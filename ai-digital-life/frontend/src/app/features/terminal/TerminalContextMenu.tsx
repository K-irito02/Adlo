import React from 'react';
import { createPortal } from 'react-dom';
import { IconPin, IconPinOff, IconEdit, IconTrash } from '@icons';
import type { ContextMenuState } from './useTerminalPanel';
import { useTCopy } from '@i18n/useTCopy';

interface TerminalContextMenuProps {
  contextMenu: ContextMenuState;
  onTogglePin: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const TerminalContextMenu = React.memo(function TerminalContextMenu({
  contextMenu,
  onTogglePin,
  onRename,
  onDelete,
}: TerminalContextMenuProps) {
  const { t } = useTCopy();
  if (!contextMenu.open) {
    return null;
  }

  return createPortal(
    <div
      className="adl-sidebar-menu"
      style={{
        position: 'fixed',
        left: contextMenu.x,
        top: contextMenu.y,
        zIndex: 99999,
      }}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button type="button" className="adl-sidebar-menu__item" onClick={onTogglePin}>
        <span className="adl-sidebar-menu__icon">
          {contextMenu.isPinned ? (
            <IconPinOff size={16} decorative />
          ) : (
            <IconPin size={16} decorative />
          )}
        </span>
        <span>{contextMenu.isPinned ? t.unpin : t.pin}</span>
      </button>
      <button type="button" className="adl-sidebar-menu__item" onClick={onRename}>
        <span className="adl-sidebar-menu__icon">
          <IconEdit size={16} decorative />
        </span>
        <span>{t.rename}</span>
      </button>
      <div className="adl-sidebar-menu__sep" role="separator" />
      <button type="button" className="adl-sidebar-menu__item is-danger" onClick={onDelete}>
        <span className="adl-sidebar-menu__icon">
          <IconTrash size={16} decorative />
        </span>
        <span>{t.delete}</span>
      </button>
    </div>,
    document.body
  );
});
