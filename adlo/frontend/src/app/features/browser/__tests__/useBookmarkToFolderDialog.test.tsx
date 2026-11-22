import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { useBookmarkToFolderDialog } from '../useBookmarkToFolderDialog';

// 收藏成功后 2s 的后台 favicon 抓取与断言无关，且会真的发请求 → 替换为 noop。
vi.mock('../faviconSelfHeal', () => ({
  scheduleFaviconFetch: vi.fn(),
  ensureSiteFaviconHttp: vi.fn(),
  shouldAttemptFaviconSelfHeal: () => false,
}));

const t = {
  browserBookmarkDuplicateWithPath: 'dup with {path}',
  browserEditBookmarkDuplicate: 'duplicate',
  browserBookmarkAddedToast: 'added',
  browserSelectDirFirst: 'select dir first',
} as unknown as Record<string, string>;

const tab = { id: 'b1', url: 'https://x.test', title: 'Title' } as BrowserTabState;

function makeDeps(
  overrides: Partial<Parameters<typeof useBookmarkToFolderDialog>[0]> = {},
): Parameters<typeof useBookmarkToFolderDialog>[0] {
  return {
    t,
    activeTab: tab,
    isBookmarked: false,
    showToast: vi.fn(),
    onCreateDir: vi.fn(),
    ...overrides,
  };
}

/** 用 setState 覆盖 action（zustand 的 setState 会合并进同一个 store，spy 因此可跨更新存活）。 */
function stubAction(
  key:
    | 'browserSaveTabAsBookmark'
    | 'browserToggleBookmark'
    | 'browserRemoveBookmarksForUrl'
    | 'browserCreateBookmarkEntry',
  impl: unknown,
): () => void {
  const real = useAppStore.getState()[key];
  useAppStore.setState({ [key]: impl } as never);
  return () => useAppStore.setState({ [key]: real } as never);
}

beforeEach(() => {
  useAppStore.setState({ browserPendingBookmark: null });
});

afterEach(() => {
  useAppStore.setState({ browserPendingBookmark: null });
});

describe('useBookmarkToFolderDialog', () => {
  it('未选择目录时提示先选目录：不落盘，且已打开的对话框保持打开', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true });
    const restore = stubAction('browserSaveTabAsBookmark', spy);
    try {
      const showToast = vi.fn();
      const { result } = renderHook((d) => useBookmarkToFolderDialog(d), {
        initialProps: makeDeps({ showToast }),
      });
      // 先打开对话框，验证「空目录提交」路径不会把框关掉（判别性：旧实现若误关框即失败）。
      act(() => {
        result.current.handleOpenBookmarkDialog();
      });
      expect(result.current.bookmarkDialogOpen).toBe(true);
      await act(async () => {
        await result.current.handleBookmarkAddToFolder(null);
      });
      expect(showToast).toHaveBeenCalledWith('select dir first', 'warning');
      expect(spy).not.toHaveBeenCalled();
      expect(result.current.bookmarkDialogOpen).toBe(true);
    } finally {
      restore();
    }
  });

  it('选择工作区后提交：以宿主传入的活动标签落盘，并提示成功、关闭对话框', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true });
    const restore = stubAction('browserSaveTabAsBookmark', spy);
    try {
      const showToast = vi.fn();
      const { result } = renderHook((d) => useBookmarkToFolderDialog(d), {
        initialProps: makeDeps({ showToast }),
      });
      await act(async () => {
        await result.current.handleBookmarkAddToFolder('workspace:ws1');
      });
      expect(spy).toHaveBeenCalledWith('b1', undefined, undefined, 'ws1', 'Title');
      expect(showToast).toHaveBeenCalledWith('added', 'success');
      expect(result.current.bookmarkDialogOpen).toBe(false);
    } finally {
      restore();
    }
  });

  it('已收藏时点击按钮直接取消收藏、不打开对话框', () => {
    // 收藏身份只看 URL：取消收藏必须走 URL 级动作，不能按 (url,title) 元组匹配
    // （导入/仅保存条目标题与页面标题不同，元组匹配会变成「再收藏一条」）。
    const spy = vi.fn();
    const restore = stubAction('browserRemoveBookmarksForUrl', spy);
    try {
      const { result } = renderHook((d) => useBookmarkToFolderDialog(d), {
        initialProps: makeDeps({ isBookmarked: true }),
      });
      act(() => {
        result.current.handleOpenBookmarkDialog();
      });
      expect(spy).toHaveBeenCalledWith('https://x.test');
      expect(result.current.bookmarkDialogOpen).toBe(false);
    } finally {
      restore();
    }
  });

  it('无活标签的待收藏项：直接写入目标目录（不再只写全局索引）', async () => {
    const createSpy = vi.fn().mockReturnValue({ ok: true });
    const restore = stubAction('browserCreateBookmarkEntry', createSpy);
    try {
      const { result } = renderHook((d) => useBookmarkToFolderDialog(d), {
        initialProps: makeDeps(),
      });
      act(() => {
        useAppStore
          .getState()
          .browserSetPendingBookmark({ url: 'https://no-tab.test/page', title: 'NoTab' });
      });
      await waitFor(() => expect(result.current.bookmarkDialogOpen).toBe(true));
      await act(async () => {
        await result.current.handleBookmarkAddToFolder('folder:f1');
      });
      expect(createSpy).toHaveBeenCalledWith({
        url: 'https://no-tab.test/page',
        title: 'NoTab',
        folderId: 'f1',
      });
    } finally {
      restore();
    }
  });

  it('回归：面板+中心同时挂载时，一次「收藏到目录」投递只打开一个对话框', async () => {
    // 待收藏项投递（browserPendingBookmark）唯一生产者是面板侧条目树菜单；
    // 中心必须传 watchStorePending=false，否则两宿主各弹一框（D1）。
    const panel = renderHook((d) => useBookmarkToFolderDialog(d), {
      initialProps: makeDeps(),
    });
    const center = renderHook((d) => useBookmarkToFolderDialog(d), {
      initialProps: makeDeps({ watchStorePending: false }),
    });

    act(() => {
      useAppStore.getState().browserSetPendingBookmark({ url: 'https://p.test', title: 'Pending' });
    });

    await waitFor(() => expect(panel.result.current.bookmarkDialogOpen).toBe(true));
    expect(panel.result.current.bookmarkName).toBe('Pending');
    // 中心侧不订阅：既不开框，也不消费投递
    expect(center.result.current.bookmarkDialogOpen).toBe(false);
  });

  it('投递被消费后清空 store 中的待收藏项', async () => {
    const { result } = renderHook((d) => useBookmarkToFolderDialog(d), {
      initialProps: makeDeps(),
    });
    act(() => {
      useAppStore.getState().browserSetPendingBookmark({ url: 'https://p.test', title: 'Pending' });
    });
    await waitFor(() => expect(result.current.bookmarkDialogOpen).toBe(true));
    expect(useAppStore.getState().browserPendingBookmark).toBeNull();
  });
});
