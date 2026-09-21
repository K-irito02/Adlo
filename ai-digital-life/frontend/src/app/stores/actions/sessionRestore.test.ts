import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stubStorage } from '@stores/persisted/__tests__/helpers';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';

function workspaceEntry(id: string, path: string): RecentWorkspaceEntry {
  return {
    id,
    path,
    rootPath: path,
    name: id,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
  };
}

const mockReadFileForWorkspace = vi.fn();
const mockSetEditorDirtyPaths = vi.fn();

function setupWindowDigitalLife() {
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    workspace: {
      readFileForWorkspace: mockReadFileForWorkspace,
      setEditorDirtyPaths: mockSetEditorDirtyPaths,
    },
  };
}

describe('session restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubStorage();
    setupWindowDigitalLife();
    useAppStore.setState({
      lastOpenedFile: null,
      sessionRestoreNotice: undefined,
      selectedFilePath: undefined,
      selectedFileWorkspaceId: undefined,
      fileContent: undefined,
      fileOpenError: null,
      openTabs: [],
      outline: [],
      recentWorkspaces: [],
      errorToasts: [],
    });
  });

  afterEach(() => {
    useAppStore.setState({
      lastOpenedFile: null,
      sessionRestoreNotice: undefined,
      selectedFilePath: undefined,
      selectedFileWorkspaceId: undefined,
      fileContent: undefined,
      fileOpenError: null,
      openTabs: [],
      outline: [],
      recentWorkspaces: [],
      errorToasts: [],
    });
  });

  it('records the last opened file', () => {
    useAppStore.getState().rememberLastOpenedFile('workspace_a', 'src/app.ts');
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem('adl:session.lastFile') ?? 'null')).toEqual({
      workspaceId: 'workspace_a',
      relativePath: 'src/app.ts',
    });
    expect(useAppStore.getState().lastOpenedFile).toEqual({
      workspaceId: 'workspace_a',
      relativePath: 'src/app.ts',
    });
  });

  it('restores it after a simulated restart', () => {
    localStorage.setItem(
      'adl:session.lastFile',
      JSON.stringify({ workspaceId: 'workspace_a', relativePath: 'src/app.ts' }),
    );
    resetHydrationForTest();
    expect(hydrateAll().patch.lastOpenedFile).toEqual({
      workspaceId: 'workspace_a',
      relativePath: 'src/app.ts',
    });
  });

  it('falls back to null for a malformed stored value', () => {
    localStorage.setItem(
      'adl:session.lastFile',
      JSON.stringify({ workspaceId: 42, relativePath: 'src/app.ts' }),
    );
    resetHydrationForTest();
    const result = hydrateAll();
    expect(result.patch.lastOpenedFile).toBeNull();
    expect(result.dirtyKeys).toContain('adl:session.lastFile');
  });

  it('degrades gracefully when the file no longer exists', async () => {
    const openFileForWorkspace = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const realOpenFileForWorkspace = useAppStore.getState().openFileForWorkspace;
    useAppStore.setState({
      lastOpenedFile: { workspaceId: 'workspace_a', relativePath: 'gone.ts' },
      recentWorkspaces: [workspaceEntry('workspace_a', '/ws/a')],
      openFileForWorkspace: openFileForWorkspace as never,
    });
    try {
      await expect(useAppStore.getState().restoreLastOpenedFile()).resolves.toBeUndefined();
      expect(useAppStore.getState().sessionRestoreNotice).toBe('sessionLastFileMissing');
      expect(openFileForWorkspace).toHaveBeenCalledWith('workspace_a', '/ws/a', 'gone.ts');
    } finally {
      useAppStore.setState({ openFileForWorkspace: realOpenFileForWorkspace });
    }
  });

  it('degrades gracefully when the workspace is gone', async () => {
    const openFileForWorkspace = vi.fn();
    const realOpenFileForWorkspace = useAppStore.getState().openFileForWorkspace;
    useAppStore.setState({
      lastOpenedFile: { workspaceId: 'workspace_gone', relativePath: 'src/app.ts' },
      recentWorkspaces: [workspaceEntry('workspace_a', '/ws/a')],
      openFileForWorkspace: openFileForWorkspace as never,
    });
    try {
      await expect(useAppStore.getState().restoreLastOpenedFile()).resolves.toBeUndefined();
      expect(useAppStore.getState().sessionRestoreNotice).toBe('sessionLastFileMissing');
      expect(openFileForWorkspace).not.toHaveBeenCalled();
    } finally {
      useAppStore.setState({ openFileForWorkspace: realOpenFileForWorkspace });
    }
  });

  it('flags a same-path open in the wrong workspace as a failed restore (fix round 1 #4)', async () => {
    const openFileForWorkspace = vi.fn().mockImplementation(async () => {
      useAppStore.setState({
        selectedFilePath: 'same.ts',
        selectedFileWorkspaceId: 'workspace_b',
      });
    });
    const realOpenFileForWorkspace = useAppStore.getState().openFileForWorkspace;
    useAppStore.setState({
      lastOpenedFile: { workspaceId: 'workspace_a', relativePath: 'same.ts' },
      recentWorkspaces: [
        workspaceEntry('workspace_a', '/ws/a'),
        workspaceEntry('workspace_b', '/ws/b'),
      ],
      openFileForWorkspace: openFileForWorkspace as never,
    });
    try {
      await expect(useAppStore.getState().restoreLastOpenedFile()).resolves.toBeUndefined();
      expect(useAppStore.getState().sessionRestoreNotice).toBe('sessionLastFileMissing');
    } finally {
      useAppStore.setState({ openFileForWorkspace: realOpenFileForWorkspace });
    }
  });

  it('clears the notice and remembers the file when any file opens successfully', async () => {
    mockReadFileForWorkspace.mockResolvedValue({
      ok: true,
      data: { content: 'hello', lastModifiedAt: 1 },
    });
    useAppStore.setState({
      sessionRestoreNotice: 'sessionLastFileMissing',
      recentWorkspaces: [workspaceEntry('workspace_a', '/ws/a')],
    });
    await useAppStore.getState().openFileForWorkspace('workspace_a', '/ws/a', 'src/new.ts');
    expect(useAppStore.getState().sessionRestoreNotice).toBeUndefined();
    expect(useAppStore.getState().lastOpenedFile).toEqual({
      workspaceId: 'workspace_a',
      relativePath: 'src/new.ts',
    });
  });
});
