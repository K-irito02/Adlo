import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconPin, IconPinOff, IconEdit, IconDelete } from '@icons';
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
  onClose,
}: TerminalContextMenuProps) {
  const { t } = useTCopy();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const open = contextMenu.open;

  // 外部点击 / Esc 关闭：菜单内元素自处理（mousedown 已 stopPropagation），
  // 这里只响应真正发生在菜单外的交互；否则菜单在「重命名/删除」之外的点击下会一直悬留。
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      className="adl-sidebar-menu"
      style={{
        position: 'fixed',
        left: contextMenu.x,
        top: contextMenu.y,
        zIndex: 'var(--z-toast-top)',
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
          <IconDelete size={16} decorative />
        </span>
        <span>{t.delete}</span>
      </button>
    </div>,
    document.body,
  );
});
