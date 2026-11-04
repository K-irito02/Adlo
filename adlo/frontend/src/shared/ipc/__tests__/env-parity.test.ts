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

import { createHttpBridge } from '../../../httpBridge';
import { createTauriBridge } from '../../../tauri-bridge/index';
import { createMockEnv } from '../../../mock/mock-env';
import type { EnvBridge } from '../env';

const EXPECTED = [
  'getStatus',
  'install',
  'uninstall',
  'selectSource',
  'setCustomPath',
  'recheck',
] as const;

describe('env bridge method parity', () => {
  const sortedKeys = (bridge: EnvBridge): string[] => Object.keys(bridge).sort();

  it('exposes the same method set on tauri / http / mock', () => {
    const tauri = createTauriBridge('http://127.0.0.1:9999');
    const http = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const mock = createMockEnv();
    expect(sortedKeys(http.env)).toEqual(sortedKeys(mock));
    expect(sortedKeys(tauri.env)).toEqual(sortedKeys(mock));
    expect(sortedKeys(mock)).toEqual([...EXPECTED].sort());
  });
});
