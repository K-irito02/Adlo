import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface DragSession {
  draggedId: string;
  startX: number;
  isDragging: boolean;
}

export interface BranchLabelDragResult {
  isDragging: boolean;
  draggedBranchId: string | null;
  previewOrder: string[];
  cursorPosition: { x: number; y: number };
  ghostLabel: string | null;
  handleMouseDown: (id: string) => (e: React.MouseEvent) => void;
}

export function useBranchLabelDragReorder(
  allBranches: string[],
  onReorder: (newOrder: string[]) => void,
): BranchLabelDragResult {
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [localOrder, setLocalOrder] = useState<string[]>(() => [...allBranches]);
  const dragSessionRef = useRef<DragSession | null>(null);
  const localOrderRef = useRef<string[]>(localOrder);
  localOrderRef.current = localOrder;
  const startOrderRef = useRef<string[]>([]);
  const lastInsertIdxRef = useRef<number | null>(null);
  const allBranchesRef = useRef(allBranches);
  allBranchesRef.current = allBranches;

  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  useEffect(() => {
    const current = allBranchesRef.current;
    const local = localOrderRef.current;
    const localSet = new Set(local);
    const currentSet = new Set(current);
    const changedExt =
      current.length !== local.length ||
      current.some((id) => !localSet.has(id)) ||
      local.some((id) => !currentSet.has(id));

    if (changedExt) {
      const kept = local.filter((id) => currentSet.has(id));
      const added = current.filter((id) => !localSet.has(id));
      const merged = [...kept, ...added];
      localOrderRef.current = merged;
      setLocalOrder(merged);
    }
  }, [allBranches]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const session = dragSessionRef.current;
      if (!session) {
        return;
      }

      if (!session.isDragging) {
        if (Math.abs(e.clientX - session.startX) <= 4) {
          return;
        }
        session.isDragging = true;
        setDragActiveId(session.draggedId);
      }

      setCursorPosition({ x: e.clientX, y: e.clientY });

      const tagRow = document.querySelector<HTMLElement>('.adl-branch-graph__tag-row');
      if (!tagRow) {
        return;
      }

      const items = tagRow.querySelectorAll<HTMLElement>('[data-branch-drag-id]');
      const rects: { id: string; rect: DOMRect }[] = [];
      for (const item of items) {
        const id = item.getAttribute('data-branch-drag-id');
        if (id && id !== session.draggedId) {
          rects.push({ id, rect: item.getBoundingClientRect() });
        }
      }
      if (rects.length === 0) {
        return;
      }

      let insertIdx = rects.length;
      for (let i = 0; i < rects.length; i++) {
        const midX = rects[i].rect.left + rects[i].rect.width / 2;
        if (e.clientX < midX) {
          insertIdx = i;
          break;
        }
      }

      if (insertIdx === lastInsertIdxRef.current) {
        return;
      }
      lastInsertIdxRef.current = insertIdx;

      const currentOrder = localOrderRef.current;
      const newOrder = currentOrder.filter((id) => id !== session.draggedId);
      newOrder.splice(insertIdx, 0, session.draggedId);

      const changed =
        newOrder.length !== currentOrder.length || newOrder.some((id, i) => id !== currentOrder[i]);
      if (!changed) {
        return;
      }

      const oldRects = new Map<string, number>();
      items.forEach((item) => {
        const id = item.getAttribute('data-branch-drag-id');
        if (id) {
          oldRects.set(id, item.getBoundingClientRect().left);
        }
      });

      localOrderRef.current = newOrder;
      setLocalOrder(newOrder);

      requestAnimationFrame(() => {
        const tagRowAfter = document.querySelector<HTMLElement>('.adl-branch-graph__tag-row');
        if (!tagRowAfter) {
          return;
        }
        const itemsAfter = tagRowAfter.querySelectorAll<HTMLElement>('[data-branch-drag-id]');
        itemsAfter.forEach((item) => {
          const id = item.getAttribute('data-branch-drag-id');
          if (!id) {
            return;
          }
          const oldLeft = oldRects.get(id);
          if (oldLeft === undefined) {
            return;
          }
          const newLeft = item.getBoundingClientRect().left;
          const dx = oldLeft - newLeft;
          if (Math.abs(dx) > 0.5) {
            item.style.transition = 'none';
            item.style.transform = `translateX(${dx}px)`;
          }
        });
        void tagRowAfter.offsetHeight;
        itemsAfter.forEach((item) => {
          item.style.transition = 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)';
          item.style.transform = '';
        });
      });
    };

    const cleanupDrag = () => {
      const tagRow = document.querySelector<HTMLElement>('.adl-branch-graph__tag-row');
      if (tagRow) {
        tagRow.querySelectorAll<HTMLElement>('[data-branch-drag-id]').forEach((item) => {
          item.style.transform = '';
          item.style.transition = '';
        });
      }
      dragSessionRef.current = null;
      lastInsertIdxRef.current = null;
      setDragActiveId(null);
    };

    const handleMouseUp = () => {
      const session = dragSessionRef.current;
      if (!session) {
        return;
      }

      if (session.isDragging) {
        const startOrder = startOrderRef.current;
        const currentOrder = localOrderRef.current;
        const orderChanged =
          startOrder.length !== currentOrder.length ||
          startOrder.some((id, i) => id !== currentOrder[i]);

        if (orderChanged) {
          onReorderRef.current([...currentOrder]);
        }

        const draggedId = session.draggedId;
        cleanupDrag();
        const handler = (e: MouseEvent) => {
          const el = document.querySelector(`[data-branch-drag-id="${CSS.escape(draggedId)}"]`);
          if (el && el.contains(e.target as Node)) {
            e.stopPropagation();
          }
          window.removeEventListener('click', handler, true);
        };
        window.addEventListener('click', handler, true);
        return;
      }

      cleanupDrag();
    };

    const handleBlur = () => {
      cleanupDrag();
    };

    document.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    window.addEventListener('pointercancel', handleBlur);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
      window.removeEventListener('pointercancel', handleBlur);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const handleMouseDown = useCallback(
    (id: string) => (e: React.MouseEvent) => {
      if (e.button !== 0) {
        return;
      }
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
      startOrderRef.current = [...localOrderRef.current];
      dragSessionRef.current = {
        draggedId: id,
        startX: e.clientX,
        isDragging: false,
      };
    },
    [],
  );

  return {
    isDragging: dragActiveId !== null,
    draggedBranchId: dragActiveId,
    previewOrder: localOrder,
    cursorPosition,
    ghostLabel: dragActiveId,
    handleMouseDown,
  };
}
