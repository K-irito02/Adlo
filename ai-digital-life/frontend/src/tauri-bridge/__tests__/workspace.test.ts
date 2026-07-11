import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { createTauriWorkspaceBridge } from '../workspace';

function okResult<T>(data: T) {
  return { ok: true as const, data };
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('workspaceBridge', () => {
  it('listRecent calls invoke with workspace_list_recent', async () => {
    mockInvoke.mockResolvedValue(okResult([]));
    const bridge = createTauriWorkspaceBridge();
    await bridge.listRecent();
    expect(mockInvoke).toHaveBeenCalledWith('workspace_list_recent', undefined);
  });

  it('open calls invoke with workspace_open and args', async () => {
    mockInvoke.mockResolvedValue(okResult({}));
    const bridge = createTauriWorkspaceBridge();
    await bridge.open('/test/path');
    expect(mockInvoke).toHaveBeenCalledWith('workspace_open', { workspacePath: '/test/path' });
  });

  it('clearCurrent calls invoke with workspace_clear_current', async () => {
    mockInvoke.mockResolvedValue(okResult(true));
    const bridge = createTauriWorkspaceBridge();
    await bridge.clearCurrent();
    expect(mockInvoke).toHaveBeenCalledWith('workspace_clear_current', undefined);
  });

  it('listTree calls invoke with workspace_list_tree', async () => {
    mockInvoke.mockResolvedValue(okResult([]));
    const bridge = createTauriWorkspaceBridge();
    await bridge.listTree();
    expect(mockInvoke).toHaveBeenCalledWith('workspace_list_tree', undefined);
  });

  it('search calls invoke with workspace_search', async () => {
    mockInvoke.mockResolvedValue(okResult([]));
    const bridge = createTauriWorkspaceBridge();
    await bridge.search('query');
    expect(mockInvoke).toHaveBeenCalledWith('workspace_search', { query: 'query' });
  });

  it('pin calls invoke with workspace_pin', async () => {
    mockInvoke.mockResolvedValue(okResult([]));
    const bridge = createTauriWorkspaceBridge();
    await bridge.pin('ws-1');
    expect(mockInvoke).toHaveBeenCalledWith('workspace_pin', { workspaceId: 'ws-1' });
  });

  it('getGitStatus calls invoke with workspace_get_git_status', async () => {
    mockInvoke.mockResolvedValue(okResult({}));
    const bridge = createTauriWorkspaceBridge();
    await bridge.getGitStatus();
    expect(mockInvoke).toHaveBeenCalledWith('workspace_get_git_status', undefined);
  });

  it('readFile calls invoke with workspace_read_file', async () => {
    mockInvoke.mockResolvedValue(okResult({}));
    const bridge = createTauriWorkspaceBridge();
    await bridge.readFile('src/main.ts');
    expect(mockInvoke).toHaveBeenCalledWith('workspace_read_file', { relativePath: 'src/main.ts' });
  });

  it('createFile calls invoke with workspace_create_file', async () => {
    mockInvoke.mockResolvedValue(okResult({}));
    const bridge = createTauriWorkspaceBridge();
    await bridge.createFile('test.txt', 'content');
    expect(mockInvoke).toHaveBeenCalledWith('workspace_create_file', {
      relativePath: 'test.txt',
      content: 'content',
    });
  });

  it('deleteFile calls invoke with workspace_delete_file', async () => {
    mockInvoke.mockResolvedValue(okResult(true));
    const bridge = createTauriWorkspaceBridge();
    await bridge.deleteFile('old.txt');
    expect(mockInvoke).toHaveBeenCalledWith('workspace_delete_file', { relativePath: 'old.txt' });
  });

  it('stageFile calls invoke with workspace_git_stage_file', async () => {
    mockInvoke.mockResolvedValue(okResult(undefined));
    const bridge = createTauriWorkspaceBridge();
    await bridge.stageFile('file.ts');
    expect(mockInvoke).toHaveBeenCalledWith('workspace_git_stage_file', {
      relativePath: 'file.ts',
      workspacePath: undefined,
    });
  });
});
