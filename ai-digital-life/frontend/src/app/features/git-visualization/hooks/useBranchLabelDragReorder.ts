import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface DragSession {
  draggedId: string;
  startX: number;
  isDragging: boolean;
}

export interface BranchLabelDragResult {
  isDragging: boolean;
  draggedColId: string | null;
  previewOrder: number[];
  cursorRef: React.RefObject<{ x: number; y: number } | null>;
  handleMouseDown: (id: string) => (e: React.MouseEvent) => void;
}

export function useBranchLabelDragReorder(
  allColIndices: number[],
  onReorder: (newOrder: number[]) => void,
): BranchLabelDragResult {
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const [localOrder, setLocalOrder] = useState<number[]>(() => [...allColIndices]);
  const dragSessionRef = useRef<DragSession | null>(null);
  const localOrderRef = useRef<number[]>(localOrder);
  localOrderRef.current = localOrder;
  const startOrderRef = useRef<number[]>([]);
  const lastInsertIdxRef = useRef<number | null>(null);
  const allColIndicesRef = useRef(allColIndices);
  allColIndicesRef.current = allColIndices;

  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  useEffect(() => {
    const current = allColIndicesRef.current;
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
  }, [allColIndices]);

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

      cursorRef.current = { x: e.clientX, y: e.clientY };

      const tagRow = document.querySelector<HTMLElement>('.adl-branch-graph__tag-row');
      if (!tagRow) {
        return;
      }

      const items = tagRow.querySelectorAll<HTMLElement>('[data-col-drag-id]');
      const rects: { id: string; rect: DOMRect }[] = [];
      for (const item of items) {
        const id = item.getAttribute('data-col-drag-id');
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
      const draggedNum = Number(session.draggedId);
      const newOrder = currentOrder.filter((id) => id !== draggedNum);
      newOrder.splice(insertIdx, 0, draggedNum);

      const changed =
        newOrder.length !== currentOrder.length || newOrder.some((id, i) => id !== currentOrder[i]);
      if (!changed) {
        return;
      }

      localOrderRef.current = newOrder;
      setLocalOrder(newOrder);
    };

    const cleanupDrag = () => {
      const tagRow = document.querySelector<HTMLElement>('.adl-branch-graph__tag-row');
      if (tagRow) {
        tagRow.querySelectorAll<HTMLElement>('[data-col-drag-id]').forEach((item) => {
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
          const el = document.querySelector(`[data-col-drag-id="${CSS.escape(draggedId)}"]`);
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
    draggedColId: dragActiveId,
    previewOrder: localOrder,
    cursorRef,
    handleMouseDown,
  };
}
