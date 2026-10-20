import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBrowserHistorySlice, HISTORY_COALESCE_WINDOW_MS } from '../browserHistorySlice';
import type { BrowserHistorySlice } from '../browserHistorySlice';

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
  state = { ...createBrowserHistorySlice(set as never, get as never) };
  return { get };
}

describe('browserHistorySlice — same-document coalescing', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces same-document URL variants arriving within the navigation window into one entry', () => {
    const { get } = createMockStore();
    const s = get() as unknown as BrowserHistorySlice;
    s.browserAddToHistory(
      'https://www.douyin.com/user/self?from_nav=1',
      'https://www.douyin.com/user/self?from_nav=1',
    );
    s.browserAddToHistory(
      'https://www.douyin.com/user/self?from_tab_name=main&showTab=like',
      'https://www.douyin.com/user/self?from_tab_name=main&showTab=like',
    );
    s.browserAddToHistory('https://www.douyin.com/user/self', 'https://www.douyin.com/user/self');
    const history = (get() as unknown as BrowserHistorySlice).browserHistory;
    expect(history).toHaveLength(1);
    expect(history[0].url).toBe('https://www.douyin.com/user/self');
  });

  it('keeps the best (non-placeholder) title when merging variants', () => {
    const { get } = createMockStore();
    const s = get() as unknown as BrowserHistorySlice;
    s.browserAddToHistory(
      'https://www.douyin.com/user/self?from_tab_name=main&showTab=like',
      '泥瓶巷一棵草的抖音 - 抖音',
    );
    s.browserAddToHistory('https://www.douyin.com/user/self', 'https://www.douyin.com/user/self');
    const history = (get() as unknown as BrowserHistorySlice).browserHistory;
    expect(history).toHaveLength(1);
    expect(history[0].url).toBe('https://www.douyin.com/user/self');
    expect(history[0].title).toBe('泥瓶巷一棵草的抖音 - 抖音');
  });

  it('does not coalesce same-document variants once the window has elapsed', () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    vi.setSystemTime(t0);
    const { get } = createMockStore();
    const s = get() as unknown as BrowserHistorySlice;
    s.browserAddToHistory('https://www.douyin.com/user/self?from_nav=1', 'a');
    vi.setSystemTime(t0 + HISTORY_COALESCE_WINDOW_MS + 500);
    s.browserAddToHistory('https://www.douyin.com/user/self', 'b');
    expect((get() as unknown as BrowserHistorySlice).browserHistory).toHaveLength(2);
  });

  it('does not coalesce different YouTube videos even within the window', () => {
    const { get } = createMockStore();
    const s = get() as unknown as BrowserHistorySlice;
    s.browserAddToHistory('https://youtube.com/watch?v=AAA', 'Video A');
    s.browserAddToHistory('https://youtube.com/watch?v=BBB', 'Video B');
    const history = (get() as unknown as BrowserHistorySlice).browserHistory;
    expect(history).toHaveLength(2);
    expect(history[0].url).toBe('https://youtube.com/watch?v=BBB');
    expect(history[1].url).toBe('https://youtube.com/watch?v=AAA');
  });

  it('does not coalesce across different hosts even within the window', () => {
    const { get } = createMockStore();
    const s = get() as unknown as BrowserHistorySlice;
    s.browserAddToHistory('https://a.com/page', 'A');
    s.browserAddToHistory('https://b.com/page', 'B');
    expect((get() as unknown as BrowserHistorySlice).browserHistory).toHaveLength(2);
  });

  it('still dedupes an identical URL (same day, same dedupKey)', () => {
    const { get } = createMockStore();
    const s = get() as unknown as BrowserHistorySlice;
    s.browserAddToHistory('https://example.com/page', 't');
    s.browserAddToHistory('https://example.com/page', 't');
    expect((get() as unknown as BrowserHistorySlice).browserHistory).toHaveLength(1);
  });
});

describe('browserHistorySlice — redirect URL rewrite (方案 A)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rewrites the original history entry URL to the redirect target', () => {
    const { get } = createMockStore();
    const s = get() as unknown as BrowserHistorySlice;
    s.browserAddToHistory(
      'https://search.marginalia.nu/search?q=%E5%92%8C%E5%B9%B3',
      'Marginalia: 和平',
    );
    const entryId = (get() as unknown as BrowserHistorySlice).browserHistory[0].id;
    s.browserUpdateHistoryUrl(
      'https://search.marginalia.nu/search?q=%E5%92%8C%E5%B9%B3',
      'https://marginalia-search.com/search?q=%E5%92%8C%E5%B9%B3',
    );
    const history = (get() as unknown as BrowserHistorySlice).browserHistory;
    expect(history).toHaveLength(1);
    expect(history[0].url).toBe('https://marginalia-search.com/search?q=%E5%92%8C%E5%B9%B3');
    expect(history[0].title).toBe('Marginalia: 和平');
    expect(history[0].id).toBe(entryId);
  });

  it('removes the old entry when the redirect target already exists in history', () => {
    const { get } = createMockStore();
    const s = get() as unknown as BrowserHistorySlice;
    s.browserAddToHistory('https://source.test/page', 'Source');
    s.browserAddToHistory('https://target.test/page', 'Target');
    s.browserUpdateHistoryUrl('https://source.test/page', 'https://target.test/page');
    const history = (get() as unknown as BrowserHistorySlice).browserHistory;
    expect(history).toHaveLength(1);
    expect(history[0].url).toBe('https://target.test/page');
  });

  it('is a no-op for same dedupKey or no matching entry', () => {
    const { get } = createMockStore();
    const s = get() as unknown as BrowserHistorySlice;
    s.browserAddToHistory('https://a.com/page', 'A');
    // 同 dedupKey（尾斜杠归一）→ 视为无变化
    s.browserUpdateHistoryUrl('https://a.com/page/', 'https://a.com/page');
    // 无匹配条目 → 无变化
    s.browserUpdateHistoryUrl('https://no-such.com/x', 'https://b.com/y');
    const history = (get() as unknown as BrowserHistorySlice).browserHistory;
    expect(history).toHaveLength(1);
    expect(history[0].url).toBe('https://a.com/page');
  });

  it('preserves the better (engine-prefixed) title when deleting the old entry on redirect', () => {
    // 真实 marginalia 流程：submit 写入带引擎前缀标题的源条目 → onUrlChanged 写入
    // 占位标题的最终条目 → 检测块删除源条目。最终条目标题应为引擎前缀标题而非占位。
    const { get } = createMockStore();
    const s = get() as unknown as BrowserHistorySlice;
    s.browserAddToHistory('https://search.marginalia.nu/search?q=x', 'Marginalia: 和平');
    s.browserAddToHistory(
      'https://marginalia-search.com/search?q=x',
      'https://marginalia-search.com/search?q=x',
    );
    s.browserUpdateHistoryUrl(
      'https://search.marginalia.nu/search?q=x',
      'https://marginalia-search.com/search?q=x',
    );
    const history = (get() as unknown as BrowserHistorySlice).browserHistory;
    expect(history).toHaveLength(1);
    expect(history[0].url).toBe('https://marginalia-search.com/search?q=x');
    expect(history[0].title).toBe('Marginalia: 和平');
  });

  it('strips one-time auth token before persisting (R1-Medium)', () => {
    // dsh `?token=` 轮换：落盘必须去 token，否则凭据进 localStorage 且每次轮换分裂新条目。
    const { get } = createMockStore();
    const s = get() as unknown as BrowserHistorySlice;
    s.browserAddToHistory('http://127.0.0.1:3080/?token=abc', 'dsh');
    s.browserAddToHistory('http://127.0.0.1:3080/?token=def', 'dsh');
    const history = (get() as unknown as BrowserHistorySlice).browserHistory;
    expect(history).toHaveLength(1);
    expect(history[0].url).toBe('http://127.0.0.1:3080/');
    expect(history[0].url).not.toContain('token');
  });

  it('strips token on redirect rewrite target', () => {
    const { get } = createMockStore();
    const s = get() as unknown as BrowserHistorySlice;
    s.browserAddToHistory('http://127.0.0.1:3080/', 'dsh');
    s.browserUpdateHistoryUrl('http://127.0.0.1:3080/', 'http://127.0.0.1:3080/?token=xyz');
    const history = (get() as unknown as BrowserHistorySlice).browserHistory;
    expect(history).toHaveLength(1);
    expect(history[0].url).toBe('http://127.0.0.1:3080/');
  });

  it('only rewrites the newest matching entry, leaving older-date visits untouched', () => {
    // 最新条目被改写为最终 URL，更早的同 dedupKey 旧访问保留原始 URL。
    const { get: getState } = createMockStore();
    const store = getState() as unknown as BrowserHistorySlice;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    // 手动制造"两条不同时间的同 dedupKey 条目"（最新在前）
    const state = getState() as unknown as BrowserHistorySlice;
    state.browserHistory = [
      { id: 'newest', url: 'https://a.com/page', title: 'A', visitedAt: now },
      { id: 'older', url: 'https://a.com/page', title: 'Old Visit', visitedAt: now - dayMs },
    ];
    store.browserUpdateHistoryUrl('https://a.com/page', 'https://b.com/page');
    const history = (getState() as unknown as BrowserHistorySlice).browserHistory;
    expect(history).toHaveLength(2);
    expect(history[0].url).toBe('https://b.com/page'); // 最新被改写
    expect(history[1].url).toBe('https://a.com/page'); // 旧日期保留
  });
});
