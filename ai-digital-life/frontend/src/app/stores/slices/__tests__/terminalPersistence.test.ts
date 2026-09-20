import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';

describe('terminal panel persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('restores terminalWorkspaceExpanded after a simulated restart', () => {
    useAppStore.getState().setTerminalWorkspaceExpanded({ __independent__: true });
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.terminalWorkspaceExpanded).toEqual({ __independent__: true });
  });

  it('restores the active terminal tab id', () => {
    // 真实方法名是 terminalSelectTab（terminalSlice.ts:241）；不存在 terminalSetActiveTab
    useAppStore.getState().terminalSelectTab('terminal-abc');
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.terminalActiveTabId).toBe('terminal-abc');
  });

  it('keeps the history index out of the synchronous hydration patch', () => {
    localStorage.setItem('adl:terminal.historyIndex', JSON.stringify({ 'terminal-1': [] }));
    const { patch } = hydrateAll();
    expect((patch as Record<string, unknown>).terminalHistoryIndex).toBeUndefined();
  });
});
