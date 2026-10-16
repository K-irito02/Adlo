import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceLifecycleActions } from '../workspaceLifecycleActions';
import type { StoreState } from '../../StoreState';

function setup() {
  const cancelPendingSearch = vi.fn();
  const bootstrap = vi.fn().mockResolvedValue(undefined);
  const saveDirtyEditors = vi.fn().mockResolvedValue(0);
  const state = {
    appInfo: { currentWorkspace: { id: 'ws-old', path: '/old' } },
    errorToasts: [],
    clearErrorToasts: vi.fn(),
    cancelPendingSearch,
    bootstrap,
    saveDirtyEditors,
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
  return { actions, cancelPendingSearch, bootstrap, saveDirtyEditors };
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

  it('clearWorkspaceContext cancels pending search before bootstrap', async () => {
    const { actions, cancelPendingSearch, bootstrap } = setup();
    await actions.clearWorkspaceContext();
    expect(cancelPendingSearch).toHaveBeenCalledTimes(1);
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });
});
