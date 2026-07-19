import { describe, it, expect } from 'vitest';
import { computeLoadPhases } from './workspaceLoadOrder';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';

function makeWs(id: string): RecentWorkspaceEntry {
  return {
    id,
    path: `/fake/${id}`,
    rootPath: `/fake/${id}`,
    name: id,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
  } as RecentWorkspaceEntry;
}

describe('computeLoadPhases', () => {
  it('returns all-empty phases when inputs are empty', () => {
    const phases = computeLoadPhases([], [], [], []);
    expect(phases.priority).toEqual([]);
    expect(phases.deferred).toEqual([]);
    expect(phases.natural).toEqual([]);
  });

  it('places priority workspaces in priority phase in array order', () => {
    const visible = [makeWs('a'), makeWs('b'), makeWs('c')];
    const phases = computeLoadPhases(['c', 'a', 'b'], [], [], visible);
    expect(phases.priority.map((w) => w.id)).toEqual(['c', 'a', 'b']);
    expect(phases.deferred).toEqual([]);
    expect(phases.natural).toEqual([]);
  });

  it('places deferred workspaces in deferred phase in array order', () => {
    const visible = [makeWs('a'), makeWs('b')];
    const phases = computeLoadPhases([], ['b', 'a'], [], visible);
    expect(phases.priority).toEqual([]);
    expect(phases.deferred.map((w) => w.id)).toEqual(['b', 'a']);
    expect(phases.natural).toEqual([]);
  });

  it('places natural-order workspaces in natural phase in array order', () => {
    const visible = [makeWs('a'), makeWs('b'), makeWs('c')];
    const phases = computeLoadPhases([], [], ['c', 'a', 'b'], visible);
    expect(phases.priority).toEqual([]);
    expect(phases.deferred).toEqual([]);
    expect(phases.natural.map((w) => w.id)).toEqual(['c', 'a', 'b']);
  });

  it('mixes all three phases preserving order', () => {
    const visible = [makeWs('a'), makeWs('b'), makeWs('c'), makeWs('d'), makeWs('e')];
    const phases = computeLoadPhases(['a'], ['b'], ['c', 'd'], visible);
    expect(phases.priority.map((w) => w.id)).toEqual(['a']);
    expect(phases.deferred.map((w) => w.id)).toEqual(['b']);
    expect(phases.natural.map((w) => w.id)).toEqual(['c', 'd', 'e']);
  });

  it('filters out orphan IDs (pointing to removed workspaces)', () => {
    const visible = [makeWs('a'), makeWs('b')];
    const phases = computeLoadPhases(['a', 'ghost'], [], ['b', 'phantom'], visible);
    expect(phases.priority.map((w) => w.id)).toEqual(['a']);
    expect(phases.natural.map((w) => w.id)).toEqual(['b']);
  });

  it('appends stray workspaces (not in any list) to natural phase end', () => {
    const visible = [makeWs('a'), makeWs('b'), makeWs('c'), makeWs('d')];
    // 'a' in priority, 'b' in deferred, 'c' in natural order, 'd' is stray
    const phases = computeLoadPhases(['a'], ['b'], ['c'], visible);
    expect(phases.priority.map((w) => w.id)).toEqual(['a']);
    expect(phases.deferred.map((w) => w.id)).toEqual(['b']);
    expect(phases.natural.map((w) => w.id)).toEqual(['c', 'd']);
  });

  it('returns empty phases when visibleWorkspaces is empty (all IDs become orphans)', () => {
    const phases = computeLoadPhases(['a'], ['b'], ['c'], []);
    expect(phases.priority).toEqual([]);
    expect(phases.deferred).toEqual([]);
    expect(phases.natural).toEqual([]);
  });

  it('preserves array order exactly for priority phase', () => {
    const visible = [makeWs('1'), makeWs('2'), makeWs('3'), makeWs('4')];
    const phases = computeLoadPhases(['4', '1', '3', '2'], [], [], visible);
    expect(phases.priority.map((w) => w.id)).toEqual(['4', '1', '3', '2']);
  });
});
