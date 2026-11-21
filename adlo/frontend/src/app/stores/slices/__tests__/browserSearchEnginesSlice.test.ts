import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoreState } from '../../StoreState';
import { createBrowserSearchEnginesSlice } from '../browserSearchEnginesSlice';
import type { SearchEngine } from '../browserSearchEnginesSlice';

const pickReachableSearchEngine = vi.hoisted(() => vi.fn());

vi.mock('@features/browser/searchEngineProbe', () => ({ pickReachableSearchEngine }));

function createMockStore() {
  let state: Partial<StoreState> = {};
  const get = () => state as StoreState;
  const set = (partial: Partial<StoreState> | ((current: StoreState) => Partial<StoreState>)) => {
    const next = typeof partial === 'function' ? partial(get()) : partial;
    state = { ...state, ...next };
  };
  const slice = createBrowserSearchEnginesSlice(set, get);
  state = { ...slice };
  return {
    get,
    seed: (patch: Partial<StoreState>) => {
      state = { ...state, ...patch };
    },
  };
}

function makeEngine(id: string, isBuiltIn: boolean): SearchEngine {
  return {
    id,
    name: id,
    urlTemplate: `https://${id}.example/search?q=%s`,
    isBuiltIn,
    isDefault: false,
  };
}

describe('initializeSearchEngines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with 7 built-in engines and no Yahoo', () => {
    const { get } = createMockStore();
    get().initializeSearchEngines();
    expect(get().searchEngines).toHaveLength(7);
    expect(get().searchEngines.some((engine) => engine.id === 'yahoo')).toBe(false);
    expect(get().defaultSearchEngineId).toBeTruthy();
  });

  it('sets Google as default', () => {
    const { get } = createMockStore();
    get().initializeSearchEngines();
    const defaultEngine = get().searchEngines.find((engine) => engine.isDefault);
    expect(defaultEngine?.name).toBe('Google');
    expect(get().defaultSearchEngineId).toBe(defaultEngine?.id);
  });

  it('marks all as built-in', () => {
    const { get } = createMockStore();
    get().initializeSearchEngines();
    expect(get().searchEngines.every((engine) => engine.isBuiltIn)).toBe(true);
  });

  it('is idempotent on second call', () => {
    const { get } = createMockStore();
    get().initializeSearchEngines();
    get().initializeSearchEngines();
    expect(get().searchEngines).toHaveLength(7);
  });

  it('reconciles old built-ins: drops removed Yahoo, keeps custom engines and falls back the default', () => {
    const { get, seed } = createMockStore();
    const google: SearchEngine = {
      ...makeEngine('google', true),
      name: 'Google',
      urlTemplate: 'https://www.google.com/search?q=%s',
    };
    const yahoo = makeEngine('yahoo', true);
    const custom = makeEngine('custom-1', false);
    seed({
      searchEngines: [google, yahoo, custom],
      defaultSearchEngineId: 'yahoo',
    });

    get().initializeSearchEngines();

    expect(get().searchEngines.some((engine) => engine.id === 'yahoo')).toBe(false);
    expect(get().searchEngines.some((engine) => engine.id === 'custom-1')).toBe(true);
    expect(get().defaultSearchEngineId).toBe('google');
    expect(get().searchEngines.find((engine) => engine.isDefault)?.id).toBe('google');
  });

  it('keeps a custom engine as default when it still exists', () => {
    const { get, seed } = createMockStore();
    const custom = makeEngine('custom-1', false);
    custom.isDefault = true;
    seed({
      searchEngines: [makeEngine('google', true), custom],
      defaultSearchEngineId: 'custom-1',
    });

    get().initializeSearchEngines();

    expect(get().defaultSearchEngineId).toBe('custom-1');
    expect(get().searchEngines.find((engine) => engine.isDefault)?.id).toBe('custom-1');
  });
});

describe('setDefaultSearchEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates default engine and marks the first selection as done', () => {
    const { get } = createMockStore();
    get().initializeSearchEngines();
    const secondId = get().searchEngines[1].id;
    get().setDefaultSearchEngine(secondId);
    expect(get().defaultSearchEngineId).toBe(secondId);
    expect(get().searchEngines[1].isDefault).toBe(true);
    expect(get().searchEngines[0].isDefault).toBe(false);
    expect(get().searchEngineAutoSelected).toBe(true);
  });
});

describe('autoSelectSearchEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets the reachable engine as default and clears the probing flag', async () => {
    const { get } = createMockStore();
    get().initializeSearchEngines();
    const baidu = get().searchEngines.find((engine) => engine.name === '百度');
    pickReachableSearchEngine.mockResolvedValue(baidu);

    await get().autoSelectSearchEngine();

    expect(pickReachableSearchEngine).toHaveBeenCalledTimes(1);
    expect(get().defaultSearchEngineId).toBe(baidu?.id);
    expect(get().searchEngineAutoSelected).toBe(true);
    expect(get().searchEngineProbing).toBe(false);
  });

  it('keeps the current default but marks the first selection done when nothing is reachable', async () => {
    const { get } = createMockStore();
    get().initializeSearchEngines();
    const initialDefault = get().defaultSearchEngineId;
    pickReachableSearchEngine.mockResolvedValue(null);

    await get().autoSelectSearchEngine();

    expect(get().defaultSearchEngineId).toBe(initialDefault);
    expect(get().searchEngineAutoSelected).toBe(true);
    expect(get().searchEngineProbing).toBe(false);
  });

  it('does not override a manual choice made while probing', async () => {
    const { get } = createMockStore();
    get().initializeSearchEngines();
    let resolveProbe: (value: SearchEngine | null) => void = () => {};
    pickReachableSearchEngine.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProbe = resolve;
        }),
    );

    const pending = get().autoSelectSearchEngine();
    const manual = get().searchEngines.find((engine) => engine.name === '搜狗');
    expect(manual).toBeTruthy();
    get().setDefaultSearchEngine(manual!.id);

    resolveProbe(get().searchEngines.find((engine) => engine.name === '百度') ?? null);
    await pending;

    expect(get().defaultSearchEngineId).toBe(manual!.id);
    expect(get().searchEngineProbing).toBe(false);
  });

  it('probes and applies the chosen engine when nothing was selected yet', async () => {
    const { get } = createMockStore();
    get().initializeSearchEngines();
    const sogou = get().searchEngines.find((engine) => engine.name === '搜狗');
    pickReachableSearchEngine.mockResolvedValue(sogou);

    await get().ensureSearchEngineAutoSelected();

    expect(pickReachableSearchEngine).toHaveBeenCalledTimes(1);
    expect(get().defaultSearchEngineId).toBe(sogou?.id);
    expect(get().searchEngineAutoSelected).toBe(true);
  });

  it('does not probe again once the first selection is done', async () => {
    const { get } = createMockStore();
    get().initializeSearchEngines();
    get().setDefaultSearchEngine(get().searchEngines[0].id);

    await get().ensureSearchEngineAutoSelected();

    expect(pickReachableSearchEngine).not.toHaveBeenCalled();
  });
});

describe('addCustomSearchEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a custom engine', () => {
    const { get } = createMockStore();
    const id = get().addCustomSearchEngine({
      name: 'Custom',
      urlTemplate: 'https://custom.com/search?q=%s',
      faviconUrl: 'https://custom.com/favicon.ico',
    });
    expect(get().searchEngines).toHaveLength(1);
    expect(get().searchEngines[0].id).toBe(id);
    expect(get().searchEngines[0].isBuiltIn).toBe(false);
    expect(get().searchEngines[0].name).toBe('Custom');
  });
});

describe('deleteCustomSearchEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes a custom engine', () => {
    const { get } = createMockStore();
    const id = get().addCustomSearchEngine({
      name: 'Custom',
      urlTemplate: 'https://custom.com/search?q=%s',
    });
    expect(get().searchEngines).toHaveLength(1);
    get().deleteCustomSearchEngine(id);
    expect(get().searchEngines).toHaveLength(0);
  });
});

describe('updateCustomSearchEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('patches an engine', () => {
    const { get } = createMockStore();
    const id = get().addCustomSearchEngine({
      name: 'Old',
      urlTemplate: 'https://old.com/search?q=%s',
    });
    get().updateCustomSearchEngine(id, { name: 'New' });
    expect(get().searchEngines[0].name).toBe('New');
  });
});

describe('getDefaultSearchEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the default engine after initialization', () => {
    const { get } = createMockStore();
    get().initializeSearchEngines();
    expect(get().getDefaultSearchEngine().name).toBe('Google');
  });
});
