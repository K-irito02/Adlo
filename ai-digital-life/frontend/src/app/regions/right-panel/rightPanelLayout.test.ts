import { describe, expect, it } from 'vitest';
import {
  deriveRightPanelOverlayState,
  resolveOverlayAnchorWidth,
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

describe('resolveOverlayAnchorWidth (事项 8)', () => {
  it('clears the anchor when docked', () => {
    expect(
      resolveOverlayAnchorWidth('overlay_partial', 'docked', 1380, 1400, false),
    ).toBeUndefined();
    expect(resolveOverlayAnchorWidth('overlay_full', 'docked', 1380, 1400, true)).toBeUndefined();
  });

  it('sets the live threshold on docked-to-overlay entry', () => {
    expect(resolveOverlayAnchorWidth('docked', 'overlay_partial', undefined, 1380, false)).toBe(
      1380,
    );
    expect(resolveOverlayAnchorWidth('docked', 'overlay_full', 500, 1380, false)).toBe(1380);
  });

  it('keeps a set anchor across continuous overlay changes', () => {
    // 窗口 resize / 拖拽不重定（编辑器换行稳定优先）。
    expect(resolveOverlayAnchorWidth('overlay_partial', 'overlay_partial', 1380, 1500, false)).toBe(
      1380,
    );
    expect(resolveOverlayAnchorWidth('overlay_full', 'overlay_partial', 1380, 1500, false)).toBe(
      1380,
    );
  });

  it('falls back to the live threshold when no anchor is stored', () => {
    expect(
      resolveOverlayAnchorWidth('overlay_partial', 'overlay_partial', undefined, 1500, false),
    ).toBe(1500);
  });

  it('rebases the anchor to the live threshold on left-sidebar toggle', () => {
    // 左栏 260→0 后阈值 1380→1640：不重定则后续翻转瞬间中心宽跳变 260px（事项 8 跳动）。
    expect(resolveOverlayAnchorWidth('overlay_full', 'overlay_full', 1380, 1640, true)).toBe(1640);
    expect(resolveOverlayAnchorWidth('overlay_partial', 'overlay_partial', 1380, 1640, true)).toBe(
      1640,
    );
  });
});
