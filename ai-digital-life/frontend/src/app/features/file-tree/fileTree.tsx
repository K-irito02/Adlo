import React, { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { IconAlertTriangle, IconCircle, FileBadgeIcon } from '@icons';
import { getFileTreeVisualSpec } from './fileTreeVisuals';
import { CustomScrollArea } from './CustomScrollArea';
import { TreeNodeRow } from './TreeNodeRow';
import { ContextMenu } from '@components/ContextMenu';
import type {
  FileTreeRenderableNode,
  FileTreeProps,
  FileTreeContextMenuItem,
  FlattenedTreeNode,
} from './fileTree.utils';
import { useFileTreeVirtualization, VIRTUAL_ITEM_HEIGHT } from './useFileTreeVirtualization';
import { useFileTreeHover } from './useFileTreeHover';

interface VirtualNodeProps<T extends FileTreeRenderableNode> {
  flatNode: FlattenedTreeNode<T>;
  expandedPaths: Record<string, boolean>;
  activePath: string | undefined;
  selectedPaths: Set<string>;
  highlightedPath: string | undefined;
  hoveredPath: string | undefined;
  dirtyPaths?: Set<string>;
  externalChangePath: string | undefined;
  onToggle: (path: string) => void;
  onOpenFile: (relativePath: string) => void;
  renderMeta?: (node: T) => React.ReactNode;
  renderCount?: (node: T) => React.ReactNode;
  renderIconBefore?: (node: T) => React.ReactNode;
  getNodeClassName?: (node: T) => string | undefined;
  getNodeTitle?: (node: T) => string | undefined;
  onShowContextMenu?: (event: React.MouseEvent<HTMLDivElement>, node: T) => void;
  expandLabel: string;
  collapseLabel: string;
  flat?: boolean;
  top: number;
  trunkHeight?: number;
  hoveredDescendantPaths?: Set<string>;
}

function VirtualNodeComponent<T extends FileTreeRenderableNode>({
  flatNode,
  expandedPaths,
  activePath,
  selectedPaths,
  highlightedPath,
  hoveredPath,
  dirtyPaths,
  externalChangePath,
  onToggle,
  onOpenFile,
  renderMeta,
  renderCount,
  renderIconBefore,
  getNodeClassName,
  getNodeTitle,
  onShowContextMenu,
  expandLabel,
  collapseLabel,
  flat,
  top,
  trunkHeight,
  hoveredDescendantPaths,
}: VirtualNodeProps<T>) {
  const { node, depth } = flatNode;
  const isDirectory = node.kind === 'directory';
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
  const customCount = renderCount?.(node);
  const customIconBefore = renderIconBefore?.(node);
  const nodeClassName = getNodeClassName?.(node);
  const nodeTitle = getNodeTitle?.(node);
  const isHoveredDescendant = hoveredDescendantPaths?.has(flatNode.node.path) ?? false;
  // Cache the style object so TreeNodeRow's React.memo sees a stable
  // reference when `top` and `trunkHeight` are unchanged. Previously a
  // new object literal was created on every parent render, defeating
  // memoization for every visible row.
  const itemStyle = useMemo<React.CSSProperties>(() => {
    const base: React.CSSProperties = {
      position: 'absolute',
      top,
      left: 0,
      right: 0,
      height: VIRTUAL_ITEM_HEIGHT,
    };
    return trunkHeight
      ? ({ ...base, '--adl-trunk-height': `${trunkHeight}px` } as React.CSSProperties)
      : base;
  }, [top, trunkHeight]);

  // Stabilize callbacks passed to TreeNodeRow (React.memo). Previously
  // three inline arrow functions were created on every render, defeating
  // TreeNodeRow's memo even when node.path was unchanged.
  const handleToggle = useCallback(() => onToggle(node.path), [onToggle, node.path]);

  const handleActivate = useCallback(() => {
    if (isDirectory) {
      onToggle(node.path);
    } else {
      onOpenFile(node.path);
    }
  }, [isDirectory, onToggle, onOpenFile, node.path]);

  // useMemo (not useCallback) because the result can be `undefined`
  // when onShowContextMenu is not provided. useCallback always returns
  // a function, which would break the `undefined` contract.
  const handleContextMenu = useMemo(
    () =>
      onShowContextMenu
        ? (event: React.MouseEvent<HTMLDivElement>) => onShowContextMenu(event, node)
        : undefined,
    [onShowContextMenu, node],
  );

  return (
    <TreeNodeRow
      depth={depth + 1}
      rowOffset={depth * 48 + 4}
      hasChildren={isDirectory}
      isExpanded={isExpanded}
      isActive={isSelected}
      isHovered={isHovered}
      isContextMenuTarget={isContextMenuTarget}
      expandLabel={expandLabel}
      collapseLabel={collapseLabel}
      onToggle={isDirectory ? handleToggle : undefined}
      onActivate={handleActivate}
      itemClassName={`adl-filetree__item${isDirectory ? ' adl-filetree__node--directory' : ' adl-filetree__node--file'}${nodeClassName ? ` ${nodeClassName}` : ''}${isHoveredDescendant ? ' is-hovered-by-ancestor' : ''}`}
      rowClassName="adl-filetree__row"
      labelClassName="adl-filetree__label"
      toggleClassName="adl-filetree__toggle"
      indentClassName={`adl-filetree__indent${flat ? ' adl-filetree__indent--flat' : ''}`}
      labelContentClassName="adl-filetree__node-main"
      label={node.name}
      nodePath={node.path}
      nodeTitle={nodeTitle}
      iconBefore={
        isDirectory ? undefined : customIconBefore ? (
          customIconBefore
        ) : (
          <span
            className={`adl-filetree__file-icon adl-filetree__file-icon--${fileVisual?.tone ?? 'default'}`}
            aria-hidden="true"
          >
            <FileBadgeIcon variant={fileVisual?.icon ?? 'badge'} size={14} decorative />
          </span>
        )
      }
      count={customCount}
      countClassName="adl-filetree__count"
      meta={
        customMeta || isExternal || isDirty ? (
          <>
            {customMeta}
            {isExternal ? <IconAlertTriangle size={12} decorative /> : null}
            {isDirty ? (
              <IconCircle size={12} decorative className="adl-filetree__dirty-dot" />
            ) : null}
          </>
        ) : undefined
      }
      metaClassName="adl-filetree__meta adl-tree-node__meta--inline"
      onContextMenu={handleContextMenu}
      style={itemStyle}
    />
  );
}

const MemoizedVirtualNode = memo(VirtualNodeComponent) as typeof VirtualNodeComponent;

export function FileTree<T extends FileTreeRenderableNode>({
  nodes,
  selectedFilePath,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggle,
  onOpenFile,
  renderMeta,
  renderCount,
  renderIconBefore,
  getNodeClassName,
  getNodeTitle,
  getContextMenuItems,
  contextMenuPersistRef,
  clearMenuHighlightRef,
  expandLabel = 'Expand',
  collapseLabel = 'Collapse',
  flat,
  flipAnimation = false,
}: FileTreeProps<T>) {
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
    node: T;
    items: FileTreeContextMenuItem<T>[];
    multiSelectedNodes: T[];
  } | null>(null);
  const [contextMenuTargetPath, setContextMenuTargetPath] = useState<string | undefined>(undefined);
  const highlightedPath = contextMenuTargetPath;

  const activePath = selectedFilePath;
  const selectedPaths = useMemo(
    (): Set<string> => (activePath ? new Set([activePath]) : new Set()),
    [activePath],
  );
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const clearContextMenu = () => setContextMenuTargetPath(undefined);

  useEffect(() => {
    if (clearMenuHighlightRef) {
      clearMenuHighlightRef.current = clearContextMenu;
    }
    return () => {
      if (clearMenuHighlightRef) {
        clearMenuHighlightRef.current = undefined;
      }
    };
  }, [clearMenuHighlightRef]);

  const { flatNodes, totalHeight, trunkHeightMap, startIndex, visibleNodes } =
    useFileTreeVirtualization<T>(nodes, expandedPaths, scrollAreaRef, flipAnimation);

  const { hoveredPath, hoveredDescendantPaths, onMouseOver, onMouseOut } =
    useFileTreeHover<T>(flatNodes);

  const handleToggleDirectory = useCallback(
    (path: string) => {
      onToggle(path);
    },
    [onToggle],
  );

  const handleOpenFile = useCallback(
    (relativePath: string) => {
      onOpenFile(relativePath);
    },
    [onOpenFile],
  );

  const handleShowContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, node: T) => {
      event.preventDefault();
      if (contextMenuPersistRef) {
        contextMenuPersistRef.current = false;
      }

      setContextMenuTargetPath(node.path);

      let multiSelectedNodes: T[];
      if (selectedPaths.has(node.path)) {
        const collected: T[] = [];
        const visit = (items: T[]) => {
          items.forEach((item) => {
            if (selectedPaths.has(item.path)) {
              collected.push(item);
            }
            if (item.children.length > 0) {
              visit(item.children as T[]);
            }
          });
        };
        visit(nodes);
        multiSelectedNodes = collected;
      } else {
        multiSelectedNodes = [node];
      }

      const items = getContextMenuItems?.(node, multiSelectedNodes) ?? [];
      if (!items.length) {
        setContextMenuTargetPath(undefined);
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
    [getContextMenuItems, contextMenuPersistRef, selectedPaths, nodes],
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
        <ul
          className="adl-filetree adl-tree-root"
          role="tree"
          style={
            totalHeight > 0
              ? {
                  height: totalHeight,
                  position: 'relative',
                }
              : undefined
          }
          onMouseOver={onMouseOver}
          onMouseOut={onMouseOut}
        >
          {visibleNodes.map((flatNode, localIndex) => {
            const absoluteIndex = startIndex + localIndex;
            return (
              <MemoizedVirtualNode<T>
                key={flatNode.node.path}
                flatNode={flatNode}
                expandedPaths={expandedPaths}
                activePath={activePath}
                selectedPaths={selectedPaths}
                highlightedPath={highlightedPath}
                hoveredPath={hoveredPath}
                dirtyPaths={dirtyPaths}
                externalChangePath={externalChangePath}
                onToggle={handleToggleDirectory}
                onOpenFile={handleOpenFile}
                renderMeta={renderMeta}
                renderCount={renderCount}
                renderIconBefore={renderIconBefore}
                getNodeClassName={getNodeClassName}
                getNodeTitle={getNodeTitle}
                onShowContextMenu={getContextMenuItems ? handleShowContextMenu : undefined}
                expandLabel={expandLabel}
                collapseLabel={collapseLabel}
                flat={flat}
                trunkHeight={trunkHeightMap[flatNode.node.path]}
                hoveredDescendantPaths={hoveredDescendantPaths}
                top={absoluteIndex * VIRTUAL_ITEM_HEIGHT}
              />
            );
          })}
        </ul>
      </CustomScrollArea>
      {contextMenuState ? (
        <ContextMenu
          items={contextMenuState.items.map((item) => ({
            id: item.id,
            label: item.label,
            icon: item.icon,
            disabled: item.disabled,
            danger: item.danger,
            separator: item.separator,
            hint: item.hint,
            action: item.action
              ? () => {
                  item.action!(contextMenuState.node, contextMenuState.multiSelectedNodes);
                }
              : undefined,
          }))}
          position={{ x: contextMenuState.x, y: contextMenuState.y }}
          onClose={() => {
            setContextMenuTargetPath(undefined);
            setContextMenuState(null);
            if (contextMenuPersistRef) {
              contextMenuPersistRef.current = false;
            }
          }}
        />
      ) : null}
    </>
  );
}
