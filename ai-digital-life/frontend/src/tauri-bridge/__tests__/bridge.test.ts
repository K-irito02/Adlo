import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockInvoke, mockListen } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockListen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}));

const { mockShellOpen } = vi.hoisted(() => ({
  mockShellOpen: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: mockShellOpen,
}));

import { createTauriBridge } from '../index';

function okResult<T>(data: T) {
  return { ok: true as const, data };
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockListen.mockReset();
  mockShellOpen.mockReset();
  mockListen.mockResolvedValue(() => {});
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

describe('createTauriBridge workspace domain', () => {
  it('workspace.onFileChanged subscribes to the Tauri file-change channel (desktop)', () => {
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const listener = vi.fn();
    const unsubscribe = bridge.workspace.onFileChanged(listener);

    expect(mockListen).toHaveBeenCalledWith(
      'digital-life://workspace-file-changed',
      expect.any(Function),
    );

    const handler = mockListen.mock.calls[0][1];
    const event = { path: 'src/main.ts', lastModifiedAt: 123 };
    handler({ payload: event });
    expect(listener).toHaveBeenCalledWith(event);

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('workspace.pickDirectory opens the native folder dialog via Tauri invoke (desktop)', async () => {
    mockInvoke.mockResolvedValue(okResult('/picked/path'));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.workspace.pickDirectory();

    expect(mockInvoke).toHaveBeenCalledWith('workspace_pick_directory', undefined);
    expect(res).toEqual({ ok: true, data: '/picked/path' });
  });

  it('workspace.pickDirectory maps a cancelled dialog (null) to undefined', async () => {
    mockInvoke.mockResolvedValue(okResult(null));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.workspace.pickDirectory();

    expect(res).toEqual({ ok: true, data: undefined });
  });

  it('workspace.revealInFileManager reveals the path in the OS file manager via Tauri invoke (desktop)', async () => {
    mockInvoke.mockResolvedValue(okResult(true));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.workspace.revealInFileManager('E:/project/src/main.ts');

    expect(mockInvoke).toHaveBeenCalledWith('workspace_reveal_in_file_manager', {
      path: 'E:/project/src/main.ts',
    });
    expect(res).toEqual({ ok: true, data: true });
  });

  it('keeps the remaining workspace RPC methods on the httpBridge (HTTP routes)', async () => {
    const fetchMock = vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: [{ id: 'ws-1' }] }),
    } as Response);
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.workspace.listRecent();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/sidebar/list',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, data: [{ id: 'ws-1' }] });
  });
});

describe('createTauriBridge system-capability domains stay on Tauri (audit)', () => {
  it('app domain uses Tauri invoke, not the httpBridge NOT_SUPPORTED stubs', async () => {
    mockInvoke.mockResolvedValue(okResult({ name: 'adl' }));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.app.getInfo();

    expect(mockInvoke).toHaveBeenCalledWith('app_get_info', undefined);
    expect(res).toEqual({ ok: true, data: { name: 'adl' } });
  });

  it('pty domain uses Tauri invoke, not the httpBridge NOT_SUPPORTED stubs', async () => {
    mockInvoke.mockResolvedValue(okResult({ sessionId: 's1' }));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.pty.create({ cols: 80, rows: 24 });

    expect(mockInvoke).toHaveBeenCalledWith('pty_create', {
      input: { cols: 80, rows: 24 },
    });
    expect(res).toEqual({ ok: true, data: { sessionId: 's1' } });
  });

  it('reserved domain uses Tauri invoke, not the httpBridge NOT_SUPPORTED stubs', async () => {
    mockInvoke.mockResolvedValue(okResult({ enabled: true }));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.reserved.acpGetStatus();

    expect(mockInvoke).toHaveBeenCalledWith('acp_get_status', undefined);
    expect(res).toEqual({ ok: true, data: { enabled: true } });
  });

  it('window.openExternal shells out via the Tauri shell plugin, not window.open', async () => {
    mockShellOpen.mockResolvedValue(undefined);
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    await bridge.window.openExternal('https://example.com');
    expect(mockShellOpen).toHaveBeenCalledWith('https://example.com');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('browser.createForTab returns null in httpBridge but is Tauri-native on desktop', async () => {
    mockInvoke.mockResolvedValue(okResult('tab-1'));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.browser.createForTab('t1', 'https://example.com');

    expect(mockInvoke).toHaveBeenCalledWith('browser_create_for_tab', {
      tabId: 't1',
      url: 'https://example.com',
      colorScheme: undefined,
    });
    expect(res).toBe('tab-1');
  });
});
