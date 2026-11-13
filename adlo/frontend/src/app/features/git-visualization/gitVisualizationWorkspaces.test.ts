import { describe, expect, it } from 'vitest';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import { visibleGitWorkspaces } from './gitVisualizationWorkspaces';

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
