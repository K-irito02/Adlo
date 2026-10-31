import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { executeNetworkResetPlan, NPMJS_URL } from '@shared/settings-reset/networkReset';
import { NPMMIRROR_URL, pickFastestSource } from './sourceAutoDetect';
import { describeDetectFailure, describeProbeFailure, usableProxy } from './probeError';
import { NoProxyField } from './NoProxyField';
import { AutoResolvedNote } from '@components/settings/AutoResolvedNote';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { StaticResetSpacer } from '../../components/settings/StaticResetSpacer';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import { SettingsRowRefresh } from '@components/settings/SettingsRefreshButton';
import { SettingsSelect } from '../../components/settings/SettingsSelect';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IconResetDefaults } from '../../icons';
import { anchorFor } from '@components/settings/settingsSearchIndex';
import type { DshSourceConfig } from '../../../shared/ipc/dsh';

type SourceType = 'auto' | 'npmjs' | 'npmmirror' | 'custom';
type ProxyMode = 'auto' | 'manual' | 'none';

/** 变更即静默保存的防抖窗口（失败才 toast，成功不打扰）。 */
const AUTOSAVE_DELAY_MS = 500;
/** 测试结果在按钮内的展示时长，到时恢复按钮文案。 */
const TEST_RESULT_MS = 2000;

/**
 * 「网络」设置组：下载源 / 代理设置 / 测试连接三块（Task 5 由 DshSettings 整块搬入，
 * 类名与 dsh 域 i18n key 原样保留——key 只是标识符，不迁移领域；锚点已迁入 network 域）。
 *
 * 块头（恢复默认图标 + 主标题）在卡外，卡内 `adl-settings-row` 副标题+提示图标
 * 在最左、控件在最右并垂直居中。
 *
 * 保存模型：变更即防抖静默落盘（`saveSourceConfig` PATCH），失败才 toast；
 * 恢复默认（块级/组级）经通用确认对话框乐观执行：点确认立刻关框并刷新卡片，
 * 后台落盘，失败则 toast 并回滚（期间用户手动改过则不回滚）。组级恢复走自有流程
 * （侧边栏置 `networkGroupResetPending` → 此处消费开框），源=自动检测、代理=自动、
 * 清空自定义地址与代理字段；维护 `networkBlocksAtDefault` 聚合信号供侧边栏禁用判定。
 * 组级恢复委托共享 `executeNetworkResetPlan` 单计划（源/代理部分；版本来源归 DSH 组）。
 *
 * 表单控件 fail-open：`sourceStatus` 未知（拉取失败/延迟）时下拉与输入框保持
 * 可用，状态到达后播种同步；块恢复按钮同样只看本地选项（事项 11）。
 *
 * 自动检测：并发实测官方与镜像延迟取可达的更低延迟者，写回 `source_mode=auto`
 * + 所选 registry；结果到达时若用户已改选其它源则丢弃（sourceTypeRef 竞态防护）。
 */
export function NetworkSettings() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const showToast = useAppStore((s) => s.showToast);
  const setNetworkBlocksAtDefault = useAppStore((s) => s.setNetworkBlocksAtDefault);
  const networkGroupResetPending = useAppStore((s) => s.networkGroupResetPending);
  const consumeNetworkGroupReset = useAppStore((s) => s.consumeNetworkGroupReset);

  const [sourceType, setSourceType] = useState<SourceType>('npmjs');
  const [customUrl, setCustomUrl] = useState('');
  const [proxyMode, setProxyMode] = useState<ProxyMode>('auto');
  const [httpProxy, setHttpProxy] = useState('');
  const [httpsProxy, setHttpsProxy] = useState('');
  const [noProxy, setNoProxy] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  // 行级刷新：下载源走重新检测并写回，代理走重新读取解析结果。
  const [sourceRefreshBusy, setSourceRefreshBusy] = useState(false);
  const [proxyRefreshBusy, setProxyRefreshBusy] = useState(false);

  const [sourceResetOpen, setSourceResetOpen] = useState(false);
  const [proxyResetOpen, setProxyResetOpen] = useState(false);
  const [groupResetOpen, setGroupResetOpen] = useState(false);
  const [groupResetBusy, setGroupResetBusy] = useState(false);

  const sourceTypeRef = useRef<SourceType>('npmjs');
  const initializedRef = useRef(false);
  /** 用户是否显式改过下载源字段；未改且状态未知时不得把默认 npmjs 当作已知值落盘。 */
  const sourceTouchedRef = useRef(false);
  /**
   * 用户已编辑的字段集合：sourceStatus 可能晚于用户输入到达，播种时只填未被编辑的
   * 字段，绝不用旧快照覆盖用户新输入（也避免随后防抖把种子值反向落盘）。
   */
  const dirtyFieldsRef = useRef<
    Set<'source' | 'proxyMode' | 'httpProxy' | 'httpsProxy' | 'noProxy'>
  >(new Set());
  const markDirty = useCallback(
    (...fields: ('source' | 'proxyMode' | 'httpProxy' | 'httpsProxy' | 'noProxy')[]) => {
      for (const field of fields) {
        dirtyFieldsRef.current.add(field);
      }
    },
    [],
  );
  const formRef = useRef({ sourceType, customUrl, proxyMode, httpProxy, httpsProxy, noProxy });
  const debounceTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef(false);
  const drainingRef = useRef(false);
  const testTimerRef = useRef<number | null>(null);
  /** 卸载标记：异步探测/防抖在组件消失后不得再落盘（否则会写到后续会话）。 */
  const aliveRef = useRef(true);

  // 卸载即失效：清理在途防抖定时器；异步回调统一以 `aliveRef` 兜底丢弃。
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  const applySourceType = useCallback((next: SourceType) => {
    sourceTypeRef.current = next;
    setSourceType(next);
  }, []);

  // 防抖落盘在计时器回调里读最新表单值：渲染后同步快照，避免闭包旧值。
  useEffect(() => {
    formRef.current = { sourceType, customUrl, proxyMode, httpProxy, httpsProxy, noProxy };
  }, [sourceType, customUrl, proxyMode, httpProxy, httpsProxy, noProxy]);

  const buildConfig = useCallback((): DshSourceConfig | null => {
    const s = formRef.current;
    // 自定义地址为空：不落盘（保持上一份有效配置）。
    if (s.sourceType === 'custom' && !s.customUrl.trim()) {
      return null;
    }
    const proxy = {
      mode: s.proxyMode,
      http_proxy: s.proxyMode === 'manual' ? s.httpProxy || null : null,
      https_proxy: s.proxyMode === 'manual' ? s.httpsProxy || null : null,
      no_proxy: s.proxyMode === 'manual' ? s.noProxy || null : null,
    };
    // 源状态未加载且用户尚未显式改源：只写代理，绝不把初始占位的 npmjs 当已知源。
    if (useAppStore.getState().sourceStatus === null && !sourceTouchedRef.current) {
      return { proxy };
    }
    const config: DshSourceConfig = {
      source_mode: s.sourceType === 'auto' ? 'auto' : 'manual',
      proxy,
    };
    if (s.sourceType === 'npmjs') {
      config.npm_registry = NPMJS_URL;
    } else if (s.sourceType === 'npmmirror') {
      config.npm_registry = NPMMIRROR_URL;
    } else if (s.sourceType === 'custom') {
      config.npm_registry = s.customUrl.trim();
    }
    // auto：不带 npm_registry（registry 由检测结果补写，PATCH 语义互不覆盖）。
    return config;
  }, []);

  // 全通道串行：防抖落盘与显式写入共用一条 promise 链，同一时刻最多一个在途
  // saveSourceConfig，按调用顺序完成——saveNow 不再与在途 drainSave 并发双写
  //（事项 11 Phase 4 A1-1.4；drainingRef 仍负责防止重入 drain 循环）。
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const persist = useCallback(
    (config: DshSourceConfig, silent = false): Promise<boolean> => {
      const run = saveChainRef.current.then(async () => {
        try {
          // 后台自动保存传 silent：失败仅此处 toast，不记全局错误卡（收尾 F8 单通道）。
          const ok = await actions.saveSourceConfig(config, silent);
          if (!ok) {
            showToast(t.dshSettingsSaveFailed, 'error');
          }
          return ok;
        } catch {
          showToast(t.dshSettingsSaveFailed, 'error');
          return false;
        }
      });
      saveChainRef.current = run.then(() => {});
      return run;
    },
    [actions, showToast, t],
  );

  // 串行排空：计时器只置脏标记，落盘时按最新表单快照组装配置；在途期间再次
  // 到期的变更留在标记里，由 while 循环补落，保证后写获胜且不并发写桥。
  const drainSave = useCallback(async () => {
    if (drainingRef.current) {
      return;
    }
    drainingRef.current = true;
    try {
      while (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        const config = buildConfig();
        if (config) {
          await persist(config, true);
        }
      }
    } finally {
      drainingRef.current = false;
    }
  }, [buildConfig, persist]);

  const scheduleSave = useCallback(() => {
    pendingSaveRef.current = true;
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void drainSave();
    }, AUTOSAVE_DELAY_MS);
  }, [drainSave]);

  /** 恢复默认等显式写入：取消在途防抖（旧快照已被本次覆盖）后即时落盘。 */
  const saveNow = useCallback(
    async (config: DshSourceConfig): Promise<boolean> => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      pendingSaveRef.current = false;
      return persist(config);
    },
    [persist],
  );

  /**
   * 自动检测：并发实测官方与镜像，取可达中延迟更低者写回（source_mode=auto）。
   * silent=true（挂载/恢复后静默执行）：空候选（双源不可达/桥失败 null）直接返回
   * 不打扰；单桥失败但另一路可达时照常选优。结果到达时若用户已改选其它源则丢弃。
   */
  const runAutoDetect = useCallback(
    async (silent: boolean) => {
      const [official, mirror] = await Promise.all([
        actions.testSource(NPMJS_URL, silent),
        actions.testSource(NPMMIRROR_URL, silent),
      ]);
      // 卸载后到达的探测结果直接丢弃：ref 仍保留旧值，不拦会继续落盘。
      if (!aliveRef.current || sourceTypeRef.current !== 'auto') {
        return;
      }
      const candidates = [
        { url: NPMJS_URL, label: t.dshSettingsSourceNpmjs, result: official },
        { url: NPMMIRROR_URL, label: t.dshSettingsSourceNpmmirror, result: mirror },
      ].filter((c) => c.result?.reachable === true);
      if (candidates.length === 0) {
        // 空候选：能归因代理就点名端点（手动代理不可达），否则给通用文案。
        // 静默模式（挂载/恢复后）不弹 toast。
        if (!silent) {
          showToast(describeDetectFailure(t, [official, mirror]), 'error');
          await persist({ source_mode: 'auto' });
        }
        return;
      }
      const winnerProbe = pickFastestSource(candidates.map((c) => c.result));
      const winner = candidates.find((c) => c.result === winnerProbe);
      if (!winner) {
        return;
      }
      if (!silent) {
        showToast(formatT(t, 'dshSettingsAutoDetected', { source: winner.label }), 'success');
      }
      const current = useAppStore.getState().sourceStatus?.config;
      if (current?.source_mode === 'auto' && current.npm_registry === winner.url) {
        return;
      }
      await persist({ source_mode: 'auto', npm_registry: winner.url });
    },
    [actions, showToast, t, persist],
  );

  /** 下载源行刷新：重新实测并写回（与切到「自动检测」同一动作，非静默）。 */
  const handleSourceRefresh = useCallback(() => {
    if (sourceRefreshBusy) {
      return;
    }
    setSourceRefreshBusy(true);
    void runAutoDetect(false).finally(() => setSourceRefreshBusy(false));
  }, [runAutoDetect, sourceRefreshBusy]);

  /** 代理行刷新：重新读取解析结果（后端重新探测系统代理/回退状态）。 */
  const handleProxyRefresh = useCallback(() => {
    if (proxyRefreshBusy) {
      return;
    }
    setProxyRefreshBusy(true);
    void actions.fetchSourceStatus(true, true).finally(() => setProxyRefreshBusy(false));
  }, [actions, proxyRefreshBusy]);

  // 源状态缺失时自行静默拉取：网络组可能先于 DSH 组挂载（或 DSH 快照失败），
  // 不能假设 sourceStatus 一定由别处供给；失败保持 null，表单继续 fail-open。
  useEffect(() => {
    if (useAppStore.getState().sourceStatus === null) {
      void actions.fetchSourceStatus(true);
    }
  }, [actions]);

  // 首次拿到 sourceStatus 时播种表单：按 source_mode + registry URL 往返映射
  //（旧实现只认 dsh_mirror 分支，npmmirror 会被误判为自定义）。
  useEffect(() => {
    if (!sourceStatus || initializedRef.current) {
      return;
    }
    initializedRef.current = true;
    const { config } = sourceStatus;
    const dirty = dirtyFieldsRef.current;
    // 只播种用户尚未编辑过的字段：慢速 source-status 在用户开始输入后到达时，
    // 保留用户草稿（并让后续防抖落用户值，而非种子旧值）。
    if (!dirty.has('source')) {
      if (config.source_mode === 'auto') {
        applySourceType('auto');
      } else if (config.npm_registry === NPMJS_URL) {
        applySourceType('npmjs');
      } else if (config.npm_registry === NPMMIRROR_URL) {
        applySourceType('npmmirror');
      } else {
        applySourceType('custom');
        setCustomUrl(config.npm_registry);
      }
    }
    if (!dirty.has('proxyMode')) {
      setProxyMode(
        config.proxy.mode === 'manual' ? 'manual' : config.proxy.mode === 'none' ? 'none' : 'auto',
      );
    }
    if (!dirty.has('httpProxy')) {
      setHttpProxy(config.proxy.http_proxy ?? '');
    }
    if (!dirty.has('httpsProxy')) {
      setHttpsProxy(config.proxy.https_proxy ?? '');
    }
    if (!dirty.has('noProxy')) {
      setNoProxy(config.proxy.no_proxy ?? '');
    }
    // 自动模式挂载即静默实测选优（种子之后执行，sourceTypeRef 已同步）；
    // 用户已手动改源时不得用检测结果覆盖其选择。
    if (config.source_mode === 'auto' && !dirty.has('source')) {
      void runAutoDetect(true);
    }
  }, [sourceStatus, applySourceType, runAutoDetect]);

  // 测试结果计时器清零 helper（三处事件 + 卸载清理共用，语义一致：旧结论 stale 即清）。
  const clearTestTimer = useCallback(() => {
    if (testTimerRef.current !== null) {
      window.clearTimeout(testTimerRef.current);
      testTimerRef.current = null;
    }
  }, []);

  // 卸载清理两件套（测试结果计时器/pending 兜底）；防抖计时器刻意保留——
  // 挂载后落盘走 store action，放行可避免"改完立即切组导致丢保存"。
  useEffect(
    () => () => {
      clearTestTimer();
      // 聚合信号卸载不清（事项 12d）：保留最后已知值供侧边栏禁用判定，
      // 切出后由 SettingsPanel 未激活校正随 store 变化刷新；
      // pending 兜底消费，避免下次挂载"迟到弹窗"。
      useAppStore.getState().consumeNetworkGroupReset();
    },
    [clearTestTimer],
  );

  // 聚合信号：源=自动检测且代理=自动 → 两块全默认（供侧边栏网络行禁用）。
  // 块按钮 fail-open：只看本地选项是否为默认，不要求 sourceStatus 已知——
  // 拉取失败时状态恒 null，带 !sourceStatus 门会把按钮永久砖化（事项 11）；
  // 后端不通时点了恢复会弹失败提示并回滚。聚合信号保留 sourceStatus 门
  // （未知 → false → 侧边栏启用，本来就是 fail-open）。
  const sourceAtDefault = sourceType === 'auto';
  const proxyAtDefault = proxyMode === 'auto';
  useEffect(() => {
    setNetworkBlocksAtDefault(sourceStatus !== null && sourceAtDefault && proxyAtDefault);
  }, [sourceStatus, sourceAtDefault, proxyAtDefault, setNetworkBlocksAtDefault]);

  /**
   * 组级恢复对话框打开（承接 pending 信号）：守卫先行——组框/任一块框已开/
   * 执行中 → 不消费 pending（信号保留，框关闭后 effect 重试），避免重置意图被
   * 静默吞掉（事项 11 Phase 4 A1-L1）。
   * 与 BrowserSettings.openGroupResetDialog 同构（彼处为先消费，本处为保信号改守卫先行）。
   */
  const openGroupResetDialog = useCallback(() => {
    if (groupResetOpen || groupResetBusy || sourceResetOpen || proxyResetOpen) {
      return;
    }
    consumeNetworkGroupReset();
    setGroupResetOpen(true);
  }, [consumeNetworkGroupReset, groupResetOpen, groupResetBusy, sourceResetOpen, proxyResetOpen]);

  useEffect(() => {
    if (!networkGroupResetPending) {
      return;
    }
    openGroupResetDialog();
  }, [networkGroupResetPending, openGroupResetDialog]);

  /** 组级恢复：源=自动检测（落盘后静默实测选优）、代理=自动、清空自定义地址与代理字段。
   * 乐观执行：点确认立刻关框并刷新卡片，后台落盘（委托共享 `executeNetworkResetPlan`
   * 单计划一次写源+代理默认；经 saveNow 显式写入以取消在途防抖，避免旧快照在恢复之后补写）；
   * 失败则 toast（persist 内）并回滚到确认前的值（期间用户若已手动改过则不回滚，
   * 新输入优先）。 */
  const handleGroupConfirm = useCallback(() => {
    if (groupResetBusy) {
      return;
    }
    setGroupResetBusy(true);
    markDirty('source', 'proxyMode', 'httpProxy', 'httpsProxy', 'noProxy');
    const prev = { sourceType, customUrl, proxyMode, httpProxy, httpsProxy, noProxy };
    applySourceType('auto');
    setCustomUrl('');
    setProxyMode('auto');
    setHttpProxy('');
    setHttpsProxy('');
    setNoProxy('');
    setTestResult(null);
    setGroupResetOpen(false);
    // 回滚判决读 formRef：此处同步快照，不依赖渲染后 effect（极快失败时 effect
    // 尚未跑，回滚会被误判跳过。事项 11 Phase 4 A1-1.5）。
    formRef.current = {
      sourceType: 'auto',
      customUrl: '',
      proxyMode: 'auto',
      httpProxy: '',
      httpsProxy: '',
      noProxy: '',
    };
    void (async () => {
      try {
        // saveNow（非 persist）：显式写入前取消在途防抖并清 pending，避免旧快照
        // 在恢复写盘之后补写（显式写入契约见 saveNow 定义）。
        const save = { saveSourceConfig: (cfg: DshSourceConfig) => saveNow(cfg) };
        const result = await executeNetworkResetPlan(save);
        if (!result.ok) {
          const s = formRef.current;
          if (
            s.sourceType === 'auto' &&
            s.customUrl === '' &&
            s.proxyMode === 'auto' &&
            s.httpProxy === '' &&
            s.httpsProxy === '' &&
            s.noProxy === ''
          ) {
            applySourceType(prev.sourceType);
            setCustomUrl(prev.customUrl);
            setProxyMode(prev.proxyMode);
            setHttpProxy(prev.httpProxy);
            setHttpsProxy(prev.httpsProxy);
            setNoProxy(prev.noProxy);
          }
          return;
        }
        showToast(t.settingsResetComplete, 'success');
        void runAutoDetect(true);
      } finally {
        setGroupResetBusy(false);
      }
    })();
  }, [
    groupResetBusy,
    markDirty,
    saveNow,
    applySourceType,
    showToast,
    t,
    runAutoDetect,
    sourceType,
    customUrl,
    proxyMode,
    httpProxy,
    httpsProxy,
    noProxy,
  ]);

  // 取消无执行中守卫：组确认乐观先关框，busy 为 true 时对话框已卸载，
  // 取消按钮物理不可达（事项 11 Phase 4 B1-A-1 死守卫清理）。
  const handleGroupCancel = useCallback(() => {
    setGroupResetOpen(false);
  }, []);

  /** 下载源块恢复：源=自动检测 + 落盘默认 registry，静默实测选优；乐观执行，失败回滚。
   * 无 busy 守卫：确认即关框卸载所以双击不可达；万一重入，同载荷经串行链排队幂等
   * （收尾 F7，刻意不再加守卫）。 */
  const handleSourceResetConfirm = useCallback(() => {
    markDirty('source');
    const prev = { sourceType, customUrl, testResult };
    applySourceType('auto');
    setCustomUrl('');
    setTestResult(null);
    setSourceResetOpen(false);
    // 同步快照 formRef（见组确认注释，不依赖渲染后 effect）。
    formRef.current = { ...formRef.current, sourceType: 'auto', customUrl: '' };
    void (async () => {
      const ok = await saveNow({ source_mode: 'auto', npm_registry: NPMJS_URL });
      if (!ok) {
        const s = formRef.current;
        if (s.sourceType === 'auto' && s.customUrl === '') {
          applySourceType(prev.sourceType);
          setCustomUrl(prev.customUrl);
          setTestResult(prev.testResult);
        }
        return;
      }
      void runAutoDetect(true);
    })();
  }, [markDirty, saveNow, applySourceType, runAutoDetect, sourceType, customUrl, testResult]);

  /** 代理块恢复：代理=自动 + 清空三个字段；乐观执行，失败回滚。 */
  const handleProxyResetConfirm = useCallback(() => {
    markDirty('proxyMode', 'httpProxy', 'httpsProxy', 'noProxy');
    const prev = { proxyMode, httpProxy, httpsProxy, noProxy };
    setProxyMode('auto');
    setHttpProxy('');
    setHttpsProxy('');
    setNoProxy('');
    setProxyResetOpen(false);
    // 同步快照 formRef（见组确认注释，不依赖渲染后 effect）。
    formRef.current = {
      ...formRef.current,
      proxyMode: 'auto',
      httpProxy: '',
      httpsProxy: '',
      noProxy: '',
    };
    void (async () => {
      const ok = await saveNow({
        proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
      });
      if (!ok) {
        const s = formRef.current;
        if (
          s.proxyMode === 'auto' &&
          s.httpProxy === '' &&
          s.httpsProxy === '' &&
          s.noProxy === ''
        ) {
          setProxyMode(prev.proxyMode);
          setHttpProxy(prev.httpProxy);
          setHttpsProxy(prev.httpsProxy);
          setNoProxy(prev.noProxy);
        }
        return;
      }
    })();
  }, [markDirty, saveNow, proxyMode, httpProxy, httpsProxy, noProxy]);

  const handleSourceChange = useCallback(
    (v: string) => {
      const next = v as SourceType;
      sourceTouchedRef.current = true;
      markDirty('source');
      applySourceType(next);
      setTestResult(null);
      clearTestTimer();
      if (next === 'auto') {
        // 切自动检测不排防抖：检测写回覆盖全部语义，避免固定双写（收尾 F5）。
        // 双源皆不可达时检测内负责把 source_mode 落盘（下保持一致）。
        void runAutoDetect(false);
      } else {
        scheduleSave();
      }
    },
    [applySourceType, clearTestTimer, markDirty, scheduleSave, runAutoDetect],
  );

  const handleCustomUrlChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      sourceTouchedRef.current = true;
      markDirty('source');
      setCustomUrl(e.target.value);
      // 地址变了旧结论即 stale：与切源一致清掉按钮内结果（事项 11 Phase 4 A1-L6）。
      setTestResult(null);
      clearTestTimer();
      scheduleSave();
    },
    [clearTestTimer, markDirty, scheduleSave],
  );

  const handleProxyModeChange = useCallback(
    (v: string) => {
      markDirty('proxyMode');
      setProxyMode(v as ProxyMode);
      scheduleSave();
    },
    [markDirty, scheduleSave],
  );

  const handleProxyField = useCallback(
    (field: 'httpProxy' | 'httpsProxy' | 'noProxy', setter: (value: string) => void) =>
      (e: ChangeEvent<HTMLInputElement>) => {
        markDirty(field);
        setter(e.target.value);
        scheduleSave();
      },
    [markDirty, scheduleSave],
  );

  /** 直连名单：单行翻页组件回调；写回仍是换行分隔的字符串。 */
  const handleNoProxyChange = useCallback(
    (next: string) => {
      markDirty('noProxy');
      setNoProxy(next);
      scheduleSave();
    },
    [markDirty, scheduleSave],
  );

  const handleTest = useCallback(async () => {
    if (testing) {
      return;
    }
    clearTestTimer();
    setTesting(true);
    setTestResult(null);
    const s = formRef.current;
    const url =
      s.sourceType === 'custom'
        ? s.customUrl.trim()
        : s.sourceType === 'npmmirror'
          ? NPMMIRROR_URL
          : s.sourceType === 'npmjs'
            ? NPMJS_URL
            : // auto：测当前实际生效的 registry（最近一次检测写回值）。
              (useAppStore.getState().sourceStatus?.config.npm_registry ?? NPMJS_URL);
    let ok = false;
    let message: string;
    try {
      const result = url ? await actions.testSource(url) : null;
      if (result) {
        ok = result.reachable;
        message = ok
          ? t.dshSettingsTestSuccess.replace('{latency}', String(result.latency_ms ?? '-'))
          : t.dshSettingsTestFailed.replace('{error}', describeProbeFailure(t, result));
      } else {
        message = t.dshSettingsTestFailed.replace('{error}', t.dshSettingsTestErrorRequestFailed);
      }
    } catch {
      message = t.dshSettingsTestFailed.replace('{error}', t.dshSettingsTestErrorNetwork);
    }
    setTestResult({ ok, message });
    setTesting(false);
    testTimerRef.current = window.setTimeout(() => {
      testTimerRef.current = null;
      setTestResult(null);
    }, TEST_RESULT_MS);
  }, [testing, actions, clearTestTimer, t]);

  // options 身份稳定，避免下游 SettingsSelect 订阅 effect 每渲染重绑监听。
  const sourceOptions = useMemo(
    () => [
      { value: 'auto', label: t.dshSettingsSourceAuto },
      { value: 'npmjs', label: t.dshSettingsSourceNpmjs },
      { value: 'npmmirror', label: t.dshSettingsSourceNpmmirror },
      { value: 'custom', label: t.dshSettingsSourceCustom },
    ],
    [
      t.dshSettingsSourceAuto,
      t.dshSettingsSourceNpmjs,
      t.dshSettingsSourceNpmmirror,
      t.dshSettingsSourceCustom,
    ],
  );

  const proxyModeOptions = useMemo(
    () => [
      { value: 'auto', label: t.dshSettingsProxyModeAuto },
      { value: 'manual', label: t.dshSettingsProxyModeManual },
      { value: 'none', label: t.dshSettingsProxyModeNone },
    ],
    [t.dshSettingsProxyModeAuto, t.dshSettingsProxyModeManual, t.dshSettingsProxyModeNone],
  );

  const sourceResetLabel = formatT(t, 'settingsResetGroupToDefault', {
    group: t.dshSettingsSource,
  });
  const proxyResetLabel = formatT(t, 'settingsResetGroupToDefault', {
    group: t.dshSettingsProxy,
  });
  const groupResetTitle = formatT(t, 'settingsResetGroupConfirmTitle', {
    group: t.settingsNetwork,
  });
  const groupResetMessage = formatT(t, 'settingsResetGroupConfirmMessage', {
    group: t.settingsNetwork,
  });

  const sourceResetDisabled = sourceAtDefault;
  const proxyResetDisabled = proxyAtDefault;
  const testDisabled = testing || (sourceType === 'custom' && !customUrl.trim());

  // 「自动检测」的背后真实状态（蓝色提示行）：仅在自动模式且状态已知时渲染。
  // 代理：端点可达则显示端点，不可达时后端已静默回退直连（下拉仍是「自动检测」）。
  // 同时要求「草稿模式 = 已落盘模式」：刚切到自动检测、落盘尚未完成时，
  // `proxyEffective` 还是上一份配置的结果，先不显示，避免短暂说错端点。
  const proxyResolvedNote = (() => {
    const info = sourceStatus?.proxyEffective;
    if (proxyMode !== 'auto' || sourceStatus?.config.proxy.mode !== 'auto' || !info) {
      return null;
    }
    if (info.autoFallback) {
      const endpoint = usableProxy(info.endpoint);
      return endpoint
        ? formatT(t, 'dshSettingsProxyAutoFallback', { proxy: endpoint })
        : t.dshSettingsProxyAutoInvalid;
    }
    const endpoint = usableProxy(info.endpoint);
    if (endpoint) {
      return formatT(t, 'dshSettingsProxyResolved', { proxy: endpoint });
    }
    return t.dshSettingsProxyAutoDirect;
  })();

  // 下载源：自动检测实际写回的 registry 就是「当前实际使用」的来源；同样要求
  // 已落盘的 source_mode 也是 auto，避免切换瞬间读到上一份 registry。
  const sourceResolvedNote = (() => {
    if (sourceType !== 'auto' || sourceStatus?.config.source_mode !== 'auto') {
      return null;
    }
    const registry = sourceStatus.config.npm_registry;
    const label =
      registry === NPMJS_URL
        ? t.dshSettingsSourceNpmjs
        : registry === NPMMIRROR_URL
          ? t.dshSettingsSourceNpmmirror
          : registry;
    return formatT(t, 'settingsAutoResolved', { value: label });
  })();

  return (
    <div className="adl-settings-section adl-dsh-settings adl-network-settings">
      <div
        className="adl-dsh-settings__header"
        data-settings-anchor={anchorFor('network', 'source')}
      >
        <button
          type="button"
          className="adl-settings-row__reset"
          aria-label={sourceResetLabel}
          title={sourceResetLabel}
          data-testid="dsh-source-reset"
          disabled={sourceResetDisabled}
          onClick={() => setSourceResetOpen(true)}
        >
          <IconResetDefaults size={14} decorative />
        </button>
        <SettingsHeader title={t.dshSettingsSource} />
      </div>
      <div className="adl-settings-card">
        <div className="adl-settings-row" data-settings-row={t.dshSettingsSource}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <SettingsHintButton content={t.dshSettingsSourceHint} />
              <span>{t.dshSettingsSource}</span>
              <SettingsRowRefresh
                refresh={
                  sourceType === 'auto'
                    ? {
                        label: t.dshSettingsSource,
                        spinning: sourceRefreshBusy,
                        onRefresh: handleSourceRefresh,
                      }
                    : undefined
                }
              />
            </div>
            <small>{t.dshSettingsSourceDesc}</small>
            {sourceResolvedNote ? <AutoResolvedNote>{sourceResolvedNote}</AutoResolvedNote> : null}
          </div>
          <div className="adl-settings-row__control">
            <SettingsSelect
              value={sourceType}
              options={sourceOptions}
              onChange={handleSourceChange}
              label={t.dshSettingsSource}
            />
          </div>
        </div>
        {sourceType === 'custom' ? (
          <div className="adl-settings-row" data-settings-row={t.dshSettingsCustomUrl}>
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.dshSettingsCustomUrl}</span>
              </div>
              <small>{t.dshSettingsCustomUrlDesc}</small>
            </div>
            <div className="adl-settings-row__control">
              <input
                type="text"
                className="adl-settings-input"
                aria-label={t.dshSettingsCustomUrl}
                placeholder={t.dshSettingsSourceCustomPlaceholder}
                value={customUrl}
                onChange={handleCustomUrlChange}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div
        className="adl-dsh-settings__header adl-dsh-settings__header--section"
        data-settings-anchor={anchorFor('network', 'proxy')}
      >
        <button
          type="button"
          className="adl-settings-row__reset"
          aria-label={proxyResetLabel}
          title={proxyResetLabel}
          data-testid="dsh-proxy-reset"
          disabled={proxyResetDisabled}
          onClick={() => setProxyResetOpen(true)}
        >
          <IconResetDefaults size={14} decorative />
        </button>
        <SettingsHeader title={t.dshSettingsProxy} />
      </div>
      <div
        className={`adl-settings-card${
          proxyMode === 'manual' ? ' adl-network-settings__proxy-card--manual' : ''
        }`}
      >
        <div className="adl-settings-row" data-settings-row={t.dshSettingsProxyMode}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <SettingsHintButton content={t.dshSettingsProxyHint} />
              <span>{t.dshSettingsProxyMode}</span>
              <SettingsRowRefresh
                refresh={
                  proxyMode === 'auto'
                    ? {
                        label: t.dshSettingsProxyMode,
                        spinning: proxyRefreshBusy,
                        onRefresh: handleProxyRefresh,
                      }
                    : undefined
                }
              />
            </div>
            <small>{t.dshSettingsProxyDesc}</small>
            {proxyResolvedNote ? <AutoResolvedNote>{proxyResolvedNote}</AutoResolvedNote> : null}
          </div>
          <div className="adl-settings-row__control">
            <SettingsSelect
              value={proxyMode}
              options={proxyModeOptions}
              onChange={handleProxyModeChange}
              label={t.dshSettingsProxyMode}
            />
          </div>
        </div>
        {proxyMode === 'manual'
          ? (
              [
                {
                  key: 'http',
                  dirtyField: 'httpProxy' as const,
                  label: t.dshSettingsProxyHttp,
                  desc: t.dshSettingsProxyHttpDesc,
                  value: httpProxy,
                  placeholder: t.dshSettingsProxyPlaceholder,
                  setter: setHttpProxy,
                },
                {
                  key: 'https',
                  dirtyField: 'httpsProxy' as const,
                  label: t.dshSettingsProxyHttps,
                  desc: t.dshSettingsProxyHttpsDesc,
                  value: httpsProxy,
                  placeholder: t.dshSettingsProxyPlaceholder,
                  setter: setHttpsProxy,
                },
                {
                  key: 'no',
                  dirtyField: 'noProxy' as const,
                  label: t.dshSettingsProxyNoProxy,
                  desc: t.dshSettingsProxyNoProxyDesc,
                  value: noProxy,
                  placeholder: t.dshSettingsProxyNoProxyPlaceholder,
                  setter: setNoProxy,
                },
              ] as const
            ).map((field) => (
              <div className="adl-settings-row" key={field.key} data-settings-row={field.label}>
                <div className="adl-settings-row__label">
                  <div className="adl-settings-row__label-text">
                    <span>{field.label}</span>
                  </div>
                  <small>{field.desc}</small>
                </div>
                <div className="adl-settings-row__control adl-network-proxy-field-control">
                  {field.key === 'no' ? (
                    <NoProxyField value={noProxy} onChange={handleNoProxyChange} />
                  ) : (
                    <input
                      type="text"
                      className="adl-settings-input"
                      aria-label={field.label}
                      placeholder={field.placeholder}
                      value={field.value}
                      onChange={handleProxyField(field.dirtyField, field.setter)}
                    />
                  )}
                </div>
              </div>
            ))
          : null}
      </div>

      <div
        className="adl-dsh-settings__header adl-dsh-settings__header--section"
        data-settings-anchor={anchorFor('network', 'test')}
      >
        <StaticResetSpacer />
        <SettingsHeader title={t.dshSettingsTestConnection} />
      </div>
      <div className="adl-settings-card">
        <div className="adl-settings-row" data-settings-row={t.dshSettingsTestLabel}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <SettingsHintButton content={t.dshSettingsTestHint} />
              <span>{t.dshSettingsTestLabel}</span>
            </div>
            <small>{t.dshSettingsTestDesc}</small>
          </div>
          <div className="adl-settings-row__control">
            <button
              type="button"
              className="adl-settings-dropdown__trigger adl-dsh-settings__test-button"
              disabled={testDisabled}
              onClick={() => void handleTest()}
              data-testid="dsh-test-button"
              title={testResult?.message ?? t.dshSettingsTestButton}
            >
              <span
                className={`adl-settings-dropdown__value${
                  testResult ? (testResult.ok ? ' is-success' : ' is-error') : ''
                }`}
              >
                {testing
                  ? t.dshSettingsTestTesting
                  : (testResult?.message ?? t.dshSettingsTestButton)}
              </span>
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={sourceResetOpen}
        title={formatT(t, 'settingsResetGroupConfirmTitle', { group: t.dshSettingsSource })}
        message={formatT(t, 'settingsResetGroupConfirmMessage', { group: t.dshSettingsSource })}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleSourceResetConfirm}
        onCancel={() => setSourceResetOpen(false)}
      />
      <ConfirmDialog
        open={proxyResetOpen}
        title={formatT(t, 'settingsResetGroupConfirmTitle', { group: t.dshSettingsProxy })}
        message={formatT(t, 'settingsResetGroupConfirmMessage', { group: t.dshSettingsProxy })}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleProxyResetConfirm}
        onCancel={() => setProxyResetOpen(false)}
      />
      <ConfirmDialog
        open={groupResetOpen}
        title={groupResetTitle}
        message={groupResetMessage}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleGroupConfirm}
        onCancel={handleGroupCancel}
      />
    </div>
  );
}
