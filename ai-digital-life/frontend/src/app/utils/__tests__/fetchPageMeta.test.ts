import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('fetchPageMeta pure fetch', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('__TAURI_INTERNALS__', undefined);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  });

  it('returns null for non-http urls', async () => {
    const mod = await import('../fetchPageMeta');
    expect(await mod.fetchPageMeta('about:blank')).toBeNull();
    expect(await mod.prefetchPageMeta('file:///x')).toBeNull();
  });

  it('fetchPageMeta returns null when the request hangs past the 5s timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    const mod = await import('../fetchPageMeta');
    const pending = mod.fetchPageMeta('https://hang.example');
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toBeNull();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
