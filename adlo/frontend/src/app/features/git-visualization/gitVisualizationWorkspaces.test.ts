import { describe, expect, it } from 'vitest';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import { reconcileTabOrder, visibleGitWorkspaces } from './gitVisualizationWorkspaces';

const workspace = (
  id: string,
  overrides: Partial<RecentWorkspaceEntry> = {},
): RecentWorkspaceEntry => ({
  id,
  name: id,
  path: `/path/${id}`,
  rootPath: `/path/${id}`,
  lastOpenedAt: 1,
  isPinned: false,
  pinnedOrder: 0,
  unpinnedOrder: 0,
  removedFromSidebar: false,
  available: true,
  ...overrides,
});

describe('visibleGitWorkspaces', () => {
  it('drops hidden workspaces (removedFromSidebar)', () => {
    const result = visibleGitWorkspaces([
      workspace('workspace-1'),
      workspace('external-x', { removedFromSidebar: true }),
    ]);
    expect(result.map((entry) => entry.id)).toEqual(['workspace-1']);
  });

  it('keeps offline workspaces so their tab state still renders', () => {
    const result = visibleGitWorkspaces([workspace('workspace-offline', { available: false })]);
    expect(result.map((entry) => entry.id)).toEqual(['workspace-offline']);
  });

  it('returns an empty list when every workspace is hidden', () => {
    expect(visibleGitWorkspaces([workspace('external-a', { removedFromSidebar: true })])).toEqual(
      [],
    );
  });
});

describe('reconcileTabOrder', () => {
  it('appends a workspace added after the tab order was captured', () => {
    expect(reconcileTabOrder(['a', 'b'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('keeps the user drag order while appending new workspaces in list order', () => {
    expect(reconcileTabOrder(['b', 'a'], ['a', 'b', 'c', 'd'])).toEqual(['b', 'a', 'c', 'd']);
  });

  it('drops workspaces that disappeared and returns the same reference when nothing changed', () => {
    expect(reconcileTabOrder(['a', 'b', 'c'], ['a', 'c'])).toEqual(['a', 'c']);

    const unchanged = ['a', 'b'];
    expect(reconcileTabOrder(unchanged, ['a', 'b'])).toBe(unchanged);
  });
});
