import type { WorkspaceFilesChangedBatch } from '@ai-digital-life/kernel';

/** 把 http(s) base URL 转成 `/ws/workspace` 的 WebSocket URL（与 `pty-ws.toWsUrl` 同构）。 */
export function toWorkspaceWsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) {
    return '/ws/workspace';
  }
  return `${base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/ws/workspace`;
}

export interface WorkspaceEventsClientOptions {
  /** 测试注入点：替换默认 WebSocket 构造。 */
  wsFactory?: (url: string) => WebSocket;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

export interface WorkspaceEventsClient {
  onFilesChanged(listener: (batch: WorkspaceFilesChangedBatch) => void): () => void;
  dispose(): void;
}

const WS_CONNECTING = 0;
const WS_OPEN = 1;

/** 单例式 WS 客户端：只在存在订阅者时连接，断线指数退避重连。 */
export function createWorkspaceEventsClient(
  baseUrl = '',
  options: WorkspaceEventsClientOptions = {},
): WorkspaceEventsClient {
  const { wsFactory, reconnectDelayMs = 1000, maxReconnectDelayMs = 30_000 } = options;
  const listeners = new Set<(batch: WorkspaceFilesChangedBatch) => void>();
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = reconnectDelayMs;
  let disposed = false;

  const handleFrame = (raw: string) => {
    let frame: { kind?: string; changed?: string[]; removed?: string[]; overflow?: boolean };
    try {
      frame = JSON.parse(raw) as typeof frame;
    } catch {
      return;
    }
    if (frame.kind !== 'files-changed') {
      return;
    }
    const batch: WorkspaceFilesChangedBatch = {
      changed: frame.changed ?? [],
      removed: frame.removed ?? [],
      overflow: frame.overflow === true,
    };
    listeners.forEach((fn) => fn(batch));
  };

  const connect = () => {
    if (disposed || socket !== null || listeners.size === 0) {
      return;
    }
    const ws = (wsFactory ?? ((url: string) => new WebSocket(url)))(toWorkspaceWsUrl(baseUrl));
    socket = ws;
    ws.onopen = () => {
      reconnectDelay = reconnectDelayMs;
    };
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        handleFrame(event.data);
      }
    };
    ws.onclose = () => {
      if (socket !== ws) {
        return;
      }
      socket = null;
      if (!disposed && listeners.size > 0) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelayMs);
      }
    };
    ws.onerror = (event) => {
      console.warn('[workspace-events-ws] socket error', event);
    };
  };

  return {
    onFilesChanged(listener) {
      listeners.add(listener);
      connect();
      return () => {
        listeners.delete(listener);
        if (
          listeners.size === 0 &&
          socket !== null &&
          socket.readyState !== WS_CONNECTING &&
          socket.readyState !== WS_OPEN
        ) {
          socket.close();
        }
      };
    },
    dispose() {
      disposed = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket !== null) {
        const ws = socket;
        socket = null;
        ws.onclose = null;
        ws.close();
      }
      listeners.clear();
    },
  };
}
