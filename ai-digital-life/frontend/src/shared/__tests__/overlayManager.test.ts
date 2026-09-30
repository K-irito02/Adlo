import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { WEBVIEW_OVERLAY_SELECTOR, getOverlayManager } from '../overlayManager';

function createDiv(className?: string): HTMLElement {
  const el = document.createElement('div');
  if (className) {
    el.className = className;
  }
  return el;
}

function setRect(el: HTMLElement, rect: DOMRect) {
  el.getBoundingClientRect = vi.fn(() => rect);
}

const RECT = (l: number, t: number, r: number, b: number): DOMRect => ({
  left: l,
  top: t,
  right: r,
  bottom: b,
  width: r - l,
  height: b - t,
  x: l,
  y: t,
  toJSON() {},
});

describe('WEBVIEW_OVERLAY_SELECTOR', () => {
  it('包含所有悬浮层类名', () => {
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-sidebar-menu');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-multitree-entry__menu');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-menu__dropdown');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-search-engine-popover');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-download-menu');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-confirm-overlay');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-hamburger__dropdown');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-hamburger__submenu');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.hint-card');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-prompt-modal');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-clipboard-viewer');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-toast');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.toast-card');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-statusbar__menu');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-statusbar__model-menu');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-conflict-modal-overlay');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-notif-dropdown');
    // 项目自定义 tooltip 故意不隐藏 WebView（hover 即藏会导致页面闪烁，2026-09-30 用户需求）
    expect(WEBVIEW_OVERLAY_SELECTOR).not.toContain('.tooltip');
    // 常驻空容器 toast-card-region 故意不纳入：flex gap 撑出的 400x8 幽灵条带会被误判为
    // 永久遮挡导致 WebView 永不恢复（2026-09-30 日志定位）；真实 toast 由 .toast-card 覆盖
    expect(WEBVIEW_OVERLAY_SELECTOR).not.toContain('.toast-card-region');
  });

  it('以逗号分隔的合法 querySelectorAll 格式', () => {
    const parts = WEBVIEW_OVERLAY_SELECTOR.split(',').map((s) => s.trim());
    expect(parts.length).toBe(17);
    expect(parts.every((s) => s.startsWith('.'))).toBe(true);
  });
});

describe('getOverlayManager', () => {
  it('返回同一单例实例', () => {
    const a = getOverlayManager();
    const b = getOverlayManager();
    expect(a).toBe(b);
  });
});

describe('OverlayManager', () => {
  let manager: ReturnType<typeof getOverlayManager>;

  beforeEach(() => {
    manager = getOverlayManager();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('getSelector', () => {
    it('返回 WEBVIEW_OVERLAY_SELECTOR 常量', () => {
      expect(manager.getSelector()).toBe(WEBVIEW_OVERLAY_SELECTOR);
    });
  });

  describe('checkOverlap', () => {
    it('无悬浮层时返回 false', () => {
      const container = createDiv();
      document.body.appendChild(container);
      setRect(container, RECT(0, 0, 100, 100));
      expect(manager.checkOverlap(container)).toBe(false);
    });

    it('悬浮层与容器重叠时返回 true', () => {
      const container = createDiv();
      const overlay = createDiv('adl-sidebar-menu');
      document.body.appendChild(container);
      document.body.appendChild(overlay);
      setRect(container, RECT(0, 0, 100, 100));
      setRect(overlay, RECT(50, 50, 150, 150));
      expect(manager.checkOverlap(container)).toBe(true);
    });

    it('悬浮层与容器不重叠时返回 false', () => {
      const container = createDiv();
      const overlay = createDiv('adl-sidebar-menu');
      document.body.appendChild(container);
      document.body.appendChild(overlay);
      setRect(container, RECT(0, 0, 100, 100));
      setRect(overlay, RECT(200, 200, 300, 300));
      expect(manager.checkOverlap(container)).toBe(false);
    });

    it('仅边接触不算重叠', () => {
      const container = createDiv();
      const overlay = createDiv('adl-menu__dropdown');
      document.body.appendChild(container);
      document.body.appendChild(overlay);
      setRect(container, RECT(0, 0, 100, 100));
      setRect(overlay, RECT(100, 0, 200, 100));
      expect(manager.checkOverlap(container)).toBe(false);
    });

    it('完全包含时返回 true', () => {
      const container = createDiv();
      const overlay = createDiv('adl-confirm-overlay');
      document.body.appendChild(container);
      document.body.appendChild(overlay);
      setRect(container, RECT(50, 50, 150, 150));
      setRect(overlay, RECT(0, 0, 200, 200));
      expect(manager.checkOverlap(container)).toBe(true);
    });

    it('零面积浮层不计入重叠', () => {
      const container = createDiv();
      const overlay = createDiv('adl-sidebar-menu');
      document.body.appendChild(container);
      document.body.appendChild(overlay);
      setRect(container, RECT(0, 0, 100, 100));
      setRect(overlay, RECT(50, 50, 50, 50));
      expect(manager.checkOverlap(container)).toBe(false);
    });

    it('pointer-events:none 的常驻容器不计入重叠', () => {
      const container = createDiv();
      const overlay = createDiv('adl-sidebar-menu');
      overlay.style.pointerEvents = 'none';
      document.body.appendChild(container);
      document.body.appendChild(overlay);
      setRect(container, RECT(0, 0, 100, 100));
      setRect(overlay, RECT(50, 50, 150, 150));
      expect(manager.checkOverlap(container)).toBe(false);
    });

    it('display:none 的浮层不计入重叠', () => {
      const container = createDiv();
      const overlay = createDiv('adl-sidebar-menu');
      overlay.style.display = 'none';
      document.body.appendChild(container);
      document.body.appendChild(overlay);
      setRect(container, RECT(0, 0, 100, 100));
      setRect(overlay, RECT(50, 50, 150, 150));
      expect(manager.checkOverlap(container)).toBe(false);
    });

    it('opacity:0 的退出动画残留不计入重叠', () => {
      const container = createDiv();
      const overlay = createDiv('adl-confirm-overlay');
      overlay.style.opacity = '0';
      document.body.appendChild(container);
      document.body.appendChild(overlay);
      setRect(container, RECT(0, 0, 100, 100));
      setRect(overlay, RECT(50, 50, 150, 150));
      expect(manager.checkOverlap(container)).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('订阅时立即调用 callback（首订阅者触发 startObserver + 直接调用共两次）', () => {
      const container = createDiv();
      document.body.appendChild(container);
      setRect(container, RECT(0, 0, 100, 100));
      const cb = vi.fn();
      manager.subscribe(container, cb);
      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenCalledWith(false);
    });

    it('有重叠时回调收到 true', () => {
      const container = createDiv();
      const overlay = createDiv('adl-sidebar-menu');
      document.body.appendChild(container);
      document.body.appendChild(overlay);
      setRect(container, RECT(0, 0, 100, 100));
      setRect(overlay, RECT(50, 50, 150, 150));
      const cb = vi.fn();
      manager.subscribe(container, cb);
      expect(cb).toHaveBeenCalledWith(true);
    });

    it('取消订阅后不再触发回调', () => {
      const container = createDiv();
      document.body.appendChild(container);
      setRect(container, RECT(0, 0, 100, 100));
      const cb = vi.fn();
      const unsub = manager.subscribe(container, cb);
      const countAfterSub = cb.mock.calls.length;
      unsub();
      document.body.appendChild(createDiv('adl-sidebar-menu'));
      return new Promise((r) => setTimeout(r, 50)).then(() => {
        expect(cb).toHaveBeenCalledTimes(countAfterSub);
      });
    });

    it('多个订阅者互不影响', () => {
      const container1 = createDiv();
      const container2 = createDiv();
      document.body.appendChild(container1);
      document.body.appendChild(container2);
      setRect(container1, RECT(0, 0, 100, 100));
      setRect(container2, RECT(0, 0, 100, 100));
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      manager.subscribe(container1, cb1);
      manager.subscribe(container2, cb2);
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('全部取消订阅后不再触发任何回调', () => {
      const container = createDiv();
      document.body.appendChild(container);
      setRect(container, RECT(0, 0, 100, 100));
      const cb = vi.fn();
      const unsub = manager.subscribe(container, cb);
      const countAfterSub = cb.mock.calls.length;
      unsub();
      expect(cb.mock.calls.length).toBe(countAfterSub);
    });
  });
});
