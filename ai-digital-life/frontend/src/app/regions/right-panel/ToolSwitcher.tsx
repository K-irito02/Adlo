import React from 'react';
import {
  IconFiles,
  IconGitFork,
  IconGlobe,
  IconPanelRight,
  IconPanelRightClose,
  IconTerminal,
  IconSettings,
} from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { useAppStore } from '@stores/slicedStore';
import { EMPTY_KEYBINDS } from '@shared/keybinds';
import { displayShortcut, type CommandMeta } from '@app/commands/defaultCommands';
import type { ToolId } from '@stores/types';
import type { CopyDict } from '@i18n';
import { useTCopy } from '@i18n/useTCopy';

interface ToolSwitcherProps {
  activeTool: ToolId;
  badges: Record<ToolId, number>;
  idBase: string;
  onSelect: (tool: ToolId) => void;
  rightPanelExpanded: boolean;
  onToggleRightPanelExpanded: () => void;
}

const TAB_META: {
  id: ToolId;
  commandId: CommandMeta['id'];
  icon: React.ReactNode;
  labelKey: keyof CopyDict;
}[] = [
  {
    id: 'files',
    commandId: 'view.files',
    icon: <IconFiles size={16} decorative />,
    labelKey: 'toolFiles',
  },
  {
    id: 'changes',
    commandId: 'view.changes',
    icon: <IconGitFork size={16} decorative />,
    labelKey: 'toolChanges',
  },
  {
    id: 'browser',
    commandId: 'view.browser',
    icon: <IconGlobe size={16} decorative />,
    labelKey: 'toolBrowser',
  },
  {
    id: 'terminal',
    commandId: 'view.terminal',
    icon: <IconTerminal size={16} decorative />,
    labelKey: 'toolTerminal',
  },
  {
    id: 'settings',
    commandId: 'settings.open',
    icon: <IconSettings size={16} decorative />,
    labelKey: 'toolSettings',
  },
  // ── 通信面板（发布前隐藏，可恢复） ─────────────────────────────────────
  // 隐藏原因：通信面板还有很多功能没有实现，发布产品时暂不对外展示，
  // 以后考虑好后会再恢复实现与完善，所以这里只注释、不删除代码。
  // 恢复方法（共 3 处，缺一不可）：
  // 1. 取消下面整个 communicate 配置块的注释；
  // 2. 恢复 RightPanel.tsx 中的 CommunicationPanel 懒加载 import 与面板 div；
  // 3. 确认 ToolId（stores/types.ts）仍保留 'communicate'（已保留，无需改动）。
  // 注意：badges 仍保留 communicate 键（useRightPanelViewProps），恢复后徽标自动生效；
  // 持久化的 activeRightTool 若为旧值（如 'communicate'），注册表的 readStringEnum 会回落到 'files'，无需迁移。
  // {
  //   id: 'communicate',
  //   icon: (
  //     <svg
  //       viewBox="0 0 16 16"
  //       width="16"
  //       height="16"
  //       fill="currentColor"
  //       style={{ display: 'block' }}
  //     >
  //       <path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-3 3v-3H4a2 2 0 0 1-2-2V4zm2-1a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h3v2.5L9.5 10H12a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4z" />
  //       <path d="M5 5.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-1a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5z" />
  //     </svg>
  //   ),
  //   labelKey: 'toolCommunicate',
  // },
];

export const ToolSwitcher = React.memo(function ToolSwitcher({
  activeTool,
  badges,
  idBase,
  onSelect,
  rightPanelExpanded,
  onToggleRightPanelExpanded,
}: ToolSwitcherProps) {
  const { t } = useTCopy();
  const [hoveredTool, setHoveredTool] = React.useState<ToolId | null>(null);
  const keybinds = useAppStore((s) => s.appInfo?.config?.keybinds) ?? EMPTY_KEYBINDS;

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
    [onSelect, idBase],
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
          const hint = displayShortcut(keybinds, tab.commandId);
          return (
            <React.Fragment key={tab.id}>
              <TooltipSimple content={hint ? `${label} · ${hint}` : label} placement="top">
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
