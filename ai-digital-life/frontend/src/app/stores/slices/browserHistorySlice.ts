import type { StoreState } from '../StoreState';
import { createUiId, createDebouncedWrite } from '../shared';

export interface BrowserHistoryState {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
}

const BROWSER_HISTORY_KEY = 'adl-ui:browser-history';

const { scheduleWrite } = createDebouncedWrite(50);

export const BROWSER_HISTORY_STORAGE_KEY = BROWSER_HISTORY_KEY;

export interface BrowserHistorySlice {
  browserHistory: BrowserHistoryState[];

  browserAddToHistory: (url: string, title: string) => void;
  browserClearHistory: () => void;
  browserUpdateHistoryTitle: (url: string, title: string) => void;
  browserDeleteHistoryByLevel: (
    level: 'label' | 'year' | 'month' | 'day',
    nodePath: string
  ) => void;
}

export const createBrowserHistorySlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): BrowserHistorySlice => ({
  browserHistory: [],

  browserAddToHistory: (url: string, title: string) => {
    set((state) => {
      const filteredHistory = state.browserHistory.filter((item) => item.url !== url);
      const newHistoryItem: BrowserHistoryState = {
        id: createUiId('history'),
        url,
        title: title || url,
        visitedAt: Date.now(),
      };
      const nextHistory = [newHistoryItem, ...filteredHistory].slice(0, 100);
      scheduleWrite(BROWSER_HISTORY_KEY, nextHistory);
      return { browserHistory: nextHistory };
    });
  },

  browserClearHistory: () => {
    scheduleWrite(BROWSER_HISTORY_KEY, []);
    set({ browserHistory: [] });
  },

  browserUpdateHistoryTitle: (url: string, title: string) => {
    set((state) => {
      const changed = state.browserHistory.some((h) => h.url === url && h.title !== title);
      if (!changed) {
        return state;
      }
      const nextHistory = state.browserHistory.map((h) => (h.url === url ? { ...h, title } : h));
      scheduleWrite(BROWSER_HISTORY_KEY, nextHistory);
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
      scheduleWrite(BROWSER_HISTORY_KEY, filtered);
      return { browserHistory: filtered };
    });
  },
});
