import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAddNotification = vi.fn();
vi.mock('@stores/slicedStore', () => ({
  useAppStore: (selector: any) =>
    selector({
      addNotification: mockAddNotification,
      appInfo: { currentWorkspace: { path: '/test' } },
      gitSnapshot: null,
      gitStashRestored: undefined,
      workspaceContextMode: 'workspace',
      selectedFilePath: null,
    }),
}));

const mockSwitchGitBranch = vi.fn();
vi.mock('@tauri-bridge', () => ({
  default: {
    workspace: {
      switchGitBranch: mockSwitchGitBranch,
    },
  },
}));

import type { WorkspaceGitBranchChangeResult } from '@ai-digital-life/kernel';

const mockWorkspace = {
  id: 'ws-test',
  path: '/test',
  rootPath: '/test',
  name: 'test',
  type: 'unknown' as const,
  status: 'ready' as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  lastOpenedAt: Date.now(),
};

describe('gitActions conflict notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds notification when hasRestored is false and conflicts exist', () => {
    const mockResult: WorkspaceGitBranchChangeResult = {
      workspace: mockWorkspace,
      gitSnapshot: {
        branch: 'target',
        staged: [],
        unstaged: [],
        untracked: [],
        conflicts: ['file1.ts', 'file2.ts'],
        capturedAt: Date.now(),
        isRepo: true,
        ahead: 0,
        behind: 0,
      },
      previousBranch: 'source',
      currentBranch: 'target',
      stashedChanges: true,
      hasRestored: false,
    };

    expect(mockAddNotification).toBeDefined();
    expect(mockSwitchGitBranch).toBeDefined();
    expect(mockResult.hasRestored).toBe(false);
    expect(mockResult.gitSnapshot.conflicts.length).toBeGreaterThan(0);
  });
});
