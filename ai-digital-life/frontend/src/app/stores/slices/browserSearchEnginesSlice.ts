import type { StoreState } from '../StoreState';
import { makePersistedWriter } from '../shared';

export interface SearchEngine {
  id: string;
  name: string;
  urlTemplate: string;
  isBuiltIn: boolean;
  isDefault: boolean;
  faviconUrl?: string;
}

const BUILT_IN_ENGINES: Omit<SearchEngine, 'id'>[] = [
  { name: 'Google', urlTemplate: 'https://www.google.com/search?q=%s', isBuiltIn: true, isDefault: true, faviconUrl: '/search-engines/google.ico' },
  { name: 'Bing', urlTemplate: 'https://www.bing.com/search?q=%s', isBuiltIn: true, isDefault: false, faviconUrl: '/search-engines/bing.ico' },
  { name: 'DuckDuckGo', urlTemplate: 'https://duckduckgo.com/?q=%s', isBuiltIn: true, isDefault: false, faviconUrl: '/search-engines/duckduckgo.ico' },
  { name: 'Yahoo', urlTemplate: 'https://search.yahoo.com/search?p=%s', isBuiltIn: true, isDefault: false, faviconUrl: '/search-engines/yahoo.ico' },
  { name: '百度', urlTemplate: 'https://www.baidu.com/s?wd=%s', isBuiltIn: true, isDefault: false, faviconUrl: '/search-engines/baidu.ico' },
  { name: '搜狗', urlTemplate: 'https://www.sogou.com/web?query=%s', isBuiltIn: true, isDefault: false, faviconUrl: '/search-engines/sogou.ico' },
  { name: '360搜索', urlTemplate: 'https://www.so.com/s?q=%s', isBuiltIn: true, isDefault: false, faviconUrl: '/search-engines/360.ico' },
  { name: '必应中国', urlTemplate: 'https://cn.bing.com/search?q=%s', isBuiltIn: true, isDefault: false, faviconUrl: '/search-engines/cnbing.ico' },
];

const writeSearchEngines = makePersistedWriter('adl:browser:searchEngines');

export interface BrowserSearchEnginesSlice {
  searchEngines: SearchEngine[];
  defaultSearchEngineId: string;
  initializeSearchEngines: () => void;
  setDefaultSearchEngine: (id: string) => void;
  addCustomSearchEngine: (engine: Omit<SearchEngine, 'id' | 'isBuiltIn' | 'isDefault'>) => string;
  updateCustomSearchEngine: (id: string, patch: Partial<SearchEngine>) => void;
  deleteCustomSearchEngine: (id: string) => void;
  getDefaultSearchEngine: () => SearchEngine;
}

export const createBrowserSearchEnginesSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): BrowserSearchEnginesSlice => ({
  searchEngines: [],
  defaultSearchEngineId: '',

  initializeSearchEngines: () => {
    const existing = get().searchEngines;
    if (existing.length > 0) return;
    const engines: SearchEngine[] = BUILT_IN_ENGINES.map((e, idx) => ({
      ...e,
      id: e.name.toLowerCase().replace(/\s+/g, '-'),
      isDefault: idx === 0,
    }));
    writeSearchEngines(engines);
    set({ searchEngines: engines, defaultSearchEngineId: engines[0].id });
  },

  setDefaultSearchEngine: (id) =>
    set((state) => {
      const next = state.searchEngines.map((e) => ({ ...e, isDefault: e.id === id }));
      writeSearchEngines(next);
      return { searchEngines: next, defaultSearchEngineId: id };
    }),

  addCustomSearchEngine: (engine) => {
    let id = '';
    set((state) => {
      id = `custom-${Date.now()}`;
      const newEngine: SearchEngine = {
        id,
        name: engine.name,
        urlTemplate: engine.urlTemplate,
        isBuiltIn: false,
        isDefault: false,
        faviconUrl: engine.faviconUrl,
      };
      const next = [...state.searchEngines, newEngine];
      writeSearchEngines(next);
      return { searchEngines: next };
    });
    return id;
  },

  updateCustomSearchEngine: (id, patch) =>
    set((state) => {
      const next = state.searchEngines.map((e) => (e.id === id ? { ...e, ...patch } : e));
      writeSearchEngines(next);
      return { searchEngines: next };
    }),

  deleteCustomSearchEngine: (id) =>
    set((state) => {
      const next = state.searchEngines.filter((e) => e.id !== id);
      writeSearchEngines(next);
      return { searchEngines: next };
    }),

  getDefaultSearchEngine: () => {
    const state = get();
    return (
      state.searchEngines.find((e) => e.id === state.defaultSearchEngineId) ??
      state.searchEngines[0]
    );
  },
});
