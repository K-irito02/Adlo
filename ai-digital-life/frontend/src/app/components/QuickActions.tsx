import React from 'react';
import { renderIcon, type IconName } from '../../design-system/icons';
import { TooltipSimple } from './Tooltip';

export interface QuickActionsProps {
  /** Identifier of the currently active action (for visual highlight). */
  activeAction?: string;
  /** MCP server connection status, drives the status dot color. */
  mcpStatus?: 'connected' | 'partial' | 'error' | 'none';
  onSkillsClick: () => void;
  onMcpClick: () => void;
  onNewWorkspace: () => void;
}

/** Map MCP status to a CSS-compatible color variable fragment for the status dot. */
const MCP_STATUS_COLOR: Record<NonNullable<QuickActionsProps['mcpStatus']>, string> = {
  connected: 'var(--success)',
  partial: 'var(--warning)',
  error: 'var(--danger)',
  none: 'var(--text-disabled)',
};

interface ActionButtonProps {
  icon: IconName;
  label: string;
  tooltip: string;
  isActive: boolean;
  onClick: () => void;
  statusDot?: string;
}

function ActionButton({
  icon,
  label: _label,
  tooltip,
  isActive,
  onClick,
  statusDot,
}: ActionButtonProps) {
  return (
    <TooltipSimple content={tooltip} placement="right">
      <button
        type="button"
        className={`sidebar-quick-action${isActive ? ' sidebar-quick-action--active' : ''}`}
        aria-label={tooltip}
        onClick={onClick}
      >
        <span
          className="sidebar-quick-action__icon"
          dangerouslySetInnerHTML={{
            __html: renderIcon(icon, { size: 'sm', decorative: true }).value,
          }}
        />
        {statusDot ? (
          <span
            className="sidebar-quick-action__dot"
            style={{ backgroundColor: statusDot }}
            aria-hidden="true"
          />
        ) : null}
      </button>
    </TooltipSimple>
  );
}

/**
 * Region 5 - Quick action buttons displayed at the top of the left sidebar.
 *
 * Provides fast access to Skills, MCP Servers, and New Workspace actions.
 * Each button is a 32x32px icon-only control with optional status indicator.
 */
export function QuickActions({
  activeAction,
  mcpStatus = 'none',
  onSkillsClick,
  onMcpClick,
  onNewWorkspace,
}: QuickActionsProps): React.ReactElement {
  return (
    <div className="sidebar-quick-actions" role="toolbar" aria-label="Quick actions">
      <ActionButton
        icon="sparkles"
        label="skills"
        tooltip="Skills"
        isActive={activeAction === 'skills'}
        onClick={onSkillsClick}
      />
      <ActionButton
        icon="plug"
        label="mcp"
        tooltip="MCP Servers"
        isActive={activeAction === 'mcp'}
        onClick={onMcpClick}
        statusDot={MCP_STATUS_COLOR[mcpStatus]}
      />
      <ActionButton
        icon="folder-plus"
        label="new-workspace"
        tooltip="New Workspace (Ctrl+N)"
        isActive={false}
        onClick={onNewWorkspace}
      />
    </div>
  );
}

export default QuickActions;
