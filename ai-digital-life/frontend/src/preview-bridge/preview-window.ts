import { mockDigitalLifeBridge } from '../mock-bridge';
import type { WindowBridge } from '../shared/ipc/window';

export function createPreviewWindowBridge() {
  return {
    window: {
      ...mockDigitalLifeBridge.window,
      openExternal: async (url: string) => {
        const w = window as { trae?: { openExternal: (url: string) => void } };
        if (w.trae?.openExternal) {
          w.trae.openExternal(url);
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      },
    } satisfies WindowBridge,
  };
}
