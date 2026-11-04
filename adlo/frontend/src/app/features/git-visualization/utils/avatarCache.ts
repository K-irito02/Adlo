import { resolveAvatarUrl } from './commitTooltipUtils';

// ── Types ──

type AvatarSource = 'github' | 'gravatar';

/** In-memory cache entry — stores Blob URL for direct <img> consumption */
interface AvatarEntry {
  blobUrl: string;
  fetchedAt: number;
  expiresAt: number;
  source: AvatarSource;
}

/** TTL cache wrapper (mirrors cacheHelpers.ts TTLCacheEntry, kept local to avoid coupling) */
interface TTLCacheEntry<V> {
  value: V;
  expiresAt: number;
}

/** IndexedDB record — stores raw Blob for persistence */
interface AvatarRecord {
  email: string;
  blob: Blob;
  fetchedAt: number;
  expiresAt: number;
  source: AvatarSource;
}

// ── Constants ──

const AVATAR_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const AVATAR_LRU_LIMIT = 200;
const AVATAR_DB_NAME = 'adl-avatars';
const AVATAR_DB_VERSION = 3;
const AVATAR_STORE = 'avatars';

// ── Email normalization ──

function normalizeEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}

// ── IndexedDB wrapper (hand-written, zero dependencies) ──

let dbPromise: Promise<IDBDatabase> | null = null;

function openAvatarDB(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(AVATAR_DB_NAME, AVATAR_DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      // Version 3: URL scheme reverted to d=retro; invalidate caches from v1/v2 by recreating the store
      if (oldVersion < 3 && db.objectStoreNames.contains(AVATAR_STORE)) {
        db.deleteObjectStore(AVATAR_STORE);
      }
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

// ── L1: In-memory cache (LRU with TTL + Blob URL revoke) ──

const avatarMemoryCache = new Map<string, TTLCacheEntry<AvatarEntry>>();

// ── Deferred Blob URL revocation ──
//
// When a cache entry is overwritten (SWR revalidate) or LRU-evicted, the old
// Blob URL may still be held by a mounted <img>. Revoking immediately would
// break the image mid-display. Instead, we schedule a deferred revoke after
// REVOKE_DELAY_MS — by then the component has either swapped to the new src
// or unmounted. This unifies the overwrite and eviction strategies: both
// defer revoke instead of one deferring and the other revoking immediately.
const REVOKE_DELAY_MS = 30000;
const pendingRevokes = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedule a Blob URL for deferred revocation. If the same URL is already
 * pending, the existing timer is kept (no double-schedule).
 */
function scheduleRevoke(blobUrl: string): void {
  if (pendingRevokes.has(blobUrl)) {
    return;
  }
  const timer = setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
    pendingRevokes.delete(blobUrl);
  }, REVOKE_DELAY_MS);
  pendingRevokes.set(blobUrl, timer);
}

/** Revoke all pending URLs immediately (used by clearAvatarCache). */
function flushPendingRevokes(): void {
  for (const timer of pendingRevokes.values()) {
    clearTimeout(timer);
  }
  for (const url of pendingRevokes.keys()) {
    URL.revokeObjectURL(url);
  }
  pendingRevokes.clear();
}

// Generation token: incremented on clearAvatarCache. Async operations
// (revalidate, inflight) capture the generation before writing; if the
// generation changes, they skip the write to avoid re-polluting a cleared cache.
let cacheGeneration = 0;

/** Revoke a single memory entry's Blob URL and delete it (deferred). */
function revokeMemoryEntry(key: string): void {
  const entry = avatarMemoryCache.get(key);
  if (entry) {
    scheduleRevoke(entry.value.blobUrl);
    avatarMemoryCache.delete(key);
  }
}

/**
 * Write/update a memory cache entry with LRU eviction.
 * Self-implemented (not reusing setCachedLruTTL) because we must manage
 * Blob URL lifecycle (schedule deferred revoke on eviction/overwrite).
 *
 * When updating an existing entry with a new blobUrl, the old URL is NOT
 * revoked immediately. The component may still be holding a reference to
 * the old blobUrl (e.g. during SWR revalidation — the stale URL is returned
 * to the component and a fresh fetch happens in the background). Revoking
 * immediately would break the <img> mid-display. Instead, the old URL is
 * scheduled for deferred revoke after REVOKE_DELAY_MS.
 *
 * LRU eviction uses the same deferred revoke strategy for consistency.
 */
function setMemoryEntry(key: string, entry: AvatarEntry): void {
  const ttlEntry: TTLCacheEntry<AvatarEntry> = {
    value: entry,
    expiresAt: Date.now() + AVATAR_TTL_MS,
  };
  // Map.set on existing key updates in place (preserves insertion order);
  // for new keys, delete-first ensures LRU move-to-end semantics
  if (avatarMemoryCache.has(key)) {
    // Schedule deferred revoke of the old blobUrl — component may still hold it
    const oldEntry = avatarMemoryCache.get(key);
    if (oldEntry) {
      scheduleRevoke(oldEntry.value.blobUrl);
    }
    avatarMemoryCache.delete(key);
  }
  avatarMemoryCache.set(key, ttlEntry);

  // LRU eviction: evict oldest entries when over capacity (deferred revoke).
  //
  // DESIGN INTENT: LRU eviction ONLY removes the entry from L1 memory and
  // schedules deferred revocation of its Blob URL. It does NOT delete the
  // corresponding L2 IndexedDB record — by design, stale/expired entries
  // are never deleted until successfully replaced by fresh data (via setAvatar,
  // which overwrites both L1 and L2). This ensures that on a future access,
  // getAvatar can recover the avatar from L2 IDB without a network request,
  // even after L1 memory eviction due to capacity pressure. L2 IDB records
  // are only removed by explicit clearAvatarCache or by being overwritten.
  while (avatarMemoryCache.size > AVATAR_LRU_LIMIT) {
    const oldestKey = avatarMemoryCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    const oldest = avatarMemoryCache.get(oldestKey);
    if (oldest) {
      scheduleRevoke(oldest.value.blobUrl);
    }
    avatarMemoryCache.delete(oldestKey);
  }
}

// ── Network fetch ──

interface FetchResult {
  blob: Blob;
  source: AvatarSource;
}

async function fetchAvatarFromNetwork(email: string, size: number): Promise<FetchResult | null> {
  const url = resolveAvatarUrl(email, size);
  if (!url) {
    return null;
  }
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    if (blob.size === 0 || !blob.type.startsWith('image/')) {
      return null;
    }
    const source: AvatarSource = url.includes('github.com') ? 'github' : 'gravatar';
    return { blob, source };
  } catch {
    return null;
  }
}

// ── Write to both L1 and L2 ──

export async function setAvatar(email: string, blob: Blob, source: AvatarSource): Promise<void> {
  const key = normalizeEmail(email);
  if (!key) {
    return;
  }

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

// ── Background revalidation (SWR) ──

const pendingRevalidations = new Set<string>();

function scheduleRevalidate(key: string, size: number): void {
  if (pendingRevalidations.has(key)) {
    return;
  }
  pendingRevalidations.add(key);
  const gen = cacheGeneration;

  // setTimeout(0) — async, does not block current render
  setTimeout(async () => {
    try {
      const result = await fetchAvatarFromNetwork(key, size);
      // Skip write if cache was cleared while we were fetching
      if (gen !== cacheGeneration) {
        return;
      }
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
 * Synchronous L1 memory cache lookup. Returns the cached Blob URL immediately
 * if the email has any entry in memory (fresh OR stale), or null on miss.
 *
 * Use this in useState initializers to avoid the pixel-avatar flicker when a
 * cached avatar is already available (e.g. during fast scroll, when rows mount
 * whose authors were already fetched by earlier rows).
 *
 * Does NOT trigger network fetch, L2 IDB lookup, or SWR revalidation. The
 * caller is responsible for invoking getAvatar() to handle staleness and
 * populate the cache on miss. Typically the component's useEffect calls
 * getAvatar() after this returns null, or a parent preload effect has already
 * populated L1 for visible rows.
 */
export function getCachedAvatarUrl(email: string): string | null {
  const key = normalizeEmail(email);
  if (!key) {
    return null;
  }
  const memEntry = avatarMemoryCache.get(key);
  if (!memEntry) {
    return null;
  }
  // Return stale OR fresh — caller's getAvatar() will handle revalidation
  return memEntry.value.blobUrl;
}

/**
 * Get avatar for an email. Returns a Blob URL string on cache hit, or null
 * when no cached data exists and network fetch fails.
 *
 * SWR semantics: expired entries return the stale Blob URL immediately and
 * trigger a background revalidation. The stale entry is NOT deleted (and its
 * Blob URL is NOT revoked) until a fresh fetch succeeds — this ensures the
 * caller's <img> keeps rendering during revalidation.
 */
export async function getAvatar(email: string, size: number): Promise<string | null> {
  const key = normalizeEmail(email);
  if (!key) {
    return null;
  }

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
  const gen = cacheGeneration;
  const result = await fetchAvatarFromNetwork(key, size);
  if (!result) {
    return null;
  }
  // Skip write if cache was cleared while we were fetching
  if (gen !== cacheGeneration) {
    return null;
  }
  await setAvatar(key, result.blob, result.source);

  // Read back from L1 (setAvatar just wrote it)
  const fresh = avatarMemoryCache.get(key);
  return fresh ? fresh.value.blobUrl : null;
}

// ── Cleanup APIs ──

/** Clear all avatar cache (memory + IndexedDB). Revokes all Blob URLs immediately. */
export async function clearAvatarCache(): Promise<void> {
  // Increment generation token so in-flight revalidations/network fetches
  // skip writing back to the cleared cache.
  cacheGeneration++;
  // Revoke all Blob URLs in memory immediately
  avatarMemoryCache.forEach((entry) => {
    URL.revokeObjectURL(entry.value.blobUrl);
  });
  avatarMemoryCache.clear();
  // Flush any pending deferred revokes as well
  flushPendingRevokes();
  pendingRevalidations.clear();
  inflight.clear();
  await idbClear();
}

/** Remove a single avatar entry by email. */
export async function evictAvatar(email: string): Promise<void> {
  const key = normalizeEmail(email);
  if (!key) {
    return;
  }
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
