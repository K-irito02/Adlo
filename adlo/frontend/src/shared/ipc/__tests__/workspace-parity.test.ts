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
import type { WorkspaceBridge } from '../workspace';

const TEST_BASE_URL = 'http://127.0.0.1:9999';

const sortedKeys = (bridge: WorkspaceBridge): string[] => Object.keys(bridge).sort();

describe('workspace bridge method parity', () => {
  it('exposes the same method set on tauri / http / mock', () => {
    const tauri = createTauriBridge(TEST_BASE_URL).workspace;
    const http = createHttpBridge({ baseUrl: TEST_BASE_URL }).workspace;
    const mock = mockDigitalLifeBridge.workspace;
    expect(sortedKeys(http)).toEqual(sortedKeys(mock));
    expect(sortedKeys(tauri)).toEqual(sortedKeys(mock));
  });

  it('exposes initGitRepo on every bridge', () => {
    const tauri = createTauriBridge(TEST_BASE_URL).workspace;
    const http = createHttpBridge({ baseUrl: TEST_BASE_URL }).workspace;
    const mock = mockDigitalLifeBridge.workspace;
    for (const bridge of [tauri, http, mock]) {
      expect(typeof bridge.initGitRepo).toBe('function');
    }
  });
});
