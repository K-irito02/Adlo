import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { createPtyBridge } from './preview-pty-bridge';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static reset(): void {
    FakeWebSocket.instances = [];
  }

  url: string;
  sent: string[] = [];
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3; // CLOSED
  }

  // --- test helpers ---
  open(): void {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  emit(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  sentFrames(): unknown[] {
    return this.sent.map((s) => JSON.parse(s) as unknown);
  }
}

function makeBridge() {
  const wsFactory = () =>
    fromAny<WebSocket, FakeWebSocket>(new FakeWebSocket('ws://127.0.0.1/pty'));
  const bridge = createPtyBridge({ wsFactory });
  const getSocket = (): FakeWebSocket => {
    const socket = FakeWebSocket.instances[0];
    if (!socket) {
      throw new Error('no socket created yet — trigger an operation first');
    }
    return socket;
  };
  return { bridge, getSocket };
}

describe('createPtyBridge', () => {
  beforeEach(() => {
    FakeWebSocket.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the PtyBridge contract', () => {
    const { bridge } = makeBridge();
    expect(typeof bridge.subscribePtyOutput).toBe('function');
    expect(typeof bridge.pty.create).toBe('function');
    expect(typeof bridge.pty.input).toBe('function');
    expect(typeof bridge.pty.resize).toBe('function');
    expect(typeof bridge.pty.kill).toBe('function');
    expect(typeof bridge.pty.list).toBe('function');
  });

  it('subscribePtyOutput returns an unsubscribe function', () => {
    const { bridge } = makeBridge();
    const unsub = bridge.subscribePtyOutput(() => {});
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('queues create while connecting and resolves on the created frame', async () => {
    const { bridge, getSocket } = makeBridge();
    const promise = bridge.pty.create({ shell: 'powershell', cols: 80, rows: 24 });
    const socket = getSocket();
    // Frame is queued until the socket opens, then flushed.
    expect(socket.sentFrames()).toEqual([]);
    socket.open();
    expect(socket.sentFrames()).toEqual([
      { kind: 'create', shell: 'powershell', cwd: undefined, cols: 80, rows: 24 },
    ]);
    socket.emit({ kind: 'created', sessionId: 's1' });
    await expect(promise).resolves.toEqual({ ok: true, data: { sessionId: 's1' } });
  });

  it('create resolves with an error when the server sends an error frame', async () => {
    const { bridge, getSocket } = makeBridge();
    const promise = bridge.pty.create({ cols: 80, rows: 24 });
    getSocket().open();
    getSocket().emit({ kind: 'error', message: 'Unknown shell: bogus' });
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Unknown shell');
    }
  });

  it('input/resize/kill send the matching protocol frames', async () => {
    const { bridge, getSocket } = makeBridge();
    bridge.subscribePtyOutput(() => {});
    const socket = getSocket();
    socket.open();
    await bridge.pty.input('s1', 'ls\r');
    await bridge.pty.resize('s1', 120, 30);
    await bridge.pty.kill('s1');
    expect(socket.sentFrames()).toEqual([
      { kind: 'input', sessionId: 's1', data: 'ls\r' },
      { kind: 'resize', sessionId: 's1', cols: 120, rows: 30 },
      { kind: 'kill', sessionId: 's1' },
    ]);
  });

  it('forwards output frames to subscribers', () => {
    const { bridge, getSocket } = makeBridge();
    const events: { sessionId: string; data: string }[] = [];
    bridge.subscribePtyOutput((event) => events.push(event));
    const socket = getSocket();
    socket.open();
    socket.emit({ kind: 'output', sessionId: 's1', data: 'hello\n' });
    expect(events).toEqual([{ sessionId: 's1', data: 'hello\n' }]);
  });

  it('list reports the sessions created through the bridge', async () => {
    const { bridge, getSocket } = makeBridge();
    const promise = bridge.pty.create({ shell: 'cmd', cwd: 'C:\\', cols: 80, rows: 24 });
    const socket = getSocket();
    socket.open();
    socket.emit({ kind: 'created', sessionId: 's1' });
    await promise;

    const result = await bridge.pty.list();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        { sessionId: 's1', shell: 'cmd', cwd: 'C:\\', cols: 80, rows: 24, status: 'Running' },
      ]);
    }
  });

  it('keeps the socket open after the last listener unsubscribes (sessions survive)', () => {
    const { bridge, getSocket } = makeBridge();
    const unsub = bridge.subscribePtyOutput(() => {});
    const socket = getSocket();
    unsub();
    expect(socket.readyState).toBe(0); // still CONNECTING / not closed
  });

  it('close() tears the socket down', () => {
    const { bridge, getSocket } = makeBridge();
    bridge.subscribePtyOutput(() => {});
    const socket = getSocket();
    bridge.close();
    expect(socket.readyState).toBe(3); // CLOSED
  });

  it('uses the ad-server /pty endpoint when the ad-server is reachable (Finding 4)', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_ADL_SERVER_URL', 'http://127.0.0.1:9999');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fromPartial<Response>({ ok: true })));
    const { createPtyBridge } = await import('./preview-pty-bridge');

    // Resolve the reachability probe deterministically before creating the
    // bridge so the resolved base URL is the ad-server base.
    const { isAdServerReachable } = await import('./preview-reachability');
    await isAdServerReachable('http://127.0.0.1:9999');

    let createdUrl: string | undefined;
    class RecordingWebSocket {
      static instances: RecordingWebSocket[] = [];
      url: string;
      readyState = 0;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string) {
        this.url = url;
        createdUrl = url;
        RecordingWebSocket.instances.push(this);
      }
      send() {}
      close() {
        this.readyState = 3;
      }
    }
    vi.stubGlobal('WebSocket', RecordingWebSocket);

    const bridge = createPtyBridge();
    bridge.subscribePtyOutput(() => {});

    // The socket must target the ad-server /pty (ws://127.0.0.1:9999/pty),
    // NOT the window.location.origin Vite mock. Socket creation is async
    // (waits on the probe), so wait for it.
    await vi.waitFor(() => expect(RecordingWebSocket.instances.length).toBeGreaterThan(0));
    expect(createdUrl).toBe('ws://127.0.0.1:9999/pty');
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
