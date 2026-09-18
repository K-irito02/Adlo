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
  // 首连成功后即有过连接：之后每次 onopen 都是"重连"，断线窗口的变更已丢失，
  // 补发 overflow 批次唤醒消费端全量重搜（kernel 溢出退化契约在 WS 路径的落实）。
  let hasConnected = false;

  const sanitizeList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

  const handleFrame = (raw: string) => {
    let frame: { kind?: string; changed?: unknown; removed?: unknown; overflow?: boolean };
    try {
      frame = JSON.parse(raw) as typeof frame;
    } catch {
      return;
    }
    if (!frame || typeof frame !== 'object' || frame.kind !== 'files-changed') {
      return;
    }
    const batch: WorkspaceFilesChangedBatch = {
      changed: sanitizeList(frame.changed),
      removed: sanitizeList(frame.removed),
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
      if (hasConnected) {
        const batch: WorkspaceFilesChangedBatch = { changed: [], removed: [], overflow: true };
        listeners.forEach((fn) => fn(batch));
      }
      hasConnected = true;
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
    ws.onerror = () => {
      console.warn('[workspace-events-ws] socket error');
      // 只 error 不 close 的假死连接：主动关闭走统一 onclose 重连。
      try {
        ws.close();
      } catch {
        // 关闭幂等，失败即已有 onclose 接管。
      }
    };
  };

  /** 无条件释放 socket（CLOSING/CLOSED  equally）：close 幂等，不留"永不重连"状态。 */
  const releaseSocket = () => {
    if (socket === null) {
      return;
    }
    const ws = socket;
    socket = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    try {
      ws.close();
    } catch {
      // 已关闭的 socket 再关即抛，忽略。
    }
  };

  return {
    onFilesChanged(listener) {
      listeners.add(listener);
      connect();
      return () => {
        listeners.delete(listener);
        if (listeners.size !== 0) {
          return;
        }
        if (reconnectTimer !== null) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        releaseSocket();
      };
    },
    dispose() {
      // dispose 是终结性的：disposed 锁死后重订阅无声失活，重订者须新建 client。
      disposed = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      releaseSocket();
      listeners.clear();
    },
  };
}
