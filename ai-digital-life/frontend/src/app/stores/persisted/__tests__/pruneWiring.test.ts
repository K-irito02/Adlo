import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import {
  applyWorkspacePrune,
  applyTreeLoadedPrune,
  applyTabPrune,
  resetLoadedDirPathsForTest,
  isPruneStoreRegistered,
} from '../pruneWiring';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { terminalCwdStore } from '../../../features/terminal/terminalCwdStore';
import {
  defaultPaneLayout,
  terminalPaneLayoutStore,
} from '../../../features/terminal/terminalPaneLayout';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';

function workspaceEntry(id: string): RecentWorkspaceEntry {
  return {
    id,
    path: `/fake/${id}`,
    rootPath: `/fake/${id}`,
    name: id,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
  };
}

function readJsonKey(key: string): unknown {
  const raw = localStorage.getItem(key);
  return raw === null ? undefined : JSON.parse(raw);
}

describe('prune wiring', () => {
  const realDigitalLife = (window as unknown as { digitalLife?: unknown }).digitalLife;

  beforeEach(() => {
    localStorage.clear();
    resetLoadedDirPathsForTest();
    useAppStore.setState({
      recentWorkspaces: [],
      expandedFileTreePaths: {},
      expandedChangesTreePaths: {},
      filePreviewModeByPath: {},
      browserTabTreeExpanded: {},
      terminalTabs: [],
      terminalTabsById: {},
      browserTabs: [],
      browserTabsById: {},
      workspaceTrees: {},
      workspaceTreeLoading: {},
      workspaceTreeErrors: {},
    });
  });

  afterEach(() => {
    (window as unknown as { digitalLife?: unknown }).digitalLife = realDigitalLife;
    localStorage.clear();
  });

  it('registers the store when slicedStore is loaded (wiring exists)', () => {
    // 生产接线的存在性断言：slicedStore 求值即注入 store 引用；若该行被删，
    // 全部入口静默跳过，此用例变红。
    expect(isPruneStoreRegistered()).toBe(true);
  });

  it('preserves the non-workspace __independent__ terminal entry while dropping removed workspaces', () => {
    // 事项 3 回归：`__independent__`（终端"默认终端目录"）不是工作区 id，
    // 按工作区剪枝不得删除它，否则重启后该目录必展开。
    useAppStore.setState({
      recentWorkspaces: [workspaceEntry('workspace_a')],
      terminalWorkspaceExpanded: { __independent__: false, workspace_gone: true } as never,
    });
    applyWorkspacePrune();
    flushCrossSliceWrites();
    expect(useAppStore.getState().terminalWorkspaceExpanded).toEqual({
      __independent__: false,
    });
    expect(JSON.parse(localStorage.getItem('adl:terminal.workspaceExpanded') ?? 'null')).toEqual({
      __independent__: false,
    });
  });

  it('NEGATIVE: does nothing while the workspace list is still empty', () => {
    useAppStore.setState({
      expandedFileTreePaths: {
        workspace_a: { expanded: { src: true } },
        workspace_gone: { expanded: { old: true } },
      },
    });
    applyWorkspacePrune();
    expect(useAppStore.getState().expandedFileTreePaths.workspace_gone).toBeDefined();
  });

  it('空工作区 + 空中心时仍补齐 launcher（中心不变量不依赖工作区）', () => {
    useAppStore.setState({
      recentWorkspaces: [],
      centerTabs: [],
      centerActiveTabId: '',
    });
    applyWorkspacePrune();
    const s = useAppStore.getState();
    expect(s.centerTabs).toHaveLength(1);
    expect(s.centerTabs[0].kind).toBe('launcher');
    expect(s.centerActiveTabId).toBe(s.centerTabs[0].id);
  });

  it('drops the removed workspace once the list is known', () => {
    useAppStore.setState({
      recentWorkspaces: [workspaceEntry('workspace_a')],
      expandedFileTreePaths: {
        workspace_a: { expanded: { src: true } },
        workspace_gone: { expanded: { old: true } },
      },
    });
    applyWorkspacePrune();
    flushCrossSliceWrites();
    expect(useAppStore.getState().expandedFileTreePaths.workspace_gone).toBeUndefined();
    expect(useAppStore.getState().expandedFileTreePaths.workspace_a).toBeDefined();
    expect(readJsonKey('adl:files.dirExpanded')).toEqual({
      workspace_a: { expanded: { src: true } },
    });
  });

  it('NEGATIVE: keeps directory paths for a workspace whose tree is not loaded', () => {
    useAppStore.setState({
      recentWorkspaces: [workspaceEntry('workspace_a')],
      expandedFileTreePaths: {
        workspace_a: { expanded: { src: true } },
      },
    });
    applyWorkspacePrune();
    expect(useAppStore.getState().expandedFileTreePaths.workspace_a.expanded.src).toBe(true);
  });

  it('drops a directory that is absent from the loaded tree', () => {
    useAppStore.setState({
      recentWorkspaces: [workspaceEntry('workspace_a')],
      expandedFileTreePaths: {
        workspace_a: { expanded: { src: true, 'src/deleted': true } },
      },
    });
    applyTreeLoadedPrune('workspace_a', new Set(['src']));
    expect(useAppStore.getState().expandedFileTreePaths.workspace_a.expanded).toEqual({
      src: true,
    });
  });

  it('keeps browser-live tab expansions: tabIds cover terminal AND browser tabs', () => {
    // browser-*/terminal-* id 永不相撞（createUiId 前缀不同）：若 tabIds 只取终端标签，
    // 存活的浏览器展开会被误判为孤儿删掉。
    useAppStore.setState({
      recentWorkspaces: [workspaceEntry('ws-a')],
      terminalTabs: [{ id: 'terminal-1' } as never],
      browserTabs: [{ id: 'browser-1' } as never],
      browserTabTreeExpanded: {
        'workspace:ws-a': true,
        'tab:key-1:browser-1': true,
        'tab:key-2:browser-gone': true,
      },
    });
    applyWorkspacePrune();
    expect(useAppStore.getState().browserTabTreeExpanded).toEqual({
      'workspace:ws-a': true,
      'tab:key-1:browser-1': true,
    });
  });

  it('prunes external per-tab stores for tabs that no longer exist', () => {
    // 乙类（Task 10 延期）：cwdByTab 无 store 字段，不在 pruneRegistry 内，
    // 由 prune 入口经模块自身的 load/save 清理（persist 唯一写通道）。
    terminalCwdStore.saveAll({ 'term-live': '/work', 'term-orphan': '/gone' });
    useAppStore.setState({
      recentWorkspaces: [workspaceEntry('ws-a')],
      terminalTabs: [{ id: 'term-live' } as never],
    });
    applyTabPrune();
    expect(terminalCwdStore.loadAll()).toEqual({ 'term-live': '/work' });
    flushCrossSliceWrites();
    expect(readJsonKey('adl:terminal.cwdByTab')).toEqual({ 'term-live': '/work' });
  });

  it('prunes external per-tab pane layouts for tabs that no longer exist', () => {
    terminalPaneLayoutStore.apply({});
    terminalPaneLayoutStore.saveAll({
      'term-live': defaultPaneLayout(2),
      'term-orphan': defaultPaneLayout(2),
    });
    useAppStore.setState({
      recentWorkspaces: [workspaceEntry('ws-a')],
      terminalTabs: [{ id: 'term-live' } as never],
    });
    applyTabPrune();
    expect(terminalPaneLayoutStore.loadAll()).toEqual({ 'term-live': defaultPaneLayout(2) });
    flushCrossSliceWrites();
    expect(readJsonKey('adl:terminal.paneLayout')).toEqual({ 'term-live': defaultPaneLayout(2) });
  });

  it('prunes an orphan directory after the tree loads successfully', async () => {
    (window as unknown as { digitalLife?: unknown }).digitalLife = {
      workspace: {
        listTreeForWorkspace: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            tree: [{ path: 'src', name: 'src', kind: 'directory', children: [] }],
            fromCache: false,
            capturedAt: Date.now(),
          },
        }),
      },
    };
    useAppStore.setState({
      recentWorkspaces: [workspaceEntry('ws-a')],
      expandedFileTreePaths: {
        'ws-a': { expanded: { src: true, 'src/deleted': true } },
      },
    });
    await useAppStore.getState().loadWorkspaceTree('ws-a' as never, '/fake/ws-a');
    expect(useAppStore.getState().expandedFileTreePaths['ws-a'].expanded).toEqual({ src: true });
  });

  it('NEGATIVE: skips pruning when the tree load fails', async () => {
    (window as unknown as { digitalLife?: unknown }).digitalLife = {
      workspace: {
        listTreeForWorkspace: vi.fn().mockResolvedValue({
          ok: false,
          error: { message: 'unavailable' },
        }),
      },
    };
    useAppStore.setState({
      recentWorkspaces: [workspaceEntry('ws-a')],
      expandedFileTreePaths: {
        'ws-a': { expanded: { src: true, 'src/deleted': true } },
      },
    });
    await useAppStore.getState().loadWorkspaceTree('ws-a' as never, '/fake/ws-a');
    expect(useAppStore.getState().workspaceTreeErrors['ws-a']).toBe('unavailable');
    expect(useAppStore.getState().expandedFileTreePaths['ws-a'].expanded).toEqual({
      src: true,
      'src/deleted': true,
    });
  });
});
