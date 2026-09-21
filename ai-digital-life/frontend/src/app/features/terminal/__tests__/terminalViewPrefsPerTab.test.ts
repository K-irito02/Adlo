import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { stubStorage } from '@stores/persisted/__tests__/helpers';
import { useAppStore } from '@stores/slicedStore';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { applyTabPrune } from '@stores/persisted/pruneWiring';
import { DEFAULT_TERMINAL_VIEW_PREFS, terminalViewPrefsStore } from '../terminalViewPrefs';
import { useTerminalViewPrefs } from '../useTerminalViewPrefs';

describe('per-tab terminal view prefs', () => {
  beforeEach(() => {
    stubStorage();
  });

  it('stores prefs per tab instead of globally', () => {
    terminalViewPrefsStore.saveForTab('terminal-1', {
      mode: 'dual',
      historyFirst: false,
      historyRatio: 0.5,
    });
    terminalViewPrefsStore.saveForTab('terminal-2', {
      mode: 'single',
      historyFirst: true,
      historyRatio: 0.2,
    });
    flushCrossSliceWrites();
    const stored = JSON.parse(localStorage.getItem('adl:terminal.viewPrefs') ?? 'null');
    expect(stored['terminal-1'].mode).toBe('dual');
    expect(stored['terminal-2'].mode).toBe('single');
    expect(terminalViewPrefsStore.loadForTab('terminal-1').mode).toBe('dual');
    expect(terminalViewPrefsStore.loadForTab('terminal-2').mode).toBe('single');
  });

  it('falls back to the previous global defaults for a tab without a record', () => {
    expect(terminalViewPrefsStore.loadForTab('terminal-unseen')).toEqual(
      DEFAULT_TERMINAL_VIEW_PREFS,
    );
    expect(terminalViewPrefsStore.loadForTab('terminal-unseen').mode).toBe('single');
  });

  it('restores per-tab prefs across a simulated restart', () => {
    localStorage.setItem(
      'adl:terminal.viewPrefs',
      JSON.stringify({ 'terminal-1': { mode: 'dual', historyFirst: false, historyRatio: 0.5 } }),
    );
    resetHydrationForTest();
    hydrateAll();
    expect(terminalViewPrefsStore.loadForTab('terminal-1')).toEqual({
      mode: 'dual',
      historyFirst: false,
      historyRatio: 0.5,
    });
    // 无记录标签仍取默认
    expect(terminalViewPrefsStore.loadForTab('terminal-2')).toEqual(DEFAULT_TERMINAL_VIEW_PREFS);
  });

  it('switching tabs neither resets nor leaks prefs across tabs', () => {
    const containerRef = { current: null };
    const { result, rerender } = renderHook(
      ({ tabId }: { tabId: string | undefined }) =>
        useTerminalViewPrefs({ containerRef, activeTabId: tabId }),
      { initialProps: { tabId: 'terminal-a' as string | undefined } },
    );
    act(() => {
      result.current.setViewMode('dual');
    });
    expect(result.current.viewPrefs.mode).toBe('dual');
    rerender({ tabId: 'terminal-b' });
    expect(result.current.viewPrefs).toEqual(DEFAULT_TERMINAL_VIEW_PREFS);
    rerender({ tabId: 'terminal-a' });
    expect(result.current.viewPrefs.mode).toBe('dual');
  });

  it('prunes prefs of closed tabs via the shared tab-prune entry', () => {
    terminalViewPrefsStore.saveForTab('term-live', {
      mode: 'dual',
      historyFirst: false,
      historyRatio: 0.5,
    });
    terminalViewPrefsStore.saveForTab('term-orphan', {
      mode: 'single',
      historyFirst: true,
      historyRatio: 0.3,
    });
    useAppStore.setState({
      recentWorkspaces: [
        {
          id: 'ws-a',
          path: '/fake/ws-a',
          rootPath: '/fake/ws-a',
          name: 'ws-a',
          lastOpenedAt: 0,
          isPinned: false,
          pinnedOrder: 0,
          unpinnedOrder: 0,
          removedFromSidebar: false,
          available: true,
        },
      ],
      terminalTabs: [{ id: 'term-live' } as never],
    });
    applyTabPrune();
    expect(terminalViewPrefsStore.loadAll()).toEqual({
      'term-live': { mode: 'dual', historyFirst: false, historyRatio: 0.5 },
    });
    flushCrossSliceWrites();
    expect(Object.keys(JSON.parse(localStorage.getItem('adl:terminal.viewPrefs') ?? '{}'))).toEqual(
      ['term-live'],
    );
    useAppStore.setState({ recentWorkspaces: [], terminalTabs: [] });
  });
});
