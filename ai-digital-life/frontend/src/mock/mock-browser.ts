import type { BrowserBridge, PageMeta, AudioStatePayload } from "../shared/ipc/browser";

export const mockBrowser: BrowserBridge = {
  createForTab: (_tabId: string, _url: string, _colorScheme?: 'light' | 'dark') =>
    Promise.resolve(null),
  activateTab: (_tabId: string) => Promise.resolve(),
  destroyTab: (_tabId: string) => Promise.resolve(),
  navigateTab: (_tabId: string, _url: string) => Promise.resolve(),
  setTabBounds: (
    _tabId: string,
    _bounds: { x: number; y: number; width: number; height: number }
  ) => Promise.resolve(),
  dividerStripShow: (
    _bounds: { x: number; y: number; width: number; height: number },
    _theme: { line: string; glow: string },
    _ariaLabel: string,
    _lang: string
  ) => Promise.resolve(),
  dividerStripSetBounds: (
    _bounds: { x: number; y: number; width: number; height: number }
  ) => Promise.resolve(),
  dividerStripHide: () => Promise.resolve(),
  memoryPressure: () => Promise.resolve(false),
  goBackTab: (_tabId: string) => Promise.resolve(false),
  goForwardTab: (_tabId: string) => Promise.resolve(false),
  canGoBackTab: (_tabId: string) => Promise.resolve(false),
  canGoForwardTab: (_tabId: string) => Promise.resolve(false),
  reloadTab: (_tabId: string) => Promise.resolve(),
  onUrlChanged: (_listener: (tabId: string, url: string) => void) => () => {},
  onMetaChanged: (_listener: (tabId: string, meta: PageMeta) => void) => () => {},
  onPageReady: (_listener: (tabId: string) => void) => () => {},
  onOpenNewTab: (_listener: (url: string) => void) => () => {},
  muteTab: (_tabId: string, _muted: boolean) => Promise.resolve(),
  onAudioStateChanged: (_listener: (payload: AudioStatePayload) => void) => () => {},
  setBrowserColorScheme: (_resolvedTheme: 'light' | 'dark') => Promise.resolve(),
  setZoom: (_tabId: string, _zoomFactor: number) => Promise.resolve(),
  clearCookies: (_tabId: string) => Promise.resolve(),
  clearCache: (_tabId: string) => Promise.resolve(),
};
