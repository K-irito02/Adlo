import type { PtyOutputEvent } from "../shared/ipc";
import type { PtySessionInfo } from "../shared/ipc";
import { requestPreviewApi } from "./api";

const MAX_PTY_LISTENERS = 32;
const ptyOutputListeners = new Set<(event: PtyOutputEvent) => void>();
let ptyPollingInterval: number | null = null;
let ptyPollingListenersCount = 0;
const sessionOutputBuffers = new Map<string, string>();

// Use polling instead of SSE for Vite dev server compatibility
function startPolling(onCleanup: () => void): void {
  console.log("Starting PTY polling...");
  
  if (ptyPollingInterval) {
    window.clearInterval(ptyPollingInterval);
  }
  
  ptyPollingInterval = window.setInterval(async () => {
    try {
      const result = await requestPreviewApi<PtySessionInfo[]>("/pty/list");
      
      if (result.ok) {
        const sessions = result.data;
        for (const session of sessions) {
          if (session.output) {
            const lastOutput = sessionOutputBuffers.get(session.sessionId) || "";
            if (session.output !== lastOutput) {
              const newOutput = session.output.slice(lastOutput.length);
              if (newOutput) {
                const event: PtyOutputEvent = {
                  sessionId: session.sessionId,
                  data: newOutput
                };
                ptyOutputListeners.forEach((fn) => fn(event));
              }
              sessionOutputBuffers.set(session.sessionId, session.output);
            }
          }
        }
      }
    } catch (e) {
      console.warn("PTY polling error", e);
    }
  }, 100); // Poll every 100ms for good responsiveness
}

export function createPtyBridge() {
  return {
    subscribePtyOutput: (listener: (event: PtyOutputEvent) => void) => {
      if (ptyOutputListeners.size >= MAX_PTY_LISTENERS) {
        console.warn("preview-bridge: PTY listener limit reached, dropping oldest listener");
        const oldest = ptyOutputListeners.values().next().value;
        if (oldest) ptyOutputListeners.delete(oldest);
      }
      ptyOutputListeners.add(listener);
      ptyPollingListenersCount += 1;
      if (!ptyPollingInterval) {
        startPolling(() => { ptyPollingListenersCount = Math.max(0, ptyPollingListenersCount - 1); });
      }
      return () => {
        ptyOutputListeners.delete(listener);
        ptyPollingListenersCount -= 1;
        if (ptyPollingListenersCount <= 0 && ptyPollingInterval) {
          window.clearInterval(ptyPollingInterval);
          ptyPollingInterval = null;
          sessionOutputBuffers.clear();
        }
      };
    },

    pty: {
      create: async (input: { shell?: string; cwd?: string; cols: number; rows: number }) =>
        requestPreviewApi<{ sessionId: string }>("/pty/create", {
          method: "POST",
          body: JSON.stringify({ shell: input.shell, cwd: input.cwd, cols: input.cols, rows: input.rows })
        }),
      input: async (sessionId: string, data: string) =>
        requestPreviewApi<boolean>("/pty/input", {
          method: "POST",
          body: JSON.stringify({ sessionId, data })
        }),
      resize: async (sessionId: string, cols: number, rows: number) =>
        requestPreviewApi<boolean>("/pty/resize", {
          method: "POST",
          body: JSON.stringify({ sessionId, cols, rows })
        }),
      kill: async (sessionId: string) => {
        sessionOutputBuffers.delete(sessionId);
        return requestPreviewApi<boolean>("/pty/kill", {
          method: "POST",
          body: JSON.stringify({ sessionId })
        });
      },
      list: async () =>
        requestPreviewApi<PtySessionInfo[]>("/pty/list")
    }
  };
}
