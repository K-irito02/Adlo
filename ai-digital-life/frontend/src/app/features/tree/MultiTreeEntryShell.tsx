import React from 'react';
import { IconFolder, IconFolderOpen } from '@icons';

export interface MultiTreeEntryShellProps {
  /** The display label for the entry (node name) */
  label: string;

  /** Whether this entry is currently expanded */
  isExpanded: boolean;

  /** Whether this entry is currently selected */
  isSelected: boolean;

  /** The count of child items to display */
  count: number;

  /** Click handler for the header row (toggles expand + selects) */
  onHeaderClick: () => void;

  /** Right-click handler for the header row */
  onHeaderContextMenu: (e: React.MouseEvent) => void;

  /** Click handler for the expand/collapse button */
  onExpandBtnClick: (e: React.MouseEvent) => void;

  /** Keyboard handler for the namezone (Enter selects) */
  onNameKeyDown: (e: React.KeyboardEvent) => void;

  /** Accessibility label for expand */
  expandLabel: string;

  /** Accessibility label for collapse */
  collapseLabel: string;

  /** Text shown when expanded but no children */
  emptyText: string;

  /** The action buttons rendered inside adl-browser-entry__actions */
  actionButtonsSlot: React.ReactNode;

  /** The entry-level portal context menu (createPortal node, rendered between header and children) */
  entryMenuSlot?: React.ReactNode;

  /** Whether this node has children (controls empty state display) */
  hasChildren: boolean;

  /** Expanded children content (e.g., <div className="adl-browser-entry__tree"><FileTree ... /></div>) */
  children?: React.ReactNode;

  /** Extra content rendered after the empty state / children (e.g., child portal menu, dialogs) */
  extraContent?: React.ReactNode;
}

/**
 * Shared skeleton for tree entry rendering.
 *
 * Renders the common outer structure shared by BrowserTreeEntry and GitHubTreeEntry:
 * the header row (expand button, label, trailing count, action buttons), portal
 * context menu placement, expanded children area, and empty state.
 *
 * The variable parts (action buttons, menu content, FileTree children, extra
 * dialogs/portals) are injected via slots.
 */
export const MultiTreeEntryShell = React.memo(function MultiTreeEntryShell({
  label,
  isExpanded,
  isSelected,
  count,
  onHeaderClick,
  onHeaderContextMenu,
  onExpandBtnClick,
  onNameKeyDown,
  expandLabel,
  collapseLabel,
  emptyText,
  actionButtonsSlot,
  entryMenuSlot,
  hasChildren,
  children,
  extraContent,
}: MultiTreeEntryShellProps) {
  return (
    <div className="adl-browser-entry">
      <div
        className={`adl-browser-entry__header${isSelected ? ' is-selected' : ''}`}
        onClick={onHeaderClick}
        onContextMenu={onHeaderContextMenu}
      >
        <div className="adl-browser-entry__expand">
          <button
            type="button"
            className={`adl-browser-entry__expand-btn${isExpanded ? ' is-expanded' : ''}`}
            onClick={onExpandBtnClick}
            aria-label={isExpanded ? collapseLabel : expandLabel}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <IconFolderOpen size={14} decorative />
            ) : (
              <IconFolder size={14} decorative />
            )}
          </button>
        </div>
        <div
          className="adl-browser-entry__namezone"
          onKeyDown={onNameKeyDown}
          role="button"
          tabIndex={0}
        >
          <span className="adl-browser-entry__name" title={label}>
            {label}
          </span>
          <div className="adl-browser-entry__trailing">
            <span className="adl-browser-entry__count">{count}</span>
            <div className="adl-browser-entry__actions">{actionButtonsSlot}</div>
          </div>
        </div>
      </div>

      {entryMenuSlot}

      {isExpanded && hasChildren && children ? children : null}

      {isExpanded && !hasChildren ? (
        <div className="adl-browser-entry__empty">
          <span className="adl-empty-hint">{emptyText}</span>
        </div>
      ) : null}

      {extraContent}
    </div>
  );
});
