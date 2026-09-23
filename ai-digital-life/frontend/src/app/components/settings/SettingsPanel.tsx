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
import { SETTINGS_GROUPS } from './settingsGroups';
import { SettingsControls } from './SettingsControls';
import { KeybindSettings } from './KeybindSettings';
import { WorkspaceSettings } from '../../features/workspace-settings/WorkspaceSettings';
import { BrowserSettings } from '../../features/browser-settings/BrowserSettings';
import { DshSettings } from '../../features/dsh/DshSettings';
import { StorageSettings } from '../../features/storage-settings/StorageSettings';
import {
  getDefaultPreferences,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME_MODE,
  DEFAULT_LOG_LEVEL,
  DEFAULT_TERMINAL_LOG_MODE,
  DEFAULT_DEBUG_LOG_MODE,
  DEFAULT_FONTS,
  DEFAULT_MAX_CONCURRENT_WORKSPACES,
  DEFAULT_WORKSPACE_PRIORITY_IDS,
  DEFAULT_WORKSPACE_DEFERRED_IDS,
  DEFAULT_WORKSPACE_NATURAL_ORDER,
} from '../../../shared/defaultPreferences';
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

/** 组级重置已接入默认映射的组（general / workspace；其它组为独立组件/独立存储，暂不挂载按钮）。 */
const RESETTABLE_GROUPS: ReadonlySet<SettingsGroupId> = new Set(['general', 'workspace']);

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
    })),
  );

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
    const ok = await updatePreferences(getDefaultPreferences());
    showToast(ok ? t.settingsResetComplete : t.settingsUpdateFailed, ok ? 'success' : 'error');
  }, [updatePreferences, showToast, t]);

  const handleResetGroup = useCallback(
    async (group: SettingsGroupId) => {
      if (group === 'general') {
        const ok = await updatePreferences({
          language: DEFAULT_LANGUAGE,
          themeMode: DEFAULT_THEME_MODE,
          logLevel: DEFAULT_LOG_LEVEL,
          terminalLogMode: DEFAULT_TERMINAL_LOG_MODE,
          debugLogMode: DEFAULT_DEBUG_LOG_MODE,
          fonts: { ...DEFAULT_FONTS },
        });
        showToast(ok ? t.settingsResetComplete : t.settingsUpdateFailed, ok ? 'success' : 'error');
        return;
      }
      if (group === 'workspace') {
        const ok = await updatePreferences({
          maxConcurrentWorkspaces: DEFAULT_MAX_CONCURRENT_WORKSPACES,
          workspacePriorityIds: [...DEFAULT_WORKSPACE_PRIORITY_IDS],
          workspaceDeferredIds: [...DEFAULT_WORKSPACE_DEFERRED_IDS],
          workspaceNaturalOrder: [...DEFAULT_WORKSPACE_NATURAL_ORDER],
        });
        showToast(ok ? t.settingsResetComplete : t.settingsUpdateFailed, ok ? 'success' : 'error');
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

  const handleRequestResetGroup = useCallback((group: SettingsGroupId) => {
    setPendingResetGroup(group);
    setConfirmResetOpen(true);
  }, []);

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
