import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { createTerminalSlice } from '../terminalSlice';
import type { TerminalSlice } from '../terminalSlice';
import {
  TERMINAL_WORKSPACE_ID_KEY,
  TERMINAL_SHELL_SELECTOR_PROFILE_KEY,
  TERMINAL_DEFAULT_PROFILE_KEY,
} from '../terminalSliceTypes';
import { STORAGE_HYDRATION_DELAY_MS } from '../../constants';

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

  it('toggleTerminalNavigator toggles navigator collapsed', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).toggleTerminalNavigator();
    const collapsed = (get() as Record<string, unknown>).navigatorCollapsedByTool as Record<
      string,
      boolean
    >;
    expect(collapsed.terminal).toBe(true);
  });

  it('toggleTerminalNavigator toggles back', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).toggleTerminalNavigator();
    (get() as unknown as TerminalSlice).toggleTerminalNavigator();
    const collapsed = (get() as Record<string, unknown>).navigatorCollapsedByTool as Record<
      string,
      boolean
    >;
    expect(collapsed.terminal).toBe(false);
  });

  it('setTerminalPersisted sets the flag', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setTerminalPersisted(true);
    expect((get() as unknown as TerminalSlice).terminalPersisted).toBe(true);
  });

  it('setTerminalWorkspaceId sets the workspace id', () => {
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setTerminalWorkspaceId('ws-1');
    expect((get() as unknown as TerminalSlice).terminalWorkspaceId).toBe('ws-1');
  });

  it('setTerminalWorkspaceId writes through to localStorage synchronously', () => {
    window.localStorage.clear();
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setTerminalWorkspaceId('ws-9');
    expect(window.localStorage.getItem(TERMINAL_WORKSPACE_ID_KEY)).toBe(JSON.stringify('ws-9'));
  });

  it('setShellSelectorProfile writes through to localStorage synchronously', () => {
    window.localStorage.clear();
    const { get } = createMockStore();
    (get() as unknown as TerminalSlice).setShellSelectorProfile('cmd');
    expect(window.localStorage.getItem(TERMINAL_SHELL_SELECTOR_PROFILE_KEY)).toBe(
      JSON.stringify('cmd'),
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

describe('hydrateTerminalDefaults', () => {
  beforeAll(async () => {
    // 放干主 describe 遗留的去抖写（真时钟 50ms 调度）：否则它们会在 fake 计时推进中
    // 意外落盘覆盖种子值 —— 这正是 F9 水合竞态在测试中的镜像，生产侧已记 backlog
    await new Promise((r) => setTimeout(r, 150));
  });

  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createIsolatedStore() {
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
    return { get, set };
  }

  it('dirty default profile key falls back to powershell instead of poisoning both fields', async () => {
    window.localStorage.setItem(TERMINAL_DEFAULT_PROFILE_KEY, JSON.stringify('zsh'));
    window.localStorage.setItem(TERMINAL_SHELL_SELECTOR_PROFILE_KEY, JSON.stringify('oops'));
    const { createTerminalSlice: createIsolated } = await import('../terminalSlice');
    const { get, set } = createIsolatedStore();
    createIsolated(set as never, get as never);
    await vi.advanceTimersByTimeAsync(STORAGE_HYDRATION_DELAY_MS + 100);
    const hydrated = get() as unknown as TerminalSlice;
    expect(hydrated.defaultTerminalProfile).toBe('powershell');
    expect(hydrated.shellSelectorProfile).toBe('powershell');
  });

  it('restores persisted workspace id and selector profile', async () => {
    window.localStorage.setItem(TERMINAL_WORKSPACE_ID_KEY, JSON.stringify('ws-7'));
    window.localStorage.setItem(TERMINAL_SHELL_SELECTOR_PROFILE_KEY, JSON.stringify('bash'));
    const { createTerminalSlice: createIsolated } = await import('../terminalSlice');
    const { get, set } = createIsolatedStore();
    createIsolated(set as never, get as never);
    await vi.advanceTimersByTimeAsync(STORAGE_HYDRATION_DELAY_MS + 100);
    const hydrated = get() as unknown as TerminalSlice;
    expect(hydrated.terminalWorkspaceId).toBe('ws-7');
    expect(hydrated.shellSelectorProfile).toBe('bash');
  });
});
