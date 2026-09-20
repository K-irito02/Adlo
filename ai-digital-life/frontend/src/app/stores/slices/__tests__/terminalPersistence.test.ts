import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';
import { TERMINAL_NAVIGATOR_WIDTH_MAX } from '@stores/slices/terminalSliceTypes';
import {
  terminalViewPrefsStore,
  type TerminalViewPrefs,
} from '@features/terminal/terminalViewPrefs';
import {
  terminalRegionCollapseStore,
  type RegionCollapse,
} from '@features/terminal/terminalRegionCollapse';
import { terminalCwdStore } from '@features/terminal/terminalCwdStore';
import { terminalHistoryStore } from '@features/terminal/terminalHistoryStore';

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

  // R1：读侧边界必须与写侧同源（曾经写死 180–480，比写侧 180–300 宽，
  // 会接住任何 setter 都产不出的值）。
  it('keeps the navigator width read bound coupled to the writer clamp', () => {
    useAppStore.getState().setTerminalNavigatorWidth(480);
    flushCrossSliceWrites();
    expect(useAppStore.getState().terminalNavigatorWidth).toBe(TERMINAL_NAVIGATOR_WIDTH_MAX);
    expect(localStorage.getItem('adl:terminal.navigatorWidth')).toBe(
      JSON.stringify(TERMINAL_NAVIGATOR_WIDTH_MAX),
    );

    // 直接塞一个越界值：读侧必须夹到同一上限，而不是接受到更宽的 (300, 480]
    localStorage.setItem('adl:terminal.navigatorWidth', JSON.stringify(480));
    resetHydrationForTest();
    expect(hydrateAll().patch.terminalNavigatorWidth).toBe(TERMINAL_NAVIGATOR_WIDTH_MAX);
  });

  // R4：四个外部微型存储的 save*() → persist 落盘路径（此前完全没有往返断言）。
  it('terminalViewPrefsStore.save writes through to the registry key', () => {
    const prefs: TerminalViewPrefs = { mode: 'dual', historyFirst: false, historyRatio: 0.5 };
    terminalViewPrefsStore.save(prefs);
    flushCrossSliceWrites();
    expect(localStorage.getItem('adl:terminal.viewPrefs')).toBe(JSON.stringify(prefs));
  });

  it('terminalRegionCollapseStore.save writes through to the registry key', () => {
    const map: Record<string, RegionCollapse> = { 'terminal-1': 'history' };
    terminalRegionCollapseStore.save(map);
    flushCrossSliceWrites();
    expect(localStorage.getItem('adl:terminal.regionCollapse')).toBe(JSON.stringify(map));
  });

  it('terminalCwdStore.saveAll writes through to the registry key', () => {
    const map = { 'terminal-1': 'C:/work' };
    terminalCwdStore.saveAll(map);
    flushCrossSliceWrites();
    expect(localStorage.getItem('adl:terminal.cwdByTab')).toBe(JSON.stringify(map));
  });

  it('terminalHistoryStore.saveAll writes through to the registry key', () => {
    const index = {
      'terminal-1': [
        { sessionId: 's1', endedAt: 1, live: false, chunks: [{ lines: 1, size: 10 }] },
      ],
    };
    terminalHistoryStore.saveAll(index);
    flushCrossSliceWrites();
    expect(localStorage.getItem('adl:terminal.historyIndex')).toBe(JSON.stringify(index));
  });
});
