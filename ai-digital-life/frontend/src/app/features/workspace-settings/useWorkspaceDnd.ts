import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { ContainerId, DraggableWorkspace } from './WorkspaceSettingsTypes';

export interface UseWorkspaceDndArgs {
  priorityIds: string[];
  deferredIds: string[];
  naturalOrder: string[];
  visibleWorkspaces: DraggableWorkspace[];
  onChange: (next: { priority: string[]; deferred: string[]; natural: string[] }) => void;
}

export interface UseWorkspaceDndResult {
  sensors: ReturnType<typeof useSensors>;
  activeId: string | null;
  activeItem: DraggableWorkspace | null;
  activeContainer: ContainerId | null;
  grabOffset: { x: number; y: number };
  cursorPosition: { x: number; y: number };
  sourceRect: { width: number; height: number } | null;
  handleDragStart: (e: DragStartEvent) => void;
  handleDragOver: (e: DragOverEvent) => void;
  handleDragEnd: (e: DragEndEvent) => void;
}

const LIST_PREFIX = 'list-';
const DRAG_ACTIVATION_DISTANCE = 4;

function isListPlaceholder(id: string): boolean {
  return id.startsWith(LIST_PREFIX);
}

function parseListKind(id: string): ContainerId {
  const kind = id.slice(LIST_PREFIX.length);
  if (kind !== 'priority' && kind !== 'deferred' && kind !== 'natural') {
    throw new Error(`Unknown list kind: ${kind}`);
  }
  return kind;
}

function querySortableElement(id: string): Element | null {
  return document.querySelector(`[data-sortable-id="${CSS.escape(id)}"]`);
}

function findListContainerAtCursor(
  cursor: { x: number; y: number },
  grabOffset: { x: number; y: number },
  sourceRect: { width: number; height: number } | null,
): ContainerId | null {
  const gridEl = document.querySelector('.workspace-grid');
  if (!gridEl) {
    return null;
  }
  const gridRect = gridEl.getBoundingClientRect();

  // Item's bounding rect at drop time (positioned relative to cursor)
  const itemTop = cursor.y - grabOffset.y;
  const itemLeft = cursor.x - grabOffset.x;
  const itemBottom = itemTop + (sourceRect?.height ?? 40);
  const itemRight = itemLeft + (sourceRect?.width ?? 180);

  // Extend the vertical sensing area from the grid's top down to the
  // application bottom edge, so every empty area below the lists is
  // associated with a column.
  const areaTop = gridRect.top;
  const areaBottom = window.innerHeight;

  // Quick vertical rejection: item must intersect the sensing area
  if (itemBottom < areaTop || itemTop > areaBottom) {
    return null;
  }

  // Compute 3 equal column boundaries (gap matches CSS grid-gap: 12px)
  const gap = 12;
  const colWidth = (gridRect.width - gap * 2) / 3;

  let maxOverlap = 0;
  let bestKind: ContainerId | null = null;

  for (let i = 0; i < 3; i++) {
    const kind = ['priority', 'deferred', 'natural'][i] as ContainerId;
    const colLeft = gridRect.left + i * (colWidth + gap);
    const colRight = colLeft + colWidth;

    // Horizontal overlap between item and this column
    const overlapStart = Math.max(itemLeft, colLeft);
    const overlapEnd = Math.min(itemRight, colRight);
    const overlap = Math.max(0, overlapEnd - overlapStart);

    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      bestKind = kind;
    }
  }

  return maxOverlap > 0 ? bestKind : null;
}

function computeMove(
  priorityIds: string[],
  deferredIds: string[],
  naturalOrder: string[],
  itemId: string,
  overId: string,
  findContainer: (id: string) => ContainerId,
  insertAfter?: boolean,
): { priority: string[]; deferred: string[]; natural: string[] } {
  let newPriority = [...priorityIds];
  let newDeferred = [...deferredIds];
  let newNatural = [...naturalOrder];

  const getList = (c: ContainerId): string[] =>
    c === 'priority' ? newPriority : c === 'deferred' ? newDeferred : newNatural;

  const setList = (c: ContainerId, value: string[]) => {
    if (c === 'priority') {
      newPriority = value;
    } else if (c === 'deferred') {
      newDeferred = value;
    } else {
      newNatural = value;
    }
  };

  for (const c of ['priority', 'deferred', 'natural'] as ContainerId[]) {
    const list = getList(c);
    const idx = list.indexOf(itemId);
    if (idx !== -1) {
      setList(c, [...list.slice(0, idx), ...list.slice(idx + 1)]);
    }
  }

  const toContainer = isListPlaceholder(overId) ? parseListKind(overId) : findContainer(overId);
  const target = getList(toContainer);
  if (isListPlaceholder(overId)) {
    setList(toContainer, [...target, itemId]);
  } else {
    const overIdx = target.indexOf(overId);
    if (overIdx === -1) {
      setList(toContainer, [...target, itemId]);
    } else if (insertAfter) {
      setList(toContainer, [...target.slice(0, overIdx + 1), itemId, ...target.slice(overIdx + 1)]);
    } else {
      setList(toContainer, [...target.slice(0, overIdx), itemId, ...target.slice(overIdx)]);
    }
  }

  const prune = (list: string[], exclude: ContainerId): string[] => {
    const others: ContainerId[] = ['priority', 'deferred', 'natural'].filter(
      (c) => c !== exclude,
    ) as ContainerId[];
    const otherSets = others.map((c) => new Set(getList(c)));
    return list.filter((id) => {
      if (id === itemId) {
        return exclude === toContainer;
      }
      return !otherSets.some((s) => s.has(id));
    });
  };

  newPriority = prune(newPriority, 'priority');
  newDeferred = prune(newDeferred, 'deferred');
  newNatural = prune(newNatural, 'natural');

  return { priority: newPriority, deferred: newDeferred, natural: newNatural };
}

export function useWorkspaceDnd(args: UseWorkspaceDndArgs): UseWorkspaceDndResult {
  const { priorityIds, deferredIds, naturalOrder, visibleWorkspaces, onChange } = args;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [grabOffset, setGrabOffset] = useState({ x: 0, y: 0 });
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [sourceRect, setSourceRect] = useState<{ width: number; height: number } | null>(null);
  const cursorRef = useRef({ x: 0, y: 0 });

  // Track cursor position during drag — use ref for synchronous reads (computeInsertAfter),
  // state for reactive overlay re-render
  useEffect(() => {
    if (!activeId) {
      return;
    }
    const onMove = (e: PointerEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
      setCursorPosition(cursorRef.current);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
  );

  const containerMap = useMemo(() => {
    const map = new Map<string, ContainerId>();
    for (const id of priorityIds) {
      map.set(id, 'priority');
    }
    for (const id of deferredIds) {
      map.set(id, 'deferred');
    }
    for (const id of naturalOrder) {
      map.set(id, 'natural');
    }
    return map;
  }, [priorityIds, deferredIds, naturalOrder]);

  const findContainer = useCallback(
    (id: string): ContainerId => containerMap.get(id) ?? 'natural',
    [containerMap],
  );

  const computeInsertAfter = useCallback((overId: string): boolean => {
    if (isListPlaceholder(overId)) {
      return false;
    }
    const el = querySortableElement(overId);
    if (!el) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return cursorRef.current.y >= rect.top + rect.height / 2;
  }, []);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const itemId = String(e.active.id);
    setActiveId(itemId);
    const el = querySortableElement(itemId);
    if (el && e.activatorEvent instanceof PointerEvent) {
      const rect = el.getBoundingClientRect();
      setGrabOffset({
        x: e.activatorEvent.clientX - rect.left,
        y: e.activatorEvent.clientY - rect.top,
      });
      cursorRef.current = { x: e.activatorEvent.clientX, y: e.activatorEvent.clientY };
      setCursorPosition(cursorRef.current);
      setSourceRect({ width: rect.width, height: rect.height });
    }
  }, []);

  const handleDragOver = useCallback(
    (e: DragOverEvent) => {
      const { active, over } = e;
      if (!over) {
        return;
      }

      const itemId = String(active.id);
      const overId = String(over.id);
      if (itemId === overId) {
        return;
      }

      const fromContainer = findContainer(itemId);
      const toContainer = isListPlaceholder(overId) ? parseListKind(overId) : findContainer(overId);
      if (fromContainer === toContainer) {
        return;
      }

      const next = computeMove(
        priorityIds,
        deferredIds,
        naturalOrder,
        itemId,
        overId,
        findContainer,
        computeInsertAfter(overId),
      );
      onChange(next);
    },
    [priorityIds, deferredIds, naturalOrder, findContainer, onChange, computeInsertAfter],
  );

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      setActiveId(null);
      setSourceRect(null);
      setGrabOffset({ x: 0, y: 0 });
      setCursorPosition({ x: 0, y: 0 });

      const itemId = String(active.id);

      // Determine target container by calculating which grid column the
      // dropped item's bounding box overlaps most with. This handles all
      // drop-in-empty-space scenarios reliably.
      const cursorContainer = findListContainerAtCursor(cursorRef.current, grabOffset, sourceRect);
      let overId: string | null;

      if (cursorContainer) {
        // Use over for precise item-to-item positioning when available,
        // otherwise append to the end of the determined container.
        const overStr = over ? String(over.id) : '';
        if (overStr && !isListPlaceholder(overStr) && findContainer(overStr) === cursorContainer) {
          overId = overStr;
        } else {
          overId = `list-${cursorContainer}`;
        }
      } else if (over) {
        overId = String(over.id);
      } else {
        overId = null;
      }

      if (!overId || itemId === overId) {
        return;
      }

      const next = computeMove(
        priorityIds,
        deferredIds,
        naturalOrder,
        itemId,
        overId,
        findContainer,
        computeInsertAfter(overId),
      );
      onChange(next);
    },
    [
      priorityIds,
      deferredIds,
      naturalOrder,
      findContainer,
      onChange,
      computeInsertAfter,
      grabOffset,
      sourceRect,
    ],
  );

  const activeItem = activeId ? (visibleWorkspaces.find((w) => w.id === activeId) ?? null) : null;
  const activeContainer = activeId ? findContainer(activeId) : null;

  return {
    sensors,
    activeId,
    activeItem,
    activeContainer,
    grabOffset,
    cursorPosition,
    sourceRect,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}
