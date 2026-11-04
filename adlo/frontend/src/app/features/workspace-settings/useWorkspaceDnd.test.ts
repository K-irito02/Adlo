import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaceDnd } from './useWorkspaceDnd';
import type { DraggableWorkspace } from './WorkspaceSettingsTypes';

// Helper: build a fake DragEndEvent
function makeDragEndEvent(
  activeId: string,
  overId: string | null,
): { active: { id: string }; over: { id: string } | null } {
  return {
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  };
}

const items: DraggableWorkspace[] = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' },
  { id: 'x', name: 'X' },
  { id: 'y', name: 'Y' },
];

describe('useWorkspaceDnd', () => {
  it('does nothing when over is null', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a'],
        deferredIds: [],
        naturalOrder: ['x', 'y'],
        visibleWorkspaces: items,
        onChange,
      }),
    );
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('a', null) as never);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing when active.id === over.id', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a', 'b'],
        deferredIds: [],
        naturalOrder: ['x'],
        visibleWorkspaces: items,
        onChange,
      }),
    );
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('a', 'a') as never);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reorders within priority list', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a', 'b', 'c'],
        deferredIds: [],
        naturalOrder: [],
        visibleWorkspaces: items,
        onChange,
      }),
    );
    // Drag 'a' onto 'b' → should insert before 'b' → ['a','b','c'] stays ['a','b','c']?
    // Actually: removing 'a' from index 0, inserting before 'b' at index 0 → ['a','b','c'] (no change).
    // To test real reorder, drag 'c' onto 'a' → remove 'c' (idx 2), insert before 'a' (idx 0) → ['c','a','b']
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('c', 'a') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: ['c', 'a', 'b'],
      deferred: [],
      natural: [],
    });
  });

  it('reorders within natural list', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: [],
        deferredIds: [],
        naturalOrder: ['x', 'y'],
        visibleWorkspaces: items,
        onChange,
      }),
    );
    // Drag 'y' onto 'x' → insert 'y' before 'x' → ['y', 'x']
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('y', 'x') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: [],
      deferred: [],
      natural: ['y', 'x'],
    });
  });

  it('moves from priority to deferred empty placeholder', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a'],
        deferredIds: [],
        naturalOrder: [],
        visibleWorkspaces: items,
        onChange,
      }),
    );
    // Drop on the empty deferred list placeholder (id `list-deferred`)
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('a', 'list-deferred') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: [],
      deferred: ['a'],
      natural: [],
    });
  });

  it('moves from deferred to priority on existing item', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a'],
        deferredIds: ['b'],
        naturalOrder: [],
        visibleWorkspaces: items,
        onChange,
      }),
    );
    // Drag 'b' onto 'a' → insert before 'a' → priority: ['b','a'], deferred: []
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('b', 'a') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: ['b', 'a'],
      deferred: [],
      natural: [],
    });
  });

  it('moves from natural to priority', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a'],
        deferredIds: [],
        naturalOrder: ['x'],
        visibleWorkspaces: items,
        onChange,
      }),
    );
    // Drag 'x' onto 'a' → insert before 'a' → priority: ['x','a'], natural: []
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('x', 'a') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: ['x', 'a'],
      deferred: [],
      natural: [],
    });
  });

  it('moves from priority to natural on existing item', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a'],
        deferredIds: [],
        naturalOrder: ['x'],
        visibleWorkspaces: items,
        onChange,
      }),
    );
    // Drag 'a' onto 'x' → insert before 'x' → priority: [], natural: ['a','x']
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('a', 'x') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: [],
      deferred: [],
      natural: ['a', 'x'],
    });
  });

  it('moves to empty list placeholder (list-priority)', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: [],
        deferredIds: [],
        naturalOrder: ['x', 'y'],
        visibleWorkspaces: items,
        onChange,
      }),
    );
    // Drag 'y' onto empty priority placeholder (id `list-priority`)
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('y', 'list-priority') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: ['y'],
      deferred: [],
      natural: ['x'],
    });
  });

  it('deduplicates when item somehow exists in two lists (defensive)', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        // Manually construct invalid state: 'a' in both priority and deferred
        priorityIds: ['a'],
        deferredIds: ['a'],
        naturalOrder: [],
        visibleWorkspaces: items,
        onChange,
      }),
    );
    // Drag 'a' (treats source as priority per findContainer first-match) onto deferred placeholder
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('a', 'list-deferred') as never);
    });
    const call = onChange.mock.calls[0][0];
    // 'a' should appear in exactly one list (deferred)
    const allIds = [...call.priority, ...call.deferred, ...call.natural];
    const aCount = allIds.filter((id: string) => id === 'a').length;
    expect(aCount).toBe(1);
    expect(call.deferred).toContain('a');
  });
});
