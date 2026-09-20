import React, { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { IconAlertTriangle, IconCircle } from '@icons';
import { FileIcon } from '@shared/file-icon';
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
  extraSelectedPath: string | undefined;
  activePathIsWeak: boolean;
  highlightedPath: string | undefined;
  hoveredPath: string | undefined;
  dirtyPaths?: Set<string>;
  externalChangePath: string | undefined;
  isFlashing: boolean;
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
  extraSelectedPath,
  activePathIsWeak,
  highlightedPath,
  hoveredPath,
  dirtyPaths,
  externalChangePath,
  isFlashing,
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
  // 强选中：activePathIsWeak 时仅来自“点击选中”的节点（extraSelectedPath），
  // 点击文件树外部/其它节点时会被清除；否则保持旧行为（activePath 强选中）。
  const isSelected = activePathIsWeak ? node.path === extraSelectedPath : node.path === activePath;
  // 弱选中：编辑器当前打开的文件（activePath = selectedFilePath），跟随编辑器保持。
  // 点击文件会使其成为编辑器打开文件，强选中与弱选中会同时落在同一节点上；
  // 此时仍应显示弱选中（淡蓝）以标识"被当前编辑器打开"，故不排除 extraSelectedPath。
  const isWeakSelected = activePathIsWeak ? node.path === activePath : false;
  const isContextMenuTarget = node.path === highlightedPath;
  const isHovered = node.path === hoveredPath;
  const isDirty = dirtyPaths?.has(node.path) ?? false;
  const isExternal = node.path === externalChangePath;
  // File icon is rendered directly by FileIcon component (no visual spec needed)
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
      isWeakSelected={isWeakSelected}
      isHovered={isHovered}
      isContextMenuTarget={isContextMenuTarget}
      isFlashing={isFlashing}
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
          <span className="adl-filetree__file-icon" aria-hidden="true">
            <FileIcon fileName={node.name} size={16} />
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
  extraSelectedPath,
  activePathIsWeak = false,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  flashPath,
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
  // 右键"多选"判定集合：只收集真正被"选中"的节点（强选中），供右键菜单分组操作。
  // 弱选中模式下，activePath（编辑器当前打开文件）仅用于弱选中渲染，不进入该集合；
  // 否则用户已在另一处节点进行强选中（extraSelectedPath）后，再右键点击弱选中文件，
  // 会把两个节点一起收集进多选分组，导致删除/重命名被错误作用到两个节点，
  // 与视觉状态（仅强选中被选中）不一致。非弱选中模式保持旧行为。
  const selectedPaths = useMemo((): Set<string> => {
    const paths = new Set<string>();
    if (activePathIsWeak) {
      if (extraSelectedPath) {
        paths.add(extraSelectedPath);
      }
    } else {
      if (activePath) {
        paths.add(activePath);
      }
      if (extraSelectedPath) {
        paths.add(extraSelectedPath);
      }
    }
    return paths;
  }, [activePathIsWeak, activePath, extraSelectedPath]);
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
                extraSelectedPath={extraSelectedPath}
                activePathIsWeak={activePathIsWeak}
                highlightedPath={highlightedPath}
                hoveredPath={hoveredPath}
                dirtyPaths={dirtyPaths}
                externalChangePath={externalChangePath}
                isFlashing={flashPath !== undefined && flatNode.node.path === flashPath}
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
            // 仅当未选择"重命名/删除"等对话框类操作（persistRef 为 false）时清除菜单高亮，
            // 使对话框操作期间目标节点保持可见；其它情况（普通操作/点击外部/Esc）随菜单一起清除。
            if (!contextMenuPersistRef?.current) {
              setContextMenuTargetPath(undefined);
            }
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
