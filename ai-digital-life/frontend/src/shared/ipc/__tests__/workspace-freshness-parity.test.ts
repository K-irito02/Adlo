import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}));

import { createTauriBridge } from '../../../tauri-bridge/index';
import { createHttpBridge } from '../../../httpBridge';
import { mockDigitalLifeBridge } from '../../../mock-bridge';
import { createPreviewSearchBridge } from '../../../preview-bridge/preview-search';
import { createPreviewEventsBridge } from '../../../preview-bridge/preview-events';

const TEST_BASE_URL = 'http://127.0.0.1:9999';

describe('workspace freshness IPC parity', () => {
  it('every bridge exposes searchInFiles and onFilesChanged', () => {
    const previewWorkspace = {
      ...createPreviewSearchBridge({
        currentWorkspace: undefined,
      }),
      ...createPreviewEventsBridge({ currentWorkspace: undefined }),
    };
    const bridges = [
      createTauriBridge(TEST_BASE_URL).workspace,
      createHttpBridge({ baseUrl: TEST_BASE_URL }).workspace,
      mockDigitalLifeBridge.workspace,
      previewWorkspace,
    ];
    for (const bridge of bridges) {
      expect(typeof bridge.searchInFiles).toBe('function');
      expect(typeof bridge.onFilesChanged).toBe('function');
    }
  });

  it('onFilesChanged returns a synchronous unsubscribe', () => {
    const unsubscribe = mockDigitalLifeBridge.workspace.onFilesChanged(() => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('mock searchInFiles returns an empty page for empty query (aligned with other bridges)', async () => {
    const result = await mockDigitalLifeBridge.workspace.searchInFiles(['anything.md'], '   ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ hits: [], hasMore: false });
    }
  });

  it('mock searchInFiles skips unknown paths without throwing', async () => {
    const result = await mockDigitalLifeBridge.workspace.searchInFiles(['nope/missing.md'], 'x');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ hits: [], hasMore: false });
    }
  });

  it('mock search returns an empty page for empty query (aligned with other bridges)', async () => {
    // 空查询若不短路，`''.includes` 恒真会把所有行当命中（与 Rust/dev 端行为分叉）。
    const result = await mockDigitalLifeBridge.workspace.search('   ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ hits: [], hasMore: false });
    }
  });

  it('every bridge accepts the paging window and answers with a result page', async () => {
    // 分页窗口是四端共享契约：`hasMore` 必须来自后端（不能靠“等于上限”推断），
    // 故窗口参数与页对象形状在四端保持一致。网络端签名一致由类型系统保证，
    // 此处对可直接调用的 mock 端做行为断言。
    const result = await mockDigitalLifeBridge.workspace.searchInFiles(['nope/missing.md'], 'x', {
      offset: 0,
      limit: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ hits: [], hasMore: false });
      expect(Array.isArray(result.data.hits)).toBe(true);
    }
  });
});
