import React, { memo, startTransition, useCallback, useEffect, useRef, useState } from "react";
import { IconAlertTriangle, IconCircle } from "../../icons";
import { getFileTreeVisualSpec } from "./fileTreeVisuals";
import { CustomScrollArea } from "./CustomScrollArea";
import { TreeNodeRow } from "./TreeNodeRow";
import { ContextMenu, type ContextMenuItem } from "../../components/ContextMenu";

export interface FileTreeRenderableNode {
  path: string;
  name: string;
  kind: "directory" | "file";
  children: FileTreeRenderableNode[];
}

export type FileTreeContextMenuItem<T extends FileTreeRenderableNode> = {
  id: string;
  label?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  separator?: true;
  action?: (node: T) => void;
} | {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  separator?: false;
  action?: (node: T) => void;
};

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
  contextMenuPersistRef?: React.MutableRefObject<boolean>;
  clearMenuHighlightRef?: React.MutableRefObject<(() => void) | undefined>;
  expandLabel?: string;
  collapseLabel?: string;
  flat?: boolean;
}

interface FileTreeNodeProps<T extends FileTreeRenderableNode> {
  node: T;
  depth: number;
  activePath?: string;
  highlightedPath?: string;
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
  flat?: boolean;
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
  highlightedPath,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggle,
  onOpenFile,
  renderMeta,
  getNodeClassName,
  onShowContextMenu,
  expandLabel,
  collapseLabel,
  flat
}: FileTreeNodeProps<T>) {
  const isDirectory = node.kind === "directory";
  const isExpanded = expandedPaths[node.path] ?? false;
  const isSelected = node.path === activePath;
  const isContextMenuTarget = node.path === highlightedPath;
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
      isContextMenuTarget={isContextMenuTarget}
      expandLabel={expandLabel}
      collapseLabel={collapseLabel}
      onToggle={isDirectory ? () => onToggle(node.path) : undefined}
      onActivate={() => (isDirectory ? onToggle(node.path) : onOpenFile(node.path))}
      itemClassName={`adl-filetree__item${isDirectory ? " adl-filetree__node--directory" : ""}${nodeClassName ? ` ${nodeClassName}` : ""}`}
      rowClassName="adl-filetree__row"
      labelClassName="adl-filetree__label"
      toggleClassName="adl-filetree__toggle"
      indentClassName={`adl-filetree__indent${flat ? " adl-filetree__indent--flat" : ""}`}
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
              highlightedPath={highlightedPath}
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
              flat={flat}
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
  if ((previous.highlightedPath === path) !== (next.highlightedPath === path)) {
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
  const [internalHighlightPath, setInternalHighlightPath] = useState<string | undefined>(undefined);
  const persistRef = props.contextMenuPersistRef;
  const highlightedPath = contextMenuState ? contextMenuState.node.path : internalHighlightPath;
  const [activePath, setActivePath] = useState<string | undefined>(props.selectedFilePath);

  // Allow parent to trigger highlight clear via ref
  const clearHighlightRef = useRef<() => void>(() => setInternalHighlightPath(undefined));
  clearHighlightRef.current = () => setInternalHighlightPath(undefined);
  if (props.clearMenuHighlightRef) {
    props.clearMenuHighlightRef.current = clearHighlightRef.current;
  }

  useEffect(() => {
    setActivePath(props.selectedFilePath);
  }, [props.selectedFilePath]);

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
      setInternalHighlightPath(undefined);
      if (persistRef) persistRef.current = false;
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
              highlightedPath={highlightedPath}
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
        ? <ContextMenu
            items={contextMenuState.items.map((item) => ({
              id: item.id,
              label: item.label,
              icon: item.icon,
              disabled: item.disabled,
              danger: item.danger,
              separator: item.separator,
              action: item.action ? () => {
                item.action!(contextMenuState.node);
              } : undefined
            }))}
            position={{ x: contextMenuState.x, y: contextMenuState.y }}
            onClose={() => {
              const nodePath = contextMenuState.node.path;
              setContextMenuState(null);
              if (persistRef?.current) {
                setInternalHighlightPath(nodePath);
              }
              if (persistRef) persistRef.current = false;
            }}
          />
        : null}
    </>
  );
}
