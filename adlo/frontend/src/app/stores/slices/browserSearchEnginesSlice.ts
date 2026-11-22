import type { StoreState } from '../StoreState';
import { pickReachableSearchEngine } from '@features/browser/searchEngineProbe';
import { persist } from '../persisted/persist';

export interface SearchEngine {
  id: string;
  name: string;
  urlTemplate: string;
  isBuiltIn: boolean;
  isDefault: boolean;
  faviconUrl?: string;
}

/**
 * 内置引擎目录：初始化时按本清单对齐已有数据（保留自定义引擎与仍存在的默认选择），
 * 因此增删内置项不需要另写迁移。`id` 由名称派生，改名等于换 id。
 */
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

/**
 * 手动选择序号（瞬态，不入 store）：启动期自动探测在途中若用户手动改选，
 * 用序号变化放弃探测结果，避免「刚选好又被后台覆盖」。
 */
let manualSelectionEpoch = 0;

function buildBuiltInEngines(): SearchEngine[] {
  return BUILT_IN_ENGINES.map((engine, index) => ({
    ...engine,
    id: engine.name.toLowerCase().replace(/\s+/g, '-'),
    isDefault: index === 0,
  }));
}

/**
 * 按代码内置清单对齐：内置项顺序/成员以常量为准，自定义引擎原样保留；
 * 默认 id 失效时回落到第一个内置引擎。
 */
function reconcileBuiltIns(
  existing: SearchEngine[],
  defaultId: string,
): { engines: SearchEngine[]; defaultId: string } {
  const builtIns = buildBuiltInEngines();
  const customEngines = existing.filter((engine) => !engine.isBuiltIn);
  const merged = [...builtIns, ...customEngines];
  const nextDefaultId = merged.some((engine) => engine.id === defaultId)
    ? defaultId
    : builtIns[0].id;
  return {
    engines: merged.map((engine) => ({ ...engine, isDefault: engine.id === nextDefaultId })),
    defaultId: nextDefaultId,
  };
}

export interface BrowserSearchEnginesSlice {
  searchEngines: SearchEngine[];
  defaultSearchEngineId: string;
  /** 是否已经完成过（自动或手动）首次选择：true 后启动期不再自动探测。 */
  searchEngineAutoSelected: boolean;
  /** 正在探测（驱动「自动选择」按钮的进行态，transient 不持久化）。 */
  searchEngineProbing: boolean;
  initializeSearchEngines: () => void;
  /** 首次启动：尚未选择过引擎时后台探测并自动选一个可达引擎；没有成功结果时保留现默认并标记已完成。 */
  ensureSearchEngineAutoSelected: () => Promise<void>;
  /** 立即探测网络并选择可达引擎（用户点「自动选择」；会覆盖当前默认）。 */
  autoSelectSearchEngine: () => Promise<void>;
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
  searchEngineAutoSelected: false,
  searchEngineProbing: false,

  initializeSearchEngines: () => {
    const existing = get().searchEngines;

    // 首次初始化：创建内置列表（此时才允许启动期自动探测）。
    if (existing.length === 0) {
      const engines = buildBuiltInEngines();
      const defaultId = engines[0].id;
      persist('adl:browser.searchEngines', engines);
      // 默认引擎 id 必须与引擎表一同落盘：否则重启后引擎表被还原、默认 id 仍为空，
      // 面板会丢失去默认引擎的选中态（旧实现由启动期读盘补上，现已无水合期回填）。
      persist('adl:browser.defaultSearchEngineId', defaultId);
      set({ searchEngines: engines, defaultSearchEngineId: defaultId });
      return;
    }

    // 已有数据（来自本次会话或构造期同步水合）：按代码清单对齐内置项。
    const currentDefaultId = get().defaultSearchEngineId;
    const { engines, defaultId } = reconcileBuiltIns(existing, currentDefaultId);
    if (currentDefaultId === defaultId && JSON.stringify(existing) === JSON.stringify(engines)) {
      return;
    }
    persist('adl:browser.searchEngines', engines);
    persist('adl:browser.defaultSearchEngineId', defaultId);
    set({ searchEngines: engines, defaultSearchEngineId: defaultId });
  },

  ensureSearchEngineAutoSelected: async () => {
    if (get().searchEngineAutoSelected) {
      return;
    }
    await get().autoSelectSearchEngine();
  },

  autoSelectSearchEngine: async () => {
    if (get().searchEngineProbing) {
      return;
    }
    const epochAtStart = manualSelectionEpoch;
    set({ searchEngineProbing: true });
    try {
      const builtIns = get().searchEngines.filter((engine) => engine.isBuiltIn);
      const chosen = await pickReachableSearchEngine(builtIns);
      // 探测期间用户手动改选：尊重用户，放弃自动结果。
      if (epochAtStart !== manualSelectionEpoch) {
        return;
      }
      if (chosen) {
        get().setDefaultSearchEngine(chosen.id);
      }
    } finally {
      set({ searchEngineProbing: false });
      if (!get().searchEngineAutoSelected) {
        persist('adl:browser.searchEngineAutoSelected', true);
        set({ searchEngineAutoSelected: true });
      }
    }
  },

  setDefaultSearchEngine: (id) => {
    manualSelectionEpoch += 1;
    set((state) => {
      const next = state.searchEngines.map((engine) => ({
        ...engine,
        isDefault: engine.id === id,
      }));
      persist('adl:browser.searchEngines', next);
      persist('adl:browser.defaultSearchEngineId', id);
      persist('adl:browser.searchEngineAutoSelected', true);
      return {
        searchEngines: next,
        defaultSearchEngineId: id,
        searchEngineAutoSelected: true,
      };
    });
  },

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
      persist('adl:browser.searchEngines', next);
      return { searchEngines: next };
    });
    return id;
  },

  updateCustomSearchEngine: (id, patch) =>
    set((state) => {
      const next = state.searchEngines.map((engine) =>
        engine.id === id ? { ...engine, ...patch } : engine,
      );
      persist('adl:browser.searchEngines', next);
      return { searchEngines: next };
    }),

  deleteCustomSearchEngine: (id) =>
    set((state) => {
      const next = state.searchEngines.filter((engine) => engine.id !== id);
      persist('adl:browser.searchEngines', next);

      // 如果删除的是当前选中的引擎，切换到第一个可用引擎
      if (state.defaultSearchEngineId === id) {
        const newDefaultId =
          next[0]?.id ?? state.searchEngines.find((engine) => engine.isBuiltIn)?.id ?? '';
        persist('adl:browser.defaultSearchEngineId', newDefaultId);
        return { searchEngines: next, defaultSearchEngineId: newDefaultId };
      }

      return { searchEngines: next };
    }),

  getDefaultSearchEngine: () => {
    const state = get();
    return (
      state.searchEngines.find((engine) => engine.id === state.defaultSearchEngineId) ??
      state.searchEngines[0]
    );
  },
});
