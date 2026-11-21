import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { pageMetaClient } from '@utils/pageMetaClient';
import * as siteMetaCache from '@utils/siteMetaCache';
import { useAppStore } from '@stores/slicedStore';
import type {
  BrowserTabState,
  BrowserBookmark,
  BookmarkEntry,
  BrowserHistoryState,
} from '@stores/slices/browserTypes';
import { useAppStartup } from '../useAppStartup';
import { isTauriShell } from '../../../tauri-bridge';

vi.mock('@utils/pageMetaClient', () => ({
  pageMetaClient: { warmup: vi.fn() },
}));

// 默认非 Tauri（jsdom）；Tauri 分支用例内按需翻转。
vi.mock('../../../tauri-bridge', () => ({
  isTauriShell: vi.fn(() => false),
}));

function makeTab(id: string, url: string): BrowserTabState {
  return {
    id,
    workspaceId: 'ws1',
    title: `T-${id}`,
    url,
    titleResolved: false,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
    isDownloading: false,
  };
}

// bootstrap 会在启动 effect 中执行，这里提供最小 bridge 使其短路返回
function setupWindowDigitalLife() {
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    app: {
      getInfo: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'WARMUP_TEST_EARLY_EXIT', message: 'bootstrap short-circuit' },
      }),
    },
    workspace: {
      listRecent: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      onFileChanged: vi.fn(() => () => {}),
      onFilesChanged: vi.fn(() => () => {}),
      setFilesChangedRoots: vi.fn(),
    },
  };
}

describe('useAppStartup warmup', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setupWindowDigitalLife();
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
    useAppStore.setState({
      loading: false,
      browserTabs: [],
      browserBookmarks: [],
      browserBookmarkFolders: [],
      browserWorkspaceBookmarks: {},
      browserHistory: [],
    });
  });

  afterEach(() => {
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  });

  it('warmup collects unique visible urls (tabs+bookmarks+history) capped at 200', async () => {
    const tabs = [
      makeTab('tab1', 'https://a.example/'),
      makeTab('tab2', 'https://b.example/'),
      makeTab('tab3', 'https://c.example/'),
    ];
    // bookmark 用无尾斜杠写法，normalize 后与 tab2 重复
    const bookmarks: BrowserBookmark[] = [
      { url: 'https://b.example', title: 'B' },
      { url: 'https://d.example/', title: 'D' },
    ];
    const workspaceBookmarks: BookmarkEntry[] = [
      {
        id: 'bm9',
        sourceTabId: 'tab9',
        url: 'https://e.example/',
        title: 'E',
        addedAt: 0,
        lastModifiedAt: 0,
      },
    ];
    const history: BrowserHistoryState[] = [
      { id: 'h1', title: 'F', url: 'https://f.example/', visitedAt: 1 },
    ];
    useAppStore.setState({
      browserTabs: tabs,
      browserBookmarks: bookmarks,
      browserWorkspaceBookmarks: { ws1: workspaceBookmarks },
      browserHistory: history,
    });

    renderHook(() => useAppStartup(undefined));
    await act(async () => {});

    expect(vi.mocked(pageMetaClient.warmup)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pageMetaClient.warmup)).toHaveBeenCalledWith([
      'https://a.example/',
      'https://b.example/',
      'https://c.example/',
      'https://d.example/',
      'https://e.example/',
      'https://f.example/',
    ]);
  });

  it('caps warmup urls at 200', async () => {
    const tabs = Array.from({ length: 250 }, (_, i) =>
      makeTab(`tab-${i}`, `https://u${i}.example/`),
    );
    useAppStore.setState({ browserTabs: tabs });

    renderHook(() => useAppStartup(undefined));
    await act(async () => {});

    const urls = vi.mocked(pageMetaClient.warmup).mock.calls[0]?.[0] ?? [];
    expect(urls.length).toBe(200);
    expect(new Set(urls).size).toBe(200);
  });

  it('seeds bookmark icon snapshots once the site-meta cache is ready', async () => {
    // 回归拦截（F2）：删掉 useAppStartup 里的 subscribeSiteMetaReady → sync 接线时，
    // 跨会话的导入图标会丢失，本断言必须变红。
    useAppStore.setState({
      browserBookmarkFolders: [
        {
          id: 'f',
          name: 'F',
          createdAt: 0,
          entries: [
            {
              id: 'b',
              url: 'https://startup-hook.test/',
              title: 'S',
              addedAt: 1,
              lastModifiedAt: 1,
              iconUri: 'data:image/png;base64,HOOK',
            },
          ],
        },
      ],
    });

    renderHook(() => useAppStartup(undefined));
    await act(async () => {});

    expect(siteMetaCache.getCachedFavicon('https://startup-hook.test/')).toBe(
      'data:image/png;base64,HOOK',
    );
  });
});

describe('useAppStartup files-changed root declaration（浏览器多根轮询）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWindowDigitalLife();
    useAppStore.setState({ adServerReachable: null });
  });

  afterEach(() => {
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  });

  it('declares every added workspace (incl. active fallback) and skips removed entries', async () => {
    useAppStore.setState({
      recentWorkspaces: [
        { id: 'a', path: '/a', removedFromSidebar: false, available: true },
        { id: 'b', path: '/b', removedFromSidebar: false, available: true },
        { id: 'offline', path: '/offline', removedFromSidebar: false, available: false },
        { id: 'hidden', path: '/hidden', removedFromSidebar: true, available: true },
      ] as never,
    });
    const appInfo = {
      config: { language: 'zh-CN' },
      currentWorkspace: { id: 'active', path: '/active' },
    } as never;

    renderHook(() => useAppStartup(appInfo));
    await act(async () => {});

    const setRoots = (
      window as unknown as {
        digitalLife: { workspace: { setFilesChangedRoots: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.workspace.setFilesChangedRoots;
    expect(setRoots).toHaveBeenLastCalledWith(['/a', '/b', '/offline', '/active']);
  });

  it('does not duplicate the active workspace when it is already in the sidebar', async () => {
    useAppStore.setState({
      recentWorkspaces: [
        { id: 'a', path: 'C:\\Repo', removedFromSidebar: false, available: true },
      ] as never,
    });
    const appInfo = {
      config: { language: 'zh-CN' },
      currentWorkspace: { id: 'a', path: 'c:/repo/' },
    } as never;

    renderHook(() => useAppStartup(appInfo));
    await act(async () => {});

    const setRoots = (
      window as unknown as {
        digitalLife: { workspace: { setFilesChangedRoots: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.workspace.setFilesChangedRoots;
    expect(setRoots).toHaveBeenLastCalledWith(['C:\\Repo']);
  });
});

describe('useAppStartup focus refresh（变更面板补刷）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWindowDigitalLife();
    vi.useFakeTimers();
    useAppStore.setState({ adServerReachable: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  });

  it('窗口焦点回归时静默补刷文件树与可见工作区 git 快照', async () => {
    const listTree = vi.fn().mockResolvedValue({
      ok: true,
      data: { tree: [], fromCache: false, capturedAt: 0 },
    });
    const listGit = vi.fn().mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 },
    });
    const ws = (window as unknown as { digitalLife: { workspace: Record<string, unknown> } })
      .digitalLife.workspace;
    ws.listTreeForWorkspace = listTree;
    ws.listGitStatusForWorkspace = listGit;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    useAppStore.setState({
      recentWorkspaces: [
        { id: 'ws-1', path: '/repo', available: true, removedFromSidebar: false },
      ] as never,
      workspaceTreeExpandedInFileNav: { 'ws-1': true },
      workspaceChangesExpanded: { 'ws-1': true },
      selectedFilePath: undefined,
    });

    renderHook(() => useAppStartup(undefined));
    await act(async () => {});
    expect(listTree).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('focus'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(listTree).toHaveBeenCalledWith('/repo', { force: true });
    expect(listGit).toHaveBeenCalledWith('/repo');
  });
});

describe('useAppStartup git snapshot backfill（事项 3）', () => {
  const original = useAppStore.getState().refreshAllGitSnapshotsSilent;
  let refreshAll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setupWindowDigitalLife();
    refreshAll = vi.fn(async () => {});
    useAppStore.setState({
      adServerReachable: null,
      appReady: false,
      recentWorkspaces: [],
      refreshAllGitSnapshotsSilent: refreshAll as never,
    });
  });

  afterEach(() => {
    useAppStore.setState({
      appReady: false,
      recentWorkspaces: [],
      refreshAllGitSnapshotsSilent: original,
    });
  });

  it('appReady 且工作区集合变化时为全部可用工作区补刷快照', async () => {
    useAppStore.setState({
      appReady: true,
      recentWorkspaces: [
        { id: 'ws-1', path: '/a', available: true, removedFromSidebar: false },
        { id: 'ws-2', path: '/b', available: true, removedFromSidebar: false },
      ] as never,
      workspaceChangesExpanded: {},
    });

    renderHook(() => useAppStartup(undefined));
    await act(async () => {});

    const callsAfterMount = refreshAll.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    act(() => {
      useAppStore.setState({
        recentWorkspaces: [
          { id: 'ws-1', path: '/a', available: true, removedFromSidebar: false },
          { id: 'ws-2', path: '/b', available: true, removedFromSidebar: false },
          { id: 'ws-3', path: '/c', available: true, removedFromSidebar: false },
        ] as never,
      });
    });
    await act(async () => {});

    expect(refreshAll.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });
});

describe('useAppStartup ad-server reachability (Phase 4 R2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWindowDigitalLife();
    useAppStore.setState({ adServerReachable: null });
  });

  afterEach(() => {
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
    vi.unstubAllGlobals();
  });

  it('writes probe results into the store via the reachability subscription', async () => {
    // jsdom 非 Tauri：走订阅分支。getInfo 挂起使 bootstrap 不写 store，
    // 探针成功后的 true 只能来自订阅写入（确定性归因）。
    (window as unknown as { digitalLife: { app: { getInfo: unknown } } }).digitalLife.app.getInfo =
      vi.fn(() => new Promise(() => {}));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200 })),
    );
    renderHook(() => useAppStartup(undefined));
    const { isAdServerReachable, resetAdServerReachability } =
      await import('../../../preview-bridge/preview-reachability');
    resetAdServerReachability();
    await act(async () => {
      await isAdServerReachable('http://127.0.0.1:59991');
    });
    expect(useAppStore.getState().adServerReachable).toBe(true);
  });

  it('sets true on Tauri mount only when never probed, never flips a bootstrap false', async () => {
    // Closing N-2：HMR 重挂载不得把 bootstrap 已写的 false 翻回 true。
    // getInfo 挂起使 bootstrap 不写 store，两次断言只观测 mount effect。
    (window as unknown as { digitalLife: { app: { getInfo: unknown } } }).digitalLife.app.getInfo =
      vi.fn(() => new Promise(() => {}));
    const mockedShell = vi.mocked(isTauriShell);

    mockedShell.mockReturnValue(true);
    try {
      useAppStore.setState({ adServerReachable: null });
      renderHook(() => useAppStartup(undefined));
      await act(async () => {});
      expect(useAppStore.getState().adServerReachable).toBe(true);

      useAppStore.setState({ adServerReachable: false });
      renderHook(() => useAppStartup(undefined));
      await act(async () => {});
      expect(useAppStore.getState().adServerReachable).toBe(false);
    } finally {
      mockedShell.mockReturnValue(false);
    }
  });
});
