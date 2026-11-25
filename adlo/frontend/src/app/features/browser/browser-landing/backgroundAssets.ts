/**
 * 自定义背景素材的加载与托管。
 *
 * 存储策略（两端行为一致，实现不同）：
 * - 桌面：Rust 把源文件复制到应用数据目录 `adl-backgrounds/`，这里只保留路径，
 *   展示时用 Tauri asset 协议流式加载（视频不需要整文件进内存）。
 * - 浏览器：Blob 存 IndexedDB，展示时用 object URL；秒开、不写 localStorage。
 *
 * 不再把文件读成 data URL：大图/视频会同时拖慢解码与持久化，且视频可能直接
 * 触发 localStorage 配额失败。
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import type { BackgroundConfig } from '@stores/slices/browserSlice';
import { isTauriShell, invokeIpc } from '../../../../tauri-bridge/tauri-shared';

export type BackgroundKind = 'image' | 'video';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const VIDEO_EXTENSIONS = ['mp4', 'webm'];

export interface BackgroundDraft {
  fileName: string;
  /** 可直接预览的 URL（桌面 asset URL / 浏览器 object URL）。 */
  previewUrl: string;
  /** 桌面托管副本绝对路径（落库字段）。 */
  assetPath?: string;
  /** 浏览器 Blob（落库时写入 IndexedDB，不持久化到 config）。 */
  blob?: Blob;
  /** 浏览器 object URL 的释放函数。 */
  revoke?: () => void;
}

export function isBackgroundExtensionAllowed(kind: BackgroundKind, extension: string): boolean {
  const normalized = extension.toLowerCase();
  const allowed = kind === 'image' ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS;
  return allowed.includes(normalized);
}

/** 从文件名推断类型；不认识的扩展名返回 null。 */
export function backgroundKindForFile(fileName: string): BackgroundKind | null {
  const extension = fileName.split('.').pop() ?? '';
  if (isBackgroundExtensionAllowed('image', extension)) {
    return 'image';
  }
  if (isBackgroundExtensionAllowed('video', extension)) {
    return 'video';
  }
  return null;
}

export function fileExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : '';
}

/**
 * 背景素材标识：同一个素材由落地页与弹窗各自解析时，object URL 可能不同，
 * 但标识相同——视频舞台据此避免重复换源（否则弹窗预览会重置主视频进度）。
 */
export function backgroundSourceKey(config: {
  assetPath?: string;
  assetId?: string;
}): string | null {
  if (config.assetPath) {
    return `path:${config.assetPath}`;
  }
  if (config.assetId) {
    return `idb:${config.assetId}`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// IndexedDB（浏览器模式）
// ─────────────────────────────────────────────────────────────

const DB_NAME = 'adl-backgrounds';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexeddb-unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexeddb-open-failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('indexeddb-request-failed'));
    });
  } finally {
    db.close();
  }
}

/** 写入时生成新键：同类素材被替换后 key 随之变化，视频舞台会重新换源。 */
export function nextBackgroundAssetKey(kind: BackgroundKind): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `background-${kind}-${suffix}`;
}

export async function putBackgroundBlob(kind: BackgroundKind, blob: Blob): Promise<string> {
  // 每次应用都用新键：同一类型的视频/图片被替换时，视频舞台的 key 必须变化，
  // 否则主视频会继续播旧素材。
  const key = nextBackgroundAssetKey(kind);
  await withStore('readwrite', (store) => store.put(blob, key));
  return key;
}

export async function readBackgroundBlob(key: string): Promise<Blob | undefined> {
  const value = await withStore<unknown>('readonly', (store) => store.get(key));
  return value instanceof Blob ? value : undefined;
}

/** 只保留指定键（背景应用/重置后的收尾）。 */
export async function pruneBackgroundBlobs(keepKeys: readonly string[]): Promise<void> {
  const db = await openDatabase();
  try {
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('indexeddb-keys-failed'));
    });
    const stale = keys.filter((key) => !keepKeys.includes(String(key)));
    if (stale.length === 0) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      for (const key of stale) {
        store.delete(key);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb-delete-failed'));
    });
  } finally {
    db.close();
  }
}

// ─────────────────────────────────────────────────────────────
// 桌面 IPC（复制到应用数据目录）
// ─────────────────────────────────────────────────────────────

interface ImportedAsset {
  path: string;
  fileName: string;
}

export function draftFromLocalFile(file: File): BackgroundDraft {
  const previewUrl = URL.createObjectURL(file);
  return {
    fileName: file.name,
    previewUrl,
    blob: file,
    revoke: () => URL.revokeObjectURL(previewUrl),
  };
}

/** 桌面端原生拖放只给绝对路径：交给 Rust 复制并返回托管路径。 */
export async function importDroppedPath(
  path: string,
  kind: BackgroundKind,
): Promise<BackgroundDraft | null> {
  const fileName = path.split(/[\\/]/).pop() ?? path;
  if (!isBackgroundExtensionAllowed(kind, fileExtension(fileName))) {
    return null;
  }
  const result = await invokeIpc<ImportedAsset>('browser_import_background_file', { path, kind });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return {
    fileName: result.data.fileName,
    previewUrl: convertFileSrc(result.data.path),
    assetPath: result.data.path,
  };
}

/** 桌面端点选上传：系统对话框由 Rust 弹，只返回源路径（复制在 import 时进行）。 */
export async function pickDesktopBackground(kind: BackgroundKind): Promise<string | null> {
  const result = await invokeIpc<string | null>('browser_pick_background_file', { kind });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data;
}

/** 桌面端清理托管目录中不再引用的素材。失败只记日志，不影响主流程。 */
export async function pruneDesktopBackgrounds(keepPaths: readonly string[]): Promise<void> {
  try {
    const result = await invokeIpc<number>('browser_prune_background_assets', {
      keep: [...keepPaths],
    });
    if (!result.ok) {
      console.warn('prune background assets failed', result.error.message);
    }
  } catch (error) {
    console.warn('prune background assets failed', error);
  }
}

// ─────────────────────────────────────────────────────────────
// 解析已保存的配置
// ─────────────────────────────────────────────────────────────

/** 把配置解析成可加载的 URL；assetId 走 IndexedDB，调用方负责在卸载时 revoke。 */
export async function resolveBackgroundUrl(
  config: BackgroundConfig,
): Promise<{ url: string | null; revoke?: () => void }> {
  if (config.assetPath) {
    return { url: convertFileSrc(config.assetPath) };
  }
  if (config.assetId) {
    try {
      const blob = await readBackgroundBlob(config.assetId);
      if (blob) {
        const url = URL.createObjectURL(blob);
        return { url, revoke: () => URL.revokeObjectURL(url) };
      }
    } catch (error) {
      console.warn('load stored background failed', error);
    }
  }
  return { url: null };
}

export function isDesktopShell(): boolean {
  return isTauriShell();
}
