import type { StoreState } from '../StoreState';
import { createUiId, makePersistedWriter } from '../shared';
import { historyDedupKey } from '@utils/browserDisplayUtils';
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
      const filteredHistory = state.browserHistory.filter(
        (item) => !(historyDedupKey(item.url) === dedupKey && getDateKey(item.visitedAt) === today),
      );
      const newHistoryItem: BrowserHistoryState = {
        id: createUiId('history'),
        url,
        title: title || url,
        visitedAt: now,
      };
      const nextHistory = [newHistoryItem, ...filteredHistory].slice(0, 100);
      writeHistory(nextHistory);
      return { browserHistory: nextHistory };
    });
  },

  browserClearHistory: () => {
    writeHistory([]);
    set({ browserHistory: [] });
  },

  browserUpdateHistoryTitle: (url: string, title: string) => {
    set((state) => {
      const dedupKey = historyDedupKey(url);
      const changed = state.browserHistory.some(
        (h) => historyDedupKey(h.url) === dedupKey && h.title !== title,
      );
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
