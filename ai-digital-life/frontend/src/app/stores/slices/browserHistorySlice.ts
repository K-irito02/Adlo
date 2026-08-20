import type { StoreState } from '../StoreState';
import { createUiId, makePersistedWriter } from '../shared';
import {
  historyDedupKey,
  hasViewIdentityParam,
  historyContainerKey,
  isPlaceholderTitle,
} from '@utils/browserDisplayUtils';
import { BROWSER_HISTORY_KEY } from './browserSliceShared';
import type { BrowserHistoryState } from './browserTypes';

export type { BrowserHistoryState };

const writeHistory = makePersistedWriter(BROWSER_HISTORY_KEY);

export const BROWSER_HISTORY_STORAGE_KEY = BROWSER_HISTORY_KEY;

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
      // DEBUG(问题3): 历史条写入——记录 (url, title, dedupKey) 以追踪"笼统标题"来源
      console.warn('[browser-history] add', {
        url,
        title: newHistoryItem.title,
        dedupKey,
        today,
        filteredOutSameDay: state.browserHistory.length - filteredHistory.length,
        truncatedTo: nextHistory.length,
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
      const changed = state.browserHistory.some(
        (h) => historyDedupKey(h.url) === dedupKey && h.title !== title,
      );
      // DEBUG(问题3): 历史标题更新——记录目标 (url, title, dedupKey) 与是否变更
      console.warn('[browser-history] updateTitle', {
        url,
        title,
        dedupKey,
        changed,
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
