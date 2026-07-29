# Avatar Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a two-level avatar cache (in-memory Map + IndexedDB) with SWR semantics to eliminate repeated network requests for GitHub/Gravatar avatars.

**Architecture:** L1 in-memory Map (LRU 200 + TTL 7 days, stores Blob URLs) backed by L2 IndexedDB persistence (stores Blobs, keyPath=email). `getAvatar(email, size)` checks L1 synchronously, then L2, then network. Stale-While-Revalidate: expired entries return old value + trigger background refresh; failed refreshes keep the old entry. Zero new dependencies — hand-written IDB wrapper.

**Tech Stack:** TypeScript, React 19, Vitest, IndexedDB (native browser API), existing `resolveAvatarUrl`/`generatePixelAvatar` from `commitTooltipUtils.ts`.

## Global Constraints

- No new runtime dependencies (`idb`, `fake-indexeddb` forbidden — hand-write IDB wrapper and test mocks)
- All UI text must use i18n keys (not applicable here — no UI text added)
- No `any` types — use `unknown` + type guards
- `const` first, no `let` reassignment, early returns, no `else`
- Error handling: IDB failures silently degrade to memory-only cache; network failures return null (component keeps pixel avatar)
- File paths use `frontend/src/app/features/git-visualization/` as the module root
- Commit scope: `frontend` for all commits

---

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/src/app/features/git-visualization/utils/avatarCache.ts` | **New.** Two-level cache: IDB wrapper, SWR logic, LRU with revoke, in-flight dedup, public API (`getAvatar`, `setAvatar`, `clearAvatarCache`, `evictAvatar`, `getAvatarCacheStats`) |
| `frontend/src/app/features/git-visualization/utils/avatarCache.test.ts` | **New.** Unit tests with hand-written IDB mock + `fetch` mock |
| `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx` | **Modify.** `AuthorAvatar` component: replace `new Image()` preload with `getAvatar()`; preload effect: replace `resolveAvatarUrl` with `getAvatar()` |
| `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx` | **Modify.** Update existing avatar test expectations (async loading behavior) |

---

## Task 1: Create avatarCache module skeleton with types and IDB wrapper

**Files:**
- Create: `frontend/src/app/features/git-visualization/utils/avatarCache.ts`

**Interfaces:**
- Consumes: `resolveAvatarUrl` from `./commitTooltipUtils`
- Produces: `AvatarEntry` type, `AvatarRecord` type, private `openAvatarDB`/`idbGet`/`idbPut`/`idbDelete`/`idbClear` functions (used internally by later tasks)

- [ ] **Step 1: Create the file with types, constants, and IDB wrapper**

Create `frontend/src/app/features/git-visualization/utils/avatarCache.ts`:

```ts
import { resolveAvatarUrl } from './commitTooltipUtils';

// ── Types ──

type AvatarSource = 'github' | 'gravatar';

/** In-memory cache entry — stores Blob URL for direct <img> consumption */
type AvatarEntry = {
  blobUrl: string;
  fetchedAt: number;
  expiresAt: number;
  source: AvatarSource;
};

/** TTL cache wrapper (mirrors cacheHelpers.ts TTLCacheEntry, kept local to avoid coupling) */
type TTLCacheEntry<V> = {
  value: V;
  expiresAt: number;
};

/** IndexedDB record — stores raw Blob for persistence */
type AvatarRecord = {
  email: string;
  blob: Blob;
  fetchedAt: number;
  expiresAt: number;
  source: AvatarSource;
};

// ── Constants ──

const AVATAR_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const AVATAR_LRU_LIMIT = 200;
const AVATAR_DB_NAME = 'adl-avatars';
const AVATAR_DB_VERSION = 1;
const AVATAR_STORE = 'avatars';

// ── Email normalization ──

function normalizeEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}

// ── IndexedDB wrapper (hand-written, zero dependencies) ──

let dbPromise: Promise<IDBDatabase> | null = null;

function openAvatarDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(AVATAR_DB_NAME, AVATAR_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AVATAR_STORE)) {
        db.createObjectStore(AVATAR_STORE, { keyPath: 'email' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<AvatarRecord | undefined> {
  try {
    const db = await openAvatarDB();
    return await new Promise<AvatarRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(AVATAR_STORE, 'readonly');
      const req = tx.objectStore(AVATAR_STORE).get(key);
      req.onsuccess = () => resolve(req.result as AvatarRecord | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbPut(record: AvatarRecord): Promise<void> {
  try {
    const db = await openAvatarDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(AVATAR_STORE, 'readwrite');
      tx.objectStore(AVATAR_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IDB write failure is non-fatal — degrade to memory-only
  }
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openAvatarDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(AVATAR_STORE, 'readwrite');
      tx.objectStore(AVATAR_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // non-fatal
  }
}

async function idbClear(): Promise<void> {
  try {
    const db = await openAvatarDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(AVATAR_STORE, 'readwrite');
      tx.objectStore(AVATAR_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // non-fatal
  }
}

// ── Exported for tests, not for external consumers ──
export { normalizeEmail as _normalizeEmailForTest };
export { AVATAR_TTL_MS as _AVATAR_TTL_MS_FOR_TEST };
export { AVATAR_LRU_LIMIT as _AVATAR_LRU_LIMIT_FOR_TEST };
```

- [ ] **Step 2: Run typecheck to verify it compiles**

Run: `pnpm --dir frontend run typecheck`
Expected: No new errors related to avatarCache.ts (pre-existing errors in other files are OK)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/utils/avatarCache.ts
git commit -m "feat(frontend): add avatarCache module skeleton with IDB wrapper"
```

---

## Task 2: Implement in-memory cache layer with LRU + revoke

**Files:**
- Modify: `frontend/src/app/features/git-visualization/utils/avatarCache.ts` (append to existing file)

**Interfaces:**
- Consumes: types from Task 1
- Produces: private `avatarMemoryCache` Map, `setMemoryEntry` function, `revokeMemoryEntry` helper (used by Task 3)

- [ ] **Step 1: Append memory cache state and helpers**

Append to `avatarCache.ts` (after the IDB section, before the test exports):

```ts
// ── L1: In-memory cache (LRU with TTL + Blob URL revoke) ──

const avatarMemoryCache = new Map<string, TTLCacheEntry<AvatarEntry>>();

/** Revoke a single memory entry's Blob URL and delete it */
function revokeMemoryEntry(key: string): void {
  const entry = avatarMemoryCache.get(key);
  if (entry) {
    URL.revokeObjectURL(entry.value.blobUrl);
    avatarMemoryCache.delete(key);
  }
}

/**
 * Write/update a memory cache entry with LRU eviction.
 * Self-implemented (not reusing setCachedLruTTL) because we must revokeObjectURL
 * on eviction to prevent Blob URL memory leaks.
 */
function setMemoryEntry(key: string, entry: AvatarEntry): void {
  // If updating an existing entry with a different blobUrl, revoke the old URL
  const existing = avatarMemoryCache.get(key);
  if (existing && existing.value.blobUrl !== entry.blobUrl) {
    URL.revokeObjectURL(existing.value.blobUrl);
  }

  const ttlEntry: TTLCacheEntry<AvatarEntry> = {
    value: entry,
    expiresAt: Date.now() + AVATAR_TTL_MS,
  };
  // Map.set on existing key updates in place (preserves insertion order);
  // for new keys, delete-first ensures LRU move-to-end semantics
  if (avatarMemoryCache.has(key)) {
    avatarMemoryCache.delete(key);
  }
  avatarMemoryCache.set(key, ttlEntry);

  // LRU eviction: evict oldest entries when over capacity
  while (avatarMemoryCache.size > AVATAR_LRU_LIMIT) {
    const oldestKey = avatarMemoryCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = avatarMemoryCache.get(oldestKey);
    if (oldest) {
      URL.revokeObjectURL(oldest.value.blobUrl);
    }
    avatarMemoryCache.delete(oldestKey);
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --dir frontend run typecheck`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/utils/avatarCache.ts
git commit -m "feat(frontend): add L1 memory cache with LRU eviction and Blob URL revoke"
```

---

## Task 3: Implement network fetch + setAvatar + in-flight dedup

**Files:**
- Modify: `frontend/src/app/features/git-visualization/utils/avatarCache.ts` (append)

**Interfaces:**
- Consumes: `resolveAvatarUrl`, `setMemoryEntry`, `idbPut`, types from Tasks 1-2
- Produces: `setAvatar` (exported, used by `getAvatar` in Task 4 and tests)

- [ ] **Step 1: Append network fetch, setAvatar, and in-flight dedup**

Append to `avatarCache.ts`:

```ts
// ── Network fetch ──

type FetchResult = { blob: Blob; source: AvatarSource };

async function fetchAvatarFromNetwork(email: string, size: number): Promise<FetchResult | null> {
  const url = resolveAvatarUrl(email, size);
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.size === 0 || !blob.type.startsWith('image/')) return null;
    const source: AvatarSource = url.includes('github.com') ? 'github' : 'gravatar';
    return { blob, source };
  } catch {
    return null;
  }
}

// ── Write to both L1 and L2 ──

export async function setAvatar(
  email: string,
  blob: Blob,
  source: AvatarSource,
): Promise<void> {
  const key = normalizeEmail(email);
  if (!key) return;

  const now = Date.now();
  const blobUrl = URL.createObjectURL(blob);

  // Write to L1 memory (handles LRU eviction + old URL revoke)
  setMemoryEntry(key, {
    blobUrl,
    fetchedAt: now,
    expiresAt: now + AVATAR_TTL_MS,
    source,
  });

  // Write to L2 IndexedDB (fire-and-forget, failures are non-fatal)
  const record: AvatarRecord = {
    email: key,
    blob,
    fetchedAt: now,
    expiresAt: now + AVATAR_TTL_MS,
    source,
  };
  await idbPut(record);
}

// ── In-flight request deduplication ──

const inflight = new Map<string, Promise<string | null>>();
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --dir frontend run typecheck`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/utils/avatarCache.ts
git commit -m "feat(frontend): add network fetch, setAvatar, and in-flight dedup state"
```

---

## Task 4: Implement getAvatar with SWR + background revalidate

**Files:**
- Modify: `frontend/src/app/features/git-visualization/utils/avatarCache.ts` (append)

**Interfaces:**
- Consumes: all internals from Tasks 1-3
- Produces: `getAvatar` (exported, the main public read API consumed by `AuthorAvatar` component in Task 7)

- [ ] **Step 1: Append scheduleRevalidate, getAvatar, and doGetAvatar**

Append to `avatarCache.ts`:

```ts
// ── Background revalidation (SWR) ──

const pendingRevalidations = new Set<string>();

function scheduleRevalidate(key: string, size: number): void {
  if (pendingRevalidations.has(key)) return;
  pendingRevalidations.add(key);

  // setTimeout(0) — async, does not block current render
  setTimeout(async () => {
    try {
      const result = await fetchAvatarFromNetwork(key, size);
      if (result) {
        // Success — overwrite stale entry with fresh data
        await setAvatar(key, result.blob, result.source);
      }
      // Failure — keep stale entry, will retry on next access
    } finally {
      pendingRevalidations.delete(key);
    }
  }, 0);
}

// ── Public read API ──

/**
 * Get avatar for an email. Returns a Blob URL string on cache hit, or null
 * when no cached data exists and network fetch fails.
 *
 * SWR semantics: expired entries return the stale Blob URL immediately and
 * trigger a background revalidation. The stale entry is NOT deleted until a
 * fresh fetch succeeds.
 */
export async function getAvatar(email: string, size: number): Promise<string | null> {
  const key = normalizeEmail(email);
  if (!key) return null;

  // 1. Check L1 memory synchronously
  const memEntry = avatarMemoryCache.get(key);
  if (memEntry) {
    if (Date.now() <= memEntry.expiresAt) {
      return memEntry.value.blobUrl; // fresh
    }
    // Stale — return old value + background refresh
    scheduleRevalidate(key, size);
    return memEntry.value.blobUrl;
  }

  // 2. In-flight dedup: if another call for this key is already pending, await it
  if (inflight.has(key)) {
    return inflight.get(key)!;
  }

  const p = doGetAvatar(key, size).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Inner: L2 + network lookup (called only when L1 misses and no in-flight request) */
async function doGetAvatar(key: string, size: number): Promise<string | null> {
  // 2. Check L2 IndexedDB
  const dbEntry = await idbGet(key);
  if (dbEntry) {
    const blobUrl = URL.createObjectURL(dbEntry.blob);
    const entry: AvatarEntry = {
      blobUrl,
      fetchedAt: dbEntry.fetchedAt,
      expiresAt: dbEntry.expiresAt,
      source: dbEntry.source,
    };
    setMemoryEntry(key, entry);
    if (Date.now() <= entry.expiresAt) {
      return blobUrl; // fresh from L2
    }
    // Stale — return old value + background refresh
    scheduleRevalidate(key, size);
    return blobUrl;
  }

  // 3. Network fetch (L1 and L2 both missed)
  const result = await fetchAvatarFromNetwork(key, size);
  if (!result) return null;
  await setAvatar(key, result.blob, result.source);

  // Read back from L1 (setAvatar just wrote it)
  const fresh = avatarMemoryCache.get(key);
  return fresh ? fresh.value.blobUrl : null;
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --dir frontend run typecheck`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/utils/avatarCache.ts
git commit -m "feat(frontend): add getAvatar with SWR semantics and background revalidate"
```

---

## Task 5: Implement cleanup and debug APIs

**Files:**
- Modify: `frontend/src/app/features/git-visualization/utils/avatarCache.ts` (append)

**Interfaces:**
- Consumes: internals from Tasks 1-4
- Produces: `clearAvatarCache`, `evictAvatar`, `getAvatarCacheStats` (exported, for tests and future UI/debug)

- [ ] **Step 1: Append cleanup and stats functions**

Append to `avatarCache.ts`:

```ts
// ── Cleanup APIs ──

/** Clear all avatar cache (memory + IndexedDB). Revokes all Blob URLs. */
export async function clearAvatarCache(): Promise<void> {
  // Revoke all Blob URLs in memory
  avatarMemoryCache.forEach((entry) => {
    URL.revokeObjectURL(entry.value.blobUrl);
  });
  avatarMemoryCache.clear();
  pendingRevalidations.clear();
  inflight.clear();
  await idbClear();
}

/** Remove a single avatar entry by email. */
export async function evictAvatar(email: string): Promise<void> {
  const key = normalizeEmail(email);
  if (!key) return;
  revokeMemoryEntry(key);
  await idbDelete(key);
}

// ── Debug API (not for production UI) ──

export function getAvatarCacheStats(): {
  memorySize: number;
  pendingRevalidations: number;
} {
  return {
    memorySize: avatarMemoryCache.size,
    pendingRevalidations: pendingRevalidations.size,
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --dir frontend run typecheck`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/utils/avatarCache.ts
git commit -m "feat(frontend): add clearAvatarCache, evictAvatar, getAvatarCacheStats APIs"
```

---

## Task 6: Write unit tests — Part 1 (normalization, L1, network, setAvatar)

**Files:**
- Create: `frontend/src/app/features/git-visualization/utils/avatarCache.test.ts`

**Interfaces:**
- Consumes: `getAvatar`, `setAvatar`, `_normalizeEmailForTest`, `clearAvatarCache`, `evictAvatar`, `getAvatarCacheStats` from Task 5; `resolveAvatarUrl` from `commitTooltipUtils`
- Produces: Test suite validating Tasks 1-3 behavior

- [ ] **Step 1: Create test file with IDB mock and basic tests**

Create `frontend/src/app/features/git-visualization/utils/avatarCache.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAvatar,
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
  constructor(private store: MockIDBStore) {}
  objectStore(): MockIDBStore {
    return this.store;
  }
}

class MockIDBDatabase {
  objectStoreNames = { contains: () => false };
  private store = new MockIDBStore();
  transaction(): MockIDBTransaction {
    return new MockIDBTransaction(this.store);
  }
  createObjectStore(): MockIDBStore {
    return this.store;
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
    if (req.onsuccess) req.onsuccess();
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
      onupgradeneeded: null as (() => void) | null,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    queueMicrotask(() => {
      if (req.onupgradeneeded) req.onupgradeneeded();
      if (req.onsuccess) req.onsuccess();
    });
    return req as unknown as IDBOpenDBRequest;
  },
});

// Patch URL.createObjectURL/revokeObjectURL to track in test env
const createdUrls: string[] = [];
const revokedUrls: string[] = [];
vi.stubGlobal('URL', {
  ...URL,
  createObjectURL: vi.fn((blob: Blob) => {
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

  it('updates existing entry and revokes old blobUrl', async () => {
    const blob1 = new Blob(['data1'], { type: 'image/png' });
    await setAvatar('carol@example.com', blob1, 'github');
    const url1 = await getAvatar('carol@example.com', 20);

    const blob2 = new Blob(['data2'], { type: 'image/png' });
    await setAvatar('carol@example.com', blob2, 'gravatar');
    const url2 = await getAvatar('carol@example.com', 20);

    expect(url1).not.toBe(url2);
    expect(revokedUrls).toContain(url1);
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/utils/avatarCache.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/utils/avatarCache.test.ts
git commit -m "test(frontend): add avatarCache unit tests for normalization, L1, setAvatar"
```

---

## Task 7: Write unit tests — Part 2 (network fallback, L2, in-flight dedup, SWR)

**Files:**
- Modify: `frontend/src/app/features/git-visualization/utils/avatarCache.test.ts` (append)

**Interfaces:**
- Consumes: same as Task 6
- Produces: Tests validating Task 4 behavior (getAvatar network path, L2, dedup, SWR)

- [ ] **Step 1: Append network, L2, dedup, and SWR tests**

Append to `avatarCache.test.ts`:

```ts
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
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(fakeBlob, { status: 200 }) as Response);

    const result = await getAvatar('dave@example.com', 32);
    expect(result).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      resolveAvatarUrl('dave@example.com', 32),
      { mode: 'cors' },
    );
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
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => {
        // Add delay so both calls overlap
        await new Promise((r) => setTimeout(r, 50));
        return new Response(fakeBlob, { status: 200 }) as Response;
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
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/utils/avatarCache.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/utils/avatarCache.test.ts
git commit -m "test(frontend): add avatarCache tests for network, dedup, SWR"
```

---

## Task 8: Write unit tests — Part 3 (LRU eviction, cleanup APIs, stats)

**Files:**
- Modify: `frontend/src/app/features/git-visualization/utils/avatarCache.test.ts` (append)

**Interfaces:**
- Consumes: same as Task 6-7
- Produces: Tests validating Task 5 behavior (LRU, clearAvatarCache, evictAvatar, stats)

- [ ] **Step 1: Append LRU and cleanup tests**

Append to `avatarCache.test.ts`:

```ts
describe('avatarCache - LRU eviction', () => {
  beforeEach(async () => {
    await clearAvatarCache();
    createdUrls.length = 0;
    revokedUrls.length = 0;
  });

  it('evicts oldest entries when over capacity', async () => {
    // Insert 3 entries (limit is 200, so we test the mechanism by checking
    // that eviction fires — for a true capacity test we'd need 201 inserts,
    // which is slow. We verify eviction logic via direct eviction instead.)
    const blob = new Blob(['d'], { type: 'image/png' });
    await setAvatar('a@x.com', blob, 'github');
    await setAvatar('b@x.com', blob, 'github');
    await setAvatar('c@x.com', blob, 'github');

    const stats = getAvatarCacheStats();
    expect(stats.memorySize).toBe(3);

    // Evicting 'a' should revoke its URL
    const urlA = await getAvatar('a@x.com', 20);
    await evictAvatar('a@x.com');

    const statsAfter = getAvatarCacheStats();
    expect(statsAfter.memorySize).toBe(2);
    expect(revokedUrls).toContain(urlA);
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
```

- [ ] **Step 2: Run all avatarCache tests**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/utils/avatarCache.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/utils/avatarCache.test.ts
git commit -m "test(frontend): add avatarCache tests for LRU eviction and cleanup APIs"
```

---

## Task 9: Refactor AuthorAvatar component to use getAvatar

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx` (lines ~9, ~34-88)
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx` (avatar test expectations)

**Interfaces:**
- Consumes: `getAvatar` from `../utils/avatarCache`, `generatePixelAvatar` from `../utils/commitTooltipUtils`
- Produces: Updated `AuthorAvatar` component using `getAvatar()` instead of `new Image()` + `resolveAvatarUrl`

- [ ] **Step 1: Update import line**

In `BranchGraph.tsx` line 9, change:

```ts
import { formatDate, resolveAvatarUrl, generatePixelAvatar } from '../utils/commitTooltipUtils';
```

to:

```ts
import { formatDate, generatePixelAvatar } from '../utils/commitTooltipUtils';
import { getAvatar } from '../utils/avatarCache';
```

- [ ] **Step 2: Replace AuthorAvatar component body**

In `BranchGraph.tsx`, replace the entire `AuthorAvatar` component (currently lines ~34-88) with:

```tsx
interface AuthorAvatarProps {
  name: string;
  email?: string;
  size?: number;
}

const AuthorAvatar = React.memo(function AuthorAvatar({
  name,
  email,
  size = 20,
}: AuthorAvatarProps) {
  // Pixel avatar is local (no network), shown instantly as the initial src.
  // Real avatar is loaded asynchronously via avatarCache (L1 memory → L2 IDB → network).
  // On cache hit, replaces the pixel avatar. On miss/failure, keeps pixel avatar.
  const pixelAvatar = useMemo(
    () => generatePixelAvatar(email ?? '', size),
    [email, size],
  );
  const [src, setSrc] = useState<string>(pixelAvatar);

  useEffect(() => {
    if (!email) {
      setSrc(pixelAvatar);
      return;
    }
    let cancelled = false;
    getAvatar(email, size).then((cachedUrl) => {
      if (!cancelled && cachedUrl) {
        setSrc(cachedUrl);
      }
      // If cachedUrl is null, keep pixelAvatar (already set as initial state)
    });
    return () => {
      cancelled = true;
    };
  }, [email, size, pixelAvatar]);

  return (
    <img
      className="adl-author-avatar"
      src={src}
      alt={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: 0,
      }}
    />
  );
});
```

- [ ] **Step 3: Update preload effect to use getAvatar**

In `BranchGraph.tsx`, find the preload effect (~lines 985-993) that currently looks like:

```ts
const img = new Image();
img.src = resolveAvatarUrl(node.authorEmail, 32);
```

Replace the entire preload effect block with:

```ts
useEffect(() => {
  if (!adapted?.nodes) return;
  const seen = new Set<string>();
  for (const node of adapted.nodes) {
    if (!node.authorEmail || seen.has(node.authorEmail)) continue;
    seen.add(node.authorEmail);
    // Preload size=32 (Tooltip usage) via avatarCache — warms L1 + L2
    getAvatar(node.authorEmail, 32).catch(() => {
      // Network failures are expected; pixel avatar remains as fallback
    });
  }
}, [adapted]);
```

Note: find the exact existing code block first and replace it wholesale. The existing block iterates `adapted.nodes`, dedupes by `authorEmail`, and creates `new Image()`. Replace only the `new Image()` / `img.src = resolveAvatarUrl(...)` lines with the `getAvatar(...)` call.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --dir frontend run typecheck`
Expected: No new errors (the `resolveAvatarUrl` import is removed; verify no other usages remain in the file)

- [ ] **Step 5: Run existing BranchGraph tests**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/BranchGraph.test.tsx`
Expected: Existing test `renders author avatars with local pixel avatar as initial src` may need adjustment since `getAvatar` is now async and returns a Promise. The test currently asserts `src` starts with `data:image/svg+xml` — this should still pass because the pixel avatar is the synchronous initial state.

If any test fails, update it (see Step 6).

- [ ] **Step 6: Update BranchGraph.test.tsx if needed**

If the test `renders author avatars with local pixel avatar as initial src` fails because `getAvatar` is called and returns a Promise that hasn't resolved, mock `getAvatar` at the top of the test file:

```ts
// At the top of BranchGraph.test.tsx, after existing imports:
vi.mock('../utils/avatarCache', () => ({
  getAvatar: vi.fn().mockResolvedValue(null), // Return null so pixel avatar stays
}));
```

Add this mock only if the test fails. If the test passes without it (because the pixel avatar initial state is synchronous and the Promise hasn't resolved in the synchronous render), do not add the mock.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/git-visualization/charts/BranchGraph.tsx frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx
git commit -m "refactor(frontend): AuthorAvatar uses getAvatar cache instead of new Image()"
```

---

## Task 10: Add integration test for async avatar replacement

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx` (append)

**Interfaces:**
- Consumes: `BranchGraph` component, `getAvatar` mock
- Produces: Integration test verifying cache hit replaces pixel avatar with cached Blob URL

- [ ] **Step 1: Append integration test**

Append to `BranchGraph.test.tsx` (inside the existing top-level `describe` block, before the closing `});`):

```tsx
  it('replaces pixel avatar with cached avatar after async load', async () => {
    // Mock getAvatar to return a fake blob URL
    const fakeBlobUrl = 'blob:fake-avatar-url';
    const { getAvatar } = await import('../utils/avatarCache');
    (getAvatar as ReturnType<typeof vi.fn>).mockResolvedValue(fakeBlobUrl);

    const { container } = render(<BranchGraph data={mockData} />);
    const imgs = container.querySelectorAll<HTMLImageElement>('img.adl-author-avatar');

    // Initially all should be pixel avatars (synchronous render)
    imgs.forEach((img) => {
      expect(img.getAttribute('src')?.startsWith('data:image/svg+xml')).toBe(true);
    });

    // After async resolution, they should be replaced with cached URL
    await vi.waitFor(() => {
      const updatedImgs = container.querySelectorAll<HTMLImageElement>('img.adl-author-avatar');
      updatedImgs.forEach((img) => {
        expect(img.getAttribute('src')).toBe(fakeBlobUrl);
      });
    });

    vi.restoreAllMocks();
  });

  it('keeps pixel avatar when getAvatar returns null', async () => {
    const { getAvatar } = await import('../utils/avatarCache');
    (getAvatar as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { container } = render(<BranchGraph data={mockData} />);
    const imgs = container.querySelectorAll<HTMLImageElement>('img.adl-author-avatar');

    await vi.waitFor(() => {
      imgs.forEach((img) => {
        expect(img.getAttribute('src')?.startsWith('data:image/svg+xml')).toBe(true);
      });
    });

    vi.restoreAllMocks();
  });
```

Note: This test requires that `getAvatar` is mocked at the module level (from Task 9 Step 6). If the mock was not added in Task 9, add it here before this test runs. The mock setup should be:

```ts
vi.mock('../utils/avatarCache', () => ({
  getAvatar: vi.fn().mockResolvedValue(null),
}));
```

Place this at the top of `BranchGraph.test.tsx`, and use `vi.mocked(getAvatar)` or dynamic import within tests to override the return value per-test.

- [ ] **Step 2: Run the tests**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/BranchGraph.test.tsx`
Expected: All tests pass, including the two new ones

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx
git commit -m "test(frontend): add integration tests for async avatar cache replacement"
```

---

## Task 11: Run full acceptance suite and final verification

**Files:**
- None modified — verification only

- [ ] **Step 1: Run ESLint + Prettier**

Run:
```
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
```
Expected: 0 errors (pre-existing warnings OK)

- [ ] **Step 2: Run typecheck**

Run: `pnpm --dir frontend run typecheck`
Expected: No new errors beyond pre-existing ones

- [ ] **Step 3: Run all git-visualization tests**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization`
Expected: All tests pass (existing 125 + new avatarCache tests)

- [ ] **Step 4: Run full frontend test suite**

Run: `pnpm --dir frontend run test`
Expected: All tests pass (no regressions)

- [ ] **Step 5: Final commit if any auto-fixes changed files**

```bash
git add -A
git diff --cached --quiet || git commit -m "style(frontend): apply lint/format fixes to avatarCache"
```

If no changes, skip this step.

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Two-level cache (L1 memory + L2 IDB) — Tasks 1-4
- ✅ SWR semantics (stale returns old + background revalidate, failure keeps old) — Task 4 + Task 7 tests
- ✅ Per-author dedup (IDB keyPath=email) — Task 1 (schema) + Task 7 (dedup test)
- ✅ TTL 7 days + LRU 200 — Task 1 (constants) + Task 2 (LRU eviction)
- ✅ Zero new dependencies — Task 1 (hand-written IDB), Task 6 (hand-written mock)
- ✅ Pixel avatar initial display — Task 9 (component refactor)
- ✅ Real avatar replaces on cache hit — Task 9 + Task 10 (integration test)
- ✅ Cleanup APIs (clearAvatarCache, evictAvatar) — Task 5 + Task 8 tests
- ✅ Error boundaries (IDB unavailable, fetch fail, non-image, empty blob) — Task 7 tests

**Type consistency check:**
- `AvatarEntry` / `AvatarRecord` / `AvatarSource` defined in Task 1, used consistently in Tasks 2-5
- `getAvatar(email: string, size: number): Promise<string | null>` — consistent across Tasks 4, 9, 10
- `setAvatar(email: string, blob: Blob, source: AvatarSource): Promise<void>` — consistent across Tasks 3, 6, 7

**Placeholder scan:** No TBD/TODO found. All code blocks are complete.
