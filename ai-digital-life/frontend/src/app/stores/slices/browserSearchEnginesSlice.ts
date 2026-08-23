import type { StoreState } from '../StoreState';
import { makePersistedWriter, readJson } from '../shared';

export interface SearchEngine {
  id: string;
  name: string;
  urlTemplate: string;
  isBuiltIn: boolean;
  isDefault: boolean;
  faviconUrl?: string;
}

const BUILT_IN_ENGINES: Omit<SearchEngine, 'id'>[] = [
  {
    name: 'Google',
    urlTemplate: 'https://www.google.com/search?q=%s',
    isBuiltIn: true,
    isDefault: true,
    faviconUrl: '/search-engines/google.ico',
  },
  {
    name: 'Bing',
    urlTemplate: 'https://www.bing.com/search?q=%s',
    isBuiltIn: true,
    isDefault: false,
    faviconUrl: '/search-engines/bing.ico',
  },
  {
    name: 'DuckDuckGo',
    urlTemplate: 'https://duckduckgo.com/?q=%s',
    isBuiltIn: true,
    isDefault: false,
    faviconUrl: '/search-engines/duckduckgo.ico',
  },
  {
    name: 'Yahoo',
    urlTemplate: 'https://search.yahoo.com/search?p=%s',
    isBuiltIn: true,
    isDefault: false,
    faviconUrl: '/search-engines/yahoo.ico',
  },
  {
    name: '百度',
    urlTemplate: 'https://www.baidu.com/s?wd=%s',
    isBuiltIn: true,
    isDefault: false,
    faviconUrl: '/search-engines/baidu.ico',
  },
  {
    name: '搜狗',
    urlTemplate: 'https://www.sogou.com/web?query=%s',
    isBuiltIn: true,
    isDefault: false,
    faviconUrl: '/search-engines/sogou.ico',
  },
  {
    name: '360搜索',
    urlTemplate: 'https://www.so.com/s?q=%s',
    isBuiltIn: true,
    isDefault: false,
    faviconUrl: '/search-engines/360.ico',
  },
  {
    name: '必应中国',
    urlTemplate: 'https://cn.bing.com/search?q=%s',
    isBuiltIn: true,
    isDefault: false,
    faviconUrl: '/search-engines/cnbing.ico',
  },
];

const writeSearchEngines = makePersistedWriter('adl:browser:searchEngines');
const writeDefaultEngineId = makePersistedWriter('adl:browser:defaultSearchEngineId');

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
    if (existing.length > 0) {
      return;
    }

    // 从 localStorage 读取已保存的搜索引擎
    const savedEngines = readJson<SearchEngine[]>('adl:browser:searchEngines', []);
    
    if (savedEngines.length > 0) {
      // 使用已保存的搜索引擎
      const savedId = readJson<string>('adl:browser:defaultSearchEngineId', '');
      const savedEngine = savedEngines.find((e) => e.id === savedId);
      const defaultId = savedEngine ? savedId : savedEngines[0]?.id ?? '';
      
      set({ searchEngines: savedEngines, defaultSearchEngineId: defaultId });
      return;
    }
    
    // 首次初始化：创建内置引擎列表
    const engines: SearchEngine[] = BUILT_IN_ENGINES.map((e, idx) => ({
      ...e,
      id: e.name.toLowerCase().replace(/\s+/g, '-'),
      isDefault: idx === 0,
    }));
    writeSearchEngines(engines);

    const savedId = readJson<string>('adl:browser:defaultSearchEngineId', '');
    const savedEngine = savedId ? engines.find((e) => e.id === savedId) : undefined;
    const defaultId = savedEngine ? savedId : engines[0].id;

    set({ searchEngines: engines, defaultSearchEngineId: defaultId });
  },

  setDefaultSearchEngine: (id) =>
    set((state) => {
      const next = state.searchEngines.map((e) => ({ ...e, isDefault: e.id === id }));
      writeSearchEngines(next);
      writeDefaultEngineId(id);
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
