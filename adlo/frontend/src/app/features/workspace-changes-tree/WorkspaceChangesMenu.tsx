import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { CopyDict } from '@i18n';
import { IconCopy, IconEyeOff, IconFolderOpen } from '@icons';
import { BranchMenuItem } from '@regions/right-panel/panels/BranchSubCard';
import { MenuHintItem } from '@components/MenuHintItem';

export interface WorkspaceChangesMenuProps {
  menuOpen: boolean;
  menuPosition: { top: number; left: number } | null;
  menuId: string;
  currentBranch: string;
  onRequestBranchOpen: () => void;
  t: CopyDict;
  onHideFromRightPanels: () => void;
  onRevealInFileManager: () => void;
  onCopyFullPath: () => void;
  onCopyRelativePath: () => void;
  onClose: () => void;
}

export const WorkspaceChangesMenu = React.memo(function WorkspaceChangesMenu({
  menuOpen,
  menuPosition,
  menuId,
  currentBranch,
  onRequestBranchOpen,
  t,
  onHideFromRightPanels,
  onRevealInFileManager,
  onCopyFullPath,
  onCopyRelativePath,
  onClose,
}: WorkspaceChangesMenuProps) {
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const menuEl = document.querySelector(`[data-menu-id="${menuId}"]`);
      const btn = document.querySelector(`[data-menu-btn-id="${menuId}"]`);
      if (btn?.contains(target)) {
        return;
      }
      if (menuEl?.contains(target)) {
        return;
      }
      onClose();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const handleScroll = () => {
      onClose();
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menuOpen, menuId, onClose]);

  if (!menuOpen || !menuPosition) {
    return null;
  }

  return createPortal(
    <div
      className="adl-multitree-entry__menu"
      role="menu"
      data-menu-id={menuId}
      style={{ top: menuPosition.top, left: menuPosition.left }}
    >
      <BranchMenuItem currentBranch={currentBranch} onRequestOpen={onRequestBranchOpen} />
      <div className="adl-multitree-entry__menu-sep" role="separator" />
      <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" disabled>
        {t.changesStageAll}
      </button>
      <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" disabled>
        {t.changesUnstageAll}
      </button>
      <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" disabled>
        {t.changesCommit}
      </button>
      <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" disabled>
        {t.changesPush}
      </button>
      <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" disabled>
        {t.changesPull}
      </button>
      <div className="adl-multitree-entry__menu-sep" role="separator" />
      <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" disabled>
        {t.changesDiscardAll}
      </button>
      <div className="adl-multitree-entry__menu-sep" role="separator" />
      <MenuHintItem
        label={t.workspaceRemoveEntry}
        hint={t.workspaceRemoveEntryHint}
        onClick={onHideFromRightPanels}
        icon={<IconEyeOff size={14} />}
      />
      <button
        type="button"
        className="adl-multitree-entry__menu-item"
        role="menuitem"
        onClick={onRevealInFileManager}
      >
        <IconFolderOpen size={14} />
        {t.sessionMenuRevealFolder as string}
      </button>
      <div className="adl-multitree-entry__menu-sep" role="separator" />
      <button
        type="button"
        className="adl-multitree-entry__menu-item"
        role="menuitem"
        onClick={onCopyFullPath}
      >
        <IconCopy size={14} />
        {t.fileCopyFullPath}
      </button>
      <button
        type="button"
        className="adl-multitree-entry__menu-item"
        role="menuitem"
        onClick={onCopyRelativePath}
      >
        <IconCopy size={14} />
        {t.fileCopyRelativePath}
      </button>
    </div>,
    document.body,
  );
});
