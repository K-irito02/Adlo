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
});
