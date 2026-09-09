import type { DigitalLifeBridge } from '../shared/ipc/digital-life';
import type { WindowBridge } from '../shared/ipc/window';

type MockWindow = DigitalLifeBridge['window'];

export function createPreviewWindowBridge(mockWindow: MockWindow) {
  return {
    window: {
      ...mockWindow,
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
