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
  it('has exactly the 10 category keys', () => {
    expect(STORAGE_CATEGORY_KEYS).toEqual([
      'database',
      'downloads_db',
      'site_meta_db',
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
      'getStatus',
      'preflight',
      'restartApp',
      'scanForeign',
      'setPaths',
    ]);
  });

  it('mock status categories match STORAGE_CATEGORY_KEYS in order', async () => {
    const res = await createMockStorage().getStatus();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.categories.map((c) => c.key)).toEqual([...STORAGE_CATEGORY_KEYS]);
    }
  });
});
