import type { AgentSiteOverride, AgentSiteRule } from '../ipc-types.generated';

export type MetaSource = 'com' | 'http' | 'iframe' | 'google';

export interface PageMeta {
  title: string;
  favicon: string;
  faviconDataUri?: string;
  url: string;
  source?: MetaSource;
}

export interface PageMetaUpdatedPayload {
  url: string;
  title: string;
  faviconUrl: string;
  faviconDataUri: string;
  source: MetaSource;
}

export interface AudioStatePayload {
  tabId: string;
  isPlaying?: boolean;
  isMuted: boolean;
}

/**
 * 浏览器/预览面板桥接能力
 * 用于: 导航到 URL、前进/后退/刷新、订阅 URL 变更事件
 * Tauri 命令: browser_navigate / browser_go_back / browser_go_forward / browser_reload
 * 浏览器模式: 前端模拟无实际效果
 */
export interface BrowserBridge {
  /** Create a WebView for a specific tab. Returns evicted tab_id if pool was full. */
  createForTab: (
    tabId: string,
    url: string,
    colorScheme?: 'light' | 'dark',
    /** 宿主分组：Tauri 按此选择 WebView2 用户数据目录（UDF 隔离主题回退）；缺省按面板处理。 */
    location?: 'panel' | 'center',
    /** 智能体站点白名单 origin 列表（注入 WebView2 链接拦截；缺省不拦截）。 */
    agentOrigins?: string[],
    /** 是否启用智能体站点链接拦截。 */
    agentInterceptEnabled?: boolean,
    /** 全局 agent-site 拦截规则（调用方必须传已解析规则；缺省不注入规则 → 不拦截）。 */
    agentSiteRules?: AgentSiteRule[],
    /** 按 origin 的 agent-site 规则覆盖。 */
    agentSiteOverrides?: AgentSiteOverride[],
  ) => Promise<string | null>;
  // 注：非 Tauri 宿主（mock/preview/http）当前忽略 location（无原生 WebView2/UDF
  // 概念），签名保留以便将来按宿主分区前端缓存时直接复用。
  /** Activate tab: show its WebView, hide others, update LRU. */
  activateTab: (tabId: string) => Promise<void>;
  /** Destroy a tab's WebView (on tab close). */
  destroyTab: (tabId: string) => Promise<void>;
  /** Navigate a specific tab's WebView. */
  navigateTab: (tabId: string, url: string) => Promise<void>;
  /** Set bounds for a specific tab's WebView. */
  setTabBounds: (
    tabId: string,
    bounds: { x: number; y: number; width: number; height: number },
  ) => Promise<void>;
  /**
   * Show (idempotent recreate) the transparent divider-strip bridge over the
   * center/right-panel seam. Tauri-only: browser mode needs no strip because
   * the DOM resize handle already receives pointer events over iframes.
   */
  dividerStripShow: (
    bounds: { x: number; y: number; width: number; height: number },
    theme: { line: string; glow: string },
    ariaLabel: string,
    lang: string,
  ) => Promise<void>;
  /** Reposition the divider strip. No-op when absent. Tauri-only. */
  dividerStripSetBounds: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => Promise<void>;
  /** Destroy the divider strip. Tauri-only. */
  dividerStripHide: () => Promise<void>;
  /** Whether the system is under memory pressure (Tauri/Windows). False in browser mode. */
  memoryPressure: () => Promise<boolean>;
  /** Go back in a specific tab */
  goBackTab: (tabId: string) => Promise<boolean>;
  /** Go forward in a specific tab */
  goForwardTab: (tabId: string) => Promise<boolean>;
  /** Whether a specific tab can go back (native history has a previous entry). */
  canGoBackTab: (tabId: string) => Promise<boolean>;
  /** Whether a specific tab can go forward (native history has a next entry). */
  canGoForwardTab: (tabId: string) => Promise<boolean>;
  /** Reload a specific tab */
  reloadTab: (tabId: string) => Promise<void>;
  /** Subscribe to URL changes (global event) */
  onUrlChanged: (listener: (tabId: string, url: string) => void) => () => void;
  /** Subscribe to page meta changes */
  onMetaChanged: (listener: (tabId: string, meta: PageMeta) => void) => () => void;
  /**
   * Subscribe to native "page finished loading" (Tauri only; no-op in browser/preview).
   * Fired after the WebView2's document load completes — used to reveal a freshly
   * created (off-screen) WebView2 only once it has rendered content (no blank flash).
   */
  onPageReady: (listener: (tabId: string) => void) => () => void;
  /** Mute or unmute a tab */
  muteTab: (tabId: string, muted: boolean) => Promise<void>;
  /** Subscribe to audio state changes */
  onAudioStateChanged: (listener: (payload: AudioStatePayload) => void) => () => void;
  /** Subscribe to new-window requests (`target="_blank"` / `window.open`); open a new tab. */
  onOpenNewTab: (listener: (url: string) => void) => () => void;
  /** 订阅被拦截的智能体站点链接点击（仅 Tauri；白名单站点）。 */
  onAgentLink: (listener: (payload: { kind: 'url' | 'file'; url: string }) => void) => () => void;
  /**
   * Refresh the agent-site link-interception parameters on all live browser
   * WebViews (Tauri only; no-op in mock/preview/http). Called after settings
   * change so already-loaded agent pages pick up the new whitelist.
   */
  setAgentIntercept: (
    origins: string[],
    enabled: boolean,
    rules?: AgentSiteRule[],
    overrides?: AgentSiteOverride[],
  ) => Promise<void>;
  /** Set the preferred color scheme on all browser WebViews (Tauri mode) */
  setBrowserColorScheme: (resolvedTheme: 'light' | 'dark') => Promise<void>;
  /** Set zoom level for a specific tab's WebView */
  setZoom: (tabId: string, zoomFactor: number) => Promise<void>;
  /** Clear all cookies for a specific tab's WebView */
  clearCookies: (tabId: string) => Promise<void>;
  /** Clear all cache for a specific tab's WebView */
  clearCache: (tabId: string) => Promise<void>;
}
