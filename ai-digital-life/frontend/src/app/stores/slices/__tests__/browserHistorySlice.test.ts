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
