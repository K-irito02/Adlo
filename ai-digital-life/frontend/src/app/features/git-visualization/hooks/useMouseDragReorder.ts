import { useState, useCallback, useEffect, useRef } from 'react';

export interface DragEdgeOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  edgeThreshold?: number;
  onEdgeLeft: () => void;
  onEdgeRight: () => void;
}

export function useMouseDragReorder(
  itemIds: string[],
  onReorder: (newOrder: string[]) => void,
  edgeOptions?: DragEdgeOptions,
) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const itemsRef = useRef(itemIds);
  itemsRef.current = itemIds;
  const edgeOptionsRef = useRef(edgeOptions);
  edgeOptionsRef.current = edgeOptions;

  const handleMouseDown = useCallback(
    (id: string) => (e: React.MouseEvent) => {
      if (e.button !== 0) {
        return;
      }
      e.preventDefault();
      setDraggedId(id);
      setOverId(id);
    },
    [],
  );

  useEffect(() => {
    if (!draggedId) {
      return;
    }

    let currentOverId = draggedId;
    let edgeIntervalId: ReturnType<typeof setInterval> | null = null;
    let activeEdge: 'left' | 'right' | null = null;

    const clearEdgeInterval = () => {
      if (edgeIntervalId !== null) {
        clearInterval(edgeIntervalId);
        edgeIntervalId = null;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el) {
        const dragItem = el.closest('[data-drag-id]');
        if (dragItem) {
          const id = dragItem.getAttribute('data-drag-id');
          if (id && id !== currentOverId) {
            currentOverId = id;
            setOverId(id);
          }
        }
      }

      const opts = edgeOptionsRef.current;
      if (opts?.containerRef.current) {
        const rect = opts.containerRef.current.getBoundingClientRect();
        const threshold = opts.edgeThreshold ?? 30;
        const nearLeft = e.clientX < rect.left + threshold;
        const nearRight = e.clientX > rect.right - threshold;

        if (nearLeft) {
          if (activeEdge !== 'left') {
            clearEdgeInterval();
            activeEdge = 'left';
          }
          if (edgeIntervalId === null) {
            opts.onEdgeLeft();
            edgeIntervalId = setInterval(() => edgeOptionsRef.current?.onEdgeLeft?.(), 800);
          }
        } else if (nearRight) {
          if (activeEdge !== 'right') {
            clearEdgeInterval();
            activeEdge = 'right';
          }
          if (edgeIntervalId === null) {
            opts.onEdgeRight();
            edgeIntervalId = setInterval(() => edgeOptionsRef.current?.onEdgeRight?.(), 800);
          }
        } else {
          clearEdgeInterval();
          activeEdge = null;
        }
      }
    };

    const handleMouseUp = () => {
      clearEdgeInterval();
      const didReorder = currentOverId && currentOverId !== draggedId;
      if (didReorder) {
        const items = itemsRef.current;
        const draggedIdx = items.indexOf(draggedId);
        const targetIdx = items.indexOf(currentOverId);
        if (draggedIdx !== -1 && targetIdx !== -1) {
          const next = items.filter((id) => id !== draggedId);
          next.splice(targetIdx, 0, draggedId);
          onReorder(next);
        }
      }
      setDraggedId(null);
      setOverId(null);
      if (didReorder) {
        const suppressId = draggedId;
        const handler = (e: MouseEvent) => {
          const el = document.querySelector(`[data-drag-id="${CSS.escape(suppressId)}"]`);
          if (el && el.contains(e.target as Node)) {
            e.stopPropagation();
          }
          window.removeEventListener('click', handler, true);
        };
        window.addEventListener('click', handler, true);
      }
    };

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearEdgeInterval();
        setDraggedId(null);
        setOverId(null);
      }
    };

    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', onEscape);

    return () => {
      clearEdgeInterval();
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', onEscape);
    };
  }, [draggedId, onReorder]);

  return { draggedId, overId, handleMouseDown };
}
