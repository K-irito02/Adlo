import React from "react";
import { createPortal } from "react-dom";
import { IconPin, IconPinOff, IconEdit, IconTrash, IconGlobe, IconCopy, IconCut } from "../../icons";
import type { CopyDict } from "../../i18n";
import type { ContextMenuState } from "./useBrowserContextMenu";

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
  t: CopyDict;
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
  t,
}: BrowserContextMenuProps) {
  if (!contextMenu.open) return null;

  return createPortal(
    <div
      className="adl-sidebar-menu"
      style={{
        position: "fixed",
        left: contextMenu.x,
        top: contextMenu.y,
        zIndex: 99999
      }}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="adl-sidebar-menu__item"
        onClick={onOpenInCurrentTab}
      >
        <span className="adl-sidebar-menu__icon">
          <IconGlobe size={16} decorative />
        </span>
        <span>在当前标签打开</span>
      </button>
      <button
        type="button"
        className="adl-sidebar-menu__item"
        onClick={onOpenInNewTab}
      >
        <span className="adl-sidebar-menu__icon">
          <IconGlobe size={16} decorative />
        </span>
        <span>在新标签打开</span>
      </button>
      <div className="adl-sidebar-menu__sep" role="separator" />
      <button
        type="button"
        className="adl-sidebar-menu__item"
        onClick={onTogglePin}
      >
        <span className="adl-sidebar-menu__icon">
          {contextMenu.isPinned ? (
            <IconPinOff size={16} decorative />
          ) : (
            <IconPin size={16} decorative />
          )}
        </span>
        <span>{contextMenu.isPinned ? "取消置顶" : "置顶标签"}</span>
      </button>
      <button
        type="button"
        className="adl-sidebar-menu__item"
        onClick={onRename}
      >
        <span className="adl-sidebar-menu__icon">
          <IconEdit size={16} decorative />
        </span>
        <span>重命名</span>
      </button>
      <button
        type="button"
        className="adl-sidebar-menu__item"
        onClick={onEdit}
      >
        <span className="adl-sidebar-menu__icon">
          <IconEdit size={16} decorative />
        </span>
        <span>编辑</span>
      </button>
      <button
        type="button"
        className="adl-sidebar-menu__item"
        onClick={onCut}
      >
        <span className="adl-sidebar-menu__icon">
          <IconCut size={16} decorative />
        </span>
        <span>剪切</span>
      </button>
      <button
        type="button"
        className="adl-sidebar-menu__item"
        onClick={onCopyUrl}
      >
        <span className="adl-sidebar-menu__icon">
          <IconCopy size={16} decorative />
        </span>
        <span>复制链接</span>
      </button>
      <div className="adl-sidebar-menu__sep" role="separator" />
      <button
        type="button"
        className="adl-sidebar-menu__item is-danger"
        onClick={onDelete}
      >
        <span className="adl-sidebar-menu__icon">
          <IconTrash size={16} decorative />
        </span>
        <span>删除</span>
      </button>
    </div>,
    document.body
  );
});
