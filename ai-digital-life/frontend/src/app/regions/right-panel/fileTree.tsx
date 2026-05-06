import React, { memo, startTransition, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
            <MemoizedFileTreeNode<T>
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
    previous.onShowContextMenu !== next.onShowContextMenu
  ) {
    return false;
  }

  const path = previous.node.path;
  if ((previous.expandedPaths[path] ?? false) !== (next.expandedPaths[path] ?? false)) {
    return false;
  }
  if ((previous.selectedFilePath === path) !== (next.selectedFilePath === path)) {
    return false;
  }
  if (previous.node.kind === "directory") {
    const previousContainsSelected = isPathInSubtree(path, previous.selectedFilePath);
    const nextContainsSelected = isPathInSubtree(path, next.selectedFilePath);
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollbarThumbRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [optimisticSelectedPath, setOptimisticSelectedPath] = useState<string | undefined>();

  useEffect(() => {
    setOptimisticSelectedPath(undefined);
  }, [props.selectedFilePath]);

  const updateScrollbar = useCallback(() => {
    const root = rootRef.current;
    const scroll = scrollRef.current;
    const thumb = scrollbarThumbRef.current;
    if (!root || !scroll || !thumb) {
      return;
    }
    const maxScrollTop = scroll.scrollHeight - scroll.clientHeight;
    const isScrollable = maxScrollTop > 1;
    root.classList.toggle("is-scrollable", isScrollable);
    if (!isScrollable) {
      thumb.style.height = "0px";
      thumb.style.transform = "translateY(0px)";
      return;
    }
    const trackHeight = scroll.clientHeight;
    const thumbHeight = Math.max(24, Math.round((scroll.clientHeight / scroll.scrollHeight) * trackHeight));
    const maxThumbTop = Math.max(1, trackHeight - thumbHeight);
    const thumbTop = Math.round((scroll.scrollTop / maxScrollTop) * maxThumbTop);
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${thumbTop}px)`;
  }, []);

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

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) {
      return;
    }
    let rafId = 0;
    const scheduleUpdate = () => {
      if (rafId) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateScrollbar();
      });
    };
    scheduleUpdate();
    scroll.addEventListener("scroll", scheduleUpdate, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleUpdate) : null;
    observer?.observe(scroll);
    if (scroll.firstElementChild) {
      observer?.observe(scroll.firstElementChild);
    }
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      scroll.removeEventListener("scroll", scheduleUpdate);
      observer?.disconnect();
    };
  }, [props.nodes, props.expandedPaths, updateScrollbar]);

  const handleOpenFile = useCallback(
    (relativePath: string) => {
      setOptimisticSelectedPath(relativePath);
      startTransition(() => props.onOpenFile(relativePath));
    },
    [props.onOpenFile]
  );

  const handleShowContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, node: T) => {
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

  const handleScrollbarPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const scroll = scrollRef.current;
    const thumb = scrollbarThumbRef.current;
    if (!scroll || !thumb || scroll.scrollHeight <= scroll.clientHeight) {
      return;
    }
    event.preventDefault();
    const track = event.currentTarget;
    track.setPointerCapture(event.pointerId);
    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const pointerInsideThumb = event.clientY >= thumbRect.top && event.clientY <= thumbRect.bottom;
    const thumbOffset = pointerInsideThumb ? event.clientY - thumbRect.top : thumbRect.height / 2;

    const applyClientY = (clientY: number) => {
      const maxScrollTop = scroll.scrollHeight - scroll.clientHeight;
      const maxThumbTop = Math.max(1, trackRect.height - thumbRect.height);
      const nextThumbTop = clamp(clientY - trackRect.top - thumbOffset, 0, maxThumbTop);
      scroll.scrollTop = Math.round((nextThumbTop / maxThumbTop) * maxScrollTop);
      updateScrollbar();
    };

    applyClientY(event.clientY);

    const handleMove = (moveEvent: PointerEvent) => applyClientY(moveEvent.clientY);
    const cleanup = (upEvent: PointerEvent) => {
      if (track.hasPointerCapture(upEvent.pointerId)) {
        track.releasePointerCapture(upEvent.pointerId);
      }
      track.removeEventListener("pointermove", handleMove);
      track.removeEventListener("pointerup", cleanup);
      track.removeEventListener("pointercancel", cleanup);
      track.removeEventListener("lostpointercapture", cleanup);
    };

    track.addEventListener("pointermove", handleMove);
    track.addEventListener("pointerup", cleanup);
    track.addEventListener("pointercancel", cleanup);
    track.addEventListener("lostpointercapture", cleanup);
  }, [updateScrollbar]);

  const selectedFilePath = optimisticSelectedPath ?? props.selectedFilePath;

  return (
    <div ref={rootRef} className="adl-filetree-shell">
      <div ref={scrollRef} className="adl-filetree-scroll">
        <ul className="adl-filetree">
          {props.nodes.map((node) => (
            <MemoizedFileTreeNode<T>
              key={node.path}
              node={node}
              depth={0}
              {...props}
              selectedFilePath={selectedFilePath}
              onOpenFile={handleOpenFile}
              onShowContextMenu={props.getContextMenuItems ? handleShowContextMenu : undefined}
            />
          ))}
        </ul>
      </div>
      <div
        className="adl-filetree-scrollbar"
        aria-hidden="true"
        onPointerDown={handleScrollbarPointerDown}
      >
        <div ref={scrollbarThumbRef} className="adl-filetree-scrollbar__thumb" />
      </div>
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
    </div>
  );
}
