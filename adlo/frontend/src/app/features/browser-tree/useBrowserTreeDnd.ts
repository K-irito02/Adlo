import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useAppStore } from '@stores/slicedStore';
import {
  CUSTOM_ROOT,
  folderContainerKey,
  validateBookmarkMove,
  workspaceContainerKey,
} from '@stores/slices/browserBookmarkOrder';
import type { BookmarkMove, BookmarkMoveError } from '@stores/slices/browserBookmarkOrder';
import { createDragGhost } from '@features/browser/dragGhost';
import type { DragGhostHandle } from '@features/browser/dragGhost';
import type { BrowserCategoryState } from './types';

const DRAG_THRESHOLD = 4;

type DropError = BookmarkMoveError | 'history' | 'workspace-header' | 'bookmark-root';

interface DragPayload {
  kind: 'folder' | 'bookmark';
  id: string;
}

interface DragSession {
  payload: DragPayload;
  row: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  ghost?: DragGhostHandle;
}

interface DndNodeInfo {
  kind: 'folder' | 'bookmark' | 'workspace';
  id: string;
  container: string | null;
  index: number;
}

export interface BrowserTreeDndIndicator {
  kind: 'insert' | 'into' | 'new-root' | 'invalid';
  top: number;
  left: number;
  width: number;
  height: number;
}

interface DropComputation {
  move?: BookmarkMove;
  error?: DropError;
  indicator: BrowserTreeDndIndicator;
}

export interface BrowserTreeDndHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
}

export interface BrowserTreeDndResult {
  indicator: BrowserTreeDndIndicator | null;
  isDragging: boolean;
  handlers: BrowserTreeDndHandlers;
}

function buildDndNodeMap(categories: {
  workspaceCategory: BrowserCategoryState;
  userFolderCategory: BrowserCategoryState;
  historyCategory: BrowserCategoryState;
}): Map<string, DndNodeInfo> {
  const map = new Map<string, DndNodeInfo>();
  const walk = (
    node: BrowserCategoryState['nodes'][number],
    container: string | null,
    index: number,
  ): void => {
    if (node.nodeType === 'workspace' && node.workspaceId) {
      map.set(node.path, {
        kind: 'workspace',
        id: node.workspaceId,
        container: null,
        index: 0,
      });
      const childContainer = workspaceContainerKey(node.workspaceId);
      node.children.forEach((child, childIndex) => walk(child, childContainer, childIndex));
      return;
    }
    if (node.nodeType === 'folder' && node.folderId) {
      map.set(node.path, {
        kind: 'folder',
        id: node.folderId,
        container,
        index,
      });
      const childContainer = folderContainerKey(node.folderId);
      node.children.forEach((child, childIndex) => walk(child, childContainer, childIndex));
      return;
    }
    if (node.nodeType === 'bookmark' && node.bookmarkId) {
      map.set(node.path, {
        kind: 'bookmark',
        id: node.bookmarkId,
        container,
        index,
      });
    }
  };

  categories.workspaceCategory.nodes.forEach((node) => walk(node, null, 0));
  categories.userFolderCategory.nodes.forEach((node, index) => walk(node, CUSTOM_ROOT, index));
  categories.historyCategory.nodes.forEach((node) => walk(node, null, 0));
  return map;
}

function closestElement(target: EventTarget | null, selector: string): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
}

function visibleRowRect(row: HTMLElement): DOMRect {
  const visible = row.classList.contains('adl-browser-entry')
    ? (row.querySelector<HTMLElement>('.adl-browser-entry__header') ?? row)
    : row;
  return visible.getBoundingClientRect();
}

/**
 * `closest('[data-path]')` 在展开目录的子区域里会返回外层目录包装元素，
 * 用它算落点会得到“整个目录之后”的错觉。这里按指针 Y 找到真正命中的
 * 最内层可见行，保证插入线/高亮与实际落点一致。
 */
function rowAtPoint(baseRow: HTMLElement, clientY: number): { row: HTMLElement; rect: DOMRect } {
  let row = baseRow;
  let rect = visibleRowRect(baseRow);
  const candidates = baseRow.querySelectorAll<HTMLElement>('[data-path]');
  for (const candidate of candidates) {
    const candidateRect = visibleRowRect(candidate);
    if (
      candidateRect.height > 0 &&
      clientY >= candidateRect.top &&
      clientY <= candidateRect.bottom
    ) {
      row = candidate;
      rect = candidateRect;
    }
  }
  return { row, rect };
}

function rowZone(clientY: number, rect: DOMRect): 'before' | 'after' | 'middle' {
  const y = clientY - rect.top;
  if (y <= rect.height * 0.2) {
    return 'before';
  }
  if (y >= rect.height * 0.8) {
    return 'after';
  }
  return 'middle';
}

export function useBrowserTreeDnd(categories: {
  workspaceCategory: BrowserCategoryState;
  userFolderCategory: BrowserCategoryState;
  historyCategory: BrowserCategoryState;
}): BrowserTreeDndResult {
  const browserMoveBookmarkNode = useAppStore((state) => state.browserMoveBookmarkNode);
  const nodeMap = useMemo(() => buildDndNodeMap(categories), [categories]);
  const nodeMapRef = useRef(nodeMap);
  nodeMapRef.current = nodeMap;

  const sessionRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef(false);
  const lastComputationRef = useRef<DropComputation | null>(null);
  const [indicator, setIndicator] = useState<BrowserTreeDndIndicator | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const cleanup = useCallback(() => {
    sessionRef.current?.ghost?.remove();
    sessionRef.current = null;
    lastComputationRef.current = null;
    setIsDragging(false);
    setIndicator(null);
    document.body.classList.remove('adl-browser-dnd-dragging');
    document.body.classList.remove('adl-browser-dnd-not-allowed');
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const computeDrop = useCallback(
    (target: EventTarget | null, clientY: number, payload: DragPayload): DropComputation | null => {
      const baseRow = closestElement(target, '[data-path]');
      if (baseRow) {
        const resolved = rowAtPoint(baseRow, clientY);
        const row = resolved.row;
        const rect = resolved.rect;
        const path = row.dataset.path ?? '';
        const info = nodeMapRef.current.get(path);
        if (!info) {
          if (path.startsWith('history')) {
            return {
              error: 'history',
              indicator: {
                kind: 'invalid',
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              },
            };
          }
          return null;
        }

        if (info.kind === 'workspace') {
          const move: BookmarkMove =
            payload.kind === 'folder'
              ? {
                  kind: 'folder',
                  id: payload.id,
                  target: { kind: 'into', container: workspaceContainerKey(info.id) },
                }
              : {
                  kind: 'bookmark',
                  id: payload.id,
                  target: { kind: 'into', container: workspaceContainerKey(info.id) },
                };
          const state = useAppStore.getState();
          const error = validateBookmarkMove(
            {
              browserBookmarkFolders: state.browserBookmarkFolders,
              browserWorkspaceBookmarks: state.browserWorkspaceBookmarks,
              browserBookmarkChildOrder: state.browserBookmarkChildOrder ?? {},
            },
            move,
          );
          return {
            ...(error ? { error } : { move }),
            indicator: {
              kind: error ? 'invalid' : 'into',
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            },
          };
        }

        if (info.kind === 'folder') {
          const zone = rowZone(clientY, rect);
          if (zone === 'middle') {
            const move: BookmarkMove =
              payload.kind === 'folder'
                ? {
                    kind: 'folder',
                    id: payload.id,
                    target: { kind: 'into', container: folderContainerKey(info.id) },
                  }
                : {
                    kind: 'bookmark',
                    id: payload.id,
                    target: { kind: 'into', container: folderContainerKey(info.id) },
                  };
            const state = useAppStore.getState();
            const error = validateBookmarkMove(
              {
                browserBookmarkFolders: state.browserBookmarkFolders,
                browserWorkspaceBookmarks: state.browserWorkspaceBookmarks,
                browserBookmarkChildOrder: state.browserBookmarkChildOrder ?? {},
              },
              move,
            );
            return {
              ...(error ? { error } : { move }),
              indicator: {
                kind: error ? 'invalid' : 'into',
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              },
            };
          }

          if (!info.container) {
            return null;
          }
          const index = zone === 'after' ? info.index + 1 : info.index;
          const move: BookmarkMove =
            payload.kind === 'folder'
              ? {
                  kind: 'folder',
                  id: payload.id,
                  target: { kind: 'insert', container: info.container, index },
                }
              : {
                  kind: 'bookmark',
                  id: payload.id,
                  target: { kind: 'insert', container: info.container, index },
                };
          const state = useAppStore.getState();
          const error = validateBookmarkMove(
            {
              browserBookmarkFolders: state.browserBookmarkFolders,
              browserWorkspaceBookmarks: state.browserWorkspaceBookmarks,
              browserBookmarkChildOrder: state.browserBookmarkChildOrder ?? {},
            },
            move,
          );
          return {
            ...(error ? { error } : { move }),
            indicator: {
              kind: error ? 'invalid' : 'insert',
              // “放到目录后面”在语义上位于整棵子树之后；展开的目录若画在 header
              // 底部会看起来像“放进目录”，因此 after 取行包装元素（含子树）的底边。
              top: zone === 'before' ? rect.top : row.getBoundingClientRect().bottom,
              left: rect.left + 8,
              width: Math.max(40, rect.width - 16),
              height: 2,
            },
          };
        }

        if (info.kind === 'bookmark') {
          if (!info.container) {
            return null;
          }
          const rectY = clientY - rect.top;
          const after = rectY > rect.height / 2;
          const index = after ? info.index + 1 : info.index;
          const move: BookmarkMove =
            payload.kind === 'folder'
              ? {
                  kind: 'folder',
                  id: payload.id,
                  target: { kind: 'insert', container: info.container, index },
                }
              : {
                  kind: 'bookmark',
                  id: payload.id,
                  target: { kind: 'insert', container: info.container, index },
                };
          const state = useAppStore.getState();
          const error = validateBookmarkMove(
            {
              browserBookmarkFolders: state.browserBookmarkFolders,
              browserWorkspaceBookmarks: state.browserWorkspaceBookmarks,
              browserBookmarkChildOrder: state.browserBookmarkChildOrder ?? {},
            },
            move,
          );
          return {
            ...(error ? { error } : { move }),
            indicator: {
              kind: error ? 'invalid' : 'insert',
              top: after ? rect.bottom : rect.top,
              left: rect.left + 8,
              width: Math.max(40, rect.width - 16),
              height: 2,
            },
          };
        }
      }

      const category = closestElement(target, '[data-dnd-category]');
      if (!category) {
        return null;
      }
      const categoryType = category.dataset.dndCategory;
      const label = category.querySelector('.adl-browser-category__label');
      const rect = (label ?? category).getBoundingClientRect();
      if (categoryType === 'userFolder' && payload.kind === 'folder') {
        const move: BookmarkMove = {
          kind: 'folder',
          id: payload.id,
          target: { kind: 'new-root' },
        };
        const state = useAppStore.getState();
        const error = validateBookmarkMove(
          {
            browserBookmarkFolders: state.browserBookmarkFolders,
            browserWorkspaceBookmarks: state.browserWorkspaceBookmarks,
            browserBookmarkChildOrder: state.browserBookmarkChildOrder ?? {},
          },
          move,
        );
        return {
          ...(error ? { error } : { move }),
          indicator: {
            kind: error ? 'invalid' : 'new-root',
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          },
        };
      }
      const error: DropError =
        categoryType === 'userFolder'
          ? 'bookmark-root'
          : categoryType === 'workspace'
            ? 'workspace-header'
            : 'history';
      return {
        error,
        indicator: {
          kind: 'invalid',
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      };
    },
    [],
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button > 0) {
      return;
    }
    const row = closestElement(event.target, '[data-path]');
    if (!row) {
      return;
    }
    const info = nodeMapRef.current.get(row.dataset.path ?? '');
    if (!info || (info.kind !== 'folder' && info.kind !== 'bookmark')) {
      return;
    }
    lastComputationRef.current = null;
    sessionRef.current = {
      payload: { kind: info.kind, id: info.id },
      row,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  }, []);

  const handleClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      if (!session.active) {
        if (
          Math.hypot(event.clientX - session.startX, event.clientY - session.startY) <
          DRAG_THRESHOLD
        ) {
          return;
        }
        session.active = true;
        session.ghost = createDragGhost(session.row, event.clientX, event.clientY);
        try {
          session.row.setPointerCapture(session.pointerId);
        } catch {
          // Pointer capture is best-effort; window listeners still handle the drag.
        }
        setIsDragging(true);
        document.body.classList.add('adl-browser-dnd-dragging');
      }
      event.preventDefault();
      session.ghost?.move(event.clientX, event.clientY);
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const computation = computeDrop(target, event.clientY, session.payload);
      lastComputationRef.current = computation;
      setIndicator(computation?.indicator ?? null);
      document.body.classList.toggle('adl-browser-dnd-not-allowed', Boolean(computation?.error));
    };

    const handleUp = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      const wasActive = session.active;
      const computation = lastComputationRef.current;
      if (wasActive) {
        event.preventDefault();
        suppressClickRef.current = true;
        if (computation?.move) {
          browserMoveBookmarkNode(computation.move);
        }
      }
      cleanup();
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    const handleCancel = () => cleanup();

    const blockClick = (event: MouseEvent) => {
      if (!suppressClickRef.current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('pointermove', handleMove, { passive: false, capture: true });
    window.addEventListener('pointerup', handleUp, true);
    window.addEventListener('pointercancel', handleCancel, true);
    window.addEventListener('blur', cleanup);
    document.addEventListener('click', blockClick, true);
    document.addEventListener('auxclick', blockClick, true);
    return () => {
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('pointerup', handleUp, true);
      window.removeEventListener('pointercancel', handleCancel, true);
      window.removeEventListener('blur', cleanup);
      document.removeEventListener('click', blockClick, true);
      document.removeEventListener('auxclick', blockClick, true);
    };
  }, [browserMoveBookmarkNode, cleanup, computeDrop]);

  return {
    indicator,
    isDragging,
    handlers: {
      onPointerDown: handlePointerDown,
      onClickCapture: handleClickCapture,
    },
  };
}
