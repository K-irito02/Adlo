import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAvatar,
  getCachedAvatarUrl,
  setAvatar,
  clearAvatarCache,
  evictAvatar,
  getAvatarCacheStats,
  _normalizeEmailForTest,
  _AVATAR_TTL_MS_FOR_TEST,
} from './avatarCache';
import { resolveAvatarUrl } from './commitTooltipUtils';

// ── Hand-written IndexedDB mock (zero new dependencies) ──

class MockIDBStore {
  private data = new Map<string, unknown>();

  get(key: string): IDBRequest {
    const result = this.data.get(key);
    return makeRequest(result);
  }
  put(value: { email: string }): IDBRequest {
    this.data.set(value.email, value);
    return makeRequest(undefined);
  }
  delete(key: string): IDBRequest {
    this.data.delete(key);
    return makeRequest(undefined);
  }
  clear(): IDBRequest {
    this.data.clear();
    return makeRequest(undefined);
  }
}

class MockIDBTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error: unknown = null;

  constructor(private store: MockIDBStore) {
    // Fire oncomplete on next microtask (after the caller assigns handlers)
    queueMicrotask(() => {
      if (this.oncomplete) {
        this.oncomplete();
      }
    });
  }
  objectStore(): MockIDBStore {
    return this.store;
  }
}

class MockIDBDatabase {
  objectStoreNames = { contains: () => true };
  private store = new MockIDBStore();
  transaction(): MockIDBTransaction {
    return new MockIDBTransaction(this.store);
  }
  createObjectStore(): MockIDBStore {
    return this.store;
  }
  deleteObjectStore(): void {
    // No-op in mock — store is recreated immediately after
  }
}

function makeRequest(result: unknown): IDBRequest {
  const req = {
    result,
    error: null,
    onsuccess: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };
  // Simulate async success on next microtask
  queueMicrotask(() => {
    if (req.onsuccess) {
      req.onsuccess();
    }
  });
  return req as unknown as IDBRequest;
}

// Patch global indexedDB
const mockDB = new MockIDBDatabase();
vi.stubGlobal('indexedDB', {
  open: () => {
    const req = {
      result: mockDB,
      error: null,
      onupgradeneeded: null as ((event: { oldVersion: number }) => void) | null,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    queueMicrotask(() => {
      if (req.onupgradeneeded) {
        req.onupgradeneeded({ oldVersion: 0 });
      }
      if (req.onsuccess) {
        req.onsuccess();
      }
    });
    return req as unknown as IDBOpenDBRequest;
  },
});

// Patch URL.createObjectURL/revokeObjectURL to track in test env
const createdUrls: string[] = [];
const revokedUrls: string[] = [];
vi.stubGlobal('URL', {
  ...URL,
  createObjectURL: vi.fn((_blob: Blob) => {
    const url = `blob:test/${createdUrls.length}`;
    createdUrls.push(url);
    return url;
  }),
  revokeObjectURL: vi.fn((url: string) => {
    revokedUrls.push(url);
  }),
});

// ── Tests ──

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(_normalizeEmailForTest('  Alex@Example.COM ')).toBe('alex@example.com');
  });

  it('handles empty string', () => {
    expect(_normalizeEmailForTest('')).toBe('');
  });

  it('handles undefined', () => {
    expect(_normalizeEmailForTest(undefined as unknown as string)).toBe('');
  });
});

describe('avatarCache - L1 memory cache', () => {
  beforeEach(async () => {
    await clearAvatarCache();
    createdUrls.length = 0;
    revokedUrls.length = 0;
  });

  it('returns null for empty email', async () => {
    const result = await getAvatar('', 20);
    expect(result).toBe(null);
  });

  it('stores and retrieves from L1 memory', async () => {
    const blob = new Blob(['fake-image-data'], { type: 'image/png' });
    await setAvatar('alice@example.com', blob, 'github');

    // Should hit L1 — no fetch call
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await getAvatar('alice@example.com', 20);
    expect(result).toBeTruthy();
    expect(result).toMatch(/^blob:test\//);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('retrieves the same blobUrl on repeated calls (dedup within L1)', async () => {
    const blob = new Blob(['data'], { type: 'image/png' });
    await setAvatar('bob@example.com', blob, 'gravatar');

    const r1 = await getAvatar('bob@example.com', 20);
    const r2 = await getAvatar('bob@example.com', 20);
    expect(r1).toBe(r2);
  });
});

describe('avatarCache - setAvatar', () => {
  beforeEach(async () => {
    await clearAvatarCache();
    createdUrls.length = 0;
    revokedUrls.length = 0;
  });

  it('ignores empty email', async () => {
    const blob = new Blob(['data'], { type: 'image/png' });
    await setAvatar('', blob, 'github');
    const stats = getAvatarCacheStats();
    expect(stats.memorySize).toBe(0);
  });

  it('defers revoking old blobUrl on overwrite (component may still hold it)', async () => {
    vi.useFakeTimers();
    const blob1 = new Blob(['data1'], { type: 'image/png' });
    await setAvatar('carol@example.com', blob1, 'github');
    const url1 = await getAvatar('carol@example.com', 20);

    const blob2 = new Blob(['data2'], { type: 'image/png' });
    await setAvatar('carol@example.com', blob2, 'gravatar');
    const url2 = await getAvatar('carol@example.com', 20);

    expect(url1).not.toBe(url2);
    // Old blobUrl is NOT revoked immediately — SWR revalidate returns the stale
    // URL to the component while fetching a fresh one in the background; revoking
    // immediately would break the <img> mid-display. It is scheduled for deferred
    // revoke after REVOKE_DELAY_MS (30s).
    expect(revokedUrls).not.toContain(url1);

    // After the deferred revoke delay, the old URL is revoked
    vi.advanceTimersByTime(31000);
    expect(revokedUrls).toContain(url1);
    vi.useRealTimers();
  });
});

describe('avatarCache - network fallback', () => {
  beforeEach(async () => {
    await clearAvatarCache();
    createdUrls.length = 0;
    revokedUrls.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches from network when cache misses', async () => {
    const fakeBlob = new Blob(['net-data'], { type: 'image/png' });
    // Use a plain mock response object — jsdom's Response constructor re-serializes
    // Blobs and loses the original Content-Type, breaking blob.type checks.
    const mockResponse = {
      ok: true,
      status: 200,
      blob: async () => fakeBlob,
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse as unknown as Response);

    const result = await getAvatar('dave@example.com', 32);
    expect(result).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(resolveAvatarUrl('dave@example.com', 32), {
      mode: 'cors',
    });
    fetchSpy.mockRestore();
  });

  it('returns null when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    const result = await getAvatar('eve@example.com', 20);
    expect(result).toBe(null);
  });

  it('returns null when response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('error', { status: 404 }) as Response,
    );
    const result = await getAvatar('frank@example.com', 20);
    expect(result).toBe(null);
  });

  it('returns null when blob is empty', async () => {
    const emptyBlob = new Blob([], { type: 'image/png' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(emptyBlob, { status: 200 }) as Response,
    );
    const result = await getAvatar('grace@example.com', 20);
    expect(result).toBe(null);
  });

  it('returns null when blob is not an image type', async () => {
    const textBlob = new Blob(['text'], { type: 'text/plain' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(textBlob, { status: 200 }) as Response,
    );
    const result = await getAvatar('henry@example.com', 20);
    expect(result).toBe(null);
  });
});

describe('avatarCache - in-flight deduplication', () => {
  beforeEach(async () => {
    await clearAvatarCache();
    createdUrls.length = 0;
    revokedUrls.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deduplicates concurrent requests for the same email', async () => {
    const fakeBlob = new Blob(['data'], { type: 'image/png' });
    // Use a plain mock response object — jsdom's Response constructor re-serializes
    // Blobs and loses the original Content-Type, breaking blob.type checks.
    const mockResponse = {
      ok: true,
      status: 200,
      blob: async () => fakeBlob,
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      // Add delay so both calls overlap
      await new Promise((r) => setTimeout(r, 50));
      return mockResponse as unknown as Response;
    });

    const [r1, r2] = await Promise.all([
      getAvatar('ivy@example.com', 20),
      getAvatar('ivy@example.com', 20),
    ]);

    expect(r1).toBeTruthy();
    expect(r2).toBe(r1); // same result
    expect(fetchSpy).toHaveBeenCalledTimes(1); // only one network request
    fetchSpy.mockRestore();
  });
});

describe('avatarCache - SWR (stale-while-revalidate)', () => {
  beforeEach(async () => {
    await clearAvatarCache();
    createdUrls.length = 0;
    revokedUrls.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns stale entry immediately and triggers background refresh', async () => {
    // Seed with an entry that is already expired
    const oldBlob = new Blob(['old'], { type: 'image/png' });
    await setAvatar('jack@example.com', oldBlob, 'github');

    // Manually expire the entry by backdating
    // We cannot directly mutate the Map, so we use vi.useFakeTimers
    vi.useFakeTimers();
    vi.advanceTimersByTime(_AVATAR_TTL_MS_FOR_TEST + 1000);

    const newBlob = new Blob(['new'], { type: 'image/png' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(newBlob, { status: 200 }) as Response);

    // First call — should return stale URL immediately
    const staleResult = await getAvatar('jack@example.com', 20);
    expect(staleResult).toBeTruthy();

    // Allow background revalidate to complete
    await vi.runAllTimersAsync();

    // Fetch should have been called for background refresh
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it('keeps stale entry when background refresh fails', async () => {
    const oldBlob = new Blob(['old'], { type: 'image/png' });
    await setAvatar('kate@example.com', oldBlob, 'github');

    vi.useFakeTimers();
    vi.advanceTimersByTime(_AVATAR_TTL_MS_FOR_TEST + 1000);

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const staleResult = await getAvatar('kate@example.com', 20);
    expect(staleResult).toBeTruthy(); // stale entry still returned

    await vi.runAllTimersAsync();

    // Entry should still exist in cache
    const stats = getAvatarCacheStats();
    expect(stats.memorySize).toBe(1);
    vi.useRealTimers();
  });

  it('does NOT revoke stale blobUrl returned to caller during SWR revalidate', async () => {
    // Regression test: SWR revalidate must not revoke the stale URL that was
    // handed back to the component, otherwise the <img> breaks mid-display.
    // The stale URL is scheduled for deferred revoke (30s), not revoked immediately.
    const oldBlob = new Blob(['old'], { type: 'image/png' });
    await setAvatar('leo@example.com', oldBlob, 'github');

    vi.useFakeTimers();
    vi.advanceTimersByTime(_AVATAR_TTL_MS_FOR_TEST + 1000);

    const newBlob = new Blob(['new'], { type: 'image/png' });
    // Use a plain mock response object — jsdom's Response constructor re-serializes
    // Blobs and loses the original Content-Type, breaking blob.type checks.
    const mockResponse = {
      ok: true,
      status: 200,
      blob: async () => newBlob,
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

    const staleUrl = await getAvatar('leo@example.com', 20);
    expect(staleUrl).toBeTruthy();

    // Run pending microtasks (revalidation) but NOT the 30s deferred revoke timer
    await vi.advanceTimersByTimeAsync(1000);

    // The stale URL returned to the caller must NOT have been revoked yet — the
    // component may still be rendering <img src={staleUrl}>.
    expect(revokedUrls).not.toContain(staleUrl);

    // After the full deferred revoke delay (30s), the stale URL IS revoked
    vi.advanceTimersByTime(30000);
    expect(revokedUrls).toContain(staleUrl);
    vi.useRealTimers();
  });
});

describe('avatarCache - LRU eviction', () => {
  beforeEach(async () => {
    await clearAvatarCache();
    createdUrls.length = 0;
    revokedUrls.length = 0;
  });

  it('evicts oldest entries when over capacity (deferred revoke)', async () => {
    vi.useFakeTimers();
    // Insert 3 entries (limit is 200, so we test the mechanism by checking
    // that eviction fires — for a true capacity test we'd need 201 inserts,
    // which is slow. We verify eviction logic via direct eviction instead.)
    const blob = new Blob(['d'], { type: 'image/png' });
    await setAvatar('a@x.com', blob, 'github');
    await setAvatar('b@x.com', blob, 'github');
    await setAvatar('c@x.com', blob, 'github');

    const stats = getAvatarCacheStats();
    expect(stats.memorySize).toBe(3);

    // Evicting 'a' should defer-revoke its URL
    const urlA = await getAvatar('a@x.com', 20);
    await evictAvatar('a@x.com');

    const statsAfter = getAvatarCacheStats();
    expect(statsAfter.memorySize).toBe(2);
    // Not revoked immediately — deferred
    expect(revokedUrls).not.toContain(urlA);
    // Revoked after delay
    vi.advanceTimersByTime(31000);
    expect(revokedUrls).toContain(urlA);
    vi.useRealTimers();
  });
});

describe('avatarCache - cleanup APIs', () => {
  beforeEach(async () => {
    await clearAvatarCache();
    createdUrls.length = 0;
    revokedUrls.length = 0;
  });

  it('clearAvatarCache clears memory and revokes all URLs', async () => {
    const blob = new Blob(['d'], { type: 'image/png' });
    await setAvatar('a@x.com', blob, 'github');
    await setAvatar('b@x.com', blob, 'github');

    const urlA = await getAvatar('a@x.com', 20);
    const urlB = await getAvatar('b@x.com', 20);

    await clearAvatarCache();

    const stats = getAvatarCacheStats();
    expect(stats.memorySize).toBe(0);
    expect(stats.pendingRevalidations).toBe(0);
    expect(revokedUrls).toContain(urlA);
    expect(revokedUrls).toContain(urlB);
  });

  it('evictAvatar removes single entry', async () => {
    const blob = new Blob(['d'], { type: 'image/png' });
    await setAvatar('keep@x.com', blob, 'github');
    await setAvatar('remove@x.com', blob, 'github');

    await evictAvatar('remove@x.com');

    const stillThere = await getAvatar('keep@x.com', 20);
    expect(stillThere).toBeTruthy();
    // 'remove@x.com' should miss L1 and attempt network — mock fetch to fail
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('none'));
    const gone = await getAvatar('remove@x.com', 20);
    expect(gone).toBe(null);
    vi.restoreAllMocks();
  });

  it('evictAvatar ignores empty email', async () => {
    const blob = new Blob(['d'], { type: 'image/png' });
    await setAvatar('real@x.com', blob, 'github');
    await evictAvatar('');
    const stats = getAvatarCacheStats();
    expect(stats.memorySize).toBe(1);
  });
});

describe('avatarCache - getAvatarCacheStats', () => {
  beforeEach(async () => {
    await clearAvatarCache();
  });

  it('returns zero counts on empty cache', () => {
    const stats = getAvatarCacheStats();
    expect(stats.memorySize).toBe(0);
    expect(stats.pendingRevalidations).toBe(0);
  });
});

describe('avatarCache - getCachedAvatarUrl (sync L1 lookup)', () => {
  beforeEach(async () => {
    await clearAvatarCache();
    createdUrls.length = 0;
    revokedUrls.length = 0;
  });

  it('returns null for empty email', () => {
    expect(getCachedAvatarUrl('')).toBe(null);
  });

  it('returns null when cache is empty', () => {
    expect(getCachedAvatarUrl('nobody@example.com')).toBe(null);
  });

  it('returns cached blobUrl after setAvatar', async () => {
    const blob = new Blob(['data'], { type: 'image/png' });
    await setAvatar('sync@example.com', blob, 'github');
    const result = getCachedAvatarUrl('sync@example.com');
    expect(result).toBeTruthy();
    expect(result).toMatch(/^blob:test\//);
  });

  it('is case-insensitive (normalizes email)', async () => {
    const blob = new Blob(['data'], { type: 'image/png' });
    await setAvatar('Case@Example.COM', blob, 'github');
    expect(getCachedAvatarUrl('case@example.com')).toBeTruthy();
  });
});

describe('avatarCache - LRU capacity boundary (deferred revoke)', () => {
  beforeEach(async () => {
    await clearAvatarCache();
    createdUrls.length = 0;
    revokedUrls.length = 0;
  });

  it('LRU eviction at capacity boundary defers revoke of oldest entry', async () => {
    vi.useFakeTimers();
    const blob = new Blob(['d'], { type: 'image/png' });
    // Insert 201 entries — limit is 200, so the 1st should be evicted
    const emails = Array.from({ length: 201 }, (_, i) => `user${i}@x.com`);
    for (const email of emails) {
      await setAvatar(email, blob, 'github');
    }

    // After 201 inserts, cache should be at capacity (200)
    const stats = getAvatarCacheStats();
    expect(stats.memorySize).toBe(200);

    // The first email's URL should have been evicted (deferred revoke, not yet revoked)
    const firstUrl = createdUrls[0];
    expect(revokedUrls).not.toContain(firstUrl);

    // The first email should no longer be in L1
    expect(getCachedAvatarUrl(emails[0])).toBe(null);

    // The second email should still be cached
    expect(getCachedAvatarUrl(emails[1])).toBeTruthy();

    // After the deferred revoke delay, the first URL is revoked
    vi.advanceTimersByTime(31000);
    expect(revokedUrls).toContain(firstUrl);
    vi.useRealTimers();
  });
});

describe('avatarCache - clearAvatarCache flushes pending revokes', () => {
  beforeEach(async () => {
    await clearAvatarCache();
    createdUrls.length = 0;
    revokedUrls.length = 0;
  });

  it('clearAvatarCache immediately revokes pending deferred revokes', async () => {
    vi.useFakeTimers();
    const blob1 = new Blob(['d1'], { type: 'image/png' });
    await setAvatar('overwrite@x.com', blob1, 'github');
    const url1 = createdUrls[0];

    // Overwrite — old URL enters pendingRevokes (deferred 30s)
    const blob2 = new Blob(['d2'], { type: 'image/png' });
    await setAvatar('overwrite@x.com', blob2, 'github');

    // Old URL not yet revoked (deferred)
    expect(revokedUrls).not.toContain(url1);

    // clearAvatarCache should flush pending revokes immediately
    await clearAvatarCache();
    expect(revokedUrls).toContain(url1);
    vi.useRealTimers();
  });
});
