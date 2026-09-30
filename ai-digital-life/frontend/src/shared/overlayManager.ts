const OVERLAY_SELECTORS = [
  '.adl-sidebar-menu',
  '.adl-multitree-entry__menu',
  '.adl-menu__dropdown',
  '.adl-search-engine-popover',
  '.adl-download-menu',
  '.adl-confirm-overlay',
  '.adl-hamburger__dropdown',
  '.adl-hamburger__submenu',
  '.hint-card',
  '.adl-prompt-modal',
  '.adl-clipboard-viewer',
  '.adl-toast',
  '.toast-card',
  '.adl-statusbar__menu',
  '.adl-statusbar__model-menu',
  '.adl-conflict-modal-overlay',
  '.adl-notif-dropdown',
] as const;
// 注意：项目自定义 Tooltip（`.tooltip`）故意不纳入 —— hover 提示出现时不隐藏 WebView2，
// 否则鼠标划过工具栏就会导致页面闪烁消失（2026-09-30 用户需求）。
// 注意：`.toast-card-region` 故意不纳入 —— 它是常驻挂载的空 flex 容器（`gap:8px` 在两个
// 空分组之间撑出一条 400x8 的条带，`pointer-events:none`），会被误判为永久遮挡导致
// WebView 永不恢复；真实 toast 由 `.toast-card` / `.adl-toast`（有内容才挂载）覆盖
//（2026-09-30 日志定位：`manager overlap=TRUE by toast-card-region`）。

export const WEBVIEW_OVERLAY_SELECTOR = OVERLAY_SELECTORS.join(', ');

/**
 * WebView2 隐藏坐标：移出画面而不卸载页面（保留 SPA 状态）。
 * `32767` 为 `Int16.MAX_VALUE` —— WebView2 视为"远在屏外"的安全值。
 * 浏览器面板与 DSH 中间区共用，改动时两侧同步生效。
 */
export const HIDDEN_WEBVIEW_OFFSCREEN_COORD = 32767;

type SubscriberCallback = (isOverlapped: boolean) => void;

/**
 * 判断命中的浮层元素是否需要隐藏 WebView。以下元素不计入：
 * - 零面积 / `display:none` / `visibility:hidden` / `opacity≈0`（常驻空容器、
 *   退出动画残留），否则 WebView 会被误隐藏后永不恢复；
 * - `pointer-events:none` —— WebView2 是 OS 级渲染表面永远盖在 DOM 之上，
 *   不能接收指针事件的元素既不会被交互、视觉上也被 WebView 覆盖，无需隐藏。
 *
 * 仅检查元素自身（不查祖先链）：`display:none`/`visibility:hidden` 祖先会使
 * 后代 rect 归零或继承隐藏而被兜住；唯独祖先 `opacity:0`（子自身 opacity 仍为 1）
 * 不在覆盖范围 —— 当前选择器均为叶子节点，无此模式，新增选择器时须复核该假设。
 */
function isVisibleOverlay(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  // 阈值而非精确 '0'：覆盖渐隐过渡中间帧（如 '0.02'）与序列化差异（如 '0.0'）。
  // 空串视为可见：真实浏览器恒返回解析后的数字串，空串只出现在无样式引擎的环境。
  if (style.opacity !== '' && Number(style.opacity) <= 0.01) {
    return false;
  }
  if (style.pointerEvents === 'none') {
    return false;
  }
  return true;
}

interface Subscriber {
  container: HTMLElement;
  callback: SubscriberCallback;
}

class OverlayManagerClass {
  private observer: MutationObserver | null = null;
  private rafId: number | null = null;
  private subscribers: Set<Subscriber> = new Set();
  private selector = WEBVIEW_OVERLAY_SELECTOR;

  subscribe(container: HTMLElement, callback: SubscriberCallback): () => void {
    const sub: Subscriber = { container, callback };
    this.subscribers.add(sub);

    if (this.subscribers.size === 1) {
      this.startObserver();
    }

    const overlaps = this.checkOverlap(container);
    callback(overlaps);

    return () => {
      this.subscribers.delete(sub);
      if (this.subscribers.size === 0) {
        this.stopObserver();
      }
    };
  }

  checkOverlap(container: HTMLElement): boolean {
    const overlays = document.querySelectorAll(this.selector);
    if (overlays.length === 0) {
      return false;
    }

    const containerRect = container.getBoundingClientRect();

    for (const el of overlays) {
      if (!isVisibleOverlay(el)) {
        continue;
      }
      const overlayRect = el.getBoundingClientRect();
      if (
        overlayRect.left < containerRect.right &&
        overlayRect.right > containerRect.left &&
        overlayRect.top < containerRect.bottom &&
        overlayRect.bottom > containerRect.top
      ) {
        return true;
      }
    }
    return false;
  }

  getSelector(): string {
    return this.selector;
  }

  private scheduleCheck = () => {
    if (this.rafId !== null) {
      return;
    }
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.notifySubscribers();
    });
  };

  private notifySubscribers() {
    for (const sub of this.subscribers) {
      const overlaps = this.checkOverlap(sub.container);
      sub.callback(overlaps);
    }
  }

  private startObserver() {
    if (this.observer) {
      return;
    }
    this.observer = new MutationObserver(this.scheduleCheck);
    // childList 捕获浮层的挂载/卸载；attributes 捕获不经 DOM 增删的显隐切换
    //（class/style 翻转，如退出动画中的 opacity 0 但仍在 DOM 中的元素）。
    // hidden/open/data-state/aria-hidden：一并监听 `<dialog>`、Radix 类组件等
    // 靠属性（而非 class/style）切换显隐的浮层；已有 rAF 合批，成本可接受。
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open', 'data-state', 'aria-hidden'],
    });
    this.notifySubscribers();
  }

  private stopObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

let instance: OverlayManagerClass | null = null;

export function getOverlayManager(): OverlayManagerClass {
  if (!instance) {
    instance = new OverlayManagerClass();
  }
  return instance;
}
