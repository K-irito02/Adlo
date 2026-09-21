import { describe, it, expect, vi } from 'vitest';
import { createTerminalSlice } from '../terminalSlice';
import type { TerminalSlice } from '../terminalSlice';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

// 本文件跑在 node 环境（无 window）：给一个内存 localStorage，
// 让 setter 直写与惰性水合走真实读写路径（断言确定性），同时消除去抖 flush 的噪音告警
function createMemoryStorage(): Storage {
  let data: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(data).length;
    },
    key: (index: number) => Object.keys(data)[index] ?? null,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
    clear: () => {
      data = {};
    },
  };
}

vi.stubGlobal('window', { localStorage: createMemoryStorage() });

function createMockStore() {
  let state: Record<string, unknown> = {};
  const get = () => state;
  const set = (partial: unknown) => {
    if (typeof partial === 'function') {
      const next = (partial as (s: Record<string, unknown>) => Record<string, unknown>)(state);
      state = { ...state, ...next };
    } else {
      state = { ...state, ...(partial as Record<string, unknown>) };
    }
  };
  state = { ...createTerminalSlice(set as never, get as never) };
  return { get };
}

describe('terminalSlice', () => {
  it('initializes with empty tabs', () => {
    const { get } = createMockStore();
    expect((get() as unknown as TerminalSlice).terminalTabs).toEqual([]);
  });

  it('initializes with empty tabsById', () => {
    const { get } = createMockStore();
    expect((get() as unknown as TerminalSlice).terminalTabsById).toEqual({});
  });

  it('initializes with empty active tab id', () => {
    const { get } = createMockStore();
    expect((get() as unknown as TerminalSlice).terminalActiveTabId).toBe('');
  });

  it('initializes default profile as powershell', () => {
    const { get } = createMockStore();
    expect((get() as unknown as TerminalSlice).defaultTerminalProfile).toBe('powershell');
  });

  it('terminalCreateTab creates a powershell tab by default', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).terminalCreateTab();
    const state = get() as unknown as TerminalSlice;
    expect(state.terminalTabs).toHaveLength(1);
    expect(state.terminalTabs[0].profile).toBe('powershell');
    expect(state.terminalTabs[0].title).toBe('PowerShell');
    expect(state.terminalTabs[0].isPinned).toBe(false);
    expect(state.terminalTabs[0].status).toBe('idle');
  });

  it('terminalCreateTab creates tab with specified profile', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).terminalCreateTab('bash');
    const state = get() as unknown as TerminalSlice;
    expect(state.terminalTabs).toHaveLength(1);
    expect(state.terminalTabs[0].profile).toBe('bash');
    expect(state.terminalTabs[0].title).toBe('Bash');
  });

  it('terminalCreateTab creates tab with cmd profile', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).terminalCreateTab('cmd');
    const state = get() as unknown as TerminalSlice;
    expect(state.terminalTabs[0].profile).toBe('cmd');
    expect(state.terminalTabs[0].title).toBe('CMD');
  });

  it('terminalCreateTab increments title for duplicate profiles', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).terminalCreateTab('powershell');
    (get() as unknown as TerminalSlice).terminalCreateTab('powershell');
    const state = get() as unknown as TerminalSlice;
    expect(state.terminalTabs).toHaveLength(2);
    expect(state.terminalTabs[0].title).toBe('PowerShell');
    expect(state.terminalTabs[1].title).toBe('PowerShell 2');
  });

  it('terminalCreateTab sets the new tab as active', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).terminalCreateTab('powershell');
    const state = get() as unknown as TerminalSlice;
    expect(state.terminalActiveTabId).toBe(state.terminalTabs[0].id);
  });

  it('terminalCreateTab sets tabsById', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).terminalCreateTab('powershell');
    const state = get() as unknown as TerminalSlice;
    const tabId = state.terminalTabs[0].id;
    expect(state.terminalTabsById[tabId]).toBeDefined();
    expect(state.terminalTabsById[tabId].id).toBe(tabId);
  });

  it('terminalSelectTab selects a tab by id', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).terminalCreateTab('powershell');
    const tabId = (get() as unknown as TerminalSlice).terminalTabs[0].id;
    (get() as unknown as TerminalSlice).terminalCreateTab('bash');
    const bashId = (get() as unknown as TerminalSlice).terminalTabs[1].id;
    (get() as unknown as TerminalSlice).terminalSelectTab(tabId);
    expect((get() as unknown as TerminalSlice).terminalActiveTabId).toBe(tabId);
    (get() as unknown as TerminalSlice).terminalSelectTab(bashId);
    expect((get() as unknown as TerminalSlice).terminalActiveTabId).toBe(bashId);
  });

  it('terminalCloseTab removes a tab', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).terminalCreateTab('powershell');
    (get() as unknown as TerminalSlice).terminalCreateTab('bash');
    expect((get() as unknown as TerminalSlice).terminalTabs).toHaveLength(2);
    const firstId = (get() as unknown as TerminalSlice).terminalTabs[0].id;
    (get() as unknown as TerminalSlice).terminalCloseTab(firstId);
    expect((get() as unknown as TerminalSlice).terminalTabs).toHaveLength(1);
  });

  it('terminalCloseTab switches active tab when closing active', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).terminalCreateTab('powershell');
    (get() as unknown as TerminalSlice).terminalCreateTab('bash');
    const bashId = (get() as unknown as TerminalSlice).terminalTabs[1].id;
    (get() as unknown as TerminalSlice).terminalSelectTab(bashId);
    (get() as unknown as TerminalSlice).terminalCloseTab(bashId);
    const state = get() as unknown as TerminalSlice;
    expect(state.terminalTabs).toHaveLength(1);
    expect(state.terminalActiveTabId).toBe(state.terminalTabs[0].id);
  });

  it('terminalCloseTab sets empty active when closing the last tab', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).terminalCreateTab('powershell');
    const id = (get() as unknown as TerminalSlice).terminalTabs[0].id;
    (get() as unknown as TerminalSlice).terminalCloseTab(id);
    const state = get() as unknown as TerminalSlice;
    expect(state.terminalTabs).toHaveLength(0);
    expect(state.terminalActiveTabId).toBe('');
  });

  it('terminalUpdateActiveTab updates the active tab', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).terminalCreateTab('powershell');
    const tabId = (get() as unknown as TerminalSlice).terminalTabs[0].id;
    (get() as unknown as TerminalSlice).terminalUpdateActiveTab({
      title: 'Updated',
      status: 'running',
    });
    const state = get() as unknown as TerminalSlice;
    expect(state.terminalTabs[0].title).toBe('Updated');
    expect(state.terminalTabs[0].status).toBe('running');
    expect(state.terminalTabs[0].id).toBe(tabId);
  });

  it('terminalTogglePin toggles isPinned', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).terminalCreateTab('powershell');
    const tabId = (get() as unknown as TerminalSlice).terminalTabs[0].id;
    expect((get() as unknown as TerminalSlice).terminalTabs[0].isPinned).toBe(false);
    (get() as unknown as TerminalSlice).terminalTogglePin(tabId);
    expect((get() as unknown as TerminalSlice).terminalTabs[0].isPinned).toBe(true);
    (get() as unknown as TerminalSlice).terminalTogglePin(tabId);
    expect((get() as unknown as TerminalSlice).terminalTabs[0].isPinned).toBe(false);
  });

  it('terminalCloseAllTabs clears all tabs', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).terminalCreateTab('powershell');
    (get() as unknown as TerminalSlice).terminalCreateTab('bash');
    (get() as unknown as TerminalSlice).terminalCloseAllTabs();
    const state = get() as unknown as TerminalSlice;
    expect(state.terminalTabs).toHaveLength(0);
    expect(state.terminalTabsById).toEqual({});
    expect(state.terminalActiveTabId).toBe('');
  });

  it('setDefaultTerminalProfile sets the profile', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setDefaultTerminalProfile('bash');
    expect((get() as unknown as TerminalSlice).defaultTerminalProfile).toBe('bash');
  });

  it('setTerminalNavigatorWidth clamps to min 180', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setTerminalNavigatorWidth(0);
    expect((get() as unknown as TerminalSlice).terminalNavigatorWidth).toBe(180);
  });

  it('setTerminalNavigatorWidth clamps to max 300', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setTerminalNavigatorWidth(500);
    expect((get() as unknown as TerminalSlice).terminalNavigatorWidth).toBe(300);
  });

  it('setTerminalNavigatorWidth sets within range', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setTerminalNavigatorWidth(200);
    expect((get() as unknown as TerminalSlice).terminalNavigatorWidth).toBe(200);
  });

  it('setTerminalWorkspaceId sets the workspace id', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setTerminalWorkspaceId('ws-1');
    expect((get() as unknown as TerminalSlice).terminalWorkspaceId).toBe('ws-1');
  });

  it('setTerminalWorkspaceId writes through to the registry key', () => {
    window.localStorage.clear();
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setTerminalWorkspaceId('ws-9');
    flushCrossSliceWrites();
    expect(window.localStorage.getItem('adl:terminal.workspaceId')).toBe(JSON.stringify('ws-9'));
  });

  it('setShellSelectorProfile writes through to the registry key', () => {
    window.localStorage.clear();
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setShellSelectorProfile('cmd');
    flushCrossSliceWrites();
    expect(window.localStorage.getItem('adl:terminal.shellSelectorProfile')).toBe(
      JSON.stringify('cmd'),
    );
  });

  it('setDefaultTerminalProfile writes through to the registry key', () => {
    window.localStorage.clear();
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setDefaultTerminalProfile('cmd');
    flushCrossSliceWrites();
    expect(window.localStorage.getItem('adl:terminal.defaultProfile')).toBe(JSON.stringify('cmd'));
  });

  it('setWorkspaceDefaultTerminalProfile persists the map and updates the store field', () => {
    window.localStorage.clear();
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setWorkspaceDefaultTerminalProfile('ws-1', 'bash');
    flushCrossSliceWrites();
    // persistField 返回的补丁必须以登记表的 field 名（workspaceDefaultProfiles）为键
    expect((get() as unknown as TerminalSlice).workspaceDefaultProfiles).toEqual({
      'ws-1': 'bash',
    });
    expect(window.localStorage.getItem('adl:terminal.workspaceDefaultProfiles')).toBe(
      JSON.stringify({ 'ws-1': 'bash' }),
    );
  });

  it('setShellSelectorProfile sets the selector profile without touching default profile', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setShellSelectorProfile('bash');
    const state = get() as unknown as TerminalSlice;
    expect(state.shellSelectorProfile).toBe('bash');
    expect(state.defaultTerminalProfile).toBe('powershell');
  });
});
