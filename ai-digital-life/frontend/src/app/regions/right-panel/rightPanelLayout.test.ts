import { describe, expect, it } from 'vitest';
import {
  deriveRightPanelOverlayState,
  shouldPreserveOverlayFull,
  shouldSkipPassiveLayoutSync,
} from './rightPanelLayout';

describe('rightPanelLayout', () => {
  it('clears overlay state when the panel is collapsed from partial overlay', () => {
    expect(deriveRightPanelOverlayState('overlay_partial', true)).toEqual({
      overlayActive: false,
      overlayExpanded: false,
    });
  });

  it('clears overlay state when the panel is collapsed from full overlay', () => {
    expect(deriveRightPanelOverlayState('overlay_full', true)).toEqual({
      overlayActive: false,
      overlayExpanded: false,
    });
  });

  it('keeps full overlay visible only while expanded', () => {
    expect(deriveRightPanelOverlayState('overlay_full', false)).toEqual({
      overlayActive: true,
      overlayExpanded: true,
    });
  });
});

describe('shouldSkipPassiveLayoutSync', () => {
  it('skips while the page is hidden (minimized/occluded)', () => {
    expect(shouldSkipPassiveLayoutSync(true, 1920, 1920, 1079)).toBe(true);
  });

  it('skips on a degenerate shell width (isolated with a normal viewport)', () => {
    expect(shouldSkipPassiveLayoutSync(false, 0, 1920, 1079)).toBe(true);
    expect(shouldSkipPassiveLayoutSync(false, -1, 1920, 1079)).toBe(true);
    expect(shouldSkipPassiveLayoutSync(false, Number.NaN, 1920, 1079)).toBe(true);
  });

  it('skips the Windows minimize transient (inner collapses, shell rect lags)', () => {
    // 最小化瞬间实测：inner 144x19，而 shell 矩形仍滞后 395。此时必须跳过，
    // 否则宽度 925 会被钳到 rightMaxWidth 320 并提交（恢复后右面板变窄）。
    expect(shouldSkipPassiveLayoutSync(false, 395, 144, 19)).toBe(true);
  });

  it('runs for a visible, non-degenerate viewport', () => {
    expect(shouldSkipPassiveLayoutSync(false, 1920, 1920, 1079)).toBe(false);
    expect(shouldSkipPassiveLayoutSync(false, 640, 640, 480)).toBe(false);
    expect(shouldSkipPassiveLayoutSync(false, 1280, 1280, 800)).toBe(false);
  });
});

describe('shouldPreserveOverlayFull', () => {
  it('does not preserve a stale full mode whose width does not fill the shell', () => {
    // 窗口曾更窄（rightMaxWidth≈1100）时被钳成 overlay_full，窗口变宽后
    // rightMaxWidth=1740 但宽度仍是 1100 —— 不得补满（否则盖住中间区）。
    expect(shouldPreserveOverlayFull('overlay_full', 1100, 1740)).toBe(false);
  });

  it('preserves full only when the panel actually fills the shell', () => {
    expect(shouldPreserveOverlayFull('overlay_full', 1740, 1740)).toBe(true);
    expect(shouldPreserveOverlayFull('overlay_full', 1739, 1740)).toBe(true);
  });

  it('pins the epsilon from both sides and locks the safe direction', () => {
    // 距满宽 2px 即视为非满（-1 tolerance 两侧钉死），退化 rightMaxWidth 一律不保留。
    expect(shouldPreserveOverlayFull('overlay_full', 1738, 1740)).toBe(false);
    expect(shouldPreserveOverlayFull('overlay_full', 1100, Number.NaN)).toBe(false);
  });

  it('never preserves when not in full mode', () => {
    expect(shouldPreserveOverlayFull('docked', 1740, 1740)).toBe(false);
    expect(shouldPreserveOverlayFull('overlay_partial', 1740, 1740)).toBe(false);
  });
});
