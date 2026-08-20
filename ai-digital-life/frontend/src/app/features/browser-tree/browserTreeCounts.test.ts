import { describe, expect, it } from 'vitest';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type {
  BrowserTabState,
  TabFolderState,
  BrowserHistoryState,
  WorkspaceBookmarkEntry,
} from '@stores/slices/browserSlice';
import type { BrowserCategoryType, BrowserTreeNode } from './types';
import {
  buildHistoryCategoryTree,
  buildUserFolderCategoryTree,
  buildWorkspaceCategoryTree,
  countDirectChildren,
  countDirectFileChildren,
  resolveChildCount,
} from './useBrowserTreeData';

const mockDateLabels = { year: '年', month: '月', day: '日', history: '历史记录' };

const workspace: RecentWorkspaceEntry = makeWorkspace('ws-1', 'Workspace 1', '/tmp/ws-1');

function makeWorkspace(id: string, name: string, path: string): RecentWorkspaceEntry {
  return {
    id,
    name,
    path,
    rootPath: path,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
  };
}

function makeTab(id: string, title: string, url: string, workspaceId: string): BrowserTabState {
  return {
    id,
    title,
    url,
    workspaceId,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
  };
}

function makeFolder(
  id: string,
  name: string,
  parentId: string | undefined,
  parentType: TabFolderState['parentType'],
  tabIds: string[] = [],
): TabFolderState {
  return {
    id,
    name,
    parentId,
    parentType,
    tabs: tabIds.map((tabId) => ({ tabId, url: '', title: '' })),
    createdAt: 0,
    isUserCreated: parentType === 'folder' && parentId === undefined,
  };
}

function makeHistoryEntry(
  id: string,
  title: string,
  url: string,
  visitedAt: number,
): BrowserHistoryState {
  return { id, title, url, visitedAt };
}

describe('countDirectFileChildren', () => {
  it('returns 0 for a file node (no children)', () => {
    const node: BrowserTreeNode = {
      path: 'tab:ws-1:t1',
      name: 't1',
      kind: 'file',
      children: [],
      nodeType: 'tab',
    };
    expect(countDirectFileChildren(node)).toBe(0);
  });

  it('returns 0 for a directory with no children', () => {
    const node: BrowserTreeNode = {
      path: 'folder:empty',
      name: 'empty',
      kind: 'directory',
      children: [],
      nodeType: 'folder',
    };
    expect(countDirectFileChildren(node)).toBe(0);
  });

  it('returns 0 for a directory containing only sub-directories', () => {
    const node: BrowserTreeNode = {
      path: 'folder:parent',
      name: 'parent',
      kind: 'directory',
      children: [
        {
          path: 'folder:child',
          name: 'child',
          kind: 'directory',
          children: [],
          nodeType: 'folder',
        },
        {
          path: 'folder:child2',
          name: 'child2',
          kind: 'directory',
          children: [],
          nodeType: 'folder',
        },
      ],
      nodeType: 'folder',
    };
    expect(countDirectFileChildren(node)).toBe(0);
  });

  it('returns the count of direct file children when no sub-directories are present', () => {
    const node: BrowserTreeNode = {
      path: 'folder:flat',
      name: 'flat',
      kind: 'directory',
      children: [
        { path: 'tab:ws-1:t1', name: 't1', kind: 'file', children: [], nodeType: 'tab' },
        { path: 'tab:ws-1:t2', name: 't2', kind: 'file', children: [], nodeType: 'tab' },
        { path: 'tab:ws-1:t3', name: 't3', kind: 'file', children: [], nodeType: 'tab' },
      ],
      nodeType: 'folder',
    };
    expect(countDirectFileChildren(node)).toBe(3);
  });

  it('counts only direct file children, ignoring sub-directory file descendants', () => {
    const node: BrowserTreeNode = {
      path: 'folder:mix',
      name: 'mix',
      kind: 'directory',
      children: [
        { path: 'tab:ws-1:t1', name: 't1', kind: 'file', children: [], nodeType: 'tab' },
        {
          path: 'folder:nested',
          name: 'nested',
          kind: 'directory',
          children: [
            { path: 'tab:ws-1:t2', name: 't2', kind: 'file', children: [], nodeType: 'tab' },
            { path: 'tab:ws-1:t3', name: 't3', kind: 'file', children: [], nodeType: 'tab' },
          ],
          nodeType: 'folder',
        },
      ],
      nodeType: 'folder',
    };
    expect(countDirectFileChildren(node)).toBe(1);
  });
});

describe('countDirectChildren (history tree)', () => {
  it('returns 0 when there are no children', () => {
    const node: BrowserTreeNode = {
      path: 'history:year:2026',
      name: '2026年',
      kind: 'directory',
      children: [],
      nodeType: 'year',
    };
    expect(countDirectChildren(node)).toBe(0);
  });

  it('returns the count of direct children regardless of kind', () => {
    const node: BrowserTreeNode = {
      path: 'history:year:2026',
      name: '2026年',
      kind: 'directory',
      children: [
        {
          path: 'history:month:2026-06',
          name: '6月',
          kind: 'directory',
          children: [],
          nodeType: 'month',
        },
        {
          path: 'history:month:2026-05',
          name: '5月',
          kind: 'directory',
          children: [],
          nodeType: 'month',
        },
      ],
      nodeType: 'year',
    };
    expect(countDirectChildren(node)).toBe(2);
  });
});

describe('count rules per category type', () => {
  it('workspace category: counts direct child tabs of each workspace (per current data shape)', () => {
    const tabA = makeTab('t1', 'Tab 1', 'https://a.example', 'ws-1');
    const tabB = makeTab('t2', 'Tab 2', 'https://b.example', 'ws-1');
    const tabC = makeTab('t3', 'Tab 3', 'https://c.example', 'ws-1');
    const tabD = makeTab('t4', 'Tab 4', 'https://d.example', 'ws-1');
    const subFolder = makeFolder('f1', 'Sub', 'root', 'folder', ['t3', 't4']);
    const rootFolder = makeFolder('root', 'Root', 'ws-1', 'workspace', ['t1', 't2']);

    const tree = buildWorkspaceCategoryTree(
      [workspace],
      [tabA, tabB, tabC, tabD],
      [rootFolder, subFolder],
    );

    expect(tree).toHaveLength(1);
    const ws = tree[0];
    // Per buildWorkspaceCategoryTree, all workspace tabs are direct children of the
    // workspace node, alongside any workspace-root folders. So the workspace's
    // direct file children = all 4 tabs.
    expect(countDirectFileChildren(ws)).toBe(4);

    const folderNode = ws.children.find((c) => c.path === 'folder:root');
    expect(folderNode).toBeDefined();
    // Folder's direct file children = the 2 tabs assigned to that folder.
    expect(countDirectFileChildren(folderNode!)).toBe(2);
  });

  it('user-folder category: counts only direct child tabs under each root folder', () => {
    const tabA = makeTab('t1', 'Tab 1', 'https://a.example', 'ws-1');
    const tabB = makeTab('t2', 'Tab 2', 'https://b.example', 'ws-1');
    const tabC = makeTab('t3', 'Tab 3', 'https://c.example', 'ws-1');
    const subFolder = makeFolder('sub', 'Sub', 'root', 'folder', ['t3']);
    const rootFolder = makeFolder('root', 'Root', undefined, undefined, ['t1', 't2']);

    const tree = buildUserFolderCategoryTree([rootFolder, subFolder], [tabA, tabB, tabC]);

    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(countDirectFileChildren(root)).toBe(2);

    const sub = root.children.find((c) => c.path === 'folder:sub');
    expect(sub).toBeDefined();
    expect(countDirectFileChildren(sub!)).toBe(1);
  });

  it('history category: year counts months, month counts days, day counts entries', () => {
    const e1 = makeHistoryEntry(
      'e1',
      'E1',
      'https://a.example',
      new Date(2026, 5, 2, 10).getTime(),
    );
    const e2 = makeHistoryEntry(
      'e2',
      'E2',
      'https://b.example',
      new Date(2026, 5, 2, 11).getTime(),
    );
    const e3 = makeHistoryEntry('e3', 'E3', 'https://c.example', new Date(2026, 4, 1, 9).getTime());
    const e4 = makeHistoryEntry(
      'e4',
      'E4',
      'https://d.example',
      new Date(2025, 11, 25, 9).getTime(),
    );

    const tree = buildHistoryCategoryTree([e1, e2, e3, e4], [], mockDateLabels);
    expect(tree).toHaveLength(1);
    const root = tree[0];

    expect(root.path).toBe('history:root');
    expect(countDirectChildren(root)).toBe(2);

    const year2026 = root.children.find((c) => c.path === 'history:year:2026')!;
    const year2025 = root.children.find((c) => c.path === 'history:year:2025')!;
    expect(countDirectChildren(year2026)).toBe(2);
    expect(countDirectChildren(year2025)).toBe(1);

    const june = year2026.children.find((c) => c.path === 'history:month:2026-06')!;
    const may = year2026.children.find((c) => c.path === 'history:month:2026-05')!;
    expect(countDirectChildren(june)).toBe(1);
    expect(countDirectChildren(may)).toBe(1);

    const juneDay2 = june.children[0];
    expect(juneDay2.path).toBe('history:day:2026-06-02');
    expect(countDirectFileChildren(juneDay2)).toBe(2);

    const mayDay1 = may.children[0];
    expect(mayDay1.path).toBe('history:day:2026-05-01');
    expect(countDirectFileChildren(mayDay1)).toBe(1);
  });

  it('category top-level count equals nodes.length (workspace)', () => {
    const ws2 = makeWorkspace('ws-2', 'Workspace 2', '/tmp/ws-2');
    const tree = buildWorkspaceCategoryTree([workspace, ws2], [], []);
    expect(tree).toHaveLength(2);
  });

  it('category top-level count equals nodes.length (user folder)', () => {
    const folderA = makeFolder('a', 'Folder A', undefined, undefined, []);
    const folderB = makeFolder('b', 'Folder B', undefined, undefined, []);
    const tree = buildUserFolderCategoryTree([folderA, folderB], []);
    expect(tree).toHaveLength(2);
  });

  it('category top-level count equals nodes.length (history is always 1: history:root)', () => {
    const e1 = makeHistoryEntry('e1', 'E1', 'https://a.example', new Date(2026, 5, 2).getTime());
    const tree = buildHistoryCategoryTree([e1], [], mockDateLabels);
    expect(tree).toHaveLength(1);
  });

  it('filters out history leaves with an empty resolved name', () => {
    const e1 = makeHistoryEntry('e1', 'E1', 'https://a.example', new Date(2026, 5, 2).getTime());
    const e2 = makeHistoryEntry('e2', '', 'https://b.example', new Date(2026, 5, 2).getTime());
    const tree = buildHistoryCategoryTree([e1, e2], [], mockDateLabels, (title, url) =>
      url.includes('b.example') ? '' : title,
    );
    const day = tree[0].children[0].children[0].children[0];
    expect(countDirectFileChildren(day)).toBe(1);
    expect(day.children.map((c) => c.url)).toEqual(['https://a.example']);
  });
});

describe('useBrowserTreeData count dispatch by categoryType', () => {
  it('selects the correct count strategy per category type', () => {
    const counts: Record<BrowserCategoryType, (n: BrowserTreeNode) => number> = {
      workspace: countDirectFileChildren,
      userFolder: countDirectFileChildren,
      history: countDirectChildren,
    };
    expect(counts.workspace).toBe(countDirectFileChildren);
    expect(counts.userFolder).toBe(countDirectFileChildren);
    expect(counts.history).toBe(countDirectChildren);
  });
});

describe('resolveChildCount (renderer for FileTree child count slot)', () => {
  it('returns null for file (tab / history-entry) nodes — no count should be shown', () => {
    const fileNode: BrowserTreeNode = {
      path: 'tab:ws-1:t1',
      name: 'Example Tab',
      kind: 'file',
      children: [],
      nodeType: 'tab',
    };
    const counts = new Map<string, number>([['folder:root', 5]]);
    expect(resolveChildCount(counts, fileNode)).toBeNull();
  });

  it('returns the count for a directory node when present in the map', () => {
    const dirNode: BrowserTreeNode = {
      path: 'folder:child',
      name: 'Child',
      kind: 'directory',
      children: [],
      nodeType: 'folder',
    };
    const counts = new Map<string, number>([['folder:child', 7]]);
    expect(resolveChildCount(counts, dirNode)).toBe(7);
  });

  it('returns 0 for a directory node missing from the map (defensive default)', () => {
    const dirNode: BrowserTreeNode = {
      path: 'folder:missing',
      name: 'Missing',
      kind: 'directory',
      children: [],
      nodeType: 'folder',
    };
    const counts = new Map<string, number>();
    expect(resolveChildCount(counts, dirNode)).toBe(0);
  });
});

describe('bookmark tree node title via resolveDisplayTitle (⑪)', () => {
  it('placeholder snapshot title falls back to the cached meta title', () => {
    const bookmarks: WorkspaceBookmarkEntry[] = [
      { tabId: 'bm-tab', url: 'https://a.com/', title: 'a.com' },
    ];
    const tree = buildWorkspaceCategoryTree(
      [workspace],
      [],
      [],
      { 'ws-1': bookmarks },
      [],
      {},
      (_title, url) => (url === 'https://a.com/' ? '真实标题' : ''),
    );
    const bmNode = tree[0].children.find((c) => c.url === 'https://a.com/');
    expect(bmNode?.name).toBe('真实标题');
  });

  it('custom snapshot title is preserved even when a meta title exists', () => {
    const bookmarks: WorkspaceBookmarkEntry[] = [
      { tabId: 'bm-tab', url: 'https://b.com/', title: '我的书签' },
    ];
    // resolver 持有真实标题决策（生产为 resolveSiteTitle）：非占位快照标题优先
    const tree = buildWorkspaceCategoryTree(
      [workspace],
      [],
      [],
      { 'ws-1': bookmarks },
      [],
      {},
      (title, url) => (url === 'https://b.com/' ? title || '服务端标题' : ''),
    );
    const bmNode = tree[0].children.find((c) => c.url === 'https://b.com/');
    expect(bmNode?.name).toBe('我的书签');
  });
});

describe('audio indicator propagation across tree categories (事项 7)', () => {
  // URL 变体（尾斜杠/跟踪参数）也应匹配到正在播放的标签 → 音量图标稳定显示。
  it('history leaf picks up playing state from a tab whose URL differs by trailing slash', () => {
    const entry = makeHistoryEntry(
      'e1',
      '视频',
      'https://www.bilibili.com/video/BV1/',
      Date.now(), // 当天 → 参与播放状态匹配
    );
    const tab = makeTab('t1', '视频', 'https://www.bilibili.com/video/BV1', 'ws-1');
    tab.isPlayingAudio = true;
    const tree = buildHistoryCategoryTree([entry], [tab], mockDateLabels);
    const day = tree[0].children[0].children[0].children[0];
    const leaf = day.children[0];
    expect(leaf.isPlayingAudio).toBe(true);
  });

  it('history leaf does NOT show playing state when no matching tab is open', () => {
    const entry = makeHistoryEntry('e1', '视频', 'https://www.bilibili.com/video/BV1/', Date.now());
    const tree = buildHistoryCategoryTree([entry], [], mockDateLabels);
    const day = tree[0].children[0].children[0].children[0];
    const leaf = day.children[0];
    expect(leaf.isPlayingAudio).toBe(false);
  });

  it('folder bookmark keeps playing state when the tab is still on the (normalized) URL', () => {
    const tab = makeTab('t1', '视频', 'https://www.bilibili.com/video/BV1', 'ws-1');
    tab.isPlayingAudio = true;
    const folder = makeFolder('root', 'Root', undefined, undefined);
    folder.tabs = [{ tabId: 't1', url: 'https://www.bilibili.com/video/BV1/', title: '视频' }];
    const tree = buildUserFolderCategoryTree([folder], [tab]);
    const leaf = tree[0].children[0];
    expect(leaf.isPlayingAudio).toBe(true);
  });

  it('workspace bookmark keeps playing state when the tab is still on the (normalized) URL', () => {
    // tab 属于其它工作区（不属于 ws-1 的"已打开标签"）→ 走书签节点分支（tab 存在），
    // 归一化 URL 匹配时保留音频状态。
    const tab = makeTab('bm-tab', '视频', 'https://www.bilibili.com/video/BV1', 'other-ws');
    tab.isPlayingAudio = true;
    const bookmarks: WorkspaceBookmarkEntry[] = [
      { tabId: 'bm-tab', url: 'https://www.bilibili.com/video/BV1/', title: '视频' },
    ];
    const tree = buildWorkspaceCategoryTree([workspace], [tab], [], { 'ws-1': bookmarks });
    const bmNode = tree[0].children.find((c) => c.url === 'https://www.bilibili.com/video/BV1/');
    expect(bmNode?.isPlayingAudio).toBe(true);
  });
});
