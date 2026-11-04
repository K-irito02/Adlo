import { describe, expect, it, afterEach } from 'vitest';
import { getWebViewAvoidRects } from './webviewAvoidRects';

function mockRect(el: Element, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      ...rect,
    }) as DOMRect;
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe('getWebViewAvoidRects', () => {
  it('returns empty list outside Tauri shell (browser/iframe mode needs no avoidance)', () => {
    const el = document.createElement('div');
    el.className = 'adl-tool-primary--browser';
    document.body.appendChild(el);

    expect(getWebViewAvoidRects()).toEqual([]);
  });

  it('collects browser primary rects inside Tauri shell', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};

    const browser = document.createElement('div');
    browser.className = 'adl-tool-primary adl-tool-primary--browser';
    mockRect(browser, { left: 1200, top: 50, right: 1900, bottom: 1000, width: 700, height: 950 });
    document.body.appendChild(browser);

    expect(getWebViewAvoidRects()).toEqual([{ left: 1200, top: 50, right: 1900, bottom: 1000 }]);
  });

  it('collects the center browser content rect inside Tauri shell', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};

    const center = document.createElement('div');
    center.className = 'adl-center-browser__content';
    // 中心视图只在确有原生 WebView 时设置该属性（见 CenterBrowserView）。
    center.setAttribute('data-webview-active', 'true');
    mockRect(center, { left: 300, top: 50, right: 1000, bottom: 1000, width: 700, height: 950 });
    document.body.appendChild(center);

    expect(getWebViewAvoidRects()).toEqual([{ left: 300, top: 50, right: 1000, bottom: 1000 }]);
  });

  it('skips the center content without data-webview-active (no native WebView)', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};

    const center = document.createElement('div');
    center.className = 'adl-center-browser__content';
    mockRect(center, { left: 300, top: 50, right: 1000, bottom: 1000, width: 700, height: 950 });
    document.body.appendChild(center);

    expect(getWebViewAvoidRects()).toEqual([]);
  });

  it('skips zero-area containers (collapsed panels / not mounted)', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};

    const collapsed = document.createElement('div');
    collapsed.className = 'adl-tool-primary--browser';
    mockRect(collapsed, { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
    document.body.appendChild(collapsed);

    expect(getWebViewAvoidRects()).toEqual([]);
  });
});
