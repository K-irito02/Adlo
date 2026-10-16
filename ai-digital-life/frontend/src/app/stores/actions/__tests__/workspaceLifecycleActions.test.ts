import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceLifecycleActions } from '../workspaceLifecycleActions';
import type { StoreState } from '../../StoreState';

function setup(flush: { saved: number; failed: number } = { saved: 0, failed: 0 }) {
  const cancelPendingSearch = vi.fn();
  const bootstrap = vi.fn().mockResolvedValue(undefined);
  const saveDirtyEditors = vi.fn().mockResolvedValue(flush);
  const showToast = vi.fn(() => 'toast-id');
  const state = {
    appInfo: { currentWorkspace: { id: 'ws-old', path: '/old' } },
    errorToasts: [],
    clearErrorToasts: vi.fn(),
    cancelPendingSearch,
    bootstrap,
    saveDirtyEditors,
    showToast,
  } as unknown as StoreState;
  const get = () => state;
  const set = vi.fn();
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    workspace: {
      open: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      clearCurrent: vi.fn().mockResolvedValue({ ok: true, data: true }),
    },
  };
  const actions = createWorkspaceLifecycleActions(set as never, get as never);
  return { actions, cancelPendingSearch, bootstrap, saveDirtyEditors, showToast };
}

describe('workspaceLifecycleActions search hygiene (事项 45 Phase 4)', () => {
  it('openWorkspace cancels pending search before bootstrap', async () => {
    const { actions, cancelPendingSearch, bootstrap } = setup();
    await actions.openWorkspace('/new');
    expect(cancelPendingSearch).toHaveBeenCalledTimes(1);
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('openWorkspace flushes dirty editors before switching', async () => {
    const { actions, saveDirtyEditors } = setup();
    await actions.openWorkspace('/new');
    expect(saveDirtyEditors).toHaveBeenCalledTimes(1);
  });

  it('openWorkspace aborts on flush failure without bootstrap or toast-less switch (P4 L1)', async () => {
    const { actions, bootstrap, showToast } = setup({ saved: 0, failed: 1 });
    const result = await actions.openWorkspace('/new');
    expect(result).toEqual({ ok: false, error: 'saveDirtyEditors failed' });
    expect(bootstrap).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('clearWorkspaceContext cancels pending search before bootstrap', async () => {
    const { actions, cancelPendingSearch, bootstrap } = setup();
    await actions.clearWorkspaceContext();
    expect(cancelPendingSearch).toHaveBeenCalledTimes(1);
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });
});
