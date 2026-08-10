import type { IpcResult } from '@ai-digital-life/kernel';
import type { PtyOutputEvent, PtySessionInfo } from './pty';

/**
 * Shared WebSocket PTY client — the single implementation that both the
 * browser preview (`preview-pty-bridge.ts`) and, after Task 10, the Tauri
 * desktop drive against the ad-server `GET /pty` WebSocket endpoint.
 *
 * Wire protocol (text JSON frames, mirroring `crates/server/src/pty_ws.rs`):
 *   client → server: `{kind:"create",shell?,cwd?,cols,rows}`,
 *                    `{kind:"input",sessionId,data}`,
 *                    `{kind:"resize",sessionId,cols,rows}`,
 *                    `{kind:"kill",sessionId}`
 *   server → client: `{kind:"created",sessionId}`,
 *                    `{kind:"output",sessionId,data}`,
 *                    `{kind:"error",sessionId?,message}`
 *
 * The client keeps a single socket, queues outbound frames while it is
 * (re)connecting, reconnects with exponential backoff, resolves `create` when
 * the matching `created` frame arrives, and fans `output` frames out to
 * `subscribePtyOutput` listeners. Once connected the socket is kept open for
 * the lifetime of the client (until `close()`), so PTY sessions survive the
 * terminal panel being hidden/unsubscribed. `list` reports the sessions created
 * through this client (the protocol has no WS list response, and the UI does
 * not call it — see task-6-report).
 */

export interface PtyWsClient {
  subscribePtyOutput(listener: (event: PtyOutputEvent) => void): () => void;
  pty: {
    create(input: {
      shell?: string;
      cwd?: string;
      cols: number;
      rows: number;
    }): Promise<IpcResult<{ sessionId: string }>>;
    input(sessionId: string, data: string): Promise<IpcResult<boolean>>;
    resize(sessionId: string, cols: number, rows: number): Promise<IpcResult<boolean>>;
    kill(sessionId: string): Promise<IpcResult<boolean>>;
    list(): Promise<IpcResult<PtySessionInfo[]>>;
  };
  /** Explicitly tear down the socket and any pending create. */
  close(): void;
}

export interface PtyWsClientOptions {
  /** Test seam: replaces the default `new WebSocket(url)` constructor. */
  wsFactory?: () => WebSocket;
  /** Initial reconnect delay; doubles until `maxReconnectDelayMs`. */
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

/** Numeric WebSocket readyState constants (avoids depending on a global). */
const WS_CONNECTING = 0;
const WS_OPEN = 1;

const CREATE_TIMEOUT_MS = 30_000;

interface CreateResolver {
  input: { shell?: string; cwd?: string; cols: number; rows: number };
  resolve: (result: IpcResult<{ sessionId: string }>) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Convert an http(s) base URL into the `/pty` WebSocket URL used by the client. */
export function toWsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) {
    return '/pty';
  }
  return `${base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/pty`;
}

function ptyError(message: string): IpcResult<never> {
  return { ok: false, error: { code: 'PTY_ERROR', message } };
}

export function createPtyWsClient(baseUrl = '', options: PtyWsClientOptions = {}): PtyWsClient {
  const { wsFactory, reconnectDelayMs = 1000, maxReconnectDelayMs = 30_000 } = options;
  const listeners = new Set<(event: PtyOutputEvent) => void>();
  const knownSessions = new Map<string, PtySessionInfo>();

  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = reconnectDelayMs;
  let closed = false;
  let pendingCreate: CreateResolver | null = null;
  const outbox: string[] = [];

  function sendFrame(frame: unknown): void {
    if (closed) {
      return;
    }
    const text = JSON.stringify(frame);
    if (socket !== null && socket.readyState === WS_OPEN) {
      socket.send(text);
    } else {
      outbox.push(text);
    }
  }

  function flushOutbox(): void {
    if (socket === null || socket.readyState !== WS_OPEN) {
      return;
    }
    let frame = outbox.shift();
    while (frame !== undefined) {
      socket.send(frame);
      frame = outbox.shift();
    }
  }

  function resolveCreate(result: IpcResult<{ sessionId: string }>): void {
    if (pendingCreate === null) {
      return;
    }
    clearTimeout(pendingCreate.timer);
    const { resolve } = pendingCreate;
    pendingCreate = null;
    resolve(result);
  }

  function handleMessage(raw: string): void {
    let frame: { kind?: string; sessionId?: string; data?: string; message?: string };
    try {
      frame = JSON.parse(raw) as {
        kind?: string;
        sessionId?: string;
        data?: string;
        message?: string;
      };
    } catch {
      return;
    }
    switch (frame.kind) {
      case 'output': {
        if (frame.sessionId === undefined) {
          return;
        }
        const event: PtyOutputEvent = { sessionId: frame.sessionId, data: frame.data ?? '' };
        listeners.forEach((fn) => fn(event));
        return;
      }
      case 'created': {
        const sessionId = frame.sessionId ?? '';
        if (sessionId !== '') {
          const input = pendingCreate?.input;
          knownSessions.set(sessionId, {
            sessionId,
            shell: input?.shell ?? '',
            cwd: input?.cwd ?? '',
            cols: input?.cols ?? 80,
            rows: input?.rows ?? 24,
            status: 'Running',
          });
        }
        resolveCreate({ ok: true, data: { sessionId } });
        return;
      }
      case 'error': {
        const message = frame.message ?? 'PTY server error';
        if (pendingCreate !== null) {
          resolveCreate(ptyError(message));
        } else {
          console.warn('[pty-ws] server error:', message);
        }
        return;
      }
      default:
        return;
    }
  }

  function closeSocket(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket !== null) {
      const ws = socket;
      socket = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // already closing / never opened
      }
    }
  }

  function ensureConnected(): void {
    if (closed || reconnectTimer !== null) {
      return;
    }
    if (socket !== null) {
      if (socket.readyState === WS_OPEN || socket.readyState === WS_CONNECTING) {
        return;
      }
      // Dead socket (CLOSED) whose `onclose` has not run yet — replace it.
      socket = null;
    }
    const ws = (wsFactory ?? (() => new WebSocket(toWsUrl(baseUrl))))();
    socket = ws;
    ws.onopen = () => {
      reconnectDelay = reconnectDelayMs;
      flushOutbox();
    };
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        handleMessage(event.data);
      }
    };
    ws.onclose = () => {
      if (socket === ws) {
        socket = null;
      }
      if (!closed) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          ensureConnected();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelayMs);
      }
    };
    ws.onerror = () => {
      // `onclose` always follows an error; nothing else to do here.
    };
  }

  function create(input: {
    shell?: string;
    cwd?: string;
    cols: number;
    rows: number;
  }): Promise<IpcResult<{ sessionId: string }>> {
    if (closed) {
      return Promise.resolve(ptyError('PTY connection closed'));
    }
    ensureConnected();
    return new Promise((resolve) => {
      pendingCreate = {
        input,
        resolve,
        timer: setTimeout(() => {
          if (pendingCreate !== null) {
            pendingCreate = null;
            resolve(ptyError('PTY create timed out'));
          }
        }, CREATE_TIMEOUT_MS),
      };
      sendFrame({
        kind: 'create',
        shell: input.shell,
        cwd: input.cwd,
        cols: input.cols,
        rows: input.rows,
      });
    });
  }

  function input(sessionId: string, data: string): Promise<IpcResult<boolean>> {
    ensureConnected();
    sendFrame({ kind: 'input', sessionId, data });
    return Promise.resolve({ ok: true, data: true });
  }

  function resize(sessionId: string, cols: number, rows: number): Promise<IpcResult<boolean>> {
    ensureConnected();
    sendFrame({ kind: 'resize', sessionId, cols, rows });
    return Promise.resolve({ ok: true, data: true });
  }

  function kill(sessionId: string): Promise<IpcResult<boolean>> {
    ensureConnected();
    sendFrame({ kind: 'kill', sessionId });
    knownSessions.delete(sessionId);
    return Promise.resolve({ ok: true, data: true });
  }

  function list(): Promise<IpcResult<PtySessionInfo[]>> {
    return Promise.resolve({ ok: true, data: Array.from(knownSessions.values()) });
  }

  function subscribePtyOutput(listener: (event: PtyOutputEvent) => void): () => void {
    listeners.add(listener);
    ensureConnected();
    return () => {
      listeners.delete(listener);
    };
  }

  function close(): void {
    closed = true;
    if (pendingCreate !== null) {
      resolveCreate(ptyError('PTY connection closed'));
    }
    closeSocket();
    listeners.clear();
  }

  return { subscribePtyOutput, pty: { create, input, resize, kill, list }, close };
}
