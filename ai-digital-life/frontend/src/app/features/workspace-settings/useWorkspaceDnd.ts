import { useCallback, useMemo, useState } from 'react';
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
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
  handleDragStart: (e: DragStartEvent) => void;
  handleDragEnd: (e: DragEndEvent) => void;
}

const LIST_PREFIX = 'list-';

function isListPlaceholder(id: string): boolean {
  return id.startsWith(LIST_PREFIX);
}

function parseListKind(id: string): ContainerId {
  return id.slice(LIST_PREFIX.length) as ContainerId;
}

/**
 * Encapsulates all drag-and-drop logic for the three-list workspace settings UI.
 *
 * The `findContainer` lookup is memoized so `handleDragEnd`'s `useCallback` doesn't
 * invalidate every render (the original inline-function bug).
 *
 * Drop target detection:
 * - If `over.id` starts with `list-`, it's an empty-list placeholder → append to that list.
 * - Otherwise `over.id` is a workspace ID → find its container, insert before it.
 */
export function useWorkspaceDnd(args: UseWorkspaceDndArgs): UseWorkspaceDndResult {
  const { priorityIds, deferredIds, naturalOrder, visibleWorkspaces, onChange } = args;
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Memoized container lookup — Map<id, ContainerId>
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

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      setActiveId(null);
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

      // Build working copies
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

      // Remove from source (if source is a real list — natural is "everyone else")
      if (fromContainer !== 'natural') {
        const src = getList(fromContainer);
        const idx = src.indexOf(itemId);
        if (idx !== -1) {
          setList(fromContainer, [...src.slice(0, idx), ...src.slice(idx + 1)]);
        }
      } else {
        // Remove from natural
        const idx = newNatural.indexOf(itemId);
        if (idx !== -1) {
          newNatural = [...newNatural.slice(0, idx), ...newNatural.slice(idx + 1)];
        }
      }

      // Insert into target
      if (isListPlaceholder(overId)) {
        // Append to target list end
        const target = getList(toContainer);
        setList(toContainer, [...target, itemId]);
      } else {
        // Insert before over.id
        const target = getList(toContainer);
        const overIdx = target.indexOf(overId);
        if (overIdx === -1) {
          setList(toContainer, [...target, itemId]);
        } else {
          setList(toContainer, [...target.slice(0, overIdx), itemId, ...target.slice(overIdx)]);
        }
      }

      // Deduplicate defensively — ensure itemId appears in exactly one list
      const prune = (list: string[], exclude: ContainerId): string[] => {
        const others: ContainerId[] = ['priority', 'deferred', 'natural'].filter(
          (c) => c !== exclude,
        ) as ContainerId[];
        const otherSets = others.map((c) => new Set(getList(c)));
        return list.filter((id) => {
          // Keep id in this list only if it doesn't appear in other lists.
          // For itemId, keep only in the target container (toContainer) so that
          // defensive dedup of invalid input still converges to a single list.
          if (id === itemId) {
            return exclude === toContainer;
          }
          return !otherSets.some((s) => s.has(id));
        });
      };
      newPriority = prune(newPriority, 'priority');
      newDeferred = prune(newDeferred, 'deferred');
      newNatural = prune(newNatural, 'natural');

      onChange({ priority: newPriority, deferred: newDeferred, natural: newNatural });
    },
    [priorityIds, deferredIds, naturalOrder, findContainer, onChange],
  );

  const activeItem = activeId ? (visibleWorkspaces.find((w) => w.id === activeId) ?? null) : null;

  return {
    sensors,
    activeId,
    activeItem,
    handleDragStart,
    handleDragEnd,
  };
}
