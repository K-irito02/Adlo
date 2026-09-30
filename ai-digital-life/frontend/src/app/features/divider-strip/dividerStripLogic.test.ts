// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  DIVIDER_STRIP_WIDTH,
  stripBoundsFromPanelRect,
  shouldShowStrip,
  stripGenerationKey,
  applyStripDelta,
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
    dshOpen: true,
    startupHidden: true,
    browserToolVisible: true,
    hasBrowserTabs: true,
    centerObscured: false,
  };

  it('shows when dsh webview and browser webview are both live in docked mode', () => {
    expect(shouldShowStrip(base)).toBe(true);
  });

  it.each([
    ['isTauri', { ...base, isTauri: false }],
    ['dshOpen', { ...base, dshOpen: false }],
    ['startupHidden', { ...base, startupHidden: false }],
    ['browserToolVisible', { ...base, browserToolVisible: false }],
    ['hasBrowserTabs', { ...base, hasBrowserTabs: false }],
    ['centerObscured', { ...base, centerObscured: true }],
  ])('hides when %s is off', (_name, input) => {
    expect(shouldShowStrip(input)).toBe(false);
  });
});

describe('stripGenerationKey', () => {
  it('changes when any sibling-ordering signal changes', () => {
    const base = { dshUrl: 'http://u', activeTabId: 't1', tabCount: 2, siblingNonce: 0 };
    const key = stripGenerationKey(base);
    expect(stripGenerationKey({ ...base, dshUrl: 'http://v' })).not.toBe(key);
    expect(stripGenerationKey({ ...base, activeTabId: 't2' })).not.toBe(key);
    expect(stripGenerationKey({ ...base, tabCount: 3 })).not.toBe(key);
    expect(stripGenerationKey({ ...base, siblingNonce: 1 })).not.toBe(key);
    expect(stripGenerationKey(base)).toBe(key);
  });

  it('does not collide when values contain separators', () => {
    const a = stripGenerationKey({
      dshUrl: 'http://u|x',
      activeTabId: 't1',
      tabCount: 2,
      siblingNonce: 0,
    });
    const b = stripGenerationKey({
      dshUrl: 'http://u',
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
