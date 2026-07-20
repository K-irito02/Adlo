import React from 'react';
import { createPortal } from 'react-dom';
import { IconPin, IconPinOff, IconEdit, IconTrash, IconGlobe, IconCopy, IconCut } from '@icons';
import type { ContextMenuState } from './useBrowserContextMenu';
import { useTCopy } from '@i18n/useTCopy';

interface BrowserContextMenuProps {
  contextMenu: ContextMenuState;
  onTogglePin: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopyUrl: () => void;
  onOpenInNewTab: () => void;
  onOpenInCurrentTab: () => void;
  onEdit: () => void;
  onCut: () => void;
}

export const BrowserContextMenu = React.memo(function BrowserContextMenu({
  contextMenu,
  onTogglePin,
  onRename,
  onDelete,
  onCopyUrl,
  onOpenInNewTab,
  onOpenInCurrentTab,
  onEdit,
  onCut,
}: BrowserContextMenuProps) {
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
        zIndex: 'var(--z-toast-top)',
      }}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button type="button" className="adl-sidebar-menu__item" onClick={onOpenInCurrentTab}>
        <span className="adl-sidebar-menu__icon">
          <IconGlobe size={16} decorative />
        </span>
        <span>{t.browserContextOpenCurrent}</span>
      </button>
      <button type="button" className="adl-sidebar-menu__item" onClick={onOpenInNewTab}>
        <span className="adl-sidebar-menu__icon">
          <IconGlobe size={16} decorative />
        </span>
        <span>{t.browserContextOpenNewTab}</span>
      </button>
      <div className="adl-sidebar-menu__sep" role="separator" />
      <button type="button" className="adl-sidebar-menu__item" onClick={onTogglePin}>
        <span className="adl-sidebar-menu__icon">
          {contextMenu.isPinned ? (
            <IconPinOff size={16} decorative />
          ) : (
            <IconPin size={16} decorative />
          )}
        </span>
        <span>{contextMenu.isPinned ? t.browserContextUnpin : t.browserContextPin}</span>
      </button>
      <button type="button" className="adl-sidebar-menu__item" onClick={onRename}>
        <span className="adl-sidebar-menu__icon">
          <IconEdit size={16} decorative />
        </span>
        <span>{t.browserContextRename}</span>
      </button>
      <button type="button" className="adl-sidebar-menu__item" onClick={onEdit}>
        <span className="adl-sidebar-menu__icon">
          <IconEdit size={16} decorative />
        </span>
        <span>{t.browserContextEdit}</span>
      </button>
      <button type="button" className="adl-sidebar-menu__item" onClick={onCut}>
        <span className="adl-sidebar-menu__icon">
          <IconCut size={16} decorative />
        </span>
        <span>{t.browserContextCut}</span>
      </button>
      <button type="button" className="adl-sidebar-menu__item" onClick={onCopyUrl}>
        <span className="adl-sidebar-menu__icon">
          <IconCopy size={16} decorative />
        </span>
        <span>{t.browserContextCopyLink}</span>
      </button>
      <div className="adl-sidebar-menu__sep" role="separator" />
      <button type="button" className="adl-sidebar-menu__item is-danger" onClick={onDelete}>
        <span className="adl-sidebar-menu__icon">
          <IconTrash size={16} decorative />
        </span>
        <span>{t.browserContextDelete}</span>
      </button>
    </div>,
    document.body,
  );
});
