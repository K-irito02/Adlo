import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { createTauriBridge } from '../index';

function okResult<T>(data: T) {
  return { ok: true as const, data };
}

beforeEach(() => {
  mockInvoke.mockReset();
  vi.unstubAllGlobals();
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: null }),
    } as Response),
  );
});

describe('createTauriBridge provider domain', () => {
  it('getProviderApiKey reads the persisted key via Tauri invoke (desktop prefill)', async () => {
    mockInvoke.mockResolvedValue(okResult('sk-persisted'));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.provider.getProviderApiKey('openai');

    expect(mockInvoke).toHaveBeenCalledWith('get_provider_api_key', {
      providerId: 'openai',
    });
    expect(res).toEqual({ ok: true, data: 'sk-persisted' });
  });

  it('hasProviderApiKey checks presence via Tauri invoke', async () => {
    mockInvoke.mockResolvedValue(okResult(true));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.provider.hasProviderApiKey('openai');

    expect(mockInvoke).toHaveBeenCalledWith('has_provider_api_key', {
      providerId: 'openai',
    });
    expect(res).toEqual({ ok: true, data: true });
  });

  it('keeps the remaining provider methods on the httpBridge (write-only over HTTP)', async () => {
    const fetchMock = vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: true }),
    } as Response);
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.provider.setProviderApiKey('openai', 'sk-new');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/provider/api-key',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res).toEqual({ ok: true, data: true });
  });
});
