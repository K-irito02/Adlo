import type { PtyOutputEvent } from '../shared/ipc';
import type { PtySessionInfo } from '../shared/ipc';
import { requestPreviewApi } from './api';

const MAX_PTY_LISTENERS = 32;
const PTY_POLL_INTERVAL_MS = 1000;
const MAX_BACKOFF_MS = 30000;

export function createPtyBridge() {
  const ptyOutputListeners = new Set<(event: PtyOutputEvent) => void>();
  let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let shouldPoll = false;
  let ptyPollingListenersCount = 0;
  let consecutiveErrors = 0;
  const sessionOutputBuffers = new Map<string, string>();

  async function pollOnce(): Promise<void> {
    if (!shouldPoll) {
      return;
    }
    const result = await requestPreviewApi<PtySessionInfo[]>('/pty/list');
    if (!shouldPoll) {
      return;
    }

    if (result.ok) {
      consecutiveErrors = 0;
      const sessions = result.data;
      for (const session of sessions) {
        if (session.output) {
          const lastOutput = sessionOutputBuffers.get(session.sessionId) || '';
          if (session.output !== lastOutput) {
            const newOutput = session.output.slice(lastOutput.length);
            if (newOutput) {
              const event: PtyOutputEvent = {
                sessionId: session.sessionId,
                data: newOutput,
              };
              ptyOutputListeners.forEach((fn) => fn(event));
            }
            sessionOutputBuffers.set(session.sessionId, session.output);
          }
        }
      }
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
    sessionOutputBuffers.clear();
  }

  return {
    subscribePtyOutput: (listener: (event: PtyOutputEvent) => void) => {
      if (ptyOutputListeners.size >= MAX_PTY_LISTENERS) {
        console.warn('preview-bridge: PTY listener limit reached, dropping oldest listener');
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
        sessionOutputBuffers.delete(sessionId);
        return requestPreviewApi<boolean>('/pty/kill', {
          method: 'POST',
          body: JSON.stringify({ sessionId }),
        });
      },
      list: async () => requestPreviewApi<PtySessionInfo[]>('/pty/list'),
    },
  };
}
