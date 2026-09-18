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

  it('mock searchInFiles returns [] for empty query (aligned with other bridges)', async () => {
    const result = await mockDigitalLifeBridge.workspace.searchInFiles(['anything.md'], '   ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
  });

  it('mock searchInFiles skips unknown paths without throwing', async () => {
    const result = await mockDigitalLifeBridge.workspace.searchInFiles(['nope/missing.md'], 'x');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
  });
});
