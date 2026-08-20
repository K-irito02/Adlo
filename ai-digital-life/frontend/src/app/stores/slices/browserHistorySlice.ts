import type { StoreState } from '../StoreState';
import { createUiId, makePersistedWriter } from '../shared';
import {
  historyDedupKey,
  hasViewIdentityParam,
  historyContainerKey,
  historyDocumentKey,
  isPlaceholderTitle,
} from '@utils/browserDisplayUtils';
import { BROWSER_HISTORY_KEY } from './browserSliceShared';
import type { BrowserHistoryState } from './browserTypes';

export type { BrowserHistoryState };

const writeHistory = makePersistedWriter(BROWSER_HISTORY_KEY);

export const BROWSER_HISTORY_STORAGE_KEY = BROWSER_HISTORY_KEY;

/**
 * 同一文档（同 hostname+pathname+身份参数）导航突发合并窗口（ms）。
 * SPA（如抖音"我的"）一次点击会连续触发多次 HistoryChanged，产生仅来源/导航参数
 * 不同的 URL 变体（user/self?from_nav=1、?from_tab_name=main&showTab=like、裸 user/self），
 * 均在毫秒级到达；窗口内合并为一条（保留最新 URL 与更优标题），Chrome/Edge 同文档合并语义。
 * 超过窗口的再次访问（同 dedupKey 同日去重已存在）不受影响。
 */
export const HISTORY_COALESCE_WINDOW_MS = 2000;

export interface BrowserHistorySlice {
  browserHistory: BrowserHistoryState[];

  browserAddToHistory: (url: string, title: string) => void;
  browserClearHistory: () => void;
  browserUpdateHistoryTitle: (url: string, title: string) => void;
  browserDeleteHistoryByLevel: (
    level: 'label' | 'year' | 'month' | 'day',
    nodePath: string,
  ) => void;
  browserDeleteHistoryEntry: (entryId: string) => void;
}

function getDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

export const createBrowserHistorySlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): BrowserHistorySlice => ({
  browserHistory: [],

  browserAddToHistory: (url: string, title: string) => {
    set((state) => {
      const now = Date.now();
      const today = getDateKey(now);
      const dedupKey = historyDedupKey(url);
      const addedIsVideo = hasViewIdentityParam(url);
      const containerKey = historyContainerKey(url);

      // 同一文档（同 hostname+pathname+身份参数）在导航窗口内到达的 URL 变体：
      // SPA 一次点击的多次 HistoryChanged 产生仅来源/导航参数不同的变体，合并为一条
      // （保留最新 URL 与更优标题），避免"一次点击多条历史"。内容身份不同
      // （YouTube v=AAA→BBB、不同 modal_id/q）的变体在 historyDocumentKey 上不同，不合并。
      const newest = state.browserHistory[0];
      const docKey = historyDocumentKey(url);
      if (
        newest &&
        now - newest.visitedAt <= HISTORY_COALESCE_WINDOW_MS &&
        historyDocumentKey(newest.url) === docKey
      ) {
        const newTitleOk = !isPlaceholderTitle(title, url);
        const oldTitleOk = !isPlaceholderTitle(newest.title, newest.url);
        const mergedTitle = newTitleOk ? title : oldTitleOk ? newest.title : title || url;
        const merged: BrowserHistoryState = {
          ...newest,
          url,
          title: mergedTitle,
          visitedAt: now,
        };
        const nextHistory = [merged, ...state.browserHistory.slice(1)];
        // DEBUG(问题4): 同一文档导航突发合并——记录变体合并（前条→本条），供核对
        // "一次点击多条历史"已折叠为一条（保留最新 URL + 更优标题）。
        console.warn('[browser-history] merge', {
          url,
          title: mergedTitle,
          docKey,
          mergedFromUrl: newest.url,
          mergedFromTitle: newest.title,
          withinMs: now - newest.visitedAt,
          truncatedTo: nextHistory.length,
        });
        writeHistory(nextHistory);
        return { browserHistory: nextHistory };
      }

      const filteredHistory = state.browserHistory.filter((item) => {
        // 同日同 dedupKey：常规去重（当前行为）
        if (historyDedupKey(item.url) === dedupKey && getDateKey(item.visitedAt) === today) {
          return false;
        }
        // 写入的是携带 modal_id 的视频条目时，清掉同容器、无 modal_id 的 base
        // scaffold（feed 骨架）——历史中只保留具体视频条目，避免重复标签与基础URL跳位。
        if (
          addedIsVideo &&
          !hasViewIdentityParam(item.url) &&
          historyContainerKey(item.url) === containerKey &&
          getDateKey(item.visitedAt) === today
        ) {
          return false;
        }
        return true;
      });
      const newHistoryItem: BrowserHistoryState = {
        id: createUiId('history'),
        url,
        title: title || url,
        visitedAt: now,
      };
      const nextHistory = [newHistoryItem, ...filteredHistory].slice(0, 100);
      // DEBUG(问题3+4): 历史条写入——记录 (url, title, dedupKey) 以追踪"笼统标题"来源，
      // 并输出写入前后最近 15 条历史快照（url/title/dedupKey），用于核对"一次点击出现多条历史"
      // 到底累积了哪些 URL 变体、各自标题来源。
      const snapshotOf = (list: typeof nextHistory) =>
        list
          .slice(0, 15)
          .map((h) => ({ url: h.url, title: h.title, dedupKey: historyDedupKey(h.url) }));
      console.warn('[browser-history] add', {
        url,
        title: newHistoryItem.title,
        dedupKey,
        today,
        filteredOutSameDay: state.browserHistory.length - filteredHistory.length,
        truncatedTo: nextHistory.length,
        before: snapshotOf(state.browserHistory),
        after: snapshotOf(nextHistory),
      });
      writeHistory(nextHistory);
      return { browserHistory: nextHistory };
    });
  },

  browserClearHistory: () => {
    writeHistory([]);
    set({ browserHistory: [] });
  },

  browserUpdateHistoryTitle: (url: string, title: string) => {
    // 占位标题（空/纯URL/主机/主机+路径如 "douyin.com/jingxuan"）不覆盖已有更优标题，
    // 避免 URL 式标题污染真实/主机标题（Chrome/Edge 语义）。
    if (isPlaceholderTitle(title, url)) {
      console.warn('[browser-history] updateTitle-skip-placeholder', { url, title });
      return;
    }
    set((state) => {
      const dedupKey = historyDedupKey(url);
      const matched = state.browserHistory.filter((h) => historyDedupKey(h.url) === dedupKey);
      const changed = matched.some((h) => h.title !== title);
      // DEBUG(问题3+4): 历史标题更新——记录目标 (url, title, dedupKey)、匹配到条目的
      // 旧标题与是否变更，用于核对标题为何停留在"douyin.com"/空占位（占位门控是否拦截）。
      console.warn('[browser-history] updateTitle', {
        url,
        title,
        dedupKey,
        changed,
        matchedOldTitles: matched.map((h) => h.title),
      });
      if (!changed) {
        return state;
      }
      const nextHistory = state.browserHistory.map((h) =>
        historyDedupKey(h.url) === dedupKey ? { ...h, title } : h,
      );
      writeHistory(nextHistory);
      return { browserHistory: nextHistory };
    });
  },

  browserDeleteHistoryByLevel: (level, nodePath) => {
    set((state) => {
      let filtered: BrowserHistoryState[];
      if (level === 'label') {
        filtered = [];
      } else if (level === 'year') {
        const year = nodePath.replace('history:year:', '');
        filtered = state.browserHistory.filter((h) => {
          const d = new Date(h.visitedAt);
          return String(d.getFullYear()) !== year;
        });
      } else if (level === 'month') {
        const monthKey = nodePath.replace('history:month:', '');
        filtered = state.browserHistory.filter((h) => {
          const d = new Date(h.visitedAt);
          const y = String(d.getFullYear());
          const m = String(d.getMonth() + 1).padStart(2, '0');
          return `${y}-${m}` !== monthKey;
        });
      } else {
        const dayKey = nodePath.replace('history:day:', '');
        filtered = state.browserHistory.filter((h) => {
          const d = new Date(h.visitedAt);
          const y = String(d.getFullYear());
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dy = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dy}` !== dayKey;
        });
      }
      writeHistory(filtered);
      return { browserHistory: filtered };
    });
  },

  browserDeleteHistoryEntry: (entryId: string) => {
    set((state) => {
      const nextHistory = state.browserHistory.filter((h) => h.id !== entryId);
      if (nextHistory.length === state.browserHistory.length) {
        return state;
      }
      writeHistory(nextHistory);
      return { browserHistory: nextHistory };
    });
  },
});
