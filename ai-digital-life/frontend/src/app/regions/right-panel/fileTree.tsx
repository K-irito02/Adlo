import React, { memo, startTransition, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconAlertTriangle, IconCircle } from "../../icons";
import { getFileTreeVisualSpec } from "./fileTreeVisuals";
import { CustomScrollArea } from "./CustomScrollArea";
import { TreeNodeRow } from "./TreeNodeRow";

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
  expandLabel?: string;
  collapseLabel?: string;
}

interface FileTreeNodeProps<T extends FileTreeRenderableNode> {
  node: T;
  depth: number;
  activePath?: string;
  expandedPaths: Record<string, boolean>;
  dirtyPaths?: Set<string>;
  externalChangePath?: string;
  onToggle: (path: string) => void;
  onOpenFile: (relativePath: string) => void;
  renderMeta?: (node: T) => React.ReactNode;
  getNodeClassName?: (node: T) => string | undefined;
  onShowContextMenu?: (event: React.MouseEvent<HTMLDivElement>, node: T) => void;
  expandLabel: string;
  collapseLabel: string;
}

function isPathInSubtree(rootPath: string, path: string | undefined): boolean {
  return !!path && (path === rootPath || path.startsWith(`${rootPath}/`));
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

function FileTreeNodeComponent<T extends FileTreeRenderableNode>({
  node,
  depth,
  activePath,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggle,
  onOpenFile,
  renderMeta,
  getNodeClassName,
  onShowContextMenu,
  expandLabel,
  collapseLabel
}: FileTreeNodeProps<T>) {
  const isDirectory = node.kind === "directory";
  const isExpanded = expandedPaths[node.path] ?? false;
  const isSelected = node.path === activePath;
  const isDirty = dirtyPaths?.has(node.path) ?? false;
  const isExternal = node.path === externalChangePath;
  const fileVisual = isDirectory ? undefined : getFileTreeVisualSpec(node);
  const customMeta = renderMeta?.(node);
  const nodeClassName = getNodeClassName?.(node);

  return (
    <TreeNodeRow
      depth={depth + 1}
      rowOffset={(depth * 14) + 4}
      hasChildren={isDirectory}
      isExpanded={isExpanded}
      isActive={isSelected}
      expandLabel={expandLabel}
      collapseLabel={collapseLabel}
      onToggle={isDirectory ? () => onToggle(node.path) : undefined}
      onActivate={() => (isDirectory ? onToggle(node.path) : onOpenFile(node.path))}
      itemClassName={`adl-filetree__item${isDirectory ? " adl-filetree__node--directory" : ""}${nodeClassName ? ` ${nodeClassName}` : ""}`}
      rowClassName="adl-filetree__row"
      labelClassName="adl-filetree__label"
      toggleClassName="adl-filetree__toggle"
      indentClassName="adl-filetree__indent"
      labelContentClassName="adl-filetree__node-main"
      label={node.name}
      labelLeading={isDirectory ? undefined : (
        <span className={`adl-filetree__file-icon adl-filetree__file-icon--${fileVisual?.tone ?? "default"}`}>
          <span className="adl-filetree__file-badge" aria-hidden="true">
            {fileVisual?.label ?? "FILE"}
          </span>
        </span>
      )}
      meta={(customMeta || isExternal || isDirty) ? (
        <>
          {customMeta}
          {isExternal ? <IconAlertTriangle size={12} decorative /> : null}
          {isDirty ? <IconCircle size={12} decorative className="adl-filetree__dirty-dot" /> : null}
        </>
      ) : undefined}
      metaClassName="adl-filetree__meta adl-tree-node__meta--inline"
      onContextMenu={onShowContextMenu ? (event) => onShowContextMenu(event, node) : undefined}
    >
      {isDirectory && isExpanded && node.children.length > 0 ? (
        <ul className="adl-filetree__children adl-tree-node__children">
          {(node.children as T[]).map((child) => (
            <MemoizedFileTreeNode<T>
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              expandedPaths={expandedPaths}
              dirtyPaths={dirtyPaths}
              externalChangePath={externalChangePath}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
              renderMeta={renderMeta}
              getNodeClassName={getNodeClassName}
              onShowContextMenu={onShowContextMenu}
              expandLabel={expandLabel}
              collapseLabel={collapseLabel}
            />
          ))}
        </ul>
      ) : null}
    </TreeNodeRow>
  );
}

function areFileTreeNodePropsEqual<T extends FileTreeRenderableNode>(
  previous: FileTreeNodeProps<T>,
  next: FileTreeNodeProps<T>
): boolean {
  if (
    previous.node !== next.node ||
    previous.depth !== next.depth ||
    previous.onToggle !== next.onToggle ||
    previous.onOpenFile !== next.onOpenFile ||
    previous.renderMeta !== next.renderMeta ||
    previous.getNodeClassName !== next.getNodeClassName ||
    previous.onShowContextMenu !== next.onShowContextMenu ||
    previous.expandLabel !== next.expandLabel ||
    previous.collapseLabel !== next.collapseLabel
  ) {
    return false;
  }

  const path = previous.node.path;
  if ((previous.expandedPaths[path] ?? false) !== (next.expandedPaths[path] ?? false)) {
    return false;
  }
  if ((previous.activePath === path) !== (next.activePath === path)) {
    return false;
  }
  if (previous.node.kind === "directory") {
    const previousContainsSelected = isPathInSubtree(path, previous.activePath);
    const nextContainsSelected = isPathInSubtree(path, next.activePath);
    if (previousContainsSelected !== nextContainsSelected) {
      return false;
    }
    if ((previous.expandedPaths[path] ?? false) && previous.expandedPaths !== next.expandedPaths) {
      return false;
    }
  }
  if ((previous.externalChangePath === path) !== (next.externalChangePath === path)) {
    return false;
  }
  if ((previous.dirtyPaths?.has(path) ?? false) !== (next.dirtyPaths?.has(path) ?? false)) {
    return false;
  }

  return true;
}

const MemoizedFileTreeNode = memo(FileTreeNodeComponent, areFileTreeNodePropsEqual) as typeof FileTreeNodeComponent;

export function FileTree<T extends FileTreeRenderableNode>(props: FileTreeProps<T>) {
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
    node: T;
    items: FileTreeContextMenuItem<T>[];
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [activePath, setActivePath] = useState<string | undefined>(props.selectedFilePath);

  useEffect(() => {
    setActivePath(props.selectedFilePath);
  }, [props.selectedFilePath]);

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

  const handleOpenFile = useCallback(
    (relativePath: string) => {
      setActivePath(relativePath);
      startTransition(() => props.onOpenFile(relativePath));
    },
    [props.onOpenFile]
  );

  const handleToggleDirectory = useCallback(
    (path: string) => {
      setActivePath(path);
      props.onToggle(path);
    },
    [props.onToggle]
  );

  const handleShowContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, node: T) => {
      const items = props.getContextMenuItems?.(node) ?? [];
      if (!items.length) {
        return;
      }
      event.preventDefault();
      setContextMenuState({
        x: event.clientX,
        y: event.clientY,
        node,
        items
      });
    },
    [props.getContextMenuItems]
  );
  return (
    <>
      <CustomScrollArea
        shellClassName="adl-filetree-shell"
        scrollClassName="adl-filetree-scroll"
        scrollbarClassName="adl-filetree-scrollbar"
        thumbClassName="adl-filetree-scrollbar__thumb"
      >
        <ul className="adl-filetree adl-tree-root" role="tree">
          {props.nodes.map((node) => (
            <MemoizedFileTreeNode<T>
              key={node.path}
              node={node}
              depth={0}
              {...props}
              activePath={activePath}
              onToggle={handleToggleDirectory}
              onOpenFile={handleOpenFile}
              onShowContextMenu={props.getContextMenuItems ? handleShowContextMenu : undefined}
              expandLabel={props.expandLabel ?? "Expand"}
              collapseLabel={props.collapseLabel ?? "Collapse"}
            />
          ))}
        </ul>
      </CustomScrollArea>
      {contextMenuState
        ? createPortal(
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
            </div>,
            document.body
          )
        : null}
    </>
  );
}
