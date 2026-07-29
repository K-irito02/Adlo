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
      // Version 2: URL scheme changed (d=retro → d=404), invalidate all cached avatars
      // Version 3: Reverted to d=retro — cache retro pixel avatars for better visual quality
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
export { AVATAR_LRU_LIMIT as _AVATAR_LRU_LIMIT_FOR_TEST };

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
    if (oldestKey === undefined) {
      break;
    }
    const oldest = avatarMemoryCache.get(oldestKey);
    if (oldest) {
      URL.revokeObjectURL(oldest.value.blobUrl);
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
/**
 * Synchronous L1 memory cache lookup. Returns the cached Blob URL immediately
 * if the email has a fresh entry in memory, or null on miss.
 *
 * Use this in useState initializers to avoid the pixel-avatar flicker when a
 * cached avatar is already available (e.g. during fast scroll, when rows mount
 * whose authors were already fetched by earlier rows).
 *
 * Does NOT trigger network fetch or L2 IDB lookup — pair with getAvatar() for
 * the full async resolution path. SWR revalidation is NOT triggered here; the
 * caller's useEffect will call getAvatar() which handles staleness.
 */
export function getCachedAvatarUrl(email: string): string | null {
  const key = normalizeEmail(email);
  if (!key) return null;
  const memEntry = avatarMemoryCache.get(key);
  if (!memEntry) return null;
  // Return stale OR fresh — caller's getAvatar() will handle revalidation
  return memEntry.value.blobUrl;
}

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
  const result = await fetchAvatarFromNetwork(key, size);
  if (!result) {
    return null;
  }
  await setAvatar(key, result.blob, result.source);

  // Read back from L1 (setAvatar just wrote it)
  const fresh = avatarMemoryCache.get(key);
  return fresh ? fresh.value.blobUrl : null;
}

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
