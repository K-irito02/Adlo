import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const localStorageStore: Record<string, string> = {};
beforeEach(() => {
  Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => localStorageStore[key] ?? null,
    setItem: (key: string, value: string) => { localStorageStore[key] = value; },
    removeItem: (key: string) => { delete localStorageStore[key]; },
    clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); },
    get length() { return Object.keys(localStorageStore).length; },
    key: (i: number) => Object.keys(localStorageStore)[i] ?? null,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('favicon cache persistence', () => {
  it('should persist and restore favicon cache across module reloads', async () => {
    const mod1 = await import('../fetchPageMeta');
    mod1.setCachedFavicon('https://example.com', 'https://example.com/favicon.ico');

    vi.advanceTimersByTime(500);

    const stored = localStorage.getItem('adl-ui:browser-favicon-cache');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed['https://example.com/']).toBe('https://example.com/favicon.ico');
  });

  it('should not persist pinned entries that would exceed 200 limit', async () => {
    const mod = await import('../fetchPageMeta');
    for (let i = 0; i < 250; i++) {
      mod.setCachedFavicon(`https://site${i}.com`, `https://site${i}.com/favicon.ico`);
    }

    vi.advanceTimersByTime(500);

    const stored = localStorage.getItem('adl-ui:browser-favicon-cache');
    const parsed = JSON.parse(stored!);
    expect(Object.keys(parsed).length).toBeLessThanOrEqual(200);
  });
});
