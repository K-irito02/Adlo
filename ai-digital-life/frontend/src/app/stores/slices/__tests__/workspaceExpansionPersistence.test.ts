import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';

const FILES_KEY = 'adl:files.workspaceExpanded';
const CHANGES_KEY = 'adl:changes.workspaceExpanded';

describe('workspace-level expansion survives a restart', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('writes the files-panel workspace expansion through the single write entry', () => {
    useAppStore.getState().setWorkspaceTreeExpandedInFileNav({
      workspace_a: true,
      workspace_b: false,
    });
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem(FILES_KEY) ?? 'null')).toEqual({
      workspace_a: true,
      workspace_b: false,
    });
  });

  it('writes the changes-panel workspace expansion through the single write entry', () => {
    useAppStore.getState().setWorkspaceChangesExpanded({ workspace_a: true });
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem(CHANGES_KEY) ?? 'null')).toEqual({ workspace_a: true });
  });

  it('restores both after a simulated restart', () => {
    localStorage.setItem(FILES_KEY, JSON.stringify({ workspace_a: true }));
    localStorage.setItem(CHANGES_KEY, JSON.stringify({ workspace_b: true }));
    resetHydrationForTest();
    const { patch } = hydrateAll();
    expect(patch.workspaceTreeExpandedInFileNav).toEqual({ workspace_a: true });
    expect(patch.workspaceChangesExpanded).toEqual({ workspace_b: true });
  });

  it('toggling a workspace head from the files panel persists the new state', async () => {
    const workspaceId = 'workspace_toggle';
    useAppStore.setState({ workspaceTrees: { [workspaceId]: [] } });
    await useAppStore.getState().expandWorkspaceTreeInFileNav(workspaceId as never, '/tmp/ws');
    flushCrossSliceWrites();
    const stored = JSON.parse(localStorage.getItem(FILES_KEY) ?? 'null');
    expect(stored).not.toBeNull();
    expect(stored[workspaceId]).toBe(true);
  });

  it('toggling a workspace head through the toggle action persists the new state', () => {
    const workspaceId = 'workspace_toggle_action';
    useAppStore.setState({ workspaceTreeExpandedInFileNav: {} });
    useAppStore.getState().toggleWorkspaceTreeInFileNav(workspaceId as never);
    flushCrossSliceWrites();
    const stored = JSON.parse(localStorage.getItem(FILES_KEY) ?? 'null');
    expect(stored).not.toBeNull();
    expect(stored[workspaceId]).toBe(true);
  });
});
