import { describe, it, expect, vi } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}));

import { STORAGE_CATEGORY_KEYS, type StorageBridge } from '../storage';
import { createMockStorage } from '../../../mock/mock-storage';
import { createHttpBridge } from '../../../httpBridge';
import { createTauriBridge } from '../../../tauri-bridge/index';

describe('storage category keys parity', () => {
  it('has exactly the 11 category keys', () => {
    expect(STORAGE_CATEGORY_KEYS).toEqual([
      'database',
      'downloads_db',
      'site_meta_db',
      'tree_cache',
      'config',
      'clipboard',
      'snapshot',
      'dsh',
      'logs',
      'credentials_fallback',
      'downloads_default',
    ]);
  });
});

describe('storage bridge method parity', () => {
  const sortedKeys = (bridge: StorageBridge): string[] => Object.keys(bridge).sort();

  it('exposes the same method set on tauri / http / mock', () => {
    const tauri = createTauriBridge('http://127.0.0.1:9999');
    const http = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const mock = createMockStorage();
    expect(sortedKeys(http.storage)).toEqual(sortedKeys(mock));
    expect(sortedKeys(tauri.storage)).toEqual(sortedKeys(mock));
    expect(sortedKeys(mock)).toEqual([
      'cancelPending',
      'clearTreeCache',
      'getStatus',
      'getTreeCacheStats',
      'preflight',
      'restartApp',
      'scanForeign',
      'setPaths',
      'setTreeCacheOptions',
    ]);
  });

  it('mock status categories match STORAGE_CATEGORY_KEYS in order', async () => {
    const res = await createMockStorage().getStatus();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.categories.map((c) => c.key)).toEqual([...STORAGE_CATEGORY_KEYS]);
    }
  });

  it('tree-cache methods behave identically on all bridges', async () => {
    // Tauri 端：按 Task 5 `@command` 注解名桩住 invoke。
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'storage_tree_cache_stats') {
        return {
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        };
      }
      return { ok: true, data: undefined };
    });
    // HTTP 端：桩住 fetch，按路由返回树缓存载荷。
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const data = url.endsWith('/storage/tree-cache/stats')
        ? {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          }
        : undefined;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const tauri = createTauriBridge('http://127.0.0.1:9999');
      const http = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
      const mock = createMockStorage();
      for (const bridge of [tauri.storage, http.storage, mock]) {
        const stats = await bridge.getTreeCacheStats();
        expect(stats.ok).toBe(true);
        if (stats.ok) {
          expect(stats.data.workspaceCount).toBe(0);
          expect(stats.data.totalBytes).toBe(0);
          expect(stats.data.oldestCapturedAt).toBeNull();
          expect(stats.data.newestCapturedAt).toBeNull();
          // stats 与 get_options 同源：开关/TTL 缺省与 Rust 一致。
          expect(stats.data.enabled).toBe(true);
          expect(stats.data.ttlMinutes).toBe(15);
        }
        const setRes = await bridge.setTreeCacheOptions({ enabled: false, ttlMinutes: 60 });
        expect(setRes.ok).toBe(true);
        // clear 幂等成功：连调两次都 ok。
        expect((await bridge.clearTreeCache()).ok).toBe(true);
        expect((await bridge.clearTreeCache()).ok).toBe(true);
      }
      // mock 内存实现：set 后 stats 即反映新 options（clear 不影响开关/TTL）。
      const mockAfter = await mock.getTreeCacheStats();
      expect(mockAfter.ok).toBe(true);
      if (mockAfter.ok) {
        expect(mockAfter.data.enabled).toBe(false);
        expect(mockAfter.data.ttlMinutes).toBe(60);
      }
      // 命令/路由钉住：Tauri 命令名与 HTTP 路由与实现一致。
      expect(mockInvoke).toHaveBeenCalledWith('storage_tree_cache_stats', undefined);
      expect(mockInvoke).toHaveBeenCalledWith('storage_tree_cache_options', {
        opts: { enabled: false, ttlMinutes: 60 },
      });
      expect(mockInvoke).toHaveBeenCalledWith('storage_tree_cache_clear', undefined);
      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(urls).toContain('http://127.0.0.1:9999/storage/tree-cache/stats');
      expect(urls).toContain('http://127.0.0.1:9999/storage/tree-cache/options');
      expect(urls).toContain('http://127.0.0.1:9999/storage/tree-cache/clear');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
