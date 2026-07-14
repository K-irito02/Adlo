export interface PageMeta {
  title: string;
  favicon: string;
  url: string;
}

export interface AudioStatePayload {
  tabId: string;
  isPlaying?: boolean;
  isMuted: boolean;
}

/**
 * 浏览器/预览面板桥接能力
 * 用于: 导航到 URL、前进/后退/刷新、订阅 URL 变更事件
 * Tauri 命令: browser_navigate / browser_go_back / browser_go_forward / browser_reload / browser_fetch_page_meta
 * 浏览器模式: 前端模拟无实际效果
 */
export interface BrowserBridge {
  /** Create a WebView for a specific tab. Returns evicted tab_id if pool was full. */
  createForTab: (
    tabId: string,
    url: string,
    colorScheme?: 'light' | 'dark'
  ) => Promise<string | null>;
  /** Activate tab: show its WebView, hide others, update LRU. */
  activateTab: (tabId: string) => Promise<void>;
  /** Destroy a tab's WebView (on tab close). */
  destroyTab: (tabId: string) => Promise<void>;
  /** Navigate a specific tab's WebView. */
  navigateTab: (tabId: string, url: string) => Promise<void>;
  /** Set bounds for a specific tab's WebView. */
  setTabBounds: (
    tabId: string,
    bounds: { x: number; y: number; width: number; height: number }
  ) => Promise<void>;
  /** Go back in a specific tab */
  goBackTab: (tabId: string) => Promise<boolean>;
  /** Go forward in a specific tab */
  goForwardTab: (tabId: string) => Promise<boolean>;
  /** Reload a specific tab */
  reloadTab: (tabId: string) => Promise<void>;
  /** Subscribe to URL changes (global event) */
  onUrlChanged: (listener: (url: string) => void) => () => void;
  /** Subscribe to page meta changes */
  onMetaChanged: (listener: (meta: PageMeta) => void) => () => void;
  /** Mute or unmute a tab */
  muteTab: (tabId: string, muted: boolean) => Promise<void>;
  /** Subscribe to audio state changes */
  onAudioStateChanged: (listener: (payload: AudioStatePayload) => void) => () => void;
  /** Set the preferred color scheme on all browser WebViews (Tauri mode) */
  setBrowserColorScheme: (resolvedTheme: 'light' | 'dark') => Promise<void>;
  /** Set zoom level for a specific tab's WebView */
  setZoom: (tabId: string, zoomFactor: number) => Promise<void>;
  /** Clear all cookies for a specific tab's WebView */
  clearCookies: (tabId: string) => Promise<void>;
  /** Clear all cache for a specific tab's WebView */
  clearCache: (tabId: string) => Promise<void>;
}
