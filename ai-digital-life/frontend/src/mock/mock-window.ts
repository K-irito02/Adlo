import type { WindowBridge } from "../shared/ipc";

export const mockWindow: WindowBridge = {
  minimize: async () => {},
  maximize: async () => {},
  close: async () => {},
  isMaximized: async () => false,
  setTitle: async (title: string) => {
    try {
      document.title = title;
    } catch (e) {
      console.warn('[mock-bridge] Failed to set document title', e);
    }
  },
  onResized: (_listener: () => void) => {
    // browser mode has no window resize events to subscribe to
    return () => {};
  },
  show: async () => {
    // browser mode: no-op
  },
};
