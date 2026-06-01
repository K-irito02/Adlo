import React, { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { IconPlus, IconTrash, IconMoreVertical, IconFolder, IconFolderOpen } from "../../icons";
import { FileTree } from "../file-tree";
import { TooltipSimple } from "../../components/Tooltip";
import type { BrowserTreeNode, BrowserCategoryType } from "./types";
import type { SectionCallbacks } from "./BrowserCategorySection";

interface BrowserTreeEntryProps {
  node: BrowserTreeNode;
  categoryType: BrowserCategoryType;
  expandedPaths: Record<string, boolean>;
  onTogglePath: (path: string) => void;
  onOpenFile: (path: string) => void;
  callbacks: SectionCallbacks;
}

function getEntryHoverButtons(nodeType: string, categoryType: BrowserCategoryType): Array<{ id: string; label: string; icon: React.ReactNode }> {
  if (categoryType === "history") {
    return [{ id: "more", label: "更多操作", icon: <IconMoreVertical size={12} decorative /> }];
  }
  return [
    { id: "create-tab", label: "新建标签", icon: <IconPlus size={12} decorative /> },
    { id: "delete-all-tabs", label: "删除所有子标签", icon: <IconTrash size={12} decorative /> },
    { id: "more", label: "更多操作", icon: <IconMoreVertical size={12} decorative /> },
  ];
}

function getEntryMoreMenuItems(
  nodeType: string,
  categoryType: BrowserCategoryType,
  nodePath: string,
  callbacks: SectionCallbacks,
): Array<{ id: string; label: string; danger?: boolean; action: () => void }> {
  if (categoryType === "history") {
    return [
      { id: "delete-history-label", label: "删除全部历史记录 · 标签", action: () => callbacks.onDeleteHistory("label", nodePath) },
      { id: "delete-history-year", label: "删除全部历史记录 · 年", danger: true, action: () => callbacks.onDeleteHistory("year", nodePath) },
      { id: "delete-history-month", label: "删除全部历史记录 · 月", danger: true, action: () => callbacks.onDeleteHistory("month", nodePath) },
      { id: "delete-history-day", label: "删除全部历史记录 · 日", danger: true, action: () => callbacks.onDeleteHistory("day", nodePath) },
    ];
  }

  const items: Array<{ id: string; label: string; danger?: boolean; action: () => void }> = [];
  items.push({ id: "open-all-tabs", label: "全部在新标签中打开", action: () => callbacks.onOpenAllInNewTabs(categoryType, nodePath) });

  if (nodeType === "workspace") {
    const wsId = nodePath.startsWith("workspace:") ? nodePath.slice("workspace:".length) : "";
    items.push({ id: "remove-from-area", label: "从该区域移除不显示", action: () => callbacks.onRemoveFromArea(wsId) });
  }

  if (nodeType === "folder" && categoryType === "userFolder") {
    const folderId = nodePath.startsWith("folder:") ? nodePath.slice("folder:".length) : "";
    items.push({ id: "rename", label: "重命名", action: () => callbacks.onRenameDirectory(folderId) });
  }

  items.push({ id: "delete-all-tabs", label: "删除所有子标签", action: () => callbacks.onDeleteAllChildTabs(categoryType, nodePath) });

  if (nodeType === "folder" && categoryType === "userFolder") {
    const folderId = nodePath.startsWith("folder:") ? nodePath.slice("folder:".length) : "";
    items.push({ id: "delete-this-dir", label: "删除此目录", danger: true, action: () => callbacks.onDeleteDirectory(folderId) });
  }

  return items;
}

function getChildNodeHoverButtons(
  nodeType: string,
  categoryType: BrowserCategoryType,
): Array<{ id: string; label: string; icon: React.ReactNode }> {
  if (categoryType === "history") {
    if (nodeType === "day") {
      return [
        { id: "delete-all-tabs", label: "删除所有子标签", icon: <IconTrash size={12} decorative /> },
        { id: "more", label: "更多操作", icon: <IconMoreVertical size={12} decorative /> },
      ];
    }
    return [];
  }

  if (nodeType === "folder") {
    return [
      { id: "create-tab", label: "新建标签", icon: <IconPlus size={12} decorative /> },
      { id: "delete-all-tabs", label: "删除所有子标签", icon: <IconTrash size={12} decorative /> },
      { id: "more", label: "更多操作", icon: <IconMoreVertical size={12} decorative /> },
    ];
  }

  return [];
}

function getChildNodeMoreMenuItems(
  nodeType: string,
  categoryType: BrowserCategoryType,
  nodePath: string,
  callbacks: SectionCallbacks,
): Array<{ id: string; label: string; danger?: boolean; action: () => void }> {
  if (categoryType === "history" && nodeType === "day") {
    return [
      { id: "open-all-tabs", label: "全部在新标签中打开", action: () => callbacks.onOpenAllInNewTabs(categoryType, nodePath) },
      { id: "delete-all-tabs", label: "删除所有子标签", action: () => callbacks.onDeleteAllChildTabs(categoryType, nodePath) },
      { id: "delete-this-dir", label: "删除此目录", danger: true, action: () => callbacks.onDeleteDirectory(nodePath) },
    ];
  }

  if (nodeType === "folder") {
    const folderId = nodePath.startsWith("folder:") ? nodePath.slice("folder:".length) : "";
    return [
      { id: "open-all-tabs", label: "全部在新标签中打开", action: () => callbacks.onOpenAllInNewTabs(categoryType, nodePath) },
      { id: "rename", label: "重命名", action: () => callbacks.onRenameDirectory(folderId) },
      { id: "delete-all-tabs", label: "删除所有子标签", action: () => callbacks.onDeleteAllChildTabs(categoryType, nodePath) },
      { id: "delete-this-dir", label: "删除此目录", danger: true, action: () => callbacks.onDeleteDirectory(folderId) },
    ];
  }

  return [];
}

function collectLeafCount(node: BrowserTreeNode): number {
  if (node.kind === "file") return 1;
  return node.children.reduce((sum, child) => sum + collectLeafCount(child), 0);
}

export function BrowserTreeEntry({
  node,
  categoryType,
  expandedPaths,
  onTogglePath,
  onOpenFile,
  callbacks,
}: BrowserTreeEntryProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [childMenuState, setChildMenuState] = useState<{
    x: number;
    y: number;
    nodePath: string;
    nodeType: string;
  } | null>(null);

  const isExpanded = expandedPaths[node.path] ?? false;
  const menuId = `browser-entry-menu-${node.path}`;
  const entryBtnRef = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const menuEl = document.querySelector(`[data-menu-id="${menuId}"]`);
      const btn = entryBtnRef.current["more"];
      if (btn?.contains(target)) return;
      if (menuEl?.contains(target)) return;
      setMenuOpen(false);
    };
    const escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", escHandler);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", escHandler);
    };
  }, [menuOpen, menuId]);

  useEffect(() => {
    if (!childMenuState) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const menuEl = document.querySelector(`[data-menu-id="browser-child-menu"]`);
      if (menuEl?.contains(target)) return;
      setChildMenuState(null);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [childMenuState]);

  const count = collectLeafCount(node);

  const entryBtns = getEntryHoverButtons(node.nodeType, categoryType);
  const entryMenuItems = getEntryMoreMenuItems(node.nodeType, categoryType, node.path, callbacks);

  const handleEntryBtnClick = useCallback(
    (buttonId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      switch (buttonId) {
        case "create-tab":
          callbacks.onCreateTab(node.workspaceId, node.folderId);
          break;
        case "delete-all-tabs":
          callbacks.onDeleteAllChildTabs(categoryType, node.path);
          break;
        case "more": {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenuPosition({ top: rect.top, left: rect.right + 4 });
          setMenuOpen((prev) => !prev);
          break;
        }
      }
    },
    [callbacks, categoryType, node],
  );

  const renderChildMeta = useCallback(
    (childNode: BrowserTreeNode) => {
      const btns = getChildNodeHoverButtons(childNode.nodeType, categoryType);
      if (btns.length === 0) return null;
      return (
        <span className="adl-browser-node__actions">
          {btns.map((btn) => (
            <TooltipSimple key={btn.id} content={btn.label} placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={(e) => {
                  e.stopPropagation();
                  if (btn.id === "more") {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setChildMenuState({ x: rect.right + 4, y: rect.top, nodePath: childNode.path, nodeType: childNode.nodeType });
                  } else if (btn.id === "create-tab") {
                    callbacks.onCreateTab(childNode.workspaceId, childNode.folderId);
                  } else if (btn.id === "delete-all-tabs") {
                    callbacks.onDeleteAllChildTabs(categoryType, childNode.path);
                  }
                }}
                aria-label={btn.label}
              >
                {btn.icon}
              </button>
            </TooltipSimple>
          ))}
        </span>
      );
    },
    [categoryType, callbacks],
  );

  return (
    <div className="adl-browser-entry">
      <div className="adl-browser-entry__header">
        <div className="adl-browser-entry__expand">
          <button
            type="button"
            className={`adl-browser-entry__expand-btn${isExpanded ? " is-expanded" : ""}`}
            onClick={() => onTogglePath(node.path)}
            aria-label={isExpanded ? "收起" : "展开"}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <IconFolderOpen size={14} decorative /> : <IconFolder size={14} decorative />}
          </button>
        </div>
        <div className="adl-browser-entry__namezone" onClick={() => onTogglePath(node.path)} onKeyDown={(e) => { if (e.key === "Enter") onTogglePath(node.path); }} role="button" tabIndex={0}>
          <span className="adl-browser-entry__name" title={node.name}>{node.name}</span>
          <div className="adl-browser-entry__trailing">
            <span className="adl-browser-entry__count">{count}</span>
            <div className="adl-browser-entry__actions">
              {entryBtns.map((btn) => (
                <TooltipSimple key={btn.id} content={btn.label} placement="top">
                  <button
                    type="button"
                    className="adl-icon-btn adl-icon-btn--xs"
                    ref={(el) => { entryBtnRef.current[btn.id] = el; }}
                    onClick={(e) => handleEntryBtnClick(btn.id, e)}
                    aria-label={btn.label}
                  >
                    {btn.icon}
                  </button>
                </TooltipSimple>
              ))}
            </div>
          </div>
        </div>
      </div>

      {menuOpen && menuPosition ? createPortal(
        <div className="adl-multitree-entry__menu" role="menu" data-menu-id={menuId} style={{ top: menuPosition.top, left: menuPosition.left }}>
          {entryMenuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`adl-multitree-entry__menu-item${item.danger ? " is-danger" : ""}`}
              role="menuitem"
              onClick={() => { item.action(); setMenuOpen(false); }}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}

      {isExpanded && node.children.length > 0 ? (
        <div className="adl-browser-entry__tree">
          <FileTree<BrowserTreeNode>
            nodes={node.children}
            expandedPaths={expandedPaths}
            onToggle={onTogglePath}
            onOpenFile={onOpenFile}
            renderMeta={renderChildMeta}
            expandLabel="展开"
            collapseLabel="收起"
          />
        </div>
      ) : null}

      {isExpanded && node.children.length === 0 ? (
        <div className="adl-browser-entry__empty">
          <span className="adl-empty-hint">暂无内容</span>
        </div>
      ) : null}

      {childMenuState ? createPortal(
        <div className="adl-multitree-entry__menu" role="menu" data-menu-id="browser-child-menu" style={{ top: childMenuState.y, left: childMenuState.x }}>
          {getChildNodeMoreMenuItems(childMenuState.nodeType, categoryType, childMenuState.nodePath, callbacks).map((item) => (
            <button
              key={item.id}
              type="button"
              className={`adl-multitree-entry__menu-item${item.danger ? " is-danger" : ""}`}
              role="menuitem"
              onClick={() => { item.action(); setChildMenuState(null); }}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
