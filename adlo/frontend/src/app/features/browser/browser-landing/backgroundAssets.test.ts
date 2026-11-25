import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backgroundKindForFile,
  backgroundSourceKey,
  draftFromLocalFile,
  fileExtension,
  isBackgroundExtensionAllowed,
  nextBackgroundAssetKey,
  pruneBackgroundBlobs,
  putBackgroundBlob,
  readBackgroundBlob,
} from './backgroundAssets';

// ── Hand-written IndexedDB mock（零新依赖）──
class MockStore {
  private data = new Map<string, unknown>();

  put(value: unknown, key: string): IDBRequest {
    this.data.set(key, value);
    return makeRequest(key);
  }

  get(key: string): IDBRequest {
    return makeRequest(this.data.get(key));
  }

  getAllKeys(): IDBRequest {
    return makeRequest([...this.data.keys()]);
  }

  delete(key: string): IDBRequest {
    this.data.delete(key);
    return makeRequest(undefined);
  }
}

class MockTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error: unknown = null;

  constructor(private store: MockStore) {
    queueMicrotask(() => this.oncomplete?.());
  }

  objectStore(): MockStore {
    return this.store;
  }
}

class MockDatabase {
  objectStoreNames = { contains: (_name: string) => true };
  private store = new MockStore();

  transaction(): MockTransaction {
    return new MockTransaction(this.store);
  }

  createObjectStore(): MockStore {
    return this.store;
  }

  close(): void {
    // no-op
  }
}

function makeRequest(result: unknown): IDBRequest {
  const request = {
    result,
    error: null,
    onsuccess: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };
  queueMicrotask(() => request.onsuccess?.());
  return request as unknown as IDBRequest;
}

let database: MockDatabase;

beforeEach(() => {
  database = new MockDatabase();
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = {
        result: database,
        error: null,
        onupgradeneeded: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request as unknown as IDBOpenDBRequest;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('backgroundAssets 纯函数', () => {
  it('按类型校验扩展名', () => {
    expect(isBackgroundExtensionAllowed('image', 'PNG')).toBe(true);
    expect(isBackgroundExtensionAllowed('image', 'mp4')).toBe(false);
    expect(isBackgroundExtensionAllowed('video', 'webm')).toBe(true);
    expect(isBackgroundExtensionAllowed('video', 'jpg')).toBe(false);
  });

  it('从文件名推断背景类型', () => {
    expect(backgroundKindForFile('a.GIF')).toBe('image');
    expect(backgroundKindForFile('clip.mp4')).toBe('video');
    expect(backgroundKindForFile('notes.txt')).toBeNull();
    expect(backgroundKindForFile('no-extension')).toBeNull();
  });

  it('扩展名提取忽略大小写', () => {
    expect(fileExtension('A.JPEG')).toBe('jpeg');
    expect(fileExtension('noext')).toBe('');
  });

  it('每次应用生成不同的素材键（同类替换后舞台必须换源）', () => {
    const first = nextBackgroundAssetKey('video');
    const second = nextBackgroundAssetKey('video');
    expect(first).not.toBe(second);
    expect(first.startsWith('background-video-')).toBe(true);
  });

  it('素材标识只认托管路径 / IndexedDB 键', () => {
    expect(backgroundSourceKey({ assetPath: 'C:/bg.mp4' })).toBe('path:C:/bg.mp4');
    expect(backgroundSourceKey({ assetId: 'background-video-a' })).toBe('idb:background-video-a');
    expect(backgroundSourceKey({})).toBeNull();
  });

  it('本地草稿的 object URL 可释放', () => {
    const create = vi.fn(() => 'blob:draft');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });

    const draft = draftFromLocalFile(new File(['x'], 'a.png', { type: 'image/png' }));
    expect(draft.previewUrl).toBe('blob:draft');
    draft.revoke?.();
    expect(revoke).toHaveBeenCalledWith('blob:draft');
  });
});

describe('backgroundAssets IndexedDB 存取', () => {
  it('putBackgroundBlob 每次生成新键，且可按新键读回 Blob', async () => {
    const blob = new Blob(['clip']);
    const first = await putBackgroundBlob('video', blob);
    const second = await putBackgroundBlob('video', blob);

    expect(first).not.toBe(second);
    expect(first.startsWith('background-video-')).toBe(true);
    expect(await readBackgroundBlob(first)).toBe(blob);
    expect(await readBackgroundBlob(second)).toBe(blob);
  });

  it('pruneBackgroundBlobs 只保留当前配置引用的键', async () => {
    const keep = await putBackgroundBlob('image', new Blob(['keep']));
    const stale = await putBackgroundBlob('image', new Blob(['stale']));

    await pruneBackgroundBlobs([keep]);

    expect(await readBackgroundBlob(keep)).toBeInstanceOf(Blob);
    expect(await readBackgroundBlob(stale)).toBeUndefined();
  });
});
