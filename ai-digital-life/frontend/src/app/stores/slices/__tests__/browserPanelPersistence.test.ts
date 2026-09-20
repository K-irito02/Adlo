import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StoreState } from '../../StoreState';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';
import { pruneRegistry } from '@stores/persisted/prune';
import type { PruneCtx } from '@stores/persisted/entry';
import { createBrowserHistorySlice } from '../browserHistorySlice';
import { createBrowserTabsSlice } from '../browserTabsSlice';
import { createBrowserFoldersSlice } from '../browserFoldersSlice';
import { createBrowserLandingSlice } from '../browserLandingSlice';
import { createBrowserSearchEnginesSlice } from '../browserSearchEnginesSlice';
import { createBrowserBookmarkSlice } from '../browserBookmarkSlice';
import { createBrowserSlice } from '../browserSlice';

type SetFn = (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void;

/** 组合浏览器各子切片的最小 store（与 slicedStore 的注册顺序一致） */
function createBrowserStore() {
  let state = {} as Record<string, unknown>;
  const get = () => state as unknown as StoreState;
  const set: SetFn = (partial) => {
    state =
      typeof partial === 'function'
        ? {
            ...state,
            ...(partial as (s: StoreState) => Partial<StoreState>)(state as unknown as StoreState),
          }
        : { ...state, ...(partial as Record<string, unknown>) };
  };
  state = {
    ...createBrowserHistorySlice(set as never, get as never),
    ...createBrowserTabsSlice(set as never, get as never),
    ...createBrowserFoldersSlice(set as never, get as never),
    ...createBrowserLandingSlice(set as never, get as never),
    ...createBrowserSearchEnginesSlice(set as never, get as never),
    ...createBrowserBookmarkSlice(set as never, get as never),
    ...createBrowserSlice(set as never, get as never),
  } as unknown as Record<string, unknown>;
  return get as () => StoreState & Record<string, unknown>;
}

/** 模拟"重启"：落盘 pending → 重置水合缓存 → 重新读盘 */
function restart() {
  flushCrossSliceWrites();
  resetHydrationForTest();
  return hydrateAll().patch as Partial<Record<string, unknown>>;
}

describe('browser panel persistence — write → simulated restart → read back', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetHydrationForTest();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('normalizes persisted tabs through the composite hydrator (titleResolved settlement)', () => {
    const get = createBrowserStore();
    get().browserOpenTab('https://example.com', 'Example');
    flushCrossSliceWrites();

    // 抹掉 titleResolved，模拟"早期会话/旧写入"缺少结算字段的标签
    const raw = JSON.parse(localStorage.getItem('adl:browser.tabs') as string) as Record<
      string,
      unknown
    >[];
    const tabId = raw[0].id as string;
    delete raw[0].titleResolved;
    localStorage.setItem('adl:browser.tabs', JSON.stringify(raw));

    const patch = restart();

    expect(patch.browserTabs).toHaveLength(1);
    expect((patch.browserTabs as { id: string }[])[0].id).toBe(tabId);
    // 有真实非占位标题 → 结算为已解决（否则恢复的标签永远显示扫光）
    expect((patch.browserTabs as { titleResolved: boolean }[])[0].titleResolved).toBe(true);
    // 跨键：activeTabId 与 tabs 一起还原，且 tabsById 由 tabs 派生
    expect(patch.browserActiveTabId).toBe(tabId);
    expect(Object.keys(patch.browserTabsById as Record<string, unknown>)).toEqual([tabId]);
  });

  it('falls back to the last tab when the persisted active tab id is stale', () => {
    localStorage.setItem(
      'adl:browser.tabs',
      JSON.stringify([
        { id: 'browser-1', title: 'One', url: 'https://one.test' },
        { id: 'browser-2', title: 'Two', url: 'https://two.test' },
      ]),
    );
    localStorage.setItem('adl:browser.activeTabId', JSON.stringify('browser-gone'));

    const patch = restart();

    expect(patch.browserActiveTabId).toBe('browser-2');
  });

  it('leaves browserTabs at its fallback when the stored tabs value is not an array', () => {
    localStorage.setItem('adl:browser.tabs', JSON.stringify({ id: 'browser-1' }));

    let patch: Partial<Record<string, unknown>> = {};
    expect(() => {
      patch = restart();
    }).not.toThrow();

    expect(patch.browserTabs).toEqual([]);
  });

  it('survives a restart when a nested tab value is corrupt (no throw, whole value rejected)', () => {
    localStorage.setItem('adl:browser.tabs', JSON.stringify([null, { id: 'browser-1' }]));
    localStorage.setItem('adl:browser.workspaceBookmarks', JSON.stringify({ ws1: 'not-an-array' }));

    expect(() => restart()).not.toThrow();
    const patch = hydrateAll().patch as Partial<Record<string, unknown>>;
    expect(patch.browserTabs).toEqual([]);
    expect(patch.browserWorkspaceBookmarks).toEqual({});
  });

  it('clamps an out-of-range persisted navigator width', () => {
    localStorage.setItem('adl:browser.navigatorWidth', JSON.stringify(9999));
    expect(restart().browserNavigatorWidth).toBe(300);

    localStorage.setItem('adl:browser.navigatorWidth', JSON.stringify(1));
    resetHydrationForTest();
    expect(hydrateAll().patch.browserNavigatorWidth).toBe(180);
  });

  it('prunes orphan workspace/tab paths of the tree expansion but keeps folder paths', () => {
    const value = {
      'workspace:ws-a': true,
      'workspace:ws-gone': true,
      'tab:key-1:tab-a': true,
      'tab:key-2:tab-gone': true,
      'folder:folder-gone': true,
    };
    const ctx: PruneCtx = {
      workspaceIds: new Set(['ws-a']),
      loadedDirPaths: new Map(),
      tabIds: new Set(['tab-a']),
    };

    const result = pruneRegistry({ browserTabTreeExpanded: value }, ctx);

    expect(result.changed).toBe(true);
    expect(result.value.browserTabTreeExpanded).toEqual({
      'workspace:ws-a': true,
      'tab:key-1:tab-a': true,
      'folder:folder-gone': true,
    });
  });

  it('skips tree-expansion pruning entirely while the reference lists are empty', () => {
    const value = { 'workspace:ws-a': true, 'tab:key-1:tab-a': true };
    const result = pruneRegistry(
      { browserTabTreeExpanded: value },
      { workspaceIds: new Set(), loadedDirPaths: new Map(), tabIds: new Set() },
    );

    expect(result.changed).toBe(false);
    expect(result.value.browserTabTreeExpanded).toBeUndefined();
  });
});

describe('every migrated browser key round-trips through the registry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetHydrationForTest();
  });

  afterEach(() => {
    localStorage.clear();
  });

  interface Case {
    key: string;
    field: string;
    legacyKey: string;
    act: (store: StoreState & Record<string, unknown>) => void;
  }

  const cases: Case[] = [
    {
      key: 'adl:browser.tabs',
      field: 'browserTabs',
      legacyKey: 'adl-ui:browser-tabs',
      act: (s) => s.browserOpenTab('https://tabs.test', 'Tabs'),
    },
    {
      key: 'adl:browser.activeTabId',
      field: 'browserActiveTabId',
      legacyKey: 'adl-ui:browser-active-tab',
      act: (s) => s.browserOpenTab('https://active.test', 'Active'),
    },
    {
      key: 'adl:browser.tabFolders',
      field: 'browserTabFolders',
      legacyKey: 'adl-ui:browser-tab-folders',
      act: (s) => s.browserCreateTabFolder('Folder'),
    },
    {
      key: 'adl:browser.tabTreeExpanded',
      field: 'browserTabTreeExpanded',
      legacyKey: 'adl-ui:browser-tab-tree-expanded',
      act: (s) => s.browserToggleTabTreePath('workspace:ws-a'),
    },
    {
      key: 'adl:browser.history',
      field: 'browserHistory',
      legacyKey: 'adl-ui:browser-history',
      act: (s) => s.browserAddToHistory('https://history.test', 'History'),
    },
    {
      key: 'adl:browser.bookmarks',
      field: 'browserBookmarks',
      legacyKey: 'adl-ui:browser-bookmarks',
      act: (s) => s.browserToggleBookmark({ url: 'https://bookmark.test', title: 'Bookmark' }),
    },
    {
      key: 'adl:browser.workspaceBookmarks',
      field: 'browserWorkspaceBookmarks',
      legacyKey: 'adl-ui:browser-workspace-bookmarks',
      act: (s) =>
        s.browserCreateBookmarkEntry({ url: 'https://ws.test', title: 'WS', workspaceId: 'ws-a' }),
    },
    {
      key: 'adl:browser.tabIdUrlMap',
      field: 'browserBookmarkTabIdUrlMap',
      legacyKey: 'adl-ui:browser-bookmark-tabid-url-map',
      // 映射只在存在活动标签页时写入（与运行时语义一致）
      act: (s) => {
        s.browserOpenTab('https://map.test', 'Map');
        s.browserToggleBookmark({ url: 'https://map.test', title: 'Map' });
      },
    },
    {
      key: 'adl:browser.shortcuts',
      field: 'browserShortcuts',
      legacyKey: 'adl-ui:browser-shortcuts',
      act: (s) => s.browserAddShortcut({ name: 'Shortcut', url: 'https://shortcut.test' }),
    },
    {
      key: 'adl:browser.localPorts',
      field: 'browserLocalPorts',
      legacyKey: 'adl-ui:browser-local-ports',
      act: (s) => s.browserAddManualPort(5173),
    },
    {
      key: 'adl:browser.bgConfig',
      field: 'browserBgConfig',
      legacyKey: 'adl-ui:browser-bg-config',
      act: (s) => s.browserSetBgConfig({ mode: 'image', fit: 'contain', filePath: '/bg.png' }),
    },
    {
      key: 'adl:browser.configuredPorts',
      field: 'browserConfiguredPorts',
      legacyKey: 'adl-ui:browser-configured-ports',
      act: (s) => s.browserSetConfiguredPorts([3000, 5173]),
    },
    {
      key: 'adl:browser.navigatorWidth',
      field: 'browserNavigatorWidth',
      legacyKey: 'adl-ui:browser-navigator-width',
      act: (s) => s.setBrowserNavigatorWidth(260),
    },
    {
      key: 'adl:browser.navigateInPlace',
      field: 'browserNavigateInPlace',
      legacyKey: 'adl-ui:browser-navigate-in-place',
      act: (s) => s.setBrowserNavigateInPlace(true),
    },
    {
      key: 'adl:browser.searchEngines',
      field: 'searchEngines',
      legacyKey: 'adl:browser:searchEngines',
      act: (s) => s.initializeSearchEngines(),
    },
    {
      key: 'adl:browser.defaultSearchEngineId',
      field: 'defaultSearchEngineId',
      legacyKey: 'adl:browser:defaultSearchEngineId',
      act: (s) => s.initializeSearchEngines(),
    },
  ];

  it.each(cases)('$key persists and hydrates back to $field', ({ key, field, legacyKey, act }) => {
    const get = createBrowserStore();
    act(get());
    flushCrossSliceWrites();

    expect(localStorage.getItem(key), `${key} must be written`).not.toBeNull();
    expect(localStorage.getItem(legacyKey), `${legacyKey} must no longer be written`).toBeNull();

    const patch = restart();

    expect(patch[field], `${field} must be hydrated`).not.toBeUndefined();
  });
});
