import React, { useMemo, useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import type { SettingItem, SettingsGroupId, SettingValue } from '@shared/ipc';
import { useTCopy } from '../../i18n/useTCopy';
import { formatT } from '../../i18n/formatT';
import { IconSearch, IconPanelLeft, IconPanelLeftClose } from '../../icons';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { TooltipSimple } from '../Tooltip';
import { ConfirmDialog } from '../ConfirmDialog';
import { RevealHighlightLayers } from '../RevealHighlight';
import {
  clearHighlight,
  highlightElement,
  REVEAL_HIGHLIGHT_DURATION_MS,
} from '@utils/revealHighlight';
import { SettingsNav } from './SettingsNav';
import {
  SETTINGS_GROUPS,
  RESETTABLE_GROUPS,
  RESET_ALL_GROUP_LABEL_KEYS,
  isKeybindsAtDefault,
  isWorkspaceAtDefault,
  isPatchSatisfied,
  getGroupResetPatch,
} from './settingsGroups';
import { ResetAllDialog } from './ResetAllDialog';
import type { ResetAllOutcome } from './resetAllSettings';
import { SettingsControls } from './SettingsControls';
import { SettingsSearchResults } from './SettingsSearchResults';
import { SettingsSearchHistoryCard, SEARCH_HISTORY_CARD_ID } from './SettingsSearchHistoryCard';
import {
  anchorFor,
  buildSettingsSearchIndex,
  filterSearchIndex,
  matchedDetail,
  type SettingsSearchEntry,
} from './settingsSearchIndex';
import { findSettingsRow } from './settingsRowLocate';
import { useRevealScrollbar } from '../../hooks/useRevealScrollbar';
import { RevealScrollbar } from '../RevealScrollbar';
import { HScrollbar } from '../HScrollbar';
import { KeybindSettings } from './KeybindSettings';
import { WorkspaceSettings } from '../../features/workspace-settings/WorkspaceSettings';
import { BrowserSettings } from '../../features/browser-settings/BrowserSettings';
import { DshSettings } from '../../features/dsh/DshSettings';
import { OpencodeSettings } from '../../features/opencode/OpencodeSettings';
import { NetworkSettings } from '../../features/network/NetworkSettings';
import { EnvironmentSettings } from '../../features/environment/EnvironmentSettings';
import { StorageSettings } from '../../features/storage-settings/StorageSettings';
import {
  prefetchStorageSettings,
  getCachedStorageStatus,
  getCachedTreeStats,
  isWellFormedStatus,
  setCachedStorageStatus,
} from '../../features/storage-settings/storageStatusCache';
import { prefetchEnvSettings } from '../../features/environment/envStatusCache';
import { computeStorageBlocksAtDefault } from '../../features/storage-settings/storageAtDefault';
import {
  TREE_CACHE_DEFAULTS,
  isCorePathsAtDefault,
  isTreeCacheAtDefault,
  treeBlockOf,
} from '@features/storage-settings/storageAtDefault';
import { downloadResetBlockVariant } from '@features/storage-settings/downloadPathReset';
import type { StorageResetDeps, StorageResetPredicates } from '@shared/settings-reset/storageReset';
import {
  computeStorageResetPlan,
  type StorageResetPlanResult,
} from '@shared/settings-reset/storageReset';
import { resolveTreeStats } from '@shared/settings-reset/treeStats';
import type { GroupKey } from '@shared/settings-reset/types';
import type { StorageBridge } from '@shared/ipc/storage';
import { EMPTY_KEYBINDS } from '@shared/keybinds';
import { computeBrowserBlocksAtDefault } from '../../features/browser-settings/browserAtDefault';
import {
  SETTINGS_NAVIGATOR_WIDTH_MIN,
  SETTINGS_NAVIGATOR_WIDTH_MAX,
} from '../../stores/slices/uiSlice';

interface SettingsPanelProps {
  settings: SettingItem[];
  onChangeSetting: (id: string, value: SettingValue) => void;
}

const SETTINGS_COMPONENTS: Partial<Record<SettingsGroupId, React.ComponentType>> = {
  shortcuts: KeybindSettings,
  workspace: WorkspaceSettings,
  browser: BrowserSettings,
  dsh: DshSettings,
  opencode: OpencodeSettings,
  network: NetworkSettings,
  environment: EnvironmentSettings,
  storage: StorageSettings,
};

/**
 * 跳转锚点的有界等待（R15）：部分锚点异步挂载（如存储组 `treeCache` 需等树缓存
 * stats 回包），故在锚点出现前逐帧重试，最多等待 `SEARCH_JUMP_DEADLINE_MS` 墙钟
 * 时间；用尽即放弃，避免锚点确实缺席时意图永久悬挂。以时间（非帧数）为界：
 * 慢 IPC 冷缓存不会过早放弃，后台标签页 rAF 节流下也仍收敛。
 */
const SEARCH_JUMP_DEADLINE_MS = 2000;

/** 待解析的跳转意图：切组后由 effect 等锚点出现，再滚动 + 高亮。 */
interface PendingJump {
  group: SettingsGroupId;
  anchor: string;
  /**
   * 命中行的定位文案（`data-settings-row` 的值）。命中来自块内某行文案时，落点优先取该行；
   * 缺省（命中块主标题/块级说明）落到块锚点，取不到该行时同样回退块锚点。
   */
  locate?: string;
}

export function SettingsPanel({ settings, onChangeSetting }: SettingsPanelProps) {
  const { t } = useTCopy();
  const {
    activeGroup,
    setActiveGroup,
    searchQuery,
    setSearchQuery,
    searchHistory,
    recordSearchHistory,
    clearSearchHistory,
    removeSearchHistoryItem,
    updatePreferences,
    showToast,
    navigatorCollapsed,
    toggleNavigator,
    settingsNavigatorWidth,
    setSettingsNavigatorWidth,
    requestStorageGroupReset,
    requestBrowserGroupReset,
    requestDshGroupReset,
    requestNetworkGroupReset,
    requestEnvironmentGroupReset,
    config,
    storageBlocksAtDefault,
    browserBlocksAtDefault,
    dshBlocksAtDefault,
    networkBlocksAtDefault,
    envStatus,
    adServerReachable,
  } = useAppStore(
    useShallow((s) => ({
      activeGroup: s.activeSettingsGroup,
      setActiveGroup: s.setActiveSettingsGroup,
      searchQuery: s.settingsSearchQuery,
      setSearchQuery: s.setSettingsSearchQuery,
      searchHistory: s.settingsSearchHistory,
      recordSearchHistory: s.recordSettingsSearch,
      clearSearchHistory: s.clearSettingsSearchHistory,
      removeSearchHistoryItem: s.removeSettingsSearchHistoryItem,
      updatePreferences: s.updatePreferences,
      showToast: s.showToast,
      navigatorCollapsed: s.navigatorCollapsedByTool.settings,
      toggleNavigator: s.toggleNavigator,
      settingsNavigatorWidth: s.settingsNavigatorWidth,
      setSettingsNavigatorWidth: s.setSettingsNavigatorWidth,
      requestStorageGroupReset: s.requestStorageGroupReset,
      requestBrowserGroupReset: s.requestBrowserGroupReset,
      requestDshGroupReset: s.requestDshGroupReset,
      requestNetworkGroupReset: s.requestNetworkGroupReset,
      requestEnvironmentGroupReset: s.requestEnvironmentGroupReset,
      config: s.appInfo?.config,
      storageBlocksAtDefault: s.storageBlocksAtDefault,
      browserBlocksAtDefault: s.browserBlocksAtDefault,
      dshBlocksAtDefault: s.dshBlocksAtDefault,
      networkBlocksAtDefault: s.networkBlocksAtDefault,
      envStatus: s.envStatus,
      adServerReachable: s.adServerReachable,
    })),
  );

  // 侧边栏组级重置聚合 disabled：组全默认时对应行按钮禁用。config 未加载时
  // 全部启用（fail-open）。storage/browser 行纳入：StorageSettings / BrowserSettings
  // 挂载时维护聚合信号，未挂载（null/未知）时保持启用。
  // 注意 workspace 块读本地编辑态（含 200ms 防抖持久化窗口），此处读已持久化的
  // config：窗口期内两侧可能短暂不一致，持久化后收敛，无数据丢失。
  const disabledResetGroups = useMemo(() => {
    const disabled = new Set<SettingsGroupId>();
    // 环境状态未知（挂载中/拉取失败）时组级恢复无依据：禁用重置，避免在状态未知时执行流程。
    if (envStatus === null) {
      disabled.add('environment');
    }
    if (!config) {
      return disabled;
    }
    const generalPatch = getGroupResetPatch('general');
    if (
      generalPatch &&
      isPatchSatisfied(
        config as unknown as Record<string, unknown>,
        generalPatch as unknown as Record<string, unknown>,
      )
    ) {
      disabled.add('general');
    }
    if (
      isWorkspaceAtDefault({
        maxConcurrentWorkspaces: config.maxConcurrentWorkspaces,
        workspacePriorityIds: config.workspacePriorityIds,
        workspaceDeferredIds: config.workspaceDeferredIds,
      })
    ) {
      disabled.add('workspace');
    }
    // 与 KeybindSettings.currentOf 同语义，统一走共享 helper（防漂移）。
    const keybinds = config.keybinds ?? {};
    if (isKeybindsAtDefault(keybinds)) {
      disabled.add('shortcuts');
    }
    const openMethodPatch = getGroupResetPatch('openMethod');
    if (
      openMethodPatch &&
      isPatchSatisfied(
        config as unknown as Record<string, unknown>,
        openMethodPatch as unknown as Record<string, unknown>,
      )
    ) {
      disabled.add('openMethod');
    }
    if (storageBlocksAtDefault === true) {
      disabled.add('storage');
    }
    if (browserBlocksAtDefault === true) {
      disabled.add('browser');
    }
    if (dshBlocksAtDefault === true) {
      disabled.add('dsh');
    }
    if (networkBlocksAtDefault === true) {
      disabled.add('network');
    }
    return disabled;
  }, [
    config,
    storageBlocksAtDefault,
    browserBlocksAtDefault,
    dshBlocksAtDefault,
    networkBlocksAtDefault,
    envStatus,
  ]);

  // 除环境组与 OpenCode 组外全默认 → 顶部「恢复全部默认」禁用（口径与侧边栏行 disabled 同源）。
  // 环境组不进 ResetAll 自动序列；OpenCode 组无侧边栏重置按钮（组内自带「恢复默认」），
  // 两者都不参与顶部判定。
  const allGroupsAtDefault =
    SETTINGS_GROUPS.filter(
      (g) => g.id !== 'environment' && g.id !== 'opencode' && !disabledResetGroups.has(g.id),
    ).length === 0;

  const updateDownloadSettings = useAppStore((s) => s.updateDownloadSettings);
  const changeDownloadPath = useAppStore((s) => s.changeDownloadPath);

  /**
   * 存储状态刷新版本号：`refreshStorageStatus` 写完共享缓存即自增，作为下方存储聚合
   * 重算 effect 的依赖 —— 缓存为模块级状态、不经由 store 触发重新渲染，若不依赖它，
   * 「仅核心路径变更」的聚合恢复提交后侧栏/顶部禁用口径会停留旧值（low-3）。
   */
  const [storageStatusRevision, setStorageStatusRevision] = useState(0);

  /**
   * 拉取最新存储状态并写入共享缓存（聚合计划计算与恢复成功后刷新共用）。
   * 开框计算计划时写入的是恢复前快照，成功提交后必须回写，否则随后进入存储组
   * 仍显示旧值、侧栏「存储」禁用聚合也停留在旧口径（L2）。
   */
  const refreshStorageStatus = useCallback(async () => {
    const bridge: StorageBridge | undefined = window.digitalLife?.storage;
    if (!bridge) {
      return null;
    }
    const result = await bridge.getStatus();
    // 与预取/挂载路径同口径：畸形体不入缓存（否则坏快照污染整个会话），跳过写入。
    if (!result.ok || !isWellFormedStatus(result.data)) {
      return null;
    }
    setCachedStorageStatus(result.data);
    setStorageStatusRevision((revision) => revision + 1);
    return result.data;
  }, []);

  /**
   * 「恢复全部默认」聚合对话框的存储组依赖：桥、状态刷新、路径写入、树缓存恢复与下载
   * 路径序列。判定口径经 `resetAllStoragePredicates` 注入（与 StorageSettings UI 同源）。
   * 桥调用一律执行时实时取（`window.digitalLife?.storage` 懒读）：避免 memo 冻结挂载时
   * 旧桥，导致“计划用新桥算出 ready、执行却用旧桥报不可用”的分叉。
   */
  const resetAllStorageDeps = useMemo<StorageResetDeps>(() => {
    const bridge: StorageBridge | undefined = window.digitalLife?.storage;
    return {
      bridge: bridge ? { preflight: (patch) => bridge.preflight(patch) } : undefined,
      // 状态查询写入共享缓存：随后进入存储组即见刷新后的状态。
      refreshStatus: refreshStorageStatus,
      setPaths: async (patch, applyNow) => {
        const freshBridge: StorageBridge | undefined = window.digitalLife?.storage;
        if (!freshBridge) {
          return { ok: false, error: { code: 'Internal', message: t.storageBridgeUnavailable } };
        }
        const applied = await freshBridge.setPaths(patch, applyNow);
        if (!applied.ok) {
          return { ok: false, error: applied.error };
        }
        return {
          ok: true,
          restartRequired: applied.data.restartRequired,
          preflight: applied.data.preflight,
        };
      },
      // 树缓存恢复：写默认开关/TTL；不清缓存（恢复默认不含清除语义）。
      resetTreeCache: async () => {
        const freshBridge: StorageBridge | undefined = window.digitalLife?.storage;
        if (!freshBridge) {
          return false;
        }
        const result = await freshBridge.setTreeCacheOptions({ ...TREE_CACHE_DEFAULTS });
        return result.ok;
      },
      previewDownload: () => ({
        settings: useAppStore.getState().downloadSettings,
        loaded: useAppStore.getState().downloadSettingsLoaded,
      }),
      readTreeStats: () => getCachedTreeStats(),
      downloadPath: { changeDownloadPath, updateDownloadSettings },
    };
  }, [changeDownloadPath, updateDownloadSettings, t, refreshStorageStatus]);

  /** 存储各块「是否已默认」判定注入：复用 storageAtDefault / downloadPathReset 的真实 helper。 */
  const resetAllStoragePredicates = useMemo<StorageResetPredicates>(
    () => ({
      isCorePathsAtDefault,
      isTreeCacheAtDefault,
      treeBlockOf,
      downloadBlockOf: (settings, loaded) => downloadResetBlockVariant(settings, loaded),
    }),
    [],
  );

  /** 顶部「恢复全部默认」聚合对话框状态（跨四组编排，替代原通用确认框路径）。 */
  const [resetAllOpen, setResetAllOpen] = useState(false);
  /** 开框前预计算好的存储计划：算好后才 setResetAllOpen(true)，框内无“计算中”闪烁。 */
  const [resetAllPlan, setResetAllPlan] = useState<StorageResetPlanResult | null>(null);
  /** 预计算在途：按钮禁用 + aria-busy，避免重复点击与无反馈等待。 */
  const [resetAllPreparing, setResetAllPreparing] = useState(false);
  const resetAllPreparingRef = useRef(false);
  /** 卸载守卫：预计算在途时面板卸载则丢弃结果（React 18 下 setState 本无害，但开框已无意义）。 */
  const resetAllMountedRef = useRef(true);
  useEffect(
    () => () => {
      resetAllMountedRef.current = false;
    },
    [],
  );
  /**
   * 开框触发元素（点击同步段捕获）：预计算期间按钮被禁用、焦点会被浏览器移走，
   * 对话框关闭后凭此归还焦点（经 ResetAllDialog 的 opener prop）。
   * 有意用 state（而非 ref）：Dialog 经 prop 读取，preparing 的重渲染顺带传达，
   * 避免“ref 写入 + 依赖另一次渲染才传播”的隐性时序耦合；关闭时清零。
   */
  const [resetAllOpener, setResetAllOpener] = useState<HTMLElement | null>(null);

  /**
   * 顶部「恢复全部默认」开框：先后台算好存储计划，再弹框（等计算好再出现，
   * 框内无“计算中”闪烁）。两段式（预计算→开框）与 StorageSettings.openGroupResetDialog
   * 一致；失败策略不同：聚合框 fail-open（存储不可判定时仍开框、执行其余四组），
   * 组框 fail-closed（toast 且不开框，见 StorageSettings openGroupResetDialog）。
   * 按钮在途禁用 + aria-busy（可感知反馈），`resetAllPreparingRef` 防重复点击。
   * 已知可并行未做：tree 拉取与计划内 `refreshStatus` 无依赖但串行（本地 IPC 实测约 67ms，
   * 收益可忽略；并行需把状态预取抽出 computeStorageResetPlan，改动共享函数得不偿失）。
   */
  const handleOpenResetAll = useCallback(async () => {
    if (resetAllPreparingRef.current) {
      return;
    }
    resetAllPreparingRef.current = true;
    setResetAllPreparing(true);
    try {
      const freshBridge = window.digitalLife?.storage;
      // 树统计与桥均实时取用（memo 的 resetAllStorageDeps 可能捕获挂载时旧桥）：
      // tree 与 preflight 同源，避免“有桥却判 unavailable”的矛盾结果。
      // 解析经共享 resolveTreeStats（与 StorageSettings.openGroupResetDialog 同源）。
      const capturedTree = await resolveTreeStats(getCachedTreeStats(), freshBridge);
      const result = await computeStorageResetPlan(
        {
          ...resetAllStorageDeps,
          bridge: freshBridge ? { preflight: (patch) => freshBridge.preflight(patch) } : undefined,
          readTreeStats: () => capturedTree,
        },
        resetAllStoragePredicates,
      ).catch((): StorageResetPlanResult => ({ status: 'unavailable' }));
      if (!resetAllMountedRef.current) {
        return;
      }
      setResetAllPlan(result);
      setResetAllOpen(true);
    } finally {
      resetAllPreparingRef.current = false;
      setResetAllPreparing(false);
    }
  }, [resetAllStorageDeps, resetAllStoragePredicates]);

  /** 关闭聚合对话框：关框即清计划与 opener（“无计划则无框”，避免残留快照）。 */
  const handleCloseResetAll = useCallback(() => {
    setResetAllOpen(false);
    setResetAllPlan(null);
    setResetAllOpener(null);
  }, []);

  /** 触发按钮点击：同步捕获 opener（供关闭后归还焦点）再进异步预计算。 */
  const handleResetAllClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setResetAllOpener(event.currentTarget);
      void handleOpenResetAll();
    },
    [handleOpenResetAll],
  );

  /** 聚合恢复结束：成功/失败/跳过汇总提示（组名经统一 labelKey 表解析，防两处漂移）。 */
  const handleResetAllCommitted = useCallback(
    async (outcome: ResetAllOutcome) => {
      const labelOf = (key: GroupKey) => t[RESET_ALL_GROUP_LABEL_KEYS[key]];
      if (outcome.failedAt === undefined) {
        showToast(t.settingsResetAllDoneAll, 'success');
        if (outcome.done.includes('storage')) {
          // 存储步骤已执行：刷新共享缓存，避免随后进入存储组仍显示恢复前快照（L2）。
          await refreshStorageStatus();
        }
        if (outcome.restartRequired) {
          // 与 StorageSettings 组级尾部同源：applyNow 已写入待迁移补丁，此处触发立即重启；
          // 桥不可重启（浏览器 / mock）时提示改由下次启动生效。
          const restarted = await window.digitalLife?.storage.restartApp();
          if (!restarted?.ok) {
            showToast(t.storageRestartUnavailableInBrowser, 'error');
            return;
          }
          showToast(t.storageRestartRequired, 'success');
        }
        return;
      }
      // R10：reason 取结构化 error 消息（绝不展示 'suspend'/'corePathsPreflight' 等内部步骤码）。
      // 首组即失败时 `done` 为空：改用「无已完成组」变体，避免「已恢复：；失败：…」残缺文案。
      showToast(
        formatT(
          t,
          outcome.done.length === 0
            ? 'settingsResetAllFailedSummaryNoDone'
            : 'settingsResetAllFailedSummary',
          {
            done: outcome.done.map(labelOf).join(', '),
            group: labelOf(outcome.failedAt),
            reason: outcome.error?.message ?? t.settingsUpdateFailed,
          },
        ),
        'error',
      );
      if (outcome.skipped.length > 0) {
        showToast(
          formatT(t, 'settingsResetAllSkippedNote', {
            groups: outcome.skipped.map(labelOf).join(', '),
          }),
          'warning',
        );
      }
    },
    [showToast, t, refreshStorageStatus],
  );

  const rafRef = useRef(0);

  // 方案 C 预取：设置面板打开即预热「存储」组快照（写入方案 B 的进场缓存），
  // 用户随后点击时数据多已就绪，首次进入也基本无加载骨架。
  // 「环境」组同理：打开即 `prefetchEnvSettings()` 冷填充，Task 7 实装挂载即瞬显。
  useEffect(() => {
    void prefetchStorageSettings();
    void prefetchEnvSettings();
  }, []);

  // 存储组聚合初始化/校正（事项 7）：存储组未激活（StorageSettings 未挂载、无路径
  // 草稿）时，据缓存 status/tree + store config/download 重算侧边栏禁用聚合 ——
  // 覆盖「从未进过存储组」的未知态，以及其他组改动影响存储默认性的场景（如浏览器
  // 组恢复下载路径）。存储组激活期间由 StorageSettings 实时维护（含路径草稿判定），
  // 此处跳过，防双写者漂移。
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const downloadSettingsLoaded = useAppStore((s) => s.downloadSettingsLoaded);
  const setStorageBlocksAtDefault = useAppStore((s) => s.setStorageBlocksAtDefault);
  useEffect(() => {
    if (activeGroup === 'storage') {
      return;
    }
    // Phase 4 R1-7.1：预取填充缓存后重算一次 —— 挂载预热是异步的，仅靠同步读
    // 缓存会使"从未进过存储组"恒为未知（null → 侧边栏启用），直到首次进组才收敛。
    // prefetch 自带在途去重 latch，重复调用廉价；写入仍受 null/相等守卫约束，无循环。
    const compute = () => {
      const value = computeStorageBlocksAtDefault({
        status: getCachedStorageStatus(),
        treeStats: getCachedTreeStats(),
        downloadSettings,
        downloadSettingsLoaded,
        draftsDirty: false,
      });
      if (value !== null && value !== useAppStore.getState().storageBlocksAtDefault) {
        setStorageBlocksAtDefault(value);
      }
    };
    compute();
    let cancelled = false;
    void prefetchStorageSettings().then(() => {
      if (!cancelled) {
        compute();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    activeGroup,
    downloadSettings,
    downloadSettingsLoaded,
    storageStatusRevision,
    setStorageBlocksAtDefault,
  ]);

  // 浏览器组聚合初始化/校正（事项 12c）：浏览器组未激活（BrowserSettings 未挂载）时，
  // 据 store（挂起时长 + 下载模式/路径，共享 helper 同 BrowserSettings 口径）重算
  // 侧边栏禁用聚合 —— 覆盖「卸载后保留最后已知值」与其它组改动影响浏览器默认性的
  // 场景（如存储组恢复下载路径）。激活期间由 BrowserSettings 实时维护，此处跳过，
  // 防双写者漂移；信息不足返回 null 不写（保持未知/最后已知值）。
  const setBrowserBlocksAtDefault = useAppStore((s) => s.setBrowserBlocksAtDefault);
  useEffect(() => {
    if (activeGroup === 'browser') {
      return;
    }
    const value = computeBrowserBlocksAtDefault(
      config?.browserInactiveTabSuspendMs,
      config?.browserSuspendWhitelistEnabled,
      config?.browserSuspendWhitelist,
      downloadSettings,
      downloadSettingsLoaded,
    );
    if (value !== null && value !== useAppStore.getState().browserBlocksAtDefault) {
      setBrowserBlocksAtDefault(value);
    }
  }, [activeGroup, config, downloadSettings, downloadSettingsLoaded, setBrowserBlocksAtDefault]);

  // DSH 组聚合初始化/校正（事项 12d）：DSH 组未激活（DshSettings 未挂载）时，据 store
  // sourceStatus（已持久化 config.version_source）重算；sourceStatus 未知
  // （null）不写。激活期间由 DshSettings 用本地判定实时维护，两侧在落盘后收敛。
  // 源/代理部分 Task 5 起归网络组（见下方网络校正），此处只看版本来源。
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const setDshBlocksAtDefault = useAppStore((s) => s.setDshBlocksAtDefault);
  useEffect(() => {
    if (activeGroup === 'dsh' || !sourceStatus) {
      return;
    }
    const value = sourceStatus.config.version_source === 'auto';
    if (value !== useAppStore.getState().dshBlocksAtDefault) {
      setDshBlocksAtDefault(value);
    }
  }, [activeGroup, sourceStatus, setDshBlocksAtDefault]);

  // 网络组聚合初始化/校正：网络组未激活（NetworkSettings 未挂载）时，据 store
  // sourceStatus（已持久化 config.source_mode / proxy.mode）重算；sourceStatus 未知
  // （null）不写。激活期间由 NetworkSettings 用本地编辑态实时维护（可能领先防抖落盘
  // ≤500ms），两侧在落盘后收敛。
  const setNetworkBlocksAtDefault = useAppStore((s) => s.setNetworkBlocksAtDefault);
  useEffect(() => {
    if (activeGroup === 'network' || !sourceStatus) {
      return;
    }
    const value =
      sourceStatus.config.source_mode === 'auto' && sourceStatus.config.proxy.mode === 'auto';
    if (value !== useAppStore.getState().networkBlocksAtDefault) {
      setNetworkBlocksAtDefault(value);
    }
  }, [activeGroup, sourceStatus, setNetworkBlocksAtDefault]);

  // 悬停/聚焦侧边栏存储行再预热一次：移动→点击的天然延迟是免费的命中窗口。
  // Tech-debt 注记：面板直连具体 feature 模块的预热函数；当第二个组需要预热时，
  // 改为 groupPrefetchers 注册表（feature 侧登记、面板侧按组调用），勿再加分支。
  const handleNavPreheatGroup = useCallback((group: SettingsGroupId) => {
    if (group === 'storage') {
      void prefetchStorageSettings();
    }
  }, []);

  const handleNavResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      const navigator = target.closest<HTMLElement>('.adl-tool-navigator');
      if (!navigator) {
        return;
      }
      target.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startWidth = navigator.offsetWidth;
      document.body.classList.add('adl-is-resizing');

      const handleMove = (moveEvent: PointerEvent) => {
        if (rafRef.current) {
          return;
        }
        rafRef.current = window.requestAnimationFrame(() => {
          rafRef.current = 0;
          const delta = moveEvent.clientX - startX;
          const newWidth = Math.max(
            SETTINGS_NAVIGATOR_WIDTH_MIN,
            Math.min(SETTINGS_NAVIGATOR_WIDTH_MAX, startWidth + delta),
          );
          navigator.style.setProperty('--adl-settings-nav-width', `${newWidth}px`);
        });
      };

      const handleUp = () => {
        if (rafRef.current) {
          window.cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        document.body.classList.remove('adl-is-resizing');
        setSettingsNavigatorWidth(navigator.offsetWidth);
        target.removeEventListener('pointermove', handleMove);
        target.removeEventListener('pointerup', handleUp);
        target.removeEventListener('pointercancel', handleUp);
        target.removeEventListener('lostpointercapture', handleUp);
      };

      target.addEventListener('pointermove', handleMove);
      target.addEventListener('pointerup', handleUp);
      target.addEventListener('pointercancel', handleUp);
      target.addEventListener('lostpointercapture', handleUp);
    },
    [setSettingsNavigatorWidth],
  );

  const handleResetGroup = useCallback(
    async (group: SettingsGroupId) => {
      // 与按钮渲染同源（RESETTABLE_GROUPS 由 patch 工厂派生）；未接入的组显式报错而非静默无操作。
      const patch = getGroupResetPatch(group);
      if (!patch) {
        showToast(t.settingsUpdateFailed, 'error');
        return;
      }
      try {
        const ok = await updatePreferences(patch);
        showToast(ok ? t.settingsResetComplete : t.settingsUpdateFailed, ok ? 'success' : 'error');
      } catch {
        showToast(t.settingsUpdateFailed, 'error');
      }
    },
    [updatePreferences, showToast, t],
  );

  const [pendingResetGroup, setPendingResetGroup] = useState<SettingsGroupId | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusToSearchRef = useRef(false);
  /** 搜索框容器（`.adl-settings-panel__search`）：历史卡片与它左对齐，也用于「点击在框内」判定。 */
  const searchFieldRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const historyCardRef = useRef<HTMLDivElement | null>(null);
  /** 历史卡片相对面板头部的左边距（px）：卡片绝对定位在头部内，由本值横向对齐搜索框。 */
  const [historyLeft, setHistoryLeft] = useState(0);
  /** 本次搜索是否已主动收起历史卡片（关闭键/外部点击/选中记录）；重新打开搜索时复位。 */
  const [historyDismissed, setHistoryDismissed] = useState(false);
  /**
   * 悬停历史记录时的输入框预览串（null = 无预览）。预览只改显示值、不动 `settingsSearchQuery`：
   * 移出卡片即还原，且预览文本被整体选中 —— 用户此刻按键会替换整段选中内容（与浏览器
   * 原生自动填充预览同语义），不会把「记录 + 新字符」拼成一条脏查询。
   */
  const [previewQuery, setPreviewQuery] = useState<string | null>(null);
  /** 待解析的跳转意图：搜索选中后先切组，由下方 effect 等锚点出现再滚动 + 高亮。 */
  const [pendingJump, setPendingJump] = useState<PendingJump | null>(null);
  /**
   * 落点高亮的宿主：`.adl-settings-panel__content-outer`（`position: relative` 且不滚动，
   * 几何等于主内容视口）→ 高亮条自然铺到主内容显示区的右边缘；`RevealHighlightLayers`
   * 常驻其内，由共享实现按类名查找并驱动。
   */
  const contentOuterRef = useRef<HTMLDivElement | null>(null);
  /**
   * 当前落点高亮（元素 + 摘除 `tabindex` 的定时器 + 是否由本次跳转补加 + 播放它的宿主）：
   * 下一次跳转或面板卸载时清理。高亮条本身由共享实现负责淡出。
   * 宿主随记录一起留存：卸载清理时该 ref 已被 React 置空，届时取不到内容宿主。
   */
  const highlightRef = useRef<{
    element: HTMLElement;
    host: HTMLElement | null;
    timer: number;
    addedTabIndex: boolean;
  } | null>(null);

  const collapseSearch = useCallback(() => {
    setPreviewQuery(null);
    setSearchQuery('');
    setSearchOpen(false);
  }, [setSearchQuery]);

  /** 历史卡片可见性：搜索框开着、还没敲字、本次未主动收起、且确实有历史。 */
  const historyVisible =
    searchOpen && searchQuery.trim() === '' && !historyDismissed && searchHistory.length > 0;

  /** 测量搜索框相对面板头部的左边距：卡片同用此值横向对齐（头部即卡片的 offsetParent）。
   *  依赖 `searchOpen`：搜索框是开框后才挂载的（关框时该节点不存在）。 */
  useLayoutEffect(() => {
    if (!searchOpen) {
      return;
    }
    const field = searchFieldRef.current;
    if (field) {
      setHistoryLeft(field.offsetLeft);
    }
  }, [searchOpen]);

  /** 重新打开搜索即复位「已收起」（唯一复位点：`historyDismissed` 只按搜索会话生效）。
   *  重新聚焦输入框 / 清空查询**有意不复位** —— 与原生自动填充「重新聚焦即再现建议」
   *  的心智不同，这里卡片按整个搜索会话生效，避免点外部收起后又被频繁召回。 */
  useEffect(() => {
    if (searchOpen) {
      setHistoryDismissed(false);
    }
  }, [searchOpen]);

  /** 预览写入后整体选中：选中态只覆盖文字本身，不会像原生自动填充那样向右铺满。 */
  useEffect(() => {
    if (previewQuery === null) {
      return;
    }
    const input = searchInputRef.current;
    input?.setSelectionRange(0, input.value.length);
  }, [previewQuery]);

  /** 点击卡片与搜索框以外任何地方即收起卡片（不改变搜索态本身）。 */
  useEffect(() => {
    if (!historyVisible) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (searchFieldRef.current?.contains(target) || historyCardRef.current?.contains(target)) {
        return;
      }
      setPreviewQuery(null);
      setHistoryDismissed(true);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [historyVisible]);

  /** 点击历史记录：以该串重新搜索（不记入历史 —— 它已在其中，跳转成功时才更新顺序）。 */
  const handlePickHistory = useCallback(
    (value: string) => {
      setPreviewQuery(null);
      setHistoryDismissed(true);
      setSearchQuery(value);
    },
    [setSearchQuery],
  );

  /** 关闭历史卡片：仅收起并交还输入焦点，不删除任何历史记录。 */
  const handleCloseHistory = useCallback(() => {
    setPreviewQuery(null);
    setHistoryDismissed(true);
    searchInputRef.current?.focus();
  }, []);

  /** 一键清空全部搜索历史：historyVisible 要求 length > 0，清空后卡片自动收起。 */
  const handleClearSearchHistory = useCallback(() => {
    clearSearchHistory();
    setPreviewQuery(null);
    searchInputRef.current?.focus();
  }, [clearSearchHistory]);

  /** 删除单条搜索历史：仅当删的是预览项才撤销预览；焦点留在列表内
   *（滑入该位置的行），删空才回输入框（R1 R-1/R-2）。 */
  const handleRemoveSearchHistoryItem = useCallback(
    (value: string) => {
      const idx = searchHistory.indexOf(value);
      removeSearchHistoryItem(value);
      if (previewQuery === value) {
        setPreviewQuery(null);
      }
      requestAnimationFrame(() => {
        const rows = historyCardRef.current?.querySelectorAll(
          '.adl-settings-search-history__remove',
        );
        const target = rows?.[Math.min(idx, (rows?.length ?? 1) - 1)];
        if (target instanceof HTMLElement) {
          target.focus();
        } else {
          searchInputRef.current?.focus();
        }
      });
    },
    [removeSearchHistoryItem, searchHistory, previewQuery],
  );

  /** 清除当前落点高亮（含移除定时器）：下一次跳转前与面板卸载时调用。
   *  仅摘除本跳转补加的 `tabindex`（既有属性不动），不留永久可脚本聚焦的语义残留；
   *  高亮条交给共享实现收起（宿主取记录里的那份 —— 卸载清理时 ref 已置空）。 */
  const clearCurrentHighlight = useCallback(() => {
    const current = highlightRef.current;
    if (!current) {
      return;
    }
    window.clearTimeout(current.timer);
    clearHighlight(current.host);
    if (current.addedTabIndex) {
      current.element.removeAttribute('tabindex');
    }
    highlightRef.current = null;
  }, []);

  /**
   * 跳转到命中条目：收起搜索 → 记入搜索历史 → 切换到该组 → 置待解析跳转意图。
   * 滚动与高亮由下方 `pendingJump` effect 完成 —— 部分锚点异步挂载（如存储组
   * `treeCache` 需等 stats 回包），单帧定位会静默 no-op（R15：改为有界等待）。
   * 落点取「命中行」优先（命中块内某行文案时落到那一行；见 `matchedDetail`），
   * 否则/取不到时落到块锚点 —— 锚点即块主标题所在容器。
   * 历史只在「点开某条结果」这一步写入：它等价于「这次查询真的被用上了」，
   * 逐键写入会让半截输入与无效查询挤满历史。
   */
  const handleSelectResult = useCallback(
    (entry: SettingsSearchEntry) => {
      const detail = matchedDetail(entry, searchQuery);
      // 先记录历史再收起：`searchQuery` 是本次渲染闭包捕获的旧值，与执行顺序无关，
      // 但「先记录后清空」的阅读顺序不会让后续维护者误以为记录的是清空后的查询。
      recordSearchHistory(searchQuery);
      collapseSearch();
      setActiveGroup(entry.group);
      setPendingJump({
        group: entry.group,
        anchor: anchorFor(entry.group, entry.anchorId),
        locate: detail?.locate,
      });
    },
    [collapseSearch, recordSearchHistory, searchQuery, setActiveGroup],
  );

  /**
   * 侧栏选择分组：搜索态下先收起搜索再切组，否则内容区仍渲染跨组结果、点击成死点击
   * （导航高亮移动但内容不变）。非搜索态行为与直接 `setActiveGroup` 一致。
   */
  const handleSelectGroup = useCallback(
    (group: SettingsGroupId) => {
      if (searchQuery.trim() !== '') {
        collapseSearch();
      }
      setActiveGroup(group);
    },
    [collapseSearch, searchQuery, setActiveGroup],
  );

  // 跳转意图解析：待 activeGroup 生效后定位落点；落点尚未挂载则逐帧重试至有界时间预算。
  // 落点优先取「命中行」（命中块内某行文案时落到那一行），取不到再回退块锚点。
  // 命中后滚动居中 + 播放落点高亮（`tabindex` 摘除定时器存于 ref，避免意图清空时被 effect 清理误杀）。
  // 用户中途切到别的组时清除残留意图：否则之后手工回到该组会自发滚动+高亮（状态机残留）。
  useEffect(() => {
    if (!pendingJump) {
      return;
    }
    if (activeGroup !== pendingJump.group) {
      setPendingJump(null);
      return;
    }
    const selector = `[data-settings-anchor="${pendingJump.anchor}"]`;
    const deadline = Date.now() + SEARCH_JUMP_DEADLINE_MS;
    // 逐帧重试的句柄用 const 容器承载（项目禁止 `let` 重赋值）：闭包跨调用读写其字段。
    const pendingFrame = { current: 0 };
    // 落点为 best-effort：命中行取不到（该行在**当前编辑态**下不渲染，如每类独立模式下的
    // 「数据根目录」行）时，用块锚点收敛。块锚点与行同生同灭，故两类元素都不会出现
    // 「只有行、没有锚点」的情况；两者皆无（块尚未挂载）时下面的重试生效。
    const tick = () => {
      const element =
        findSettingsRow(contentOuterRef.current, pendingJump.locate) ??
        document.querySelector<HTMLElement>(selector);
      if (!element) {
        if (Date.now() >= deadline) {
          setPendingJump(null);
          return;
        }
        pendingFrame.current = window.requestAnimationFrame(tick);
        return;
      }
      clearCurrentHighlight();
      if (typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ block: 'center' });
      }
      // a11y（F3）：结果项卸载后焦点会落回 <body>；把焦点移交给落点锚点，键盘用户
      // 不必从头 Tab。锚点为普通元素、通常不可聚焦，就地补 `tabindex="-1"`（不改各组件 markup）；
      // 仅记录「本次补加」并在高亮结束/下一次跳转时摘除，避免留下永久可聚焦的语义残留。
      const addedTabIndex = !element.hasAttribute('tabindex');
      if (addedTabIndex) {
        element.setAttribute('tabindex', '-1');
      }
      element.focus({ preventScroll: true });
      // 落点提示走共享实现（与文件面板「检索 → 预览」同一套覆盖层），本面板取主题蓝变体：
      // 左边缘竖线 + 横向铺满主内容显示区的淡背景，播放后自行淡出。
      const host = contentOuterRef.current;
      if (host) {
        highlightElement(host, element, { variant: 'accent' });
      }
      highlightRef.current = {
        element,
        host,
        addedTabIndex,
        // 摘除 tabindex 的定时器与共享高亮淡出共用 REVEAL_HIGHLIGHT_DURATION_MS：
        // 若未来调用方给 highlightElement 传自定义 durationMs，这里必须同值，
        // 否则焦点残留期与可见高亮期脱节（当前两处都用默认值，耦合不可达）。
        timer: window.setTimeout(() => {
          if (addedTabIndex) {
            element.removeAttribute('tabindex');
          }
          highlightRef.current = null;
        }, REVEAL_HIGHLIGHT_DURATION_MS),
      };
      setPendingJump(null);
    };
    tick();
    return () => {
      if (pendingFrame.current) {
        window.cancelAnimationFrame(pendingFrame.current);
      }
    };
  }, [pendingJump, activeGroup, clearCurrentHighlight]);

  // 面板卸载：清掉 `tabindex` 摘除定时器并收起落点高亮（元素此时可能已分离，操作无害）。
  useEffect(() => clearCurrentHighlight, [clearCurrentHighlight]);

  /** mod+F：焦点在面板内时拦截浏览器/编辑器查找，改为打开面板搜索输入框。 */
  const handlePanelKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') {
      return;
    }
    // portal 渲染的对话框在 React 树内（事件会冒泡到此），但 DOM 在面板外：
    // 以 DOM 归属判定「焦点是否在面板内」，焦点在面板外一律不响应。
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSearchOpen(true);
  }, []);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // 任一确认框开着：Escape 交给对话框自身关闭，不清空搜索词。
      if (event.key !== 'Escape' || confirmResetOpen || resetAllOpen) {
        return;
      }
      event.stopPropagation();
      returnFocusToSearchRef.current = true;
      collapseSearch();
    },
    [collapseSearch, confirmResetOpen, resetAllOpen],
  );

  const handleSearchBlur = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      const panel = event.currentTarget.closest('.adl-settings-panel');
      if (panel && event.relatedTarget instanceof Node && panel.contains(event.relatedTarget)) {
        return;
      }
      collapseSearch();
    },
    [collapseSearch],
  );

  useEffect(() => {
    if (searchQuery.trim() !== '' && !searchOpen) {
      setSearchOpen(true);
    }
  }, [searchQuery, searchOpen]);

  useEffect(() => {
    if (!searchOpen && returnFocusToSearchRef.current) {
      returnFocusToSearchRef.current = false;
      searchButtonRef.current?.focus();
    }
  }, [searchOpen]);

  const handleCancelReset = useCallback(() => {
    setConfirmResetOpen(false);
    setPendingResetGroup(null);
  }, []);

  const handleConfirmClick = useCallback(() => {
    setConfirmResetOpen(false);
    // 通用确认框只服务组级恢复（「恢复全部」改由 ResetAllDialog 承接，不再走此路径）。
    if (!pendingResetGroup) {
      return;
    }
    const group = pendingResetGroup;
    setPendingResetGroup(null);
    void handleResetGroup(group);
  }, [handleResetGroup, pendingResetGroup]);

  const handleRequestResetGroup = useCallback(
    (group: SettingsGroupId) => {
      // 搜索态下目标组组件未挂载（内容区仍渲染跨组结果）：先收起搜索，否则三组自有
      // 重置信号被置位却无人消费，对话框要等用户日后回到该组才「迟到弹出」（M2 同族）。
      if (searchQuery.trim() !== '') {
        collapseSearch();
      }
      if (group === 'storage') {
        // 存储组多桥多步（迁移/树缓存/预算/下载各有各的桥与生效时机），不能走
        // updatePreferences 一刀切：先关通用确认框（防键盘路径下双框叠加，rev2 I4-N1），
        // 再切到存储组 + 置 pending 信号，由 StorageSettings 弹出自有确认对话框并执行。
        setConfirmResetOpen(false);
        setPendingResetGroup(null);
        setActiveGroup('storage');
        requestStorageGroupReset();
        return;
      }
      if (group === 'browser') {
        // 浏览器组同为自有流程（挂起偏好 + 下载模式 + 下载路径三步跨桥）：
        // 先关通用确认框，再切组 + 置 pending 信号，由 BrowserSettings 弹出自有
        // 确认对话框并按挂起 → 模式 → 路径顺序执行。
        setConfirmResetOpen(false);
        setPendingResetGroup(null);
        setActiveGroup('browser');
        requestBrowserGroupReset();
        return;
      }
      if (group === 'dsh') {
        // DSH 组为自有流程（下载源 + 代理 + 恢复写 saveSourceConfig 桥，
        // 非偏好 patch）：先关通用确认框，再切组 + 置 pending 信号，
        // 由 DshSettings 弹出自有确认对话框并执行。
        setConfirmResetOpen(false);
        setPendingResetGroup(null);
        setActiveGroup('dsh');
        requestDshGroupReset();
        return;
      }
      if (group === 'network') {
        // 网络组为自有流程（源/代理恢复，语义同旧 dsh 重置中的源/代理部分）：
        // 先关通用确认框，再切组 + 置 pending 信号，由 NetworkSettings
        // （Task 5 实装）弹出自有确认对话框并执行。
        setConfirmResetOpen(false);
        setPendingResetGroup(null);
        setActiveGroup('network');
        requestNetworkGroupReset();
        return;
      }
      if (group === 'environment') {
        // 环境组为自有流程（不进 ResetAll 自动序列，仅侧边栏自助）：
        // 先关通用确认框，再切组 + 置 pending 信号，由 EnvironmentSettings
        // （Task 7 实装）弹出自有确认对话框并执行。
        setConfirmResetOpen(false);
        setPendingResetGroup(null);
        setActiveGroup('environment');
        requestEnvironmentGroupReset();
        return;
      }
      setPendingResetGroup(group);
      setConfirmResetOpen(true);
    },
    [
      collapseSearch,
      searchQuery,
      requestStorageGroupReset,
      requestBrowserGroupReset,
      requestDshGroupReset,
      requestNetworkGroupReset,
      requestEnvironmentGroupReset,
      setActiveGroup,
    ],
  );

  // 持久化/历史遗留的 activeGroup 可能不在当前组列表里（如已移除的 terminal）：
  // 回退到第一个组，避免导航无选中、面板空白。
  const effectiveGroup = SETTINGS_GROUPS.some((group) => group.id === activeGroup)
    ? activeGroup
    : SETTINGS_GROUPS[0].id;

  // 非搜索态：当前组的固定设置项（搜索态由跨组索引结果承载，见下）。
  const filtered = useMemo(
    () => settings.filter((s) => s.groupId === effectiveGroup),
    [effectiveGroup, settings],
  );

  const isSearching = searchQuery.trim() !== '';

  // 跨组搜索索引 + 过滤结果：仅搜索态渲染（非搜索态空查询也会返回全量，故不额外分支）。
  const searchIndex = useMemo(
    () => buildSettingsSearchIndex({ t, settings, keybinds: config?.keybinds ?? EMPTY_KEYBINDS }),
    [t, settings, config],
  );
  const searchResults = useMemo(
    () => filterSearchIndex(searchIndex, searchQuery),
    [searchIndex, searchQuery],
  );

  const ActiveComponent = !isSearching ? SETTINGS_COMPONENTS[effectiveGroup] : undefined;

  // 项目自定义滚动条（垂直=文件树/剪贴板同源 RevealScrollbar；水平=对齐
  // 编辑器/差异查看器横向条家族的点态 HScrollbar）。scrollRef 挂真实滚动元素，
  // hover 挂外层宿主（滑块与滚动区为兄弟节点，hover 必须覆盖两者，否则悬停滑块即闪隐）。
  // 横轴的 `visible`（hover 门控）未被 HScrollbar 消费（常驻设计按 scrollable 渲染）：
  // 此处复用 hoverProps 仅为借道进入即重测（measure），勿误读为"横条需 hover 才可见"。
  const contentScrollbar = useRevealScrollbar([effectiveGroup, searchQuery], 'vertical');
  // 横向几何由 ResizeObserver 直接观察 host（导航拖宽即改 host 宽度），
  // deps 无需再含 settingsNavigatorWidth（revB-R3：原依据不成立）。
  const hostScrollbar = useRevealScrollbar([effectiveGroup, searchQuery], 'horizontal');

  // 组级重置沿用同一个 ConfirmDialog；此框仅由组级流程打开（pendingResetGroup 恒非空），
  // 文案恒用组模板。「恢复全部」由 ResetAllDialog 承接，不再走此路径。
  const pendingGroupLabel = t[
    SETTINGS_GROUPS.find((g) => g.id === pendingResetGroup)?.labelKey ?? 'settingsGeneral'
  ] as string;

  return (
    <div className="adl-settings-panel" onKeyDown={handlePanelKeyDown}>
      <header className="adl-settings-panel__header">
        <div className="adl-tool-context__group adl-tool-context__group--grow">
          <TooltipSimple content={t.panelNavigatorToggle} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
              onClick={() => toggleNavigator('settings')}
              aria-label={t.panelNavigatorToggle}
              aria-pressed={!navigatorCollapsed}
            >
              {navigatorCollapsed ? (
                <IconPanelLeftClose size={14} decorative />
              ) : (
                <IconPanelLeft size={14} decorative />
              )}
            </button>
          </TooltipSimple>
          <span className="adl-tool-context__separator" aria-hidden="true" />
          {searchOpen ? (
            <div className="adl-settings-panel__search" role="search" ref={searchFieldRef}>
              <label htmlFor="adl-settings-search-input" className="sr-only">
                {t.settingsSearchLabel}
              </label>
              <IconSearch size={12} decorative />
              <input
                id="adl-settings-search-input"
                ref={searchInputRef}
                type="search"
                // 关掉浏览器/WebView2 的原生自动填充下拉（Edge 会在该输入框上弹出「保存的信息」
                // 卡片，其文案/尺寸/行为均不受应用控制），改由下方自建历史卡片承接。
                autoComplete="off"
                className="adl-settings-panel__search-input"
                placeholder={t.settingsSearch}
                value={previewQuery ?? searchQuery}
                autoFocus
                // 浮层绑定：让 AT 知道输入框旁出现了历史列表（卡片本身给同一 id）。
                // 有意不加 `aria-expanded` —— 该属性对 `searchbox` 角色不成立，
                // 而完整的 combobox 模式（`aria-activedescendant` + 方向键导航）本轮未实现，
                // 不宣称未实现的可访问性语义。
                aria-controls={historyVisible ? SEARCH_HISTORY_CARD_ID : undefined}
                onChange={(e) => {
                  setPreviewQuery(null);
                  setSearchQuery(e.target.value);
                }}
                onKeyDown={handleSearchKeyDown}
                onBlur={handleSearchBlur}
              />
            </div>
          ) : (
            <TooltipSimple content={t.settingsSearchLabel} placement="top">
              <button
                ref={searchButtonRef}
                type="button"
                className="adl-tool-context__iconbtn"
                onClick={() => setSearchOpen(true)}
                aria-label={t.settingsSearchLabel}
              >
                <IconSearch size={14} decorative />
              </button>
            </TooltipSimple>
          )}
        </div>
        <div className="adl-settings-panel__header-actions">
          <button
            type="button"
            className="adl-settings-reset-all"
            onClick={handleResetAllClick}
            aria-label={t.settingsResetAll}
            aria-busy={resetAllPreparing}
            disabled={allGroupsAtDefault || resetAllPreparing}
          >
            {t.settingsResetAll}
          </button>
        </div>
        {historyVisible && (
          <SettingsSearchHistoryCard
            items={searchHistory}
            left={historyLeft}
            cardRef={historyCardRef}
            onHoverItem={setPreviewQuery}
            onPick={handlePickHistory}
            onClearAll={handleClearSearchHistory}
            onRemoveItem={handleRemoveSearchHistoryItem}
            onClose={handleCloseHistory}
          />
        )}
      </header>
      <ResetAllDialog
        open={resetAllOpen}
        planResult={resetAllPlan}
        onClose={handleCloseResetAll}
        deps={resetAllStorageDeps}
        onCommitted={handleResetAllCommitted}
        opener={resetAllOpener}
      />
      <ConfirmDialog
        open={confirmResetOpen}
        title={formatT(t, 'settingsResetGroupConfirmTitle', { group: pendingGroupLabel })}
        message={formatT(t, 'settingsResetGroupConfirmMessage', { group: pendingGroupLabel })}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleConfirmClick}
        onCancel={handleCancelReset}
      />
      <div
        className={`adl-settings-panel__body${navigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
      >
        <div
          className="adl-tool-navigator adl-settings-nav"
          style={
            { '--adl-settings-nav-width': `${settingsNavigatorWidth}px` } as React.CSSProperties
          }
          inert={navigatorCollapsed}
        >
          <SettingsNav
            activeGroup={effectiveGroup}
            onSelectGroup={handleSelectGroup}
            resettableGroups={RESETTABLE_GROUPS}
            onResetGroup={handleRequestResetGroup}
            disabledResetGroups={disabledResetGroups}
            onPreheatGroup={handleNavPreheatGroup}
          />
          {/* 拖拽线复用导航家族的共享类（命中区 = 右缘 3px 细线，容器不吃指针事件）：
              设置面板不再自带一份同规格规则，避免与文件/变更/左侧栏出现两份口径。 */}
          <div
            className="adl-tool-navigator__resize-handle"
            onPointerDown={handleNavResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label={t.resizeSettingsNavigator}
            aria-valuemin={SETTINGS_NAVIGATOR_WIDTH_MIN}
            aria-valuemax={SETTINGS_NAVIGATOR_WIDTH_MAX}
            aria-valuenow={settingsNavigatorWidth}
          />
        </div>
        <div
          className="adl-settings-panel__content-outer adl-reveal-scrollbar-host"
          ref={contentOuterRef}
          onMouseEnter={() => {
            contentScrollbar.hoverProps.onMouseEnter();
            hostScrollbar.hoverProps.onMouseEnter();
          }}
          onMouseLeave={() => {
            contentScrollbar.hoverProps.onMouseLeave();
            hostScrollbar.hoverProps.onMouseLeave();
          }}
        >
          <div
            className="adl-settings-panel__content-host adl-reveal-scroll-x"
            ref={hostScrollbar.scrollRef}
          >
            <div
              className="adl-settings-panel__content adl-settings-panel__content--cards adl-reveal-scroll"
              ref={contentScrollbar.scrollRef}
            >
              {/* 离线标识（Phase 4 R2）：浏览器预览下 ad-server 不可达。文案只说
                  "未连接后端"，不承诺"本地预览"——设置读写域（app）失败即失败、
                  不回退（错误卡呈现），其它业务域才可能回退预览实现。
                  null = 尚未探测，不显示。 */}
              {adServerReachable === false && (
                <div className="adl-settings-row" role="status">
                  <div className="adl-settings-row__label">
                    <small className="adl-settings-status adl-settings-status--warning">
                      {t.settingsBackendOfflineBadge}
                    </small>
                  </div>
                </div>
              )}
              {ActiveComponent ? (
                React.createElement(ActiveComponent)
              ) : isSearching ? (
                <SettingsSearchResults
                  entries={searchResults}
                  query={searchQuery}
                  onSelect={handleSelectResult}
                />
              ) : (
                <SettingsControls items={filtered} onChange={onChangeSetting} />
              )}
            </div>
          </div>
          <RevealScrollbar controller={contentScrollbar} />
          {/* 水平条用点态常驻设计（文件/变更面板同款 HScrollbar），区别于竖条的悬停显现 */}
          <HScrollbar controller={hostScrollbar} />
          {/* 落点高亮覆盖层：常驻于不滚动的内容宿主内，横向铺满主内容显示区 */}
          <RevealHighlightLayers />
        </div>
      </div>
    </div>
  );
}
