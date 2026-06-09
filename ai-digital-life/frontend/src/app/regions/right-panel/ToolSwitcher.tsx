import React from 'react';
import {
  IconFiles,
  IconGitFork,
  IconGlobe,
  IconPanelRight,
  IconPanelRightClose,
  IconTerminal,
  IconShield,
  IconSettings,
  IconCpu,
} from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import type { CopyDict } from '../../i18n';
import type { ToolId } from '../../stores/types';

interface ToolSwitcherProps {
  t: CopyDict;
  activeTool: ToolId;
  badges: Record<ToolId, number>;
  idBase: string;
  onSelect: (tool: ToolId) => void;
  rightPanelExpanded: boolean;
  onToggleRightPanelExpanded: () => void;
}

const TAB_META: Array<{
  id: ToolId;
  shortcut: string;
  icon: React.ReactNode;
  labelKey: keyof CopyDict;
}> = [
  {
    id: 'files',
    shortcut: 'Ctrl+Shift+E',
    icon: <IconFiles size={16} decorative />,
    labelKey: 'toolFiles',
  },
  {
    id: 'changes',
    shortcut: 'Ctrl+Shift+G',
    icon: <IconGitFork size={16} decorative />,
    labelKey: 'toolChanges',
  },
  {
    id: 'browser',
    shortcut: 'Ctrl+Shift+B',
    icon: <IconGlobe size={16} decorative />,
    labelKey: 'toolBrowser',
  },
  {
    id: 'terminal',
    shortcut: 'Ctrl+Shift+`',
    icon: <IconTerminal size={16} decorative />,
    labelKey: 'toolTerminal',
  },
  {
    id: 'audit',
    shortcut: 'Ctrl+Shift+A',
    icon: <IconShield size={16} decorative />,
    labelKey: 'toolAudit',
  },
  {
    id: 'models',
    shortcut: 'Ctrl+Shift+M',
    icon: <IconCpu size={16} decorative />,
    labelKey: 'toolModels',
  },
  {
    id: 'settings',
    shortcut: 'Ctrl+Shift+,',
    icon: <IconSettings size={16} decorative />,
    labelKey: 'toolSettings',
  },
  {
    id: 'ci',
    shortcut: 'Ctrl+Shift+Q',
    icon: (
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="currentColor"
        style={{ display: 'block' }}
      >
        <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.5 5.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h1zm-5 0a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h1zM8 8a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5v-1A.5.5 0 0 1 7 8h1z" />
      </svg>
    ),
    labelKey: 'toolCi',
  },
];

export const ToolSwitcher = React.memo(function ToolSwitcher({
  t,
  activeTool,
  badges,
  idBase,
  onSelect,
  rightPanelExpanded,
  onToggleRightPanelExpanded,
}: ToolSwitcherProps) {
  const [hoveredTool, setHoveredTool] = React.useState<ToolId | null>(null);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentTool: ToolId) => {
      const currentIndex = TAB_META.findIndex((tab) => tab.id === currentTool);
      if (currentIndex === -1) {
        return;
      }

      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % TAB_META.length;
      } else if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + TAB_META.length) % TAB_META.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = TAB_META.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      const nextTool = TAB_META[nextIndex];
      onSelect(nextTool.id);
      requestAnimationFrame(() => {
        const nextTab = document.getElementById(`${idBase}-${nextTool.id}-tab`);
        nextTab?.focus();
      });
    },
    [onSelect, idBase]
  );

  return (
    <div className="adl-toolswitcher">
      <div
        className="adl-toolswitcher__tabs adl-iconstrip"
        role="tablist"
        aria-label={t.toolSwitcher}
        aria-orientation="horizontal"
      >
        {TAB_META.map((tab, index) => {
          const label = t[tab.labelKey] as string;
          const badge = badges[tab.id];
          const isActive = activeTool === tab.id;
          const isHighlighted = isActive || hoveredTool === tab.id;
          const tabId = `${idBase}-${tab.id}-tab`;
          const panelId = `${idBase}-${tab.id}-panel`;
          const nextTab = TAB_META[index + 1];
          const shouldShowSeparator =
            !!nextTab && isHighlighted && (activeTool === nextTab.id || hoveredTool === nextTab.id);
          return (
            <React.Fragment key={tab.id}>
              <TooltipSimple content={`${label} · ${tab.shortcut}`} placement="top">
                <button
                  type="button"
                  id={tabId}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={panelId}
                  aria-label={label}
                  tabIndex={isActive ? 0 : -1}
                  className={`adl-toolswitcher__tab adl-iconstrip__button${isActive ? ' is-active' : ''}`}
                  onClick={() => onSelect(tab.id)}
                  onKeyDown={(event) => handleKeyDown(event, tab.id)}
                  onMouseEnter={() => setHoveredTool(tab.id)}
                  onMouseLeave={() =>
                    setHoveredTool((current) => (current === tab.id ? null : current))
                  }
                >
                  <span className="adl-toolswitcher__icon">{tab.icon}</span>
                  <span className="adl-toolswitcher__label">{label}</span>
                  {badge > 0 ? (
                    <span className="adl-toolswitcher__badge adl-iconstrip__badge">{badge}</span>
                  ) : null}
                </button>
              </TooltipSimple>
              {index < TAB_META.length - 1 ? (
                <span
                  className={`adl-toolswitcher__separator adl-iconstrip__separator${shouldShowSeparator ? ' is-visible' : ''}`}
                  aria-hidden="true"
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
      <div className="adl-toolswitcher__actions">
        <TooltipSimple
          content={rightPanelExpanded ? t.rightPanelRestore : t.rightPanelExpand}
          placement="top"
        >
          <button
            type="button"
            className={`adl-toolswitcher__expand adl-iconstrip__button${rightPanelExpanded ? ' is-active' : ''}`}
            aria-label={rightPanelExpanded ? t.rightPanelRestore : t.rightPanelExpand}
            aria-pressed={rightPanelExpanded}
            onClick={onToggleRightPanelExpanded}
          >
            <span className="adl-toolswitcher__icon">
              {rightPanelExpanded ? (
                <IconPanelRightClose size={16} decorative />
              ) : (
                <IconPanelRight size={16} decorative />
              )}
            </span>
          </button>
        </TooltipSimple>
      </div>
    </div>
  );
});
