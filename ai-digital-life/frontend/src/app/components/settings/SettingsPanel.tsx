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
  isKeybindsAtDefault,
  isWorkspaceAtDefault,
  isPatchSatisfied,
  getGroupResetPatch,
} from './settingsGroups';
import { SettingsControls } from './SettingsControls';
import { KeybindSettings } from './KeybindSettings';
import { WorkspaceSettings } from '../../features/workspace-settings/WorkspaceSettings';
import { BrowserSettings } from '../../features/browser-settings/BrowserSettings';
import { DshSettings } from '../../features/dsh/DshSettings';
import { StorageSettings } from '../../features/storage-settings/StorageSettings';
import { getDefaultPreferences } from '../../../shared/defaultPreferences';
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
        workspaceNaturalOrder: config.workspaceNaturalOrder,
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

  const rafRef = useRef(0);

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

  const handleResetAll = useCallback(async () => {
    // 恢复全部仅覆盖偏好 patch（`getDefaultPreferences()`）；下载模式 / 路径 /
    // 迁移开关走独立下载桥，不在其内——浏览器组级恢复覆盖这三步
    //（F2，预存范围，非本次引入）。
    try {
      const ok = await updatePreferences(getDefaultPreferences());
      showToast(ok ? t.settingsResetComplete : t.settingsUpdateFailed, ok ? 'success' : 'error');
    } catch {
      showToast(t.settingsUpdateFailed, 'error');
    }
  }, [updatePreferences, showToast, t]);

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

  const collapseSearch = useCallback(() => {
    setSearchQuery('');
    setSearchOpen(false);
  }, [setSearchQuery]);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Escape' || confirmResetOpen) {
        return;
      }
      event.stopPropagation();
      returnFocusToSearchRef.current = true;
      collapseSearch();
    },
    [collapseSearch, confirmResetOpen],
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
    if (pendingResetGroup) {
      const group = pendingResetGroup;
      setPendingResetGroup(null);
      void handleResetGroup(group);
      return;
    }
    void handleResetAll();
  }, [handleResetAll, handleResetGroup, pendingResetGroup]);

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

  const filtered = useMemo(() => {
    let items = settings;
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      items = items.filter(
        (s) =>
          s.label.toLowerCase().includes(lower) || s.description?.toLowerCase().includes(lower),
      );
    } else {
      items = items.filter((s) => s.groupId === effectiveGroup);
    }
    return items;
  }, [effectiveGroup, searchQuery, settings]);

  const ActiveComponent = !searchQuery.trim() ? SETTINGS_COMPONENTS[effectiveGroup] : undefined;

  // 组级重置沿用同一个 ConfirmDialog，文案按 pendingResetGroup 切换，避免"恢复全部"误导。
  const pendingGroupLabel = pendingResetGroup
    ? (t[
        SETTINGS_GROUPS.find((g) => g.id === pendingResetGroup)?.labelKey ?? 'settingsGeneral'
      ] as string)
    : null;

  return (
    <div className="adl-settings-panel">
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
            onClick={() => setConfirmResetOpen(true)}
            aria-label={t.settingsResetAll}
          >
            {t.settingsResetAll}
          </button>
        </div>
      </header>
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
        {!searchQuery.trim() && (
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
        )}
        <div className="adl-settings-panel__content adl-settings-panel__content--cards">
          {ActiveComponent ? (
            React.createElement(ActiveComponent)
          ) : (
            <SettingsControls
              items={filtered}
              onChange={onChangeSetting}
              searchQuery={searchQuery}
            />
          )}
        </div>
      </div>
    </div>
  );
}
