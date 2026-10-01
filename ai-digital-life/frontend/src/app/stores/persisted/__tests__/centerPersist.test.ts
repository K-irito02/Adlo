import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pruneCenterTabs } from '../prune';
import { applyWorkspacePrune } from '../pruneWiring';
import { useAppStore } from '@stores/slicedStore';
import type { RecentWorkspaceEntry } from '@shared/ipc';

describe('pruneCenterTabs', () => {
  const ctx = {
    workspaceIds: new Set<string>(),
    loadedDirPaths: new Map(),
    tabIds: new Set(['t1']),
  };
  it('保留 refId 存在或为 null 的标签', () => {
    const value = [
      { id: 'c1', kind: 'launcher', refId: null, createdAt: 1 },
      { id: 'c2', kind: 'browser', refId: 't1', createdAt: 2 },
    ] as const;
    const r = pruneCenterTabs([...value], ctx);
    expect(r.value).toHaveLength(2);
    expect(r.changed).toBe(false);
  });
  it('剪掉 refId 悬空标签', () => {
    const r = pruneCenterTabs([{ id: 'c2', kind: 'browser', refId: 'gone', createdAt: 2 }], ctx);
    expect(r.value).toHaveLength(0);
    expect(r.changed).toBe(true);
  });
});

describe('center launcher 不变量（剪枝后）', () => {
  const originalWorkspaces = useAppStore.getState().recentWorkspaces;

  beforeEach(() => {
    useAppStore.setState({
      recentWorkspaces: [
        {
          id: 'ws-1',
          name: 'W',
          path: 'p',
          rootPath: 'p',
          available: true,
          removedFromSidebar: false,
          lastOpenedAt: 0,
          isPinned: false,
          pinnedOrder: 0,
          unpinnedOrder: 0,
        } as RecentWorkspaceEntry,
      ],
      centerTabs: [{ id: 'c1', kind: 'browser', refId: 'dead-dsh', createdAt: 1 }],
      centerActiveTabId: 'c1',
      browserTabs: [],
      browserTabsById: {},
      terminalTabs: [],
      terminalTabsById: {},
    });
  });

  afterEach(() => {
    useAppStore.setState({
      recentWorkspaces: originalWorkspaces,
      centerTabs: [],
      centerActiveTabId: '',
    });
  });

  it('dsh 悬空引用被剪后补齐 launcher，中心不变量仍成立', () => {
    applyWorkspacePrune();

    const s = useAppStore.getState();
    expect(s.centerTabs).toHaveLength(1);
    expect(s.centerTabs[0].kind).toBe('launcher');
  });
});

describe('center launcher 不变量（运行时）', () => {
  beforeEach(() => useAppStore.setState({ centerTabs: [], centerActiveTabId: '' }));

  it('关闭最后一个中心标签后自动新建 launcher 并激活', () => {
    const id = useAppStore.getState().centerAddTab('launcher', null);
    useAppStore.getState().centerRemoveTab(id);
    const s = useAppStore.getState();
    expect(s.centerTabs).toHaveLength(1);
    expect(s.centerTabs[0].kind).toBe('launcher');
    expect(s.centerActiveTabId).toBe(s.centerTabs[0].id);
  });
});
