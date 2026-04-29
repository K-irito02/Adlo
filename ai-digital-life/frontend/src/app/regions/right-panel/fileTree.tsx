import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconAlertTriangle, IconChevronDown, IconChevronRight, IconCircle } from "../../icons";
import { getFileTreeVisualSpec } from "./fileTreeVisuals";

export interface FileTreeRenderableNode {
  path: string;
  name: string;
  kind: "directory" | "file";
  children: FileTreeRenderableNode[];
}

export interface FileTreeContextMenuItem<T extends FileTreeRenderableNode> {
  id: string;
  label: string;
  disabled?: boolean;
  action: (node: T) => void;
}

interface FileTreeProps<T extends FileTreeRenderableNode> {
  nodes: T[];
  selectedFilePath?: string;
  expandedPaths: Record<string, boolean>;
  dirtyPaths?: Set<string>;
  externalChangePath?: string;
  onToggle: (path: string) => void;
  onOpenFile: (relativePath: string) => void;
  renderMeta?: (node: T) => React.ReactNode;
  getNodeClassName?: (node: T) => string | undefined;
  getContextMenuItems?: (node: T) => FileTreeContextMenuItem<T>[];
}

interface FileTreeNodeProps<T extends FileTreeRenderableNode> {
  node: T;
  depth: number;
  selectedFilePath?: string;
  expandedPaths: Record<string, boolean>;
  dirtyPaths?: Set<string>;
  externalChangePath?: string;
  onToggle: (path: string) => void;
  onOpenFile: (relativePath: string) => void;
  renderMeta?: (node: T) => React.ReactNode;
  getNodeClassName?: (node: T) => string | undefined;
  onShowContextMenu?: (event: React.MouseEvent<HTMLButtonElement>, node: T) => void;
}

export function collectDirectoryPaths<T extends FileTreeRenderableNode>(nodes: T[]): string[] {
  const paths: string[] = [];
  const visit = (items: T[]) => {
    items.forEach((item) => {
      if (item.kind === "directory") {
        paths.push(item.path);
        if (item.children.length > 0) {
          visit(item.children as T[]);
        }
      }
    });
  };
  visit(nodes);
  return paths;
}

function FileTreeNode<T extends FileTreeRenderableNode>({
  node,
  depth,
  selectedFilePath,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggle,
  onOpenFile,
  renderMeta,
  getNodeClassName,
  onShowContextMenu
}: FileTreeNodeProps<T>) {
  const isDirectory = node.kind === "directory";
  const isExpanded = expandedPaths[node.path] ?? false;
  const isSelected = node.path === selectedFilePath;
  const isDirty = dirtyPaths?.has(node.path) ?? false;
  const isExternal = node.path === externalChangePath;
  const fileVisual = isDirectory ? undefined : getFileTreeVisualSpec(node);
  const customMeta = renderMeta?.(node);
  const nodeClassName = getNodeClassName?.(node);

  return (
    <li
      className="adl-filetree__item"
      style={{ "--adl-filetree-hover-offset": `${depth * 14}px` } as React.CSSProperties}
    >
      <button
        type="button"
        className={`adl-filetree__node${isSelected ? " is-active" : ""}${isDirectory ? " adl-filetree__node--directory" : ""}${nodeClassName ? ` ${nodeClassName}` : ""}`}
        onClick={() => (isDirectory ? onToggle(node.path) : onOpenFile(node.path))}
        onContextMenu={onShowContextMenu ? (event) => onShowContextMenu(event, node) : undefined}
      >
        <span className="adl-filetree__node-main">
          {isDirectory ? (
            <span className="adl-filetree__chevron">
              {isExpanded ? <IconChevronDown size={12} decorative /> : <IconChevronRight size={12} decorative />}
            </span>
          ) : (
            <span className={`adl-filetree__file-icon adl-filetree__file-icon--${fileVisual?.tone ?? "default"}`}>
              <span className="adl-filetree__file-badge" aria-hidden="true">
                {fileVisual?.label ?? "FILE"}
              </span>
            </span>
          )}
          <span className="adl-filetree__label">{node.name}</span>
        </span>
        {(customMeta || isExternal || isDirty) ? (
          <span className="adl-filetree__meta">
            {customMeta}
            {isExternal ? <IconAlertTriangle size={12} decorative /> : null}
            {isDirty ? <IconCircle size={12} decorative className="adl-filetree__dirty-dot" /> : null}
          </span>
        ) : null}
      </button>
      {isDirectory && isExpanded && node.children.length > 0 ? (
        <ul className="adl-filetree__children">
          {(node.children as T[]).map((child) => (
            <FileTreeNode<T>
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFilePath={selectedFilePath}
              expandedPaths={expandedPaths}
              dirtyPaths={dirtyPaths}
              externalChangePath={externalChangePath}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
              renderMeta={renderMeta}
              getNodeClassName={getNodeClassName}
              onShowContextMenu={onShowContextMenu}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FileTree<T extends FileTreeRenderableNode>(props: FileTreeProps<T>) {
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
    node: T;
    items: FileTreeContextMenuItem<T>[];
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) {
        setContextMenuState(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenuState(null);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenuState]);

  useLayoutEffect(() => {
    if (!contextMenuState || !contextMenuRef.current || !rootRef.current) {
      return;
    }
    const root = rootRef.current;
    const rect = contextMenuRef.current.getBoundingClientRect();
    const maxX = root.scrollLeft + root.clientWidth - rect.width - 8;
    const maxY = root.scrollTop + root.clientHeight - rect.height - 8;
    const clampedX = Math.max(root.scrollLeft + 8, Math.min(contextMenuState.x, maxX));
    const clampedY = Math.max(root.scrollTop + 8, Math.min(contextMenuState.y, maxY));
    if (clampedX !== contextMenuState.x || clampedY !== contextMenuState.y) {
      setContextMenuState((current) =>
        current
          ? {
              ...current,
              x: clampedX,
              y: clampedY
            }
          : current
      );
    }
  }, [contextMenuState]);

  const handleShowContextMenu = props.getContextMenuItems
    ? (event: React.MouseEvent<HTMLButtonElement>, node: T) => {
        const items = props.getContextMenuItems?.(node) ?? [];
        if (!items.length) {
          return;
        }
        event.preventDefault();
        const rootRect = rootRef.current?.getBoundingClientRect();
        const offsetX = rootRect ? event.clientX - rootRect.left + rootRef.current!.scrollLeft : event.clientX;
        const offsetY = rootRect ? event.clientY - rootRect.top + rootRef.current!.scrollTop : event.clientY;
        setContextMenuState({
          x: offsetX + 10,
          y: offsetY + 10,
          node,
          items
        });
      }
    : undefined;

  return (
    <div ref={rootRef} className="adl-filetree-shell">
      <ul className="adl-filetree">
        {props.nodes.map((node) => (
          <FileTreeNode<T> key={node.path} node={node} depth={0} {...props} onShowContextMenu={handleShowContextMenu} />
        ))}
      </ul>
      {contextMenuState ? (
        <div
          ref={contextMenuRef}
          className="adl-sidebar-menu"
          role="menu"
          style={{ left: contextMenuState.x, top: contextMenuState.y }}
        >
          {contextMenuState.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="adl-sidebar-menu__item"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) {
                  return;
                }
                item.action(contextMenuState.node);
                setContextMenuState(null);
              }}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
