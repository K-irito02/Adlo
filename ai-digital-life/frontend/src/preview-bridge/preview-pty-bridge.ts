import type { PtyOutputEvent } from '../shared/ipc';
import type { PtySessionInfo } from '../shared/ipc';
import { requestPreviewApi } from './preview-api';

const MAX_PTY_LISTENERS = 32;
const PTY_POLL_INTERVAL_MS = 1000;
const MAX_BACKOFF_MS = 30000;

export function createPtyBridge() {
  const ptyOutputListeners = new Set<(event: PtyOutputEvent) => void>();
  let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let shouldPoll = false;
  let ptyPollingListenersCount = 0;
  let consecutiveErrors = 0;
  const sessionCursors = new Map<string, number>();

  async function pollOnce(): Promise<void> {
    if (!shouldPoll) {
      return;
    }
    const listResult = await requestPreviewApi<PtySessionInfo[]>('/pty/list');
    if (!shouldPoll) {
      return;
    }

    if (listResult.ok) {
      consecutiveErrors = 0;
      const sessions = listResult.data;

      // Fetch incremental output for each session in parallel
      const outputPromises = sessions.map(async (session) => {
        const cursor = sessionCursors.get(session.sessionId) ?? 0;
        const sinceResult = await requestPreviewApi<{
          sessionId: string;
          newOutput: string;
          newCursor: number;
        }>(`/pty/output-since?sessionId=${encodeURIComponent(session.sessionId)}&cursor=${cursor}`);

        if (!sinceResult.ok) {
          return;
        }

        const { newOutput, newCursor } = sinceResult.data;
        // Update cursor regardless of whether there's new output (advances the watermark)
        sessionCursors.set(session.sessionId, newCursor);

        if (newOutput) {
          const event: PtyOutputEvent = {
            sessionId: session.sessionId,
            data: newOutput,
          };
          ptyOutputListeners.forEach((fn) => fn(event));
        }
      });

      await Promise.allSettled(outputPromises);
    } else {
      consecutiveErrors += 1;
    }

    if (shouldPoll) {
      const delay = Math.min(PTY_POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors), MAX_BACKOFF_MS);
      pollTimeoutId = setTimeout(pollOnce, delay);
    }
  }

  function startPolling(): void {
    shouldPoll = true;
    consecutiveErrors = 0;
    pollTimeoutId = setTimeout(pollOnce, PTY_POLL_INTERVAL_MS);
  }

  function stopPolling(): void {
    shouldPoll = false;
    if (pollTimeoutId !== null) {
      clearTimeout(pollTimeoutId);
      pollTimeoutId = null;
    }
    sessionCursors.clear();
  }

  return {
    subscribePtyOutput: (listener: (event: PtyOutputEvent) => void) => {
      if (ptyOutputListeners.size >= MAX_PTY_LISTENERS) {
        // silently drop oldest listener when limit reached
        const oldest = ptyOutputListeners.values().next().value;
        if (oldest) {
          ptyOutputListeners.delete(oldest);
        }
      }
      ptyOutputListeners.add(listener);
      ptyPollingListenersCount += 1;
      if (!shouldPoll) {
        startPolling();
      }
      return () => {
        ptyOutputListeners.delete(listener);
        ptyPollingListenersCount -= 1;
        if (ptyPollingListenersCount <= 0) {
          stopPolling();
        }
      };
    },

    pty: {
      create: async (input: { shell?: string; cwd?: string; cols: number; rows: number }) =>
        requestPreviewApi<{ sessionId: string }>('/pty/create', {
          method: 'POST',
          body: JSON.stringify({
            shell: input.shell,
            cwd: input.cwd,
            cols: input.cols,
            rows: input.rows,
          }),
        }),
      input: async (sessionId: string, data: string) =>
        requestPreviewApi<boolean>('/pty/input', {
          method: 'POST',
          body: JSON.stringify({ sessionId, data }),
        }),
      resize: async (sessionId: string, cols: number, rows: number) =>
        requestPreviewApi<boolean>('/pty/resize', {
          method: 'POST',
          body: JSON.stringify({ sessionId, cols, rows }),
        }),
      kill: async (sessionId: string) => {
        sessionCursors.delete(sessionId);
        return requestPreviewApi<boolean>('/pty/kill', {
          method: 'POST',
          body: JSON.stringify({ sessionId }),
        });
      },
      list: async () => requestPreviewApi<PtySessionInfo[]>('/pty/list'),
    },
  };
}
