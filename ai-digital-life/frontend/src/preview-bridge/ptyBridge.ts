import type { PtyOutputEvent } from "../shared/ipc";
import type { PtySessionInfo } from "../shared/ipc";
import { requestPreviewApi } from "./api";

const MAX_PTY_LISTENERS = 32;
const ptyOutputListeners = new Set<(event: PtyOutputEvent) => void>();
let ptySseEventSource: EventSource | null = null;
let ptySseListenersCount = 0;

function connectPtySse(onCleanup: () => void): void {
  const es = new EventSource(`/__adl_preview_api__/pty/output`);
  ptySseEventSource = es;
  es.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as PtyOutputEvent;
      ptyOutputListeners.forEach((fn) => fn(parsed));
    } catch {
      // ignore parse errors
    }
  };
  es.onerror = () => {
    es.close();
    ptySseEventSource = null;
    onCleanup();
  };
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
      ptySseListenersCount += 1;
      if (!ptySseEventSource) {
        connectPtySse(() => { ptySseListenersCount = Math.max(0, ptySseListenersCount - 1); });
      }
      return () => {
        ptyOutputListeners.delete(listener);
        ptySseListenersCount -= 1;
        if (ptySseListenersCount <= 0 && ptySseEventSource) {
          ptySseEventSource.close();
          ptySseEventSource = null;
          ptySseListenersCount = 0;
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
      kill: async (sessionId: string) =>
        requestPreviewApi<boolean>("/pty/kill", {
          method: "POST",
          body: JSON.stringify({ sessionId })
        }),
      list: async () =>
        requestPreviewApi<PtySessionInfo[]>("/pty/list")
    }
  };
}
