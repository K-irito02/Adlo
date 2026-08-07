import { describe, it, expect } from 'vitest';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import { seedMockRecentWorkspaces } from './preview-storage';

function ws(id: string, path: string): RecentWorkspaceEntry {
  return {
    id,
    path,
    rootPath: path,
    name: `name:${path}`,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
  };
}

describe('seedMockRecentWorkspaces', () => {
  it('prepends five simulated workspaces before persisted entries', () => {
    const persisted = [ws('real-1', 'E:/Real-A')];
    const seeded = seedMockRecentWorkspaces(persisted);
    expect(seeded).toHaveLength(6);
    expect(seeded[0].name).toBe('模拟工作区 1');
    expect(seeded[4].name).toBe('模拟工作区 5');
    expect(seeded[5].path).toBe('E:/Real-A');
  });

  it('does not duplicate a persisted path that matches a seed', () => {
    const persisted = [ws('real-1', 'E:/Mock-Workspace-2')];
    const seeded = seedMockRecentWorkspaces(persisted);
    expect(seeded).toHaveLength(5);
    expect(seeded.filter((entry) => entry.path === 'E:/Mock-Workspace-2')).toHaveLength(1);
  });
});
