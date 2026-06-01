import React, { memo, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { flushSync } from "react-dom";
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
  action?: (node: T, multiSelectedNodes: T[]) => void;
} | {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  separator?: false;
  action?: (node: T, multiSelectedNodes: T[]) => void;
};

export interface FileTreeProps<T extends FileTreeRenderableNode> {
  nodes: T[];
  selectedFilePath?: string;
  selectedFileWorkspaceId?: string;
  expandedPaths: Record<string, boolean>;
  dirtyPaths?: Set<string>;
  externalChangePath?: string;
  onToggle: (path: string) => void;
  onOpenFile: (relativePath: string) => void;
  renderMeta?: (node: T) => React.ReactNode;
  getNodeClassName?: (node: T) => string | undefined;
  getContextMenuItems?: (node: T, multiSelectedNodes: T[]) => FileTreeContextMenuItem<T>[];
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
  selectedPaths: Set<string>;
  highlightedPath?: string;
  hoveredPath?: string;
  expandedPaths: Record<string, boolean>;
  dirtyPaths?: Set<string>;
  externalChangePath?: string;
  onToggle: (path: string) => void;
  onOpenFile: (relativePath: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  renderMeta?: (node: T) => React.ReactNode;
  getNodeClassName?: (node: T) => string | undefined;
  onShowContextMenu?: (event: React.MouseEvent<HTMLDivElement>, node: T) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
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

function collectAllNodePaths<T extends FileTreeRenderableNode>(nodes: T[]): string[] {
  const paths: string[] = [];
  const visit = (items: T[]) => {
    items.forEach((item) => {
      paths.push(item.path);
      if (item.children.length > 0) {
        visit(item.children as T[]);
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
  selectedPaths,
  highlightedPath,
  hoveredPath,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggle,
  onOpenFile,
  renderMeta,
  getNodeClassName,
  onShowContextMenu,
  onMouseEnter,
  onMouseLeave,
  expandLabel,
  collapseLabel,
  flat
}: FileTreeNodeProps<T>) {
  const isDirectory = node.kind === "directory";
  const isExpanded = expandedPaths[node.path] ?? false;
  const isActive = node.path === activePath;
  const isMultiSelected = selectedPaths.has(node.path);
  const isSelected = isActive || isMultiSelected;
  const isContextMenuTarget = node.path === highlightedPath;
  const isHovered = node.path === hoveredPath;
  const isDirty = dirtyPaths?.has(node.path) ?? false;
  const isExternal = node.path === externalChangePath;
  const fileVisual = isDirectory ? undefined : getFileTreeVisualSpec(node);
  const customMeta = renderMeta?.(node);
  const nodeClassName = getNodeClassName?.(node);

  const handleActivate = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (isDirectory) {
      onToggle(node.path);
    } else {
      onOpenFile(node.path, event);
    }
  }, [isDirectory, node.path, onToggle, onOpenFile]);

  return (
    <TreeNodeRow
      depth={depth + 1}
      rowOffset={(depth * 48) + 4}
      hasChildren={isDirectory}
      isExpanded={isExpanded}
      isActive={isSelected}
      isHovered={isHovered}
      isContextMenuTarget={isContextMenuTarget}
      expandLabel={expandLabel}
      collapseLabel={collapseLabel}
      onToggle={isDirectory ? () => onToggle(node.path) : undefined}
      onActivate={handleActivate}
      itemClassName={`adl-filetree__item${isDirectory ? " adl-filetree__node--directory" : " adl-filetree__node--file"}${nodeClassName ? ` ${nodeClassName}` : ""}`}
      rowClassName="adl-filetree__row"
      labelClassName="adl-filetree__label"
      toggleClassName="adl-filetree__toggle"
      indentClassName={`adl-filetree__indent${flat ? " adl-filetree__indent--flat" : ""}`}
      labelContentClassName="adl-filetree__node-main"
      label={node.name}
      nodePath={node.path}
      iconBefore={isDirectory ? undefined : (
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
      onLabelMouseEnter={onMouseEnter}
      onLabelMouseLeave={onMouseLeave}
    >
      {isDirectory && isExpanded && node.children.length > 0 ? (
        <ul className="adl-filetree__children adl-tree-node__children">
          {(node.children as T[]).map((child) => (
            <MemoizedFileTreeNode<T>
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              selectedPaths={selectedPaths}
              highlightedPath={highlightedPath}
              hoveredPath={hoveredPath}
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
  if (previous.selectedPaths.has(path) !== next.selectedPaths.has(path)) {
    return false;
  }
  if ((previous.highlightedPath === path) !== (next.highlightedPath === path)) {
    return false;
  }
  if ((previous.hoveredPath === path) !== (next.hoveredPath === path)) {
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
    multiSelectedNodes: T[];
  } | null>(null);
  const [contextMenuTargetPath, setContextMenuTargetPath] = useState<string | undefined>(undefined);
  const persistRef = props.contextMenuPersistRef;
  const highlightedPath = contextMenuTargetPath;
  
  // 完全依赖外部状态，不维护本地选中状态
  const activePath = props.selectedFilePath;
  const selectedPaths = useMemo((): Set<string> => 
    activePath ? new Set([activePath]) : new Set(),
    [activePath]
  );
  const [hoveredPath, setHoveredPath] = useState<string | undefined>(undefined);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const clearHighlightRef = useRef<(() => void)>(() => setContextMenuTargetPath(undefined));
  clearHighlightRef.current = () => setContextMenuTargetPath(undefined);
  if (props.clearMenuHighlightRef) {
    props.clearMenuHighlightRef.current = clearHighlightRef.current;
  }

  const getAllNodePaths = useMemo(() => collectAllNodePaths(props.nodes), [props.nodes]);

  const handleToggleDirectory = useCallback(
    (path: string) => {
      // 直接调用外部函数
      props.onToggle(path);
    },
    [props.onToggle]
  );

  const handleOpenFile = useCallback((relativePath: string, event: React.MouseEvent<HTMLButtonElement>) => {
    // 使用 flushSync 确保外部状态更新后立即重新渲染
    flushSync(() => {
      props.onOpenFile(relativePath);
    });
  }, [props.onOpenFile]);

  const getMultiSelectedNodes = useCallback((): T[] => {
    const nodes: T[] = [];
    const visit = (items: T[]) => {
      items.forEach((item) => {
        if (selectedPaths.has(item.path)) {
          nodes.push(item);
        }
        if (item.children.length > 0) {
          visit(item.children as T[]);
        }
      });
    };
    visit(props.nodes);
    return nodes;
  }, [props.nodes, selectedPaths]);

  const handleShowContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, node: T) => {
      event.preventDefault();
      if (persistRef) persistRef.current = false;

      flushSync(() => {
        setContextMenuTargetPath(node.path);
      });

      // 计算用于上下文菜单的选中节点
      // 如果当前选中的节点包含右键点击的节点，使用当前选中
      // 否则，只使用右键点击的节点
      let multiSelectedNodes: T[];
      if (selectedPaths.has(node.path)) {
        multiSelectedNodes = getMultiSelectedNodes();
      } else {
        multiSelectedNodes = [node];
      }

      const items = props.getContextMenuItems?.(node, multiSelectedNodes) ?? [];
      if (!items.length) {
        flushSync(() => {
          setContextMenuTargetPath(undefined);
        });
        return;
      }

      setContextMenuState({
        x: event.clientX,
        y: event.clientY,
        node,
        items,
        multiSelectedNodes,
      });
    },
    [props.getContextMenuItems, persistRef, getMultiSelectedNodes, selectedPaths]
  );

  return (
    <>
      <CustomScrollArea
        shellClassName="adl-filetree-shell"
        scrollClassName="adl-filetree-scroll"
        scrollbarClassName="adl-filetree-scrollbar"
        thumbClassName="adl-filetree-scrollbar__thumb"
        ref={scrollAreaRef}
      >
        <ul className="adl-filetree adl-tree-root" role="tree">
          {props.nodes.map((node) => (
            <MemoizedFileTreeNode<T>
              key={node.path}
              node={node}
              depth={0}
              expandedPaths={props.expandedPaths}
              dirtyPaths={props.dirtyPaths}
              externalChangePath={props.externalChangePath}
              renderMeta={props.renderMeta}
              getNodeClassName={props.getNodeClassName}
              flat={props.flat}
              activePath={activePath}
              selectedPaths={selectedPaths}
              highlightedPath={highlightedPath}
              hoveredPath={hoveredPath}
              onToggle={handleToggleDirectory}
              onOpenFile={handleOpenFile}
              onShowContextMenu={props.getContextMenuItems ? handleShowContextMenu : undefined}
              onMouseEnter={() => setHoveredPath(node.path)}
              onMouseLeave={() => setHoveredPath(undefined)}
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
                item.action!(contextMenuState.node, contextMenuState.multiSelectedNodes);
              } : undefined
            }))}
            position={{ x: contextMenuState.x, y: contextMenuState.y }}
            onClose={() => {
              flushSync(() => {
                setContextMenuTargetPath(undefined);
              });
              setContextMenuState(null);
              if (persistRef) persistRef.current = false;
            }}
          />
        : null}
    </>
  );
}