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
 * 标签页媒体快照（事项 17 路线 A）。
 *
 * 由注入脚本 `init_script.js` 上报：`title` 优先取站点自己的
 * `navigator.mediaSession.metadata.title`（与 Edge 卡片同源），回退页面标题；
 * `paused/ended/position/duration` 取自页面里「正在播放优先」的那个媒体元素。
 * 仅桌面端（`MediaSessionService` 关闭后，系统卡片由 Rust SMTC 承载）会收到。
 * 卡片只显示标题，因此不再携带 artist/album。
 */
export interface BrowserMediaStatePayload {
  tabId: string;
  title: string;
  paused: boolean;
  ended: boolean;
  /** 秒。 */
  position: number;
  /** 秒；未知为 0。 */
  duration: number;
}

/** 页面内新窗口请求（`target="_blank"` / 修饰键点击 / 原生 `window.open`）的发起标签与目标 URL。 */
export interface BrowserNewTabRequest {
  /** 发起请求的浏览器标签 id（前端据此决定开在中心还是右侧面板）。 */
  tabId: string;
  url: string;
  /**
   * 发起页面的 referrer（用于新标签首次导航的 `Referer` 头）：默认策略下同源为
   * 去 fragment 的完整 URL、跨源为 origin；`rel="noreferrer"` / 等价
   * `referrerpolicy` / HTTPS→HTTP 降级时为缺省（`null`，按无 referrer 处理）。
   * 原生 `NewWindowRequested` 路径与浏览器模式也不携带该字段。
   */
  referrer?: string | null;
}

/** 系统卡片按钮 → 标签页内媒体元素（仅桌面端）。 */
export type BrowserMediaCommand = 'play' | 'pause' | 'stop';

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
    /**
     * 宿主分组：Tauri 据此选择 WebView2 用户数据目录。默认共享（中心与面板同 UDF）；
     * 关闭「共享浏览配置文件」后中心走独立 UDF（ADR 0001 修订版）。缺省按面板处理。
     */
    location?: 'panel' | 'center',
    /** 智能体站点白名单 origin 列表（注入 WebView2 链接拦截；缺省不拦截）。 */
    agentOrigins?: string[],
    /** 是否启用智能体站点链接拦截。 */
    agentInterceptEnabled?: boolean,
    /** 全局 agent-site 拦截规则（调用方必须传已解析规则；缺省不注入规则 → 不拦截）。 */
    agentSiteRules?: AgentSiteRule[],
    /** 按 origin 的 agent-site 规则覆盖。 */
    agentSiteOverrides?: AgentSiteOverride[],
    /** 面板与中心是否共用一个浏览配置文件（仅 Tauri 桌面生效；缺省按共享处理）。 */
    shareProfile?: boolean,
    /**
     * 新标签首次导航的 `Referer` 值（默认策略下同源完整 URL / 跨源 origin；
     * 缺省不设置）。仅桌面 WebView2 生效，浏览器模式/非 Windows 无对应能力。
     */
    referrer?: string | null,
    /**
     * 初始视口尺寸（CSS px）。WebView 先在屏外以该尺寸创建/加载，再揭示到最终
     * 位置，避免页面按默认 800×600 布局后二次 resize 导致的重排闪烁。
     */
    initialSize?: { width: number; height: number },
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
  /**
   * 订阅标签页内的站点媒体快照（事项 17 路线 A，仅桌面端；浏览器/预览为 no-op）。
   * 系统卡片由 Rust SMTC 承载，标签页的站点 `navigator.mediaSession` 元数据与
   * 播放进度经这里进入前端，再统一定夺卡片归属。
   */
  onMediaStateChanged: (listener: (payload: BrowserMediaStatePayload) => void) => () => void;
  /**
   * 把系统卡片的播放/暂停/停止作用到标签页内的媒体元素（仅桌面端）。
   * 浏览器/预览模式下卡片由 `navigator.mediaSession` 自己处理，这里为 no-op。
   */
  mediaControlTab: (tabId: string, action: BrowserMediaCommand) => Promise<void>;
  /** Subscribe to new-window requests (`target="_blank"` / `window.open`); open a new tab. */
  onOpenNewTab: (listener: (request: BrowserNewTabRequest) => void) => () => void;
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
  /** 忽略 HTTP 缓存重新加载该标签页（「强制刷新」；Tauri only） */
  hardReloadTab: (tabId: string) => Promise<void>;
  /**
   * 打开该标签页**自己的** DevTools 窗口（Tauri only）。
   *
   * 不能复用 Tauri 内置的 `internal_toggle_devtools`：它在不传 label 时作用于
   * 发起 invoke 的 webview（应用壳），打不到标签页的子 WebView。
   */
  openDevtools: (tabId: string) => Promise<void>;
  /** 清除该标签页**当前站点**的 Cookie（站点级；Tauri only） */
  clearSiteCookies: (tabId: string) => Promise<void>;
  /**
   * 清除**全局** Cookie 罐（同一 profile 的所有标签页共享，不是“只清当前标签”）
   *
   * `tabId` 仅用于定位一个存活的 WebView 句柄来下发清理命令。
   */
  clearCookies: (tabId: string) => Promise<void>;
  /** 清除**全局** HTTP 缓存，完成后重载该标签页（`tabId` 只用于定位句柄） */
  clearCache: (tabId: string) => Promise<void>;
  /**
   * 清除该标签页**当前站点**的站点数据（离线包 / Service Worker / 本地库 /
   * 草稿，不含 Cookie），完成后重载该标签页。Tauri only。
   */
  clearSiteCache: (tabId: string) => Promise<void>;
}
