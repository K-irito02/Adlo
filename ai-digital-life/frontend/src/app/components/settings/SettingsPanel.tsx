import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import type { SettingItem, SettingsGroupId } from '@shared/ipc';
import { useTCopy } from '../../i18n/useTCopy';
import { formatT } from '../../i18n/formatT';
import { IconSearch, IconPanelLeft, IconPanelLeftClose } from '../../icons';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { TooltipSimple } from '../Tooltip';
import { ConfirmDialog } from '../ConfirmDialog';
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
import {
  anchorFor,
  buildSettingsSearchIndex,
  filterSearchIndex,
  type SettingsSearchEntry,
} from './settingsSearchIndex';
import { useRevealScrollbar } from '../../hooks/useRevealScrollbar';
import { RevealScrollbar } from '../RevealScrollbar';
import { HScrollbar } from '../HScrollbar';
import { KeybindSettings } from './KeybindSettings';
import { WorkspaceSettings } from '../../features/workspace-settings/WorkspaceSettings';
import { BrowserSettings } from '../../features/browser-settings/BrowserSettings';
import { DshSettings } from '../../features/dsh/DshSettings';
import { StorageSettings } from '../../features/storage-settings/StorageSettings';
import {
  prefetchStorageSettings,
  getCachedStorageStatus,
  getCachedTreeStats,
  setCachedStorageStatus,
} from '../../features/storage-settings/storageStatusCache';
import { computeStorageBlocksAtDefault } from '../../features/storage-settings/storageAtDefault';
import {
  TREE_CACHE_DEFAULTS,
  isBudgetAtDefault,
  isCorePathsAtDefault,
  isTreeCacheAtDefault,
  treeBlockOf,
} from '@features/storage-settings/storageAtDefault';
import { downloadResetBlockVariant } from '@features/storage-settings/downloadPathReset';
import { TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES } from '@features/terminal/terminalHistoryBudget';
import type { StorageResetDeps, StorageResetPredicates } from '@shared/settings-reset/storageReset';
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
  onChangeSetting: (id: string, value: string | boolean | number) => void;
}

const SETTINGS_COMPONENTS: Partial<Record<SettingsGroupId, React.ComponentType>> = {
  shortcuts: KeybindSettings,
  workspace: WorkspaceSettings,
  browser: BrowserSettings,
  dsh: DshSettings,
  storage: StorageSettings,
};

/** 跳转落点高亮：类名（R6 要求 `adl-` 前缀）与停留时长（与 CSS 动画同值）。 */
const SEARCH_HIGHLIGHT_CLASS = 'adl-settings-search-highlight';
const SEARCH_HIGHLIGHT_MS = 1200;
/**
 * 跳转锚点的有界等待（R15）：部分锚点异步挂载（如存储组 `treeCache` 需等树缓存
 * stats 回包），故在锚点出现前逐帧重试，最多 `SEARCH_JUMP_MAX_ATTEMPTS` 帧
 * （≈0.5s @60fps）；用尽即放弃，避免锚点确实缺席时意图永久悬挂。
 */
const SEARCH_JUMP_MAX_ATTEMPTS = 30;

/** 待解析的跳转意图：切组后由 effect 等锚点出现，再滚动 + 高亮。 */
interface PendingJump {
  group: SettingsGroupId;
  anchor: string;
}

export function SettingsPanel({ settings, onChangeSetting }: SettingsPanelProps) {
  const { t } = useTCopy();
  const {
    activeGroup,
    setActiveGroup,
    searchQuery,
    setSearchQuery,
    updatePreferences,
    showToast,
    navigatorCollapsed,
    toggleNavigator,
    settingsNavigatorWidth,
    setSettingsNavigatorWidth,
    requestStorageGroupReset,
    requestBrowserGroupReset,
    requestDshGroupReset,
    config,
    storageBlocksAtDefault,
    browserBlocksAtDefault,
    dshBlocksAtDefault,
  } = useAppStore(
    useShallow((s) => ({
      activeGroup: s.activeSettingsGroup,
      setActiveGroup: s.setActiveSettingsGroup,
      searchQuery: s.settingsSearchQuery,
      setSearchQuery: s.setSettingsSearchQuery,
      updatePreferences: s.updatePreferences,
      showToast: s.showToast,
      navigatorCollapsed: s.navigatorCollapsedByTool.settings,
      toggleNavigator: s.toggleNavigator,
      settingsNavigatorWidth: s.settingsNavigatorWidth,
      setSettingsNavigatorWidth: s.setSettingsNavigatorWidth,
      requestStorageGroupReset: s.requestStorageGroupReset,
      requestBrowserGroupReset: s.requestBrowserGroupReset,
      requestDshGroupReset: s.requestDshGroupReset,
      config: s.appInfo?.config,
      storageBlocksAtDefault: s.storageBlocksAtDefault,
      browserBlocksAtDefault: s.browserBlocksAtDefault,
      dshBlocksAtDefault: s.dshBlocksAtDefault,
    })),
  );

  // 侧边栏组级重置聚合 disabled：组全默认时对应行按钮禁用。config 未加载时
  // 全部启用（fail-open）。storage/browser 行纳入：StorageSettings / BrowserSettings
  // 挂载时维护聚合信号，未挂载（null/未知）时保持启用。
  // 注意 workspace 块读本地编辑态（含 200ms 防抖持久化窗口），此处读已持久化的
  // config：窗口期内两侧可能短暂不一致，持久化后收敛，无数据丢失。
  const disabledResetGroups = useMemo(() => {
    const disabled = new Set<SettingsGroupId>();
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
    if (storageBlocksAtDefault === true) {
      disabled.add('storage');
    }
    if (browserBlocksAtDefault === true) {
      disabled.add('browser');
    }
    if (dshBlocksAtDefault === true) {
      disabled.add('dsh');
    }
    return disabled;
  }, [config, storageBlocksAtDefault, browserBlocksAtDefault, dshBlocksAtDefault]);

  // 六组全默认 → 顶部「恢复全部默认」禁用（口径与侧边栏行 disabled 同源）。
  const allGroupsAtDefault = disabledResetGroups.size === SETTINGS_GROUPS.length;

  const updateDownloadSettings = useAppStore((s) => s.updateDownloadSettings);
  const changeDownloadPath = useAppStore((s) => s.changeDownloadPath);

  /**
   * 「恢复全部默认」聚合对话框的存储组依赖：桥、状态刷新、路径写入、预算/树缓存恢复与下载
   * 路径序列。判定口径经 `resetAllStoragePredicates` 注入（与 StorageSettings UI 同源）。
   */
  const resetAllStorageDeps = useMemo<StorageResetDeps>(() => {
    const bridge: StorageBridge | undefined = window.digitalLife?.storage;
    return {
      bridge: bridge ? { preflight: (patch) => bridge.preflight(patch) } : undefined,
      // 状态查询写入共享缓存：随后进入存储组即见刷新后的状态。
      refreshStatus: async () => {
        if (!bridge) {
          return null;
        }
        const result = await bridge.getStatus();
        if (!result.ok) {
          return null;
        }
        setCachedStorageStatus(result.data);
        return result.data;
      },
      setPaths: async (patch, applyNow) => {
        if (!bridge) {
          return { ok: false, error: { code: 'Internal', message: t.storageBridgeUnavailable } };
        }
        const applied = await bridge.setPaths(patch, applyNow);
        if (!applied.ok) {
          return { ok: false, error: applied.error };
        }
        return {
          ok: true,
          restartRequired: applied.data.restartRequired,
          preflight: applied.data.preflight,
        };
      },
      // 预算恢复：直接写默认字节数（与 StorageSettings 单块恢复同源）。
      resetBudget: () =>
        updatePreferences({
          terminalHistoryBudgetBytes: TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
        }),
      // 树缓存恢复：写默认开关/TTL；不清缓存（恢复默认不含清除语义）。
      resetTreeCache: async () => {
        if (!bridge) {
          return false;
        }
        const result = await bridge.setTreeCacheOptions({ ...TREE_CACHE_DEFAULTS });
        return result.ok;
      },
      previewDownload: () => ({
        settings: useAppStore.getState().downloadSettings,
        loaded: useAppStore.getState().downloadSettingsLoaded,
      }),
      readTreeStats: () => getCachedTreeStats(),
      readBudgetBytes: () => useAppStore.getState().appInfo?.config?.terminalHistoryBudgetBytes,
      downloadPath: { changeDownloadPath, updateDownloadSettings },
    };
  }, [changeDownloadPath, updateDownloadSettings, updatePreferences, t]);

  /** 存储四块「是否已默认」判定注入：复用 storageAtDefault / downloadPathReset 的真实 helper。 */
  const resetAllStoragePredicates = useMemo<StorageResetPredicates>(
    () => ({
      isCorePathsAtDefault,
      isBudgetAtDefault,
      isTreeCacheAtDefault,
      treeBlockOf,
      downloadBlockOf: (settings, loaded) => downloadResetBlockVariant(settings, loaded),
    }),
    [],
  );

  /** 聚合恢复结束：成功/失败/跳过汇总提示（组名经统一 labelKey 表解析，防两处漂移）。 */
  const handleResetAllCommitted = useCallback(
    (outcome: ResetAllOutcome) => {
      const labelOf = (key: GroupKey) => t[RESET_ALL_GROUP_LABEL_KEYS[key]];
      if (outcome.failedAt === undefined) {
        showToast(t.settingsResetAllDoneAll, 'success');
        if (outcome.restartRequired) {
          showToast(t.storageRestartRequired, 'success');
        }
        return;
      }
      // R10：reason 取结构化 error 消息（绝不展示 'suspend'/'corePathsPreflight' 等内部步骤码）。
      showToast(
        formatT(t, 'settingsResetAllFailedSummary', {
          done: outcome.done.map(labelOf).join(', '),
          group: labelOf(outcome.failedAt),
          reason: outcome.error?.message ?? t.settingsUpdateFailed,
        }),
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
    [showToast, t],
  );

  const rafRef = useRef(0);

  // 方案 C 预取：设置面板打开即预热「存储」组快照（写入方案 B 的进场缓存），
  // 用户随后点击时数据多已就绪，首次进入也基本无加载骨架。
  useEffect(() => {
    void prefetchStorageSettings();
  }, []);

  // 存储组聚合初始化/校正（事项 7）：存储组未激活（StorageSettings 未挂载、无路径
  // 草稿）时，据缓存 status/tree + store config/download 重算侧边栏禁用聚合 ——
  // 覆盖「从未进过存储组」的未知态，以及其他组改动影响存储默认性的场景（如浏览器
  // 组恢复下载路径）。存储组激活期间由 StorageSettings 实时维护（含路径草稿判定），
  // 此处跳过，防双写者漂移。
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const downloadSettingsLoaded = useAppStore((s) => s.downloadSettingsLoaded);
  const budgetBytes = useAppStore((s) => s.appInfo?.config?.terminalHistoryBudgetBytes);
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
        budgetBytes,
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
    budgetBytes,
    downloadSettings,
    downloadSettingsLoaded,
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
      downloadSettings,
      downloadSettingsLoaded,
    );
    if (value !== null && value !== useAppStore.getState().browserBlocksAtDefault) {
      setBrowserBlocksAtDefault(value);
    }
  }, [activeGroup, config, downloadSettings, downloadSettingsLoaded, setBrowserBlocksAtDefault]);

  // DSH 组聚合初始化/校正（事项 12d）：DSH 组未激活（DshSettings 未挂载）时，据 store
  // sourceStatus（已持久化 config.source_mode / proxy.mode）重算；sourceStatus 未知
  //（null）不写。激活期间由 DshSettings 用本地编辑态实时维护（可能领先防抖落盘
  // ≤200ms），两侧在落盘后收敛。
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const setDshBlocksAtDefault = useAppStore((s) => s.setDshBlocksAtDefault);
  useEffect(() => {
    if (activeGroup === 'dsh' || !sourceStatus) {
      return;
    }
    const value =
      sourceStatus.config.source_mode === 'auto' && sourceStatus.config.proxy.mode === 'auto';
    if (value !== useAppStore.getState().dshBlocksAtDefault) {
      setDshBlocksAtDefault(value);
    }
  }, [activeGroup, sourceStatus, setDshBlocksAtDefault]);

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
  /** 顶部「恢复全部默认」聚合对话框（跨四组编排，替代原通用确认框路径）。 */
  const [resetAllOpen, setResetAllOpen] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusToSearchRef = useRef(false);
  /** 待解析的跳转意图：搜索选中后先切组，由下方 effect 等锚点出现再滚动 + 高亮。 */
  const [pendingJump, setPendingJump] = useState<PendingJump | null>(null);
  /** 当前落点高亮（元素 + 移除定时器）：下一次跳转或面板卸载时清理。 */
  const highlightRef = useRef<{ element: HTMLElement; timer: number } | null>(null);

  const collapseSearch = useCallback(() => {
    setSearchQuery('');
    setSearchOpen(false);
  }, [setSearchQuery]);

  /** 清除当前落点高亮（含移除定时器）：下一次跳转前与面板卸载时调用。 */
  const clearCurrentHighlight = useCallback(() => {
    const current = highlightRef.current;
    if (!current) {
      return;
    }
    window.clearTimeout(current.timer);
    current.element.classList.remove(SEARCH_HIGHLIGHT_CLASS);
    highlightRef.current = null;
  }, []);

  /**
   * 跳转到命中条目：收起搜索 → 切换到该组 → 置待解析跳转意图。
   * 滚动与高亮由下方 `pendingJump` effect 完成 —— 部分锚点异步挂载（如存储组
   * `treeCache` 需等 stats 回包），单帧定位会静默 no-op（R15：改为有界等待）。
   * 高亮只落在锚点元素自身（general/shortcuts/workspace 为整行，storage/browser/dsh 为块头），
   * 不扩展到后继卡片：避免与相邻行/卡片形成双重描边，也避免误高亮无关兄弟节点（见报告）。
   */
  const handleSelectResult = useCallback(
    (entry: SettingsSearchEntry) => {
      collapseSearch();
      setActiveGroup(entry.group);
      setPendingJump({ group: entry.group, anchor: anchorFor(entry.group, entry.anchorId) });
    },
    [collapseSearch, setActiveGroup],
  );

  // 跳转意图解析：待 activeGroup 生效后定位锚点；锚点尚未挂载则逐帧重试至有界预算。
  // 命中后滚动居中 + 高亮 1.2s（移除定时器存于 ref，避免意图清空时被 effect 清理误杀）。
  useEffect(() => {
    if (!pendingJump || activeGroup !== pendingJump.group) {
      return;
    }
    const selector = `[data-settings-anchor="${pendingJump.anchor}"]`;
    let attempts = 0;
    let frame = 0;
    const tick = () => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        attempts += 1;
        if (attempts >= SEARCH_JUMP_MAX_ATTEMPTS) {
          setPendingJump(null);
          return;
        }
        frame = window.requestAnimationFrame(tick);
        return;
      }
      clearCurrentHighlight();
      if (typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ block: 'center' });
      }
      element.classList.add(SEARCH_HIGHLIGHT_CLASS);
      highlightRef.current = {
        element,
        timer: window.setTimeout(() => {
          element.classList.remove(SEARCH_HIGHLIGHT_CLASS);
          highlightRef.current = null;
        }, SEARCH_HIGHLIGHT_MS),
      };
      setPendingJump(null);
    };
    tick();
    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [pendingJump, activeGroup, clearCurrentHighlight]);

  // 面板卸载：清掉高亮移除定时器并摘除残留类（元素此时可能已分离，操作无害）。
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
      setPendingResetGroup(group);
      setConfirmResetOpen(true);
    },
    [requestStorageGroupReset, requestBrowserGroupReset, requestDshGroupReset, setActiveGroup],
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

  // 组级重置沿用同一个 ConfirmDialog，文案按 pendingResetGroup 切换，避免"恢复全部"误导。
  const pendingGroupLabel = pendingResetGroup
    ? (t[
        SETTINGS_GROUPS.find((g) => g.id === pendingResetGroup)?.labelKey ?? 'settingsGeneral'
      ] as string)
    : null;

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
            <div className="adl-settings-panel__search" role="search">
              <label htmlFor="adl-settings-search-input" className="sr-only">
                {t.settingsSearchLabel}
              </label>
              <IconSearch size={12} decorative />
              <input
                id="adl-settings-search-input"
                type="search"
                className="adl-settings-panel__search-input"
                placeholder={t.settingsSearch}
                value={searchQuery}
                autoFocus
                onChange={(e) => setSearchQuery(e.target.value)}
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
            onClick={() => setResetAllOpen(true)}
            aria-label={t.settingsResetAll}
            disabled={allGroupsAtDefault}
          >
            {t.settingsResetAll}
          </button>
        </div>
      </header>
      <ResetAllDialog
        open={resetAllOpen}
        onClose={() => setResetAllOpen(false)}
        deps={resetAllStorageDeps}
        storagePredicates={resetAllStoragePredicates}
        onCommitted={handleResetAllCommitted}
      />
      <ConfirmDialog
        open={confirmResetOpen}
        title={
          pendingGroupLabel
            ? formatT(t, 'settingsResetGroupConfirmTitle', { group: pendingGroupLabel })
            : t.settingsResetConfirmTitle
        }
        message={
          pendingGroupLabel
            ? formatT(t, 'settingsResetGroupConfirmMessage', { group: pendingGroupLabel })
            : t.settingsResetConfirmMessage
        }
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
            onSelectGroup={setActiveGroup}
            resettableGroups={RESETTABLE_GROUPS}
            onResetGroup={handleRequestResetGroup}
            disabledResetGroups={disabledResetGroups}
            onPreheatGroup={handleNavPreheatGroup}
          />
          <div
            className="adl-settings-nav__resize-handle"
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
              {ActiveComponent ? (
                React.createElement(ActiveComponent)
              ) : isSearching ? (
                <SettingsSearchResults
                  entries={searchResults}
                  query={searchQuery}
                  onSelect={handleSelectResult}
                />
              ) : (
                <SettingsControls
                  items={filtered}
                  onChange={onChangeSetting}
                  searchQuery={searchQuery}
                />
              )}
            </div>
          </div>
          <RevealScrollbar controller={contentScrollbar} />
          {/* 水平条用点态常驻设计（文件/变更面板同款 HScrollbar），区别于竖条的悬停显现 */}
          <HScrollbar controller={hostScrollbar} />
        </div>
      </div>
    </div>
  );
}
