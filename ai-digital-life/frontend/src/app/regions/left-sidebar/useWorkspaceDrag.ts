import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecentWorkspaceEntry, ReorderWorkspacesInput } from '@ai-digital-life/kernel';
import { computeReorderedList, mergeOrderPreserving } from '../../utils/dragUtils';

interface DragSession {
  draggedId: string;
  startY: number;
  isDragging: boolean;
  isPinned: boolean;
}

export interface WorkspaceDragResult {
  isDragging: boolean;
  draggedItemId: string | null;
  localOrder: string[];
  cursorPosition: { x: number; y: number };
  handleDragStart: (event: React.MouseEvent, wsId: string, isPinned: boolean) => void;
  /** 真实拖拽结束后应抑制下一次 click（确定性：不依赖 React 状态 flush 时序）。 */
  suppressNextClick: () => boolean;
}

export function useWorkspaceDrag(
  workspaceItems: RecentWorkspaceEntry[],
  onReorderWorkspaces: (input: ReorderWorkspacesInput) => void,
): WorkspaceDragResult {
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const dragSessionRef = useRef<DragSession | null>(null);
  const targetIdRef = useRef<string | null>(null);
  const targetPosRef = useRef<'before' | 'after'>('after');
  const suppressClickRef = useRef(false);

  const [localOrder, setLocalOrder] = useState<string[]>(() => workspaceItems.map((w) => w.id));
  const localOrderRef = useRef<string[]>(localOrder);
  localOrderRef.current = localOrder;

  const sessionStartOrderRef = useRef<string[]>([]);

  const workspaceItemsRef = useRef(workspaceItems);
  workspaceItemsRef.current = workspaceItems;
  const onReorderRef = useRef(onReorderWorkspaces);
  onReorderRef.current = onReorderWorkspaces;

  const prevPinnedSetRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const externalIds = workspaceItems.map((w) => w.id);
    const isPinnedById = (id: string) => workspaceItems.find((w) => w.id === id)?.isPinned ?? false;

    const newPinnedSet = new Set(externalIds.filter((id) => isPinnedById(id)));
    const prevPinnedSet = prevPinnedSetRef.current;
    const pinnedSetChanged =
      newPinnedSet.size !== prevPinnedSet.size ||
      [...newPinnedSet].some((id) => !prevPinnedSet.has(id));

    let sorted: string[];
    if (pinnedSetChanged) {
      sorted = externalIds;
    } else {
      const merged = mergeOrderPreserving(localOrderRef.current, externalIds);
      const pinnedIds = merged.filter((id) => isPinnedById(id));
      const unpinnedIds = merged.filter((id) => !isPinnedById(id));
      sorted = [...pinnedIds, ...unpinnedIds];
    }

    prevPinnedSetRef.current = newPinnedSet;

    if (
      sorted.length !== localOrderRef.current.length ||
      sorted.some((id, i) => id !== localOrderRef.current[i])
    ) {
      localOrderRef.current = sorted;
      setLocalOrder(sorted);
    }
  }, [workspaceItems]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const session = dragSessionRef.current;
      if (!session) {
        return;
      }

      if (!session.isDragging) {
        if (Math.abs(e.clientY - session.startY) <= 4) {
          return;
        }
        session.isDragging = true;
        setDragActiveId(session.draggedId);
      }

      setCursorPosition({ x: e.clientX, y: e.clientY });

      const ul = document.querySelector('.adl-workspace-list');
      if (!ul) {
        return;
      }

      const items = ul.querySelectorAll<HTMLLIElement>('li[data-ws-id]');
      if (items.length === 0) {
        return;
      }

      let foundId: string | null = null;
      let foundPos: 'before' | 'after' = 'after';

      const firstRect = items[0].getBoundingClientRect();
      if (e.clientY < firstRect.top) {
        const firstId = items[0].getAttribute('data-ws-id');
        if (firstId && firstId !== session.draggedId) {
          foundId = firstId;
          foundPos = 'before';
        }
      } else {
        const lastRect = items[items.length - 1].getBoundingClientRect();
        if (e.clientY > lastRect.bottom) {
          const lastId = items[items.length - 1].getAttribute('data-ws-id');
          if (lastId && lastId !== session.draggedId) {
            foundId = lastId;
            foundPos = 'after';
          }
        }
      }

      if (!foundId) {
        let minDist = Infinity;
        for (const item of items) {
          const id = item.getAttribute('data-ws-id');
          if (!id || id === session.draggedId) {
            continue;
          }

          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const dist = Math.abs(e.clientY - midY);

          if (dist < minDist) {
            minDist = dist;
            foundId = id;
            foundPos = e.clientY < midY ? 'before' : 'after';
          }
        }
      }

      if (!foundId) {
        return;
      }

      const wsItems = workspaceItemsRef.current;
      const targetItem = wsItems.find((w) => w.id === foundId);
      if (!targetItem) {
        return;
      }
      if (targetItem.isPinned !== session.isPinned) {
        return;
      }

      if (foundId === targetIdRef.current && foundPos === targetPosRef.current) {
        return;
      }
      targetIdRef.current = foundId;
      targetPosRef.current = foundPos;

      const isPinnedById = (id: string) => wsItems.find((w) => w.id === id)?.isPinned ?? false;
      const newOrder = computeReorderedList(
        localOrderRef.current,
        session.draggedId,
        foundId,
        foundPos,
        session.isPinned,
        isPinnedById,
      );

      const currentOrder = localOrderRef.current;
      const changed =
        newOrder.length !== currentOrder.length || newOrder.some((id, i) => id !== currentOrder[i]);
      if (!changed) {
        return;
      }

      const oldRects = new Map<string, number>();
      items.forEach((el) => {
        const id = el.getAttribute('data-ws-id');
        if (id) {
          oldRects.set(id, el.getBoundingClientRect().top);
        }
      });

      localOrderRef.current = newOrder;
      setLocalOrder(newOrder);

      requestAnimationFrame(() => {
        const ulAfter = document.querySelector<HTMLElement>('.adl-workspace-list');
        if (!ulAfter) {
          return;
        }
        const itemsAfter = ulAfter.querySelectorAll<HTMLLIElement>('li[data-ws-id]');
        itemsAfter.forEach((el) => {
          const id = el.getAttribute('data-ws-id');
          if (!id) {
            return;
          }
          const oldTop = oldRects.get(id);
          if (oldTop === undefined) {
            return;
          }
          const newTop = el.getBoundingClientRect().top;
          const dy = oldTop - newTop;
          if (Math.abs(dy) > 0.5) {
            el.style.transition = 'none';
            el.style.transform = `translateY(${dy}px)`;
          }
        });
        void ulAfter.offsetHeight;
        itemsAfter.forEach((el) => {
          el.style.transition = 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)';
          el.style.transform = '';
        });
      });
    };

    const cleanupDrag = () => {
      const ul = document.querySelector('.adl-workspace-list');
      if (ul) {
        ul.querySelectorAll<HTMLLIElement>('li[data-ws-id]').forEach((el) => {
          el.style.transform = '';
          el.style.transition = '';
        });
      }
      dragSessionRef.current = null;
      targetIdRef.current = null;
      targetPosRef.current = 'after';
      sessionStartOrderRef.current = [];
      setDragActiveId(null);
    };

    const handleMouseUp = () => {
      const session = dragSessionRef.current;
      if (!session) {
        return;
      }

      if (session.isDragging) {
        // 真实拖拽（位移 >4px）结束后，pointerup 后续的 click 应被抑制，
        // 避免误触发行/标签的 toggle。用 ref 而非 React 状态，
        // 因 click 可能在 React 状态 flush 之前同任务触发。
        suppressClickRef.current = true;
        const startOrder = sessionStartOrderRef.current;
        const currentOrder = localOrderRef.current;
        const orderChanged =
          startOrder.length !== currentOrder.length ||
          startOrder.some((id, i) => id !== currentOrder[i]);

        if (orderChanged) {
          const items = workspaceItemsRef.current;
          const isPinnedById = (id: string) => items.find((w) => w.id === id)?.isPinned ?? false;
          const pinnedIds = currentOrder.filter((id) => isPinnedById(id));
          const unpinnedIds = currentOrder.filter((id) => !isPinnedById(id));
          onReorderRef.current({ pinnedIds, unpinnedIds });
        }
      }

      cleanupDrag();
    };

    const handleBlur = () => {
      cleanupDrag();
    };

    // 统一在每次新指针手势开始时清除上一手势可能残留的抑制标志，
    // 覆盖拖拽释放点不在行/标签上（标志未被消费）后下一次任意点击的场景。
    const handlePointerDownReset = () => {
      suppressClickRef.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    window.addEventListener('pointercancel', handleBlur);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('pointerdown', handlePointerDownReset, true);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
      window.removeEventListener('pointercancel', handleBlur);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('pointerdown', handlePointerDownReset, true);
    };
  }, []);

  const handleDragStart = useCallback(
    (event: React.MouseEvent, wsId: string, isPinned: boolean) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      // 新手势开始即清除上一手势可能残留的抑制标志，
      // 避免拖拽释放位置不在行/标签上时标志未消费导致下次点击被误吞。
      suppressClickRef.current = false;
      (event.currentTarget as HTMLElement).blur();
      sessionStartOrderRef.current = [...localOrderRef.current];
      dragSessionRef.current = {
        draggedId: wsId,
        startY: event.clientY,
        isDragging: false,
        isPinned,
      };
    },
    [],
  );
  return {
    isDragging: dragActiveId !== null,
    draggedItemId: dragActiveId,
    localOrder,
    cursorPosition,
    handleDragStart,
    suppressNextClick: () => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return true;
      }
      return false;
    },
  };
}
