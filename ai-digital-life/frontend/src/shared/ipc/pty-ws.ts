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
 *                    `{kind:"kill",sessionId}`,
 *                    `{kind:"ping"}` (connection-layer heartbeat)
 *   server → client: `{kind:"created",sessionId}`,
 *                    `{kind:"output",sessionId,data}`,
 *                    `{kind:"terminated",sessionId}` (shell 自然退出：EOF/错误；
 *                    显式 kill 由客户端乐观更新标签状态，服务端不补发),
 *                    `{kind:"error",sessionId?,message}`,
 *                    `{kind:"pong"}` (reply to `ping`)
 *
 * ping/pong 由连接层处理（`handleMessage` 提前拦截），不进入业务分发。
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
/** 心跳超时阈值：超过该时长未收到 pong 才判定连接失效（60s，宽松阈值避免误杀活跃会话） */
const HEARTBEAT_TIMEOUT_MS = 60_000;

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
  /**
   * 待匹配的 create 请求队列（FIFO）。
   *
   * 服务端在单读循环里串行处理 create 并保序回复 `created`
   *（见 `crates/server/src/pty_ws.rs::handle_socket`），故按到达顺序
   * 依次匹配队首即正确。
   *
   * 曾经的单槽位 `pendingCreate` 在重启恢复等多窗格并发激活时，
   * 后一次 create 会覆盖前一次的 resolver：只有最后一个窗格能拿到会话，
   * 其余窗格的 promise 永久挂起（连超时都因槽位被清空而失效），
   * 页面呈现"多窗格仅一格有提示符"（跟进 5/11 根因）。
   */
  const pendingCreates: CreateResolver[] = [];
  const outbox: string[] = [];
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let lastPongTime = Date.now();

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

  function startHeartbeat(): void {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
    }
    lastPongTime = Date.now();
    // 连续漏检计数：睡眠唤醒/后台节流后首次 tick 可能出现超大 gap，
    // 但下一次 ping 通常已收到 pong（本地服务毫秒级响应），不会误杀会话。
    let consecutiveMisses = 0;
    heartbeatTimer = setInterval(() => {
      // 先无条件 ping：即使处于漏检状态也保持探测，确保 pong 能刷新 lastPongTime 自愈
      sendFrame({ kind: 'ping' });
      // 窗口隐藏时定时器被节流（interval 可能 1 次/分钟），据此判死会误杀会话
      if (document.hidden) {
        consecutiveMisses = 0;
        return;
      }
      const timeSinceLastPong = Date.now() - lastPongTime;
      if (timeSinceLastPong > HEARTBEAT_TIMEOUT_MS) {
        consecutiveMisses += 1;
        // 连续 2 次漏检才判定连接失效，规避瞬时抖动/后台节流误杀活跃会话
        if (consecutiveMisses >= 2) {
          console.warn(`PTY heartbeat: no pong for ${timeSinceLastPong}ms, reconnecting`);
          // 重连统一由 onclose 调度，避免双重新连计时器
          socket?.close();
        }
      } else {
        consecutiveMisses = 0;
      }
    }, 5000);
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
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

  /** 取出队首并结算；空队列时为无操作（多余的 created 帧直接丢弃）。 */
  function resolveOldestCreate(result: IpcResult<{ sessionId: string }>): void {
    const oldest = pendingCreates.shift();
    if (oldest === undefined) {
      return;
    }
    clearTimeout(oldest.timer);
    oldest.resolve(result);
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
    // 心跳 pong 响应：仅刷新最后 pong 时间
    if (frame.kind === 'pong') {
      lastPongTime = Date.now();
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
          // 用队首请求的输入参数登记会话元信息（与下面 resolve 的是同一项）。
          const input = pendingCreates[0]?.input;
          knownSessions.set(sessionId, {
            sessionId,
            shell: input?.shell ?? '',
            cwd: input?.cwd ?? '',
            cols: input?.cols ?? 80,
            rows: input?.rows ?? 24,
            status: 'Running',
          });
        }
        resolveOldestCreate({ ok: true, data: { sessionId } });
        return;
      }
      case 'terminated': {
        const sessionId = frame.sessionId ?? '';
        if (sessionId !== '') {
          knownSessions.delete(sessionId);
          listeners.forEach((fn) => fn({ sessionId, data: '', terminated: true }));
        }
        return;
      }
      case 'error': {
        const message = frame.message ?? 'PTY server error';
        // 无 sessionId 的错误无法归因到具体请求，按保序归于队首
        //（create 失败服务端即回此帧，见 `dispatch_frame` 的 Err 分支）。
        if (pendingCreates.length > 0) {
          console.error(`PTY create failed: ${message}`);
          resolveOldestCreate(ptyError(message));
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
        console.warn('PTY closeSocket: ws.close() threw (already closing / never opened)');
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
      // 先停掉旧心跳，避免替换后双心跳 interval 泄漏
      stopHeartbeat();
      socket = null;
    }
    const wsUrl = toWsUrl(baseUrl);
    const ws = (wsFactory ?? (() => new WebSocket(wsUrl)))();
    socket = ws;
    ws.onopen = () => {
      reconnectDelay = reconnectDelayMs;
      lastPongTime = Date.now();
      startHeartbeat();
      flushOutbox();
    };
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        handleMessage(event.data);
      }
    };
    ws.onclose = () => {
      // 仅处理属于当前 socket 的关闭事件（替换旧 CLOSED socket 后，
      // 旧 onclose 不得停掉新连接的心跳或调度重连）
      if (socket === ws) {
        stopHeartbeat();
        socket = null;
        if (!closed) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            ensureConnected();
          }, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelayMs);
        }
      }
    };
    ws.onerror = (event) => {
      console.error('PTY WebSocket error:', event);
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
      console.error('PTY create failed: connection closed');
      return Promise.resolve(ptyError('PTY connection closed'));
    }
    ensureConnected();
    return new Promise((resolve) => {
      const entry: CreateResolver = {
        input,
        resolve,
        timer: setTimeout(() => {
          // 只移除自己：其它并发 create 不受影响，各自独立超时。
          const index = pendingCreates.indexOf(entry);
          if (index !== -1) {
            pendingCreates.splice(index, 1);
            console.error(`PTY create timed out after ${CREATE_TIMEOUT_MS}ms`);
            resolve(ptyError('PTY create timed out'));
          }
        }, CREATE_TIMEOUT_MS),
      };
      pendingCreates.push(entry);
      const frame = {
        kind: 'create',
        shell: input.shell,
        cwd: input.cwd,
        cols: input.cols,
        rows: input.rows,
      };
      sendFrame(frame);
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
    stopHeartbeat();
    // 结算全部挂起的 create（逐个清定时器），避免调用方永久挂起。
    let pending = pendingCreates.shift();
    while (pending !== undefined) {
      clearTimeout(pending.timer);
      pending.resolve(ptyError('PTY connection closed'));
      pending = pendingCreates.shift();
    }
    closeSocket();
    listeners.clear();
  }

  return { subscribePtyOutput, pty: { create, input, resize, kill, list }, close };
}
