import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGitFileOpsActions } from '../gitFileOpsActions';

interface TestState {
  errorToasts: unknown[];
  appInfo?: { currentWorkspace?: { id: string; path?: string; rootPath?: string } };
  recentWorkspaces: { id: string; path: string; rootPath?: string }[];
  reportError: (code: string, detail: string, scope?: string) => void;
  clearErrorToasts: (scope?: string) => void;
  refreshGitSnapshot: (
    workspaceId: string,
    workspacePath: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
}

function createHarness(overrides: Partial<TestState> = {}) {
  const state: TestState = {
    errorToasts: [],
    appInfo: { currentWorkspace: { id: 'ws-1', path: '/ws', rootPath: '/ws' } },
    recentWorkspaces: [{ id: 'ws-1', path: '/ws', rootPath: '/ws' }],
    reportError: vi.fn(),
    clearErrorToasts: vi.fn(),
    refreshGitSnapshot: vi.fn(async () => {}),
    ...overrides,
  };
  const set = vi.fn() as never;
  const get = () => state as never;
  const actions = createGitFileOpsActions(set, get);
  return { state, actions };
}

function stubWorkspaceBridge(overrides: Record<string, unknown> = {}) {
  const bridge = {
    stageAllFiles: vi.fn(async () => ({ ok: true, data: undefined })),
    unstageAllFiles: vi.fn(async () => ({ ok: true, data: undefined })),
    discardAllFiles: vi.fn(async () => ({ ok: true, data: undefined })),
    commitChanges: vi.fn(async () => ({ ok: true, data: undefined })),
    pushChanges: vi.fn(async () => ({ ok: true, data: undefined })),
    pullChanges: vi.fn(async () => ({ ok: true, data: undefined })),
    ...overrides,
  };
  vi.stubGlobal('digitalLife', { workspace: bridge });
  return bridge;
}

describe('gitFileOpsActions bulk operations', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('stages everything and refreshes the snapshot', async () => {
    const bridge = stubWorkspaceBridge();
    const { state, actions } = createHarness();

    await actions.stageAllWorkspaceChanges('/ws');

    expect(bridge.stageAllFiles).toHaveBeenCalledWith('/ws');
    expect(state.refreshGitSnapshot).toHaveBeenCalledWith('ws-1', '/ws', { silent: true });
  });

  it('reports failures instead of throwing', async () => {
    stubWorkspaceBridge({
      stageAllFiles: vi.fn(async () => ({
        ok: false,
        error: { code: 'WORKSPACE_ERROR', message: 'git add failed' },
      })),
    });
    const { state, actions } = createHarness();

    await actions.stageAllWorkspaceChanges('/ws');

    expect(state.reportError).toHaveBeenCalled();
    expect(state.refreshGitSnapshot).not.toHaveBeenCalled();
  });

  it('commits with stage-all on and refreshes on success', async () => {
    const bridge = stubWorkspaceBridge();
    const { state, actions } = createHarness();

    const failure = await actions.commitWorkspaceChanges('feat: x', {
      stageAll: true,
      workspacePath: '/ws',
    });

    expect(failure).toBeUndefined();
    expect(bridge.stageAllFiles).toHaveBeenCalledWith('/ws');
    expect(bridge.commitChanges).toHaveBeenCalledWith('feat: x', '/ws');
    expect(state.refreshGitSnapshot).toHaveBeenCalledWith('ws-1', '/ws', { silent: true });
  });

  it('skips staging when stage-all is off', async () => {
    const bridge = stubWorkspaceBridge();
    const { actions } = createHarness();

    await actions.commitWorkspaceChanges('feat: x', { stageAll: false, workspacePath: '/ws' });

    expect(bridge.stageAllFiles).not.toHaveBeenCalled();
    expect(bridge.commitChanges).toHaveBeenCalledWith('feat: x', '/ws');
  });

  it('returns the error message when the commit fails', async () => {
    stubWorkspaceBridge({
      commitChanges: vi.fn(async () => ({
        ok: false,
        error: { code: 'WORKSPACE_ERROR', message: 'nothing to commit' },
      })),
    });
    const { state, actions } = createHarness();

    const failure = await actions.commitWorkspaceChanges('feat: x', {
      stageAll: false,
      workspacePath: '/ws',
    });

    expect(failure).toBe('nothing to commit');
    expect(state.reportError).toHaveBeenCalled();
  });

  it('falls back to the active workspace when no path is provided', async () => {
    const bridge = stubWorkspaceBridge();
    const { actions } = createHarness();

    await actions.pushWorkspaceChanges();

    expect(bridge.pushChanges).toHaveBeenCalledWith('/ws');
  });

  it('does nothing when no workspace can be resolved', async () => {
    const bridge = stubWorkspaceBridge();
    const { actions } = createHarness({ appInfo: undefined, recentWorkspaces: [] });

    await actions.pullWorkspaceChanges();

    expect(bridge.pullChanges).not.toHaveBeenCalled();
  });
});
