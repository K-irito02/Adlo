import type { PageMeta } from '../shared/ipc';
import { mockDigitalLifeBridge } from '../mock-bridge';

export function createPreviewWindowBridge() {
  return {
    window: mockDigitalLifeBridge.window,
    browser: {
      createForTab: (_tabId: string, _url: string) => Promise.resolve(null),
      activateTab: (_tabId: string) => Promise.resolve(),
      destroyTab: (_tabId: string) => Promise.resolve(),
      navigateTab: (_tabId: string, _url: string) => Promise.resolve(),
      setTabBounds: (
        _tabId: string,
        _bounds: { x: number; y: number; width: number; height: number }
      ) => Promise.resolve(),
      goBackTab: (_tabId: string) => Promise.resolve(false),
      goForwardTab: (_tabId: string) => Promise.resolve(false),
      reloadTab: (_tabId: string) => Promise.resolve(),
      onUrlChanged: (_listener: (url: string) => void) => () => {},
      onMetaChanged: (_listener: (meta: PageMeta) => void) => () => {},
    },
  };
}
