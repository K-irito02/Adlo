import { describe, expect, it } from 'vitest';
import { WEBVIEW_OVERLAY_SELECTOR } from '../useWebViewVisibility';

/**
 * 覆盖「WebView2 窗口遮挡悬浮层」处理方案的悬浮层选择器清单。
 *
 * 原生浏览器标签页是附加在主窗口上的 WebView2 HWND，永远绘制在 DOM 之上，
 * 与 CSS z-index 无关。凡是会渲染到 body 且可能盖在 WebView 区域上方的悬浮层
 * （菜单/下拉/确认对话框/下载暂停框等）都必须登记在此选择器中，以便在用户操作
 * 悬浮层时把 WebView 移出屏幕。若某个新悬浮层类名遗漏在此清单中，会出现该悬浮层
 * 被 WebView 覆盖的 Bug。
 */
describe('WEBVIEW_OVERLAY_SELECTOR', () => {
  it('包含确认对话框遮罩，避免确认框被 WebView 覆盖', () => {
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-confirm-overlay');
  });

  it('保留既有的菜单/下拉等悬浮层选择器', () => {
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-sidebar-menu');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-multitree-entry__menu');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-menu__dropdown');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-search-engine-popover');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-download-menu');
  });

  it('选择器以逗号分隔拼接成合法的 querySelectorAll 输入', () => {
    expect(WEBVIEW_OVERLAY_SELECTOR.split(',').every((s) => s.trim().startsWith('.'))).toBe(true);
  });
});
