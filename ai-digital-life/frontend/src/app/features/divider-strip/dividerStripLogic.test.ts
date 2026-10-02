// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  DIVIDER_STRIP_WIDTH,
  stripBoundsFromPanelRect,
  shouldShowStrip,
  stripGenerationKey,
  applyStripDelta,
  isLiveBrowserWebView,
  resolveCenterWebView,
} from './dividerStripLogic';

describe('stripBoundsFromPanelRect', () => {
  it('centers the strip on the panel left edge with full panel height', () => {
    expect(stripBoundsFromPanelRect({ left: 1000, top: 80, height: 900 })).toEqual({
      x: 997,
      y: 80,
      width: DIVIDER_STRIP_WIDTH,
      height: 900,
    });
  });

  it('rounds fractional rects to integer pixels (Physical bounds convention)', () => {
    expect(stripBoundsFromPanelRect({ left: 1000.4, top: 80.6, height: 900.2 })).toEqual({
      x: 997,
      y: 81,
      width: DIVIDER_STRIP_WIDTH,
      height: 900,
    });
  });

  it('rejects degenerate geometry', () => {
    expect(stripBoundsFromPanelRect({ left: 1000, top: 80, height: 0 })).toBeNull();
    expect(stripBoundsFromPanelRect({ left: 1000, top: 80, height: -5 })).toBeNull();
    expect(stripBoundsFromPanelRect({ left: NaN, top: 80, height: 900 })).toBeNull();
  });
});

describe('shouldShowStrip', () => {
  const base = {
    isTauri: true,
    panelWebViewAtBoundary: true,
    startupHidden: true,
    browserToolVisible: true,
    hasBrowserTabs: true,
    domOverlayActive: false,
  };

  it('shows when the panel webview sits on the boundary hit band (navigator collapsed)', () => {
    expect(shouldShowStrip(base)).toBe(true);
  });

  it.each([
    ['isTauri', { ...base, isTauri: false }],
    ['panelWebViewAtBoundary', { ...base, panelWebViewAtBoundary: false }],
    ['startupHidden', { ...base, startupHidden: false }],
    ['browserToolVisible', { ...base, browserToolVisible: false }],
    ['hasBrowserTabs', { ...base, hasBrowserTabs: false }],
    ['domOverlayActive', { ...base, domOverlayActive: true }],
  ])('hides when %s is on/off', (_name, input) => {
    expect(shouldShowStrip(input)).toBe(false);
  });
});

describe('isLiveBrowserWebView', () => {
  const pool = (ids: string[]) => (tabId: string) => ids.includes(tabId);

  it('有 URL、非 about:blank 且已入池时判定为活跃', () => {
    expect(isLiveBrowserWebView('b1', { b1: { url: 'https://x.test' } }, pool(['b1']))).toBe(true);
  });

  it.each([
    ['tabId 为空', '', { b1: { url: 'https://x.test' } }, ['b1']],
    ['URL 为空', 'b1', { b1: { url: '' } }, ['b1']],
    ['URL 为 about:blank', 'b1', { b1: { url: 'about:blank' } }, ['b1']],
    ['未入池（无原生 WebView）', 'b1', { b1: { url: 'https://x.test' } }, []],
    ['标签悬空', 'missing', { b1: { url: 'https://x.test' } }, ['b1']],
  ])('非活跃：%s', (_name, tabId, tabsById, poolIds) => {
    expect(isLiveBrowserWebView(tabId, tabsById, pool(poolIds as string[]))).toBe(false);
  });
});

describe('resolveCenterWebView', () => {
  const pool = (ids: string[]) => (tabId: string) => ids.includes(tabId);
  const tab = (id: string, kind: string, refId: string | null) => ({ id, kind, refId });

  it('中心浏览器标签有 URL 且已入池时判定为活跃', () => {
    expect(
      resolveCenterWebView({
        centerTabs: [tab('c1', 'browser', 'b1')],
        centerActiveTabId: 'c1',
        browserTabsById: { b1: { url: 'http://localhost:3080' } },
        isTabInPool: pool(['b1']),
      }),
    ).toEqual({ active: true, tabId: 'b1' });
  });

  it('非 openDsh 路径（本地端口等任意网址）同样判定为活跃', () => {
    // 回归护栏：判定不得再依赖 dsh 专属状态，否则桥接条在普通网址下永不出现。
    expect(
      resolveCenterWebView({
        centerTabs: [tab('c1', 'browser', 'b1')],
        centerActiveTabId: 'c1',
        browserTabsById: { b1: { url: 'https://example.com' } },
        isTabInPool: pool(['b1']),
      }).active,
    ).toBe(true);
  });

  it.each([
    ['活动中心标签不是 browser（终端/入口页）', [tab('c1', 'terminal', null)], 'c1', {}, []],
    ['活动中心标签的 refId 为空', [tab('c1', 'browser', null)], 'c1', {}, []],
    [
      '中心标签未入池（无原生 WebView）',
      [tab('c1', 'browser', 'b1')],
      'c1',
      { b1: { url: 'https://x.test' } },
      [],
    ],
    ['URL 为空', [tab('c1', 'browser', 'b1')], 'c1', { b1: { url: '' } }, ['b1']],
    [
      'URL 为 about:blank',
      [tab('c1', 'browser', 'b1')],
      'c1',
      { b1: { url: 'about:blank' } },
      ['b1'],
    ],
    [
      '活动中心标签悬空',
      [tab('c1', 'browser', 'b1')],
      'missing',
      { b1: { url: 'https://x.test' } },
      ['b1'],
    ],
  ])('非活跃：%s', (_name, centerTabs, centerActiveTabId, browserTabsById, poolIds) => {
    expect(
      resolveCenterWebView({
        centerTabs,
        centerActiveTabId,
        browserTabsById,
        isTabInPool: pool(poolIds as string[]),
      }),
    ).toEqual({ active: false, tabId: '' });
  });
});

describe('stripGenerationKey', () => {
  it('changes when any sibling-ordering signal changes', () => {
    const base = {
      centerTabId: 'b1',
      activeTabId: 't1',
      tabCount: 2,
      siblingNonce: 0,
    };
    const key = stripGenerationKey(base);
    expect(stripGenerationKey({ ...base, centerTabId: 'b2' })).not.toBe(key);
    expect(stripGenerationKey({ ...base, activeTabId: 't2' })).not.toBe(key);
    expect(stripGenerationKey({ ...base, tabCount: 3 })).not.toBe(key);
    expect(stripGenerationKey({ ...base, siblingNonce: 1 })).not.toBe(key);
    expect(stripGenerationKey(base)).toBe(key);
  });

  it('does not collide when values contain separators', () => {
    const a = stripGenerationKey({
      centerTabId: 'b1',
      activeTabId: 't1',
      tabCount: 2,
      siblingNonce: 0,
    });
    const b = stripGenerationKey({
      centerTabId: 'b1',
      activeTabId: 'x|t1',
      tabCount: 2,
      siblingNonce: 0,
    });
    expect(a).not.toBe(b);
  });
});

describe('applyStripDelta', () => {
  const clamp = (w: number) => Math.min(600, Math.max(200, w));

  it('widens the panel when dragged left (negative dx)', () => {
    expect(applyStripDelta(400, -50, clamp)).toBe(450);
  });

  it('narrows the panel when dragged right (positive dx)', () => {
    expect(applyStripDelta(400, 30, clamp)).toBe(370);
  });

  it('delegates clamping to the panel geometry', () => {
    expect(applyStripDelta(400, -500, clamp)).toBe(600);
    expect(applyStripDelta(400, 500, clamp)).toBe(200);
  });
});
