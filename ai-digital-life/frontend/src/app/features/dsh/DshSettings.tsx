import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsSelect } from '../../components/settings/SettingsSelect';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { HintCardTrigger } from '../../components/HintCard';
import { IconCircleHelp } from '../../icons/status';
import { IconResetDefaults } from '../../icons';
import type { DshSourceConfig } from '../../../shared/ipc/dsh';

type SourceType = 'auto' | 'npmjs' | 'npmmirror' | 'custom';
type ProxyMode = 'auto' | 'manual' | 'none';

const NPMJS_URL = 'https://registry.npmjs.org';
const NPMMIRROR_URL = 'https://registry.npmmirror.com';
/** 变更即静默保存的防抖窗口（失败才 toast，成功不打扰）。 */
const AUTOSAVE_DELAY_MS = 500;
/** 测试结果在按钮内的展示时长，到时恢复按钮文案。 */
const TEST_RESULT_MS = 2000;

/**
 * 「DSH」设置组：下载源 / 代理设置 / 测试连接三块，与浏览器/存储组同构——
 * 块头（恢复默认图标 + 主标题）在卡外，卡内 `adl-settings-row` 副标题+提示图标
 * 在最左、控件在最右并垂直居中。
 *
 * 保存模型：变更即防抖静默落盘（`saveSourceConfig` PATCH），失败才 toast；
 * 恢复默认（块级/组级）经通用确认对话框乐观执行：点确认立刻关框并刷新卡片，
 * 后台落盘，失败则 toast 并回滚（期间用户手动改过则不回滚）。组级恢复走自有流程
 * （侧边栏置 `dshGroupResetPending` → 此处消费开框），源=自动检测、代理=自动、
 * 清空自定义地址与代理字段；维护 `dshBlocksAtDefault` 聚合信号供侧边栏禁用判定。
 *
 * 表单控件 fail-open：`sourceStatus` 未知（拉取失败/延迟）时下拉与输入框保持
 * 可用，状态到达后播种同步；块恢复按钮同样只看本地选项（事项 11）。
 *
 * 自动检测：并发实测官方与镜像延迟取可达的更低延迟者，写回 `source_mode=auto`
 * + 所选 registry；结果到达时若用户已改选其它源则丢弃（sourceTypeRef 竞态防护）。
 */
export function DshSettings() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const showToast = useAppStore((s) => s.showToast);
  const setDshBlocksAtDefault = useAppStore((s) => s.setDshBlocksAtDefault);
  const dshGroupResetPending = useAppStore((s) => s.dshGroupResetPending);
  const consumeDshGroupReset = useAppStore((s) => s.consumeDshGroupReset);

  const [sourceType, setSourceType] = useState<SourceType>('npmjs');
  const [customUrl, setCustomUrl] = useState('');
  const [proxyMode, setProxyMode] = useState<ProxyMode>('auto');
  const [httpProxy, setHttpProxy] = useState('');
  const [httpsProxy, setHttpsProxy] = useState('');
  const [noProxy, setNoProxy] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [sourceResetOpen, setSourceResetOpen] = useState(false);
  const [proxyResetOpen, setProxyResetOpen] = useState(false);
  const [groupResetOpen, setGroupResetOpen] = useState(false);
  const [groupResetBusy, setGroupResetBusy] = useState(false);

  const sourceTypeRef = useRef<SourceType>('npmjs');
  const initializedRef = useRef(false);
  const fetchedRef = useRef(false);
  const formRef = useRef({ sourceType, customUrl, proxyMode, httpProxy, httpsProxy, noProxy });
  const debounceTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef(false);
  const drainingRef = useRef(false);
  const testTimerRef = useRef<number | null>(null);

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
    const config: DshSourceConfig = {
      source_mode: s.sourceType === 'auto' ? 'auto' : 'manual',
      proxy: {
        mode: s.proxyMode,
        http_proxy: s.proxyMode === 'manual' ? s.httpProxy || null : null,
        https_proxy: s.proxyMode === 'manual' ? s.httpsProxy || null : null,
        no_proxy: s.proxyMode === 'manual' ? s.noProxy || null : null,
      },
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
    (config: DshSourceConfig): Promise<boolean> => {
      const run = saveChainRef.current.then(async () => {
        try {
          const ok = await actions.saveSourceConfig(config);
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
          await persist(config);
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
      if (sourceTypeRef.current !== 'auto') {
        return;
      }
      const candidates = [
        { url: NPMJS_URL, label: t.dshSettingsSourceNpmjs, result: official },
        { url: NPMMIRROR_URL, label: t.dshSettingsSourceNpmmirror, result: mirror },
      ].filter((c) => c.result?.reachable === true);
      if (candidates.length === 0) {
        // 空候选才提示：静默模式（桥失败 null / 双源不可达）直接返回不打扰；
        // 单桥失败但另一路可达时照常选优（事项 11 Phase 4 B1-B-1）。
        if (!silent) {
          showToast(t.dshSettingsAutoDetectFailed, 'error');
        }
        return;
      }
      const winner = candidates.reduce((best, c) =>
        (c.result?.latency_ms ?? Number.MAX_SAFE_INTEGER) <
        (best.result?.latency_ms ?? Number.MAX_SAFE_INTEGER)
          ? c
          : best,
      );
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

  // 挂载拉取：sourceStatus 初始为 null 且 fetchSourceStatus 此前无任何调用点
  //（预存缺陷——设置页从不反映已保存配置），此处按需补一次。后台同步静默：
  // 失败不记全局错误卡（进组重复弹窗是回归），fail-open 表单可照常用。
  useEffect(() => {
    if (fetchedRef.current) {
      return;
    }
    fetchedRef.current = true;
    void actions.fetchSourceStatus(true);
  }, [actions]);

  // 首次拿到 sourceStatus 时播种表单：按 source_mode + registry URL 往返映射
  //（旧实现只认 dsh_mirror 分支，npmmirror 会被误判为自定义）。
  useEffect(() => {
    if (!sourceStatus || initializedRef.current) {
      return;
    }
    initializedRef.current = true;
    const { config } = sourceStatus;
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
    setProxyMode(
      config.proxy.mode === 'manual' ? 'manual' : config.proxy.mode === 'none' ? 'none' : 'auto',
    );
    setHttpProxy(config.proxy.http_proxy ?? '');
    setHttpsProxy(config.proxy.https_proxy ?? '');
    setNoProxy(config.proxy.no_proxy ?? '');
    // 自动模式挂载即静默实测选优（种子之后执行，sourceTypeRef 已同步）。
    if (config.source_mode === 'auto') {
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

  // 卸载清理三件套（测试结果计时器/聚合信号/pending 兜底）；防抖计时器刻意保留——
  // 挂载后落盘走 store action，放行可避免"改完立即切组导致丢保存"。
  useEffect(
    () => () => {
      clearTestTimer();
      setDshBlocksAtDefault(null);
      // 卸载（切出 DSH 组）：聚合信号清 null 回到「未知 → 启用」（transient，不持久化）；
      // pending 兜底消费，避免下次挂载"迟到弹窗"。
      useAppStore.getState().consumeDshGroupReset();
    },
    [clearTestTimer, setDshBlocksAtDefault],
  );

  // 聚合信号：源=自动检测且代理=自动 → 两块全默认（供侧边栏 DSH 行禁用）。
  // 块按钮 fail-open：只看本地选项是否为默认，不要求 sourceStatus 已知——
  // 拉取失败时状态恒 null，带 !sourceStatus 门会把按钮永久砖化（事项 11）；
  // 后端不通时点了恢复会弹失败提示并回滚。聚合信号保留 sourceStatus 门
  // （未知 → false → 侧边栏启用，本来就是 fail-open）。
  const sourceAtDefault = sourceType === 'auto';
  const proxyAtDefault = proxyMode === 'auto';
  useEffect(() => {
    setDshBlocksAtDefault(sourceStatus !== null && sourceAtDefault && proxyAtDefault);
  }, [sourceStatus, sourceAtDefault, proxyAtDefault, setDshBlocksAtDefault]);

  /**
   * 组级恢复对话框打开（承接 pending 信号）：守卫先行——组框/任一块框已开/
   * 执行中 → 不消费 pending（信号保留，框关闭后 effect 重试），避免重置意图被
   * 静默吞掉（事项 11 Phase 4 A1-L1）；无框时消费（幂等）并开框。
   * 与 BrowserSettings.openGroupResetDialog 同构（彼处为先消费，本处为保信号改守卫先行）。
   */
  const openGroupResetDialog = useCallback(() => {
    if (groupResetOpen || groupResetBusy || sourceResetOpen || proxyResetOpen) {
      return;
    }
    consumeDshGroupReset();
    setGroupResetOpen(true);
  }, [consumeDshGroupReset, groupResetOpen, groupResetBusy, sourceResetOpen, proxyResetOpen]);

  useEffect(() => {
    if (!dshGroupResetPending) {
      return;
    }
    openGroupResetDialog();
  }, [dshGroupResetPending, openGroupResetDialog]);

  /** 组级恢复：源=自动检测（落盘后静默实测选优）、代理=自动、清空自定义地址与代理字段。
   * 乐观执行：点确认立刻关框并刷新卡片，后台落盘；失败则 toast（saveNow 内）并
   * 回滚到确认前的值（期间用户若已手动改过则不回滚，新输入优先）。 */
  const handleGroupConfirm = useCallback(() => {
    if (groupResetBusy) {
      return;
    }
    setGroupResetBusy(true);
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
        const ok = await saveNow({
          source_mode: 'auto',
          npm_registry: NPMJS_URL,
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        });
        if (!ok) {
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

  /** 下载源块恢复：源=自动检测 + 落盘默认 registry，静默实测选优；乐观执行，失败回滚。 */
  const handleSourceResetConfirm = useCallback(() => {
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
  }, [saveNow, applySourceType, runAutoDetect, sourceType, customUrl, testResult]);

  /** 代理块恢复：代理=自动 + 清空三个字段；乐观执行，失败回滚。 */
  const handleProxyResetConfirm = useCallback(() => {
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
  }, [saveNow, proxyMode, httpProxy, httpsProxy, noProxy]);

  const handleSourceChange = useCallback(
    (v: string) => {
      const next = v as SourceType;
      applySourceType(next);
      setTestResult(null);
      clearTestTimer();
      scheduleSave();
      if (next === 'auto') {
        void runAutoDetect(false);
      }
    },
    [applySourceType, clearTestTimer, scheduleSave, runAutoDetect],
  );

  const handleCustomUrlChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setCustomUrl(e.target.value);
      // 地址变了旧结论即 stale：与切源一致清掉按钮内结果（事项 11 Phase 4 A1-L6）。
      setTestResult(null);
      clearTestTimer();
      scheduleSave();
    },
    [clearTestTimer, scheduleSave],
  );

  const handleProxyModeChange = useCallback(
    (v: string) => {
      setProxyMode(v as ProxyMode);
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleProxyField = useCallback(
    (setter: (value: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      scheduleSave();
    },
    [scheduleSave],
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
          : t.dshSettingsTestFailed.replace('{error}', result.error ?? 'Unknown');
      } else {
        message = t.dshSettingsTestFailed.replace('{error}', 'Request failed');
      }
    } catch {
      message = t.dshSettingsTestFailed.replace('{error}', 'Network error');
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
  const groupResetTitle = formatT(t, 'settingsResetGroupConfirmTitle', { group: t.settingsDsh });
  const groupResetMessage = formatT(t, 'settingsResetGroupConfirmMessage', {
    group: t.settingsDsh,
  });

  const sourceResetDisabled = sourceAtDefault;
  const proxyResetDisabled = proxyAtDefault;
  const testDisabled = testing || (sourceType === 'custom' && !customUrl.trim());

  const hintButton = (content: string) => (
    <HintCardTrigger content={content}>
      <button
        type="button"
        className="adl-icon-button adl-icon-button--info"
        tabIndex={-1}
        aria-label={content}
      >
        <IconCircleHelp size={16} />
      </button>
    </HintCardTrigger>
  );

  return (
    <div className="adl-settings-section adl-dsh-settings">
      <div className="adl-dsh-settings__header">
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
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              {hintButton(t.dshSettingsSourceHint)}
              <span>{t.dshSettingsSource}</span>
            </div>
            <small>{t.dshSettingsSourceDesc}</small>
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
          <div className="adl-settings-row">
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

      <div className="adl-dsh-settings__header adl-dsh-settings__header--section">
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
      <div className="adl-settings-card">
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              {hintButton(t.dshSettingsProxyHint)}
              <span>{t.dshSettingsProxyMode}</span>
            </div>
            <small>{t.dshSettingsProxyDesc}</small>
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
                  label: t.dshSettingsProxyHttp,
                  value: httpProxy,
                  placeholder: t.dshSettingsProxyPlaceholder,
                  setter: setHttpProxy,
                },
                {
                  key: 'https',
                  label: t.dshSettingsProxyHttps,
                  value: httpsProxy,
                  placeholder: t.dshSettingsProxyPlaceholder,
                  setter: setHttpsProxy,
                },
                {
                  key: 'no',
                  label: t.dshSettingsProxyNoProxy,
                  value: noProxy,
                  placeholder: t.dshSettingsProxyNoProxyPlaceholder,
                  setter: setNoProxy,
                },
              ] as const
            ).map((field) => (
              <div className="adl-settings-row" key={field.key}>
                <div className="adl-settings-row__label">
                  <div className="adl-settings-row__label-text">
                    <span>{field.label}</span>
                  </div>
                </div>
                <div className="adl-settings-row__control">
                  <input
                    type="text"
                    className="adl-settings-input"
                    aria-label={field.label}
                    placeholder={field.placeholder}
                    value={field.value}
                    onChange={handleProxyField(field.setter)}
                  />
                </div>
              </div>
            ))
          : null}
      </div>

      <div className="adl-dsh-settings__header adl-dsh-settings__header--section">
        <span
          className="adl-settings-row__reset adl-settings-row__reset--static"
          aria-hidden="true"
        >
          <IconResetDefaults size={14} decorative />
        </span>
        <SettingsHeader title={t.dshSettingsTestConnection} />
      </div>
      <div className="adl-settings-card">
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              {hintButton(t.dshSettingsTestHint)}
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
