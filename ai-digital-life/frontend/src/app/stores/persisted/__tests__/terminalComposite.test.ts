import { describe, it, expect, beforeEach } from 'vitest';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';
import { terminalHistoryStore } from '@features/terminal/terminalHistoryStore';

const VALID_TAB = {
  id: 't1',
  workspaceId: 'ws-1',
  title: 'PowerShell',
  profile: 'powershell',
  status: 'idle',
  isPinned: false,
  sortOrder: 1,
} as const;

describe('terminal composite hydration', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('rebuilds terminalTabsById from persisted tabs', () => {
    localStorage.setItem('adl:terminal.tabs', JSON.stringify([VALID_TAB]));
    const patch = hydrateAll().patch;
    expect(patch.terminalTabsById).toEqual({ t1: VALID_TAB });
  });

  it('does not contribute terminalTabsById when tabs are corrupt', () => {
    localStorage.setItem('adl:terminal.tabs', JSON.stringify('not-an-array'));
    const patch = hydrateAll().patch;
    expect(patch.terminalTabsById).toBeUndefined();
  });

  it('uses its own shellSelectorProfile when valid', () => {
    localStorage.setItem('adl:terminal.shellSelectorProfile', JSON.stringify('bash'));
    expect(hydrateAll().patch.shellSelectorProfile).toBe('bash');
  });

  it('falls back to defaultTerminalProfile when its own key is missing', () => {
    localStorage.setItem('adl:terminal.defaultProfile', JSON.stringify('cmd'));
    // own shell key absent → falls back to defaultTerminalProfile ('cmd'), not the static 'powershell'
    expect(hydrateAll().patch.shellSelectorProfile).toBe('cmd');
  });

  it('falls back to powershell when both keys are missing', () => {
    expect(hydrateAll().patch.shellSelectorProfile).toBe('powershell');
  });

  it('falls back to powershell when its own value is corrupt', () => {
    localStorage.setItem('adl:terminal.shellSelectorProfile', JSON.stringify('zsh'));
    expect(hydrateAll().patch.shellSelectorProfile).toBe('powershell');
  });

  it('dirty default profile key falls back to powershell instead of poisoning both fields', () => {
    localStorage.setItem('adl:terminal.defaultProfile', JSON.stringify('zsh'));
    localStorage.setItem('adl:terminal.shellSelectorProfile', JSON.stringify('oops'));
    const patch = hydrateAll().patch;
    expect(patch.defaultTerminalProfile).toBe('powershell');
    expect(patch.shellSelectorProfile).toBe('powershell');
  });

  it('restores persisted workspace id and selector profile', () => {
    localStorage.setItem('adl:terminal.workspaceId', JSON.stringify('ws-7'));
    localStorage.setItem('adl:terminal.shellSelectorProfile', JSON.stringify('bash'));
    const patch = hydrateAll().patch;
    expect(patch.terminalWorkspaceId).toBe('ws-7');
    expect(patch.shellSelectorProfile).toBe('bash');
  });

  it('historyIndex loadAll reads storage on demand (sync:false, never hydrated at construction)', () => {
    localStorage.setItem(
      'adl:terminal.historyIndex',
      JSON.stringify({
        'terminal-1': [
          { sessionId: 's1', endedAt: 1, live: false, chunks: [{ lines: 1, size: 10 }] },
        ],
      }),
    );
    // 构造期 hydrateAll 不触及 historyIndex（sync:false）→ 缓存未填、补丁不含它
    const { patch } = hydrateAll();
    expect((patch as Record<string, unknown>).terminalHistoryIndex).toBeUndefined();
    // loadAll 必须按需读一次存储，否则预算面板会显示 0
    expect(terminalHistoryStore.loadAll()).toEqual({
      'terminal-1': [
        { sessionId: 's1', endedAt: 1, live: false, chunks: [{ lines: 1, size: 10 }] },
      ],
    });
  });
});
