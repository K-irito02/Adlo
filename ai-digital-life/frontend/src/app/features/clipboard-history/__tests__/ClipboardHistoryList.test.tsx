import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TCopyProvider } from '@i18n/TCopyContext';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import { ClipboardHistoryList } from '../ClipboardHistoryList';
import { useAppStore } from '@stores/slicedStore';

vi.mock('@stores/slicedStore', () => ({
  useAppStore: vi.fn(),
}));

// 捕获列表注册的 onChanged 监听器，暴露 emitChange() 让测试模拟一次剪贴板变化推送。
const clipboardListeners = new Set<() => void>();
const fakeBridge = {
  clipboard: {
    getThumbUrl: () => '',
    getImageUrl: () => '',
    getHtmlUrl: () => '',
    getRtfUrl: () => '',
    exportUrl: () => '',
    saveToFile: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    onChanged: (listener: () => void) => {
      clipboardListeners.add(listener);
      return () => clipboardListeners.delete(listener);
    },
    emitChange: () => {
      clipboardListeners.forEach((fn) => fn());
    },
  },
};

const dict: Record<string, string> = {
  clipboardHistory: '剪贴板历史',
  clipboardEmpty: '暂无剪贴板历史',
  clipboardNoMatch: '没有符合搜索和筛选条件的剪贴板历史',
  clipboardText: '文本',
  clipboardImage: '图片',
  clipboardCopy: '复制',
  clipboardZoomView: '放大查看',
  clipboardDeleteOne: '删除本条',
  clipboardFilter: '筛选类型',
  clipboardFilterAll: '全部',
  clipboardSearchPlaceholder: '搜索剪贴板',
  clipboardClearAll: '清空全部剪贴板历史',
  browserBack: '后退',
  close: '关闭',
  cancel: '取消',
  confirm: '确定',
};
const mockT = new Proxy(dict, { get: (target, key) => target[String(key)] ?? String(key) });

function makeItem(id: string, content: string): ClipboardItem {
  return {
    id,
    kind: 'text',
    content,
    createdAt: Date.now(),
  } as unknown as ClipboardItem;
}

function renderList(overrides: Record<string, unknown> = {}) {
  const fetchClipboardHistory = vi.fn().mockResolvedValue(undefined);
  const state: Record<string, unknown> = {
    clipboardHistory: [],
    clipboardHistoryLoading: false,
    clipboardSearch: '',
    clipboardSearchOpen: false,
    clipboardMatchCase: false,
    clipboardMatchWholeWord: false,
    clipboardUseRegex: false,
    clipboardKindFilter: 'all',
    setClipboardSearch: vi.fn(),
    setClipboardSearchOpen: vi.fn(),
    setClipboardMatchCase: vi.fn(),
    setClipboardMatchWholeWord: vi.fn(),
    setClipboardUseRegex: vi.fn(),
    setClipboardKindFilter: vi.fn(),
    clearAllClipboard: vi.fn(),
    removeClipboardItem: vi.fn(),
    fetchClipboardHistory,
    ...overrides,
  };
  vi.mocked(useAppStore).mockImplementation((selector: (s: any) => any) => selector(state));
  const result = render(
    <TCopyProvider t={mockT as never} locale="zh-CN">
      <ClipboardHistoryList />
    </TCopyProvider>,
  );
  return { fetchClipboardHistory, unmount: result.unmount, rerender: result.rerender, state };
}

beforeEach(() => {
  vi.clearAllMocks();
  clipboardListeners.clear();
  (window as unknown as { digitalLife: unknown }).digitalLife = fakeBridge;
});

afterEach(cleanup);

describe('ClipboardHistoryList', () => {
  it('shows the empty-history message when there is no history', () => {
    renderList();
    expect(screen.getByText('暂无剪贴板历史')).toBeTruthy();
  });

  it('distinguishes "no match" from "no history" when a filter excludes everything', () => {
    renderList({ clipboardHistory: [makeItem('1', 'alpha')], clipboardKindFilter: 'image' });
    expect(screen.getByText('没有符合搜索和筛选条件的剪贴板历史')).toBeTruthy();
  });

  it('renders one row per visible item and passes the visible count to the header', () => {
    renderList({
      clipboardHistory: [makeItem('1', 'alpha'), makeItem('2', 'beta')],
      clipboardKindFilter: 'all',
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toBe('2');
  });

  it('excludes the row list from rendering while loading', () => {
    renderList({ clipboardHistory: [makeItem('1', 'alpha')], clipboardHistoryLoading: true });
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('refetches immediately when clipboard changes', async () => {
    const { fetchClipboardHistory } = renderList();
    fakeBridge.clipboard.emitChange();
    await waitFor(() => expect(fetchClipboardHistory).toHaveBeenCalledTimes(2));
  });

  it('refetches again for a change arriving inside the throttle window (trailing edge)', async () => {
    const { fetchClipboardHistory } = renderList();
    fakeBridge.clipboard.emitChange(); // leading edge → immediate refetch
    fakeBridge.clipboard.emitChange(); // inside window → deferred trailing refetch
    await waitFor(() => expect(fetchClipboardHistory).toHaveBeenCalledTimes(3));
  });

  it('coalesces a burst of changes into one trailing refetch (upper bound)', async () => {
    const { fetchClipboardHistory } = renderList();
    for (let i = 0; i < 5; i += 1) {
      fakeBridge.clipboard.emitChange();
    }
    // 初次挂载 1 + 前缘 1 + 后缘 1 = 3；事件再多也不应线性增长（节流上界）。
    await waitFor(() => expect(fetchClipboardHistory).toHaveBeenCalledTimes(3));
  });

  it('does not refetch after unmount', () => {
    const { fetchClipboardHistory, unmount } = renderList();
    const before = fetchClipboardHistory.mock.calls.length;
    unmount();
    fakeBridge.clipboard.emitChange();
    expect(fetchClipboardHistory).toHaveBeenCalledTimes(before);
  });

  it('clears all pending timers on unmount', () => {
    vi.useFakeTimers();
    try {
      const { fetchClipboardHistory, unmount } = renderList();
      fakeBridge.clipboard.emitChange(); // leading refetch + schedules the 100ms trailing timer
      fakeBridge.clipboard.emitChange(); // marks a trailing refetch as pending
      const callsBeforeUnmount = fetchClipboardHistory.mock.calls.length;
      unmount();
      // 卸载必须清掉挂起的后缘定时器与 10s 兜底轮询：否则推进时钟会触发多余重取。
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(20000);
      expect(fetchClipboardHistory).toHaveBeenCalledTimes(callsBeforeUnmount);
    } finally {
      vi.useRealTimers();
    }
  });

  it('feeds store updates into the open viewer instead of a stale open-time snapshot', async () => {
    const { rerender, state } = renderList({ clipboardHistory: [makeItem('1', 'alpha')] });
    fireEvent.click(screen.getByRole('button', { name: '放大查看' }));
    // 按浏览面断言：预览面常驻挂载（隐藏），懒分包到达后同文本会重复
    const viewerText = () =>
      (document.querySelector('.adl-clipboard-viewer__text') as HTMLElement).textContent;
    expect(viewerText()).toBe('alpha');

    // 模拟保存成功后的 store 原位替换：弹窗必须跟进最新条目，而非停在打开时快照。
    state.clipboardHistory = [makeItem('1', 'beta')];
    rerender(
      <TCopyProvider t={mockT as never} locale="zh-CN">
        <ClipboardHistoryList />
      </TCopyProvider>,
    );
    await waitFor(() => expect(viewerText()).toBe('beta'));
  });
});
