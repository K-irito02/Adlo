import type { WindowBridge } from '../shared/ipc/window';

export async function createPreviewWindowBridge() {
  const { mockDigitalLifeBridge } = await import('../mock-bridge');
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
