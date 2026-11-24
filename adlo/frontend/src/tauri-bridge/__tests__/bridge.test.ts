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

import { createTauriBridge, resolveTauriServerBaseUrl } from '../index';

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

describe('resolveTauriServerBaseUrl (Task 10 baseUrl discovery)', () => {
  it('returns the baseUrl reported by app_get_server_info', async () => {
    mockInvoke.mockResolvedValue(okResult({ baseUrl: 'http://127.0.0.1:54321' }));
    await expect(resolveTauriServerBaseUrl()).resolves.toBe('http://127.0.0.1:54321');
  });

  it('falls back to the default ad-server URL when the engine is not running', async () => {
    mockInvoke.mockResolvedValue(okResult({ baseUrl: null }));
    const { DEFAULT_ADL_SERVER_BASE_URL } = await import('../../httpBridge');
    await expect(resolveTauriServerBaseUrl()).resolves.toBe(DEFAULT_ADL_SERVER_BASE_URL);
  });

  it('falls back to the default when the invoke rejects', async () => {
    mockInvoke.mockRejectedValue(new Error('invoke failed'));
    const { DEFAULT_ADL_SERVER_BASE_URL } = await import('../../httpBridge');
    await expect(resolveTauriServerBaseUrl()).resolves.toBe(DEFAULT_ADL_SERVER_BASE_URL);
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

describe('createTauriBridge system-capability domains stay on Tauri', () => {
  it('app domain uses Tauri invoke, not the httpBridge NOT_SUPPORTED stubs', async () => {
    mockInvoke.mockResolvedValue(okResult({ name: 'adl' }));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.app.getInfo();

    expect(mockInvoke).toHaveBeenCalledWith('app_get_info', undefined);
    expect(res).toEqual({ ok: true, data: { name: 'adl' } });
  });

  it('pty domain uses the shared WebSocket /pty client, not Tauri invoke', async () => {
    class FakeWebSocket {
      static instances: FakeWebSocket[] = [];
      sent: string[] = [];
      readyState = 0; // CONNECTING
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public url: string) {
        FakeWebSocket.instances.push(this);
      }
      send(data: string): void {
        this.sent.push(data);
      }
      close(): void {
        this.readyState = 3;
      }
      open(): void {
        this.readyState = 1;
        this.onopen?.();
      }
    }

    vi.stubGlobal('WebSocket', FakeWebSocket);
    try {
      const bridge = createTauriBridge('http://127.0.0.1:9999');
      const promise = bridge.pty.create({ cols: 80, rows: 24 });

      const socket = FakeWebSocket.instances[0];
      expect(socket).toBeTruthy();
      expect(socket.url).toBe('ws://127.0.0.1:9999/pty');
      // Frame is queued until the socket opens, then flushed.
      expect(socket.sent).toEqual([]);
      socket.open();
      expect(socket.sent).toEqual([
        JSON.stringify({ kind: 'create', shell: undefined, cwd: undefined, cols: 80, rows: 24 }),
      ]);
      socket.onmessage?.({ data: JSON.stringify({ kind: 'created', sessionId: 's1' }) });
      await expect(promise).resolves.toEqual({ ok: true, data: { sessionId: 's1' } });

      // No Tauri pty_* invoke commands remain.
      expect(mockInvoke).not.toHaveBeenCalledWith('pty_create', expect.anything());
    } finally {
      vi.unstubAllGlobals();
    }
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

  it('window.openPath invokes the platform_open_path shell command', async () => {
    mockInvoke.mockResolvedValue(okResult(true));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.window.openPath('C:/adlo/logs');
    expect(mockInvoke).toHaveBeenCalledWith('platform_open_path', { path: 'C:/adlo/logs' });
    expect(res).toEqual({ ok: true, data: true });
  });

  it('browser.createForTab returns null in httpBridge but is Tauri-native on desktop', async () => {
    mockInvoke.mockResolvedValue(okResult('tab-1'));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.browser.createForTab('t1', 'https://example.com');

    expect(mockInvoke).toHaveBeenCalledWith('browser_create_for_tab', {
      tabId: 't1',
      url: 'https://example.com',
      colorScheme: undefined,
      location: undefined,
      agentOrigins: undefined,
      agentInterceptEnabled: undefined,
    });
    expect(res).toBe('tab-1');
  });

  it('browser.createForTab forwards the host location for UDF grouping', async () => {
    mockInvoke.mockResolvedValue(okResult(null));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    await bridge.browser.createForTab('t2', 'https://example.com', 'light', 'center');

    expect(mockInvoke).toHaveBeenCalledWith('browser_create_for_tab', {
      tabId: 't2',
      url: 'https://example.com',
      colorScheme: 'light',
      location: 'center',
      agentOrigins: undefined,
      agentInterceptEnabled: undefined,
    });
  });

  it('browser.createForTab forwards shareProfile/referrer/initialSize payload keys', async () => {
    mockInvoke.mockResolvedValue(okResult('tab-3'));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    await bridge.browser.createForTab(
      't3',
      'https://example.com',
      'dark',
      'center',
      ['https://a.test'],
      true,
      [],
      [],
      false,
      'https://source.test/',
      { width: 800, height: 600 },
    );

    expect(mockInvoke).toHaveBeenCalledWith('browser_create_for_tab', {
      tabId: 't3',
      url: 'https://example.com',
      colorScheme: 'dark',
      location: 'center',
      agentOrigins: ['https://a.test'],
      agentInterceptEnabled: true,
      agentSiteRules: [],
      agentSiteOverrides: [],
      shareProfile: false,
      referrer: 'https://source.test/',
      initialSize: { width: 800, height: 600 },
    });
  });
});

describe('createTauriBridge storage domain', () => {
  const patch = {
    mode: 'unified' as const,
    root: 'D:/adl',
    categories: {},
    retainSource: false,
  };

  it('storage.getStatus invokes storage_get_status', async () => {
    mockInvoke.mockResolvedValue(okResult({ mode: 'unified' }));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    const res = await bridge.storage.getStatus();

    expect(mockInvoke).toHaveBeenCalledWith('storage_get_status', undefined);
    expect(res).toEqual({ ok: true, data: { mode: 'unified' } });
  });

  it('storage.scanForeign invokes storage_scan_foreign_cmd', async () => {
    mockInvoke.mockResolvedValue(okResult([]));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    await bridge.storage.scanForeign();

    expect(mockInvoke).toHaveBeenCalledWith('storage_scan_foreign_cmd', undefined);
  });

  it('storage.preflight invokes storage_preflight_cmd with { patch }', async () => {
    mockInvoke.mockResolvedValue(okResult({ ok: true }));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    await bridge.storage.preflight(patch);

    expect(mockInvoke).toHaveBeenCalledWith('storage_preflight_cmd', { patch });
  });

  it('storage.setPaths invokes storage_set_paths with { patch, applyNow }', async () => {
    mockInvoke.mockResolvedValue(okResult({ restartRequired: true }));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    await bridge.storage.setPaths(patch, true);

    expect(mockInvoke).toHaveBeenCalledWith('storage_set_paths', { patch, applyNow: true });
  });

  it('storage.cancelPending invokes storage_cancel_pending', async () => {
    mockInvoke.mockResolvedValue(okResult(undefined));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    await bridge.storage.cancelPending();

    expect(mockInvoke).toHaveBeenCalledWith('storage_cancel_pending', undefined);
  });

  it('storage.restartApp invokes app_restart', async () => {
    mockInvoke.mockResolvedValue(okResult(undefined));
    const bridge = createTauriBridge('http://127.0.0.1:9999');
    await bridge.storage.restartApp();

    expect(mockInvoke).toHaveBeenCalledWith('app_restart', undefined);
  });
});
