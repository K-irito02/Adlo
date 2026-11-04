import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBrowserSearchEnginesSlice } from '../browserSearchEnginesSlice';
import type { BrowserSearchEnginesSlice } from '../browserSearchEnginesSlice';

function createMockStore() {
  let state: Record<string, unknown> = {};
  const get = () => state as never;
  const set = (partial: unknown) => {
    if (typeof partial === 'function') {
      const next = (partial as (s: Record<string, unknown>) => Record<string, unknown>)(state);
      state = { ...state, ...next };
    } else {
      state = { ...state, ...(partial as Record<string, unknown>) };
    }
  };
  const slice = createBrowserSearchEnginesSlice(set as never, get);
  state = { ...slice };
  return { get };
}

describe('initializeSearchEngines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with 8 built-in engines', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserSearchEnginesSlice;
    slice.initializeSearchEngines();
    const state = get() as unknown as BrowserSearchEnginesSlice;
    expect(state.searchEngines).toHaveLength(8);
    expect(state.defaultSearchEngineId).toBeTruthy();
  });

  it('sets Google as default', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserSearchEnginesSlice;
    slice.initializeSearchEngines();
    const state = get() as unknown as BrowserSearchEnginesSlice;
    const defaultEngine = state.searchEngines.find((e) => e.isDefault);
    expect(defaultEngine?.name).toBe('Google');
    expect(state.defaultSearchEngineId).toBe(defaultEngine?.id);
  });

  it('marks all as built-in', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserSearchEnginesSlice;
    slice.initializeSearchEngines();
    const state = get() as unknown as BrowserSearchEnginesSlice;
    expect(state.searchEngines.every((e) => e.isBuiltIn)).toBe(true);
  });

  it('is idempotent on second call', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserSearchEnginesSlice;
    slice.initializeSearchEngines();
    slice.initializeSearchEngines();
    const state = get() as unknown as BrowserSearchEnginesSlice;
    expect(state.searchEngines).toHaveLength(8);
  });
});

describe('setDefaultSearchEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates default engine', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserSearchEnginesSlice;
    slice.initializeSearchEngines();
    const secondId = (get() as unknown as BrowserSearchEnginesSlice).searchEngines[1].id;
    slice.setDefaultSearchEngine(secondId);
    const state = get() as unknown as BrowserSearchEnginesSlice;
    expect(state.defaultSearchEngineId).toBe(secondId);
    expect(state.searchEngines[1].isDefault).toBe(true);
    expect(state.searchEngines[0].isDefault).toBe(false);
  });
});

describe('addCustomSearchEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a custom engine', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserSearchEnginesSlice;
    const id = slice.addCustomSearchEngine({
      name: 'Custom',
      urlTemplate: 'https://custom.com/search?q=%s',
      faviconUrl: 'https://custom.com/favicon.ico',
    });
    const state = get() as unknown as BrowserSearchEnginesSlice;
    expect(state.searchEngines).toHaveLength(1);
    expect(state.searchEngines[0].id).toBe(id);
    expect(state.searchEngines[0].isBuiltIn).toBe(false);
    expect(state.searchEngines[0].name).toBe('Custom');
  });
});

describe('deleteCustomSearchEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes a custom engine', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserSearchEnginesSlice;
    const id = slice.addCustomSearchEngine({
      name: 'Custom',
      urlTemplate: 'https://custom.com/search?q=%s',
    });
    expect((get() as unknown as BrowserSearchEnginesSlice).searchEngines).toHaveLength(1);
    slice.deleteCustomSearchEngine(id);
    expect((get() as unknown as BrowserSearchEnginesSlice).searchEngines).toHaveLength(0);
  });
});

describe('updateCustomSearchEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('patches an engine', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserSearchEnginesSlice;
    const id = slice.addCustomSearchEngine({
      name: 'Old',
      urlTemplate: 'https://old.com/search?q=%s',
    });
    slice.updateCustomSearchEngine(id, { name: 'New' });
    const state = get() as unknown as BrowserSearchEnginesSlice;
    expect(state.searchEngines[0].name).toBe('New');
  });
});

describe('getDefaultSearchEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the default engine after initialization', () => {
    const { get } = createMockStore();
    const slice = get() as unknown as BrowserSearchEnginesSlice;
    slice.initializeSearchEngines();
    const defaultEngine = slice.getDefaultSearchEngine();
    expect(defaultEngine.name).toBe('Google');
  });
});
