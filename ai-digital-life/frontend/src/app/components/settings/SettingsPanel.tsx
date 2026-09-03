import React, { useMemo, useRef, useCallback } from 'react';
import type { SettingItem, SettingsGroupId } from '@shared/ipc';
import { useTCopy } from '../../i18n/useTCopy';
import { IconSearch, IconPanelLeft, IconPanelLeftClose } from '../../icons';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { TooltipSimple } from '../Tooltip';
import { SettingsNav } from './SettingsNav';
import { SettingsControls } from './SettingsControls';
import { KeybindSettings } from './KeybindSettings';
import { ReferenceSettings } from '../../features/reference-manager/ReferenceSettings';
import { LspSettings } from '../../features/lsp-panel/LspSettings';
import { WorkspaceSettings } from '../../features/workspace-settings/WorkspaceSettings';
import { BrowserSettings } from '../../features/browser-settings/BrowserSettings';
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
  references: ReferenceSettings,
  lsp: LspSettings,
  workspace: WorkspaceSettings,
  browser: BrowserSettings,
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

  const handleResetAll = async () => {
    await updatePreferences(getDefaultPreferences());
    showToast(t.settingsResetComplete, 'success');
  };

  const filtered = useMemo(() => {
    let items = settings;
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      items = items.filter(
        (s) =>
          s.label.toLowerCase().includes(lower) || s.description?.toLowerCase().includes(lower),
      );
    } else {
      items = items.filter((s) => s.groupId === activeGroup);
    }
    return items;
  }, [activeGroup, searchQuery, settings]);

  const ActiveComponent = !searchQuery.trim() ? SETTINGS_COMPONENTS[activeGroup] : undefined;

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
        </div>
        <div className="adl-settings-panel__header-actions">
          <div className="adl-settings-panel__search">
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
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="adl-settings-reset-all"
            onClick={handleResetAll}
            aria-label={t.settingsResetAll}
          >
            {t.settingsResetAll}
          </button>
        </div>
      </header>
      <div
        className={`adl-settings-panel__body${navigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
      >
        {!searchQuery.trim() && (
          <nav
            className="adl-tool-navigator adl-settings-nav"
            style={
              { '--adl-settings-nav-width': `${settingsNavigatorWidth}px` } as React.CSSProperties
            }
          >
            <SettingsNav activeGroup={activeGroup} onSelectGroup={setActiveGroup} />
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
          </nav>
        )}
        <div className="adl-settings-panel__content">
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
