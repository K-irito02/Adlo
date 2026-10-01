import { describe, expect, it, vi, beforeEach } from 'vitest';
import { computePosition, type Alignment } from './tooltipPosition';

function createMockDOMRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    x: 100,
    y: 100,
    width: 100,
    height: 50,
    top: 100,
    right: 200,
    bottom: 150,
    left: 100,
    ...overrides,
  } as DOMRect;
}

describe('tooltipPosition', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      innerWidth: 1920,
      innerHeight: 1080,
    });
  });

  describe('computePosition', () => {
    it('positions tooltip above trigger for top placement', () => {
      const triggerRect = createMockDOMRect({ top: 200, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
      });

      expect(result.placement).toBe('top');
      expect(result.x).toBe(100 + 50 - 40);
      expect(result.y).toBe(200 - 30 - 8);
    });

    it('positions tooltip below trigger for bottom placement', () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'bottom',
        offset: 8,
      });

      expect(result.placement).toBe('bottom');
      expect(result.y).toBe(150 + 8);
    });

    it('positions tooltip left of trigger for left placement', () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 200, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'left',
        offset: 8,
      });

      expect(result.placement).toBe('left');
      expect(result.x).toBe(200 - 80 - 8);
    });

    it('positions tooltip right of trigger for right placement', () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'right',
        offset: 8,
      });

      expect(result.placement).toBe('right');
      expect(result.x).toBe(200 + 8);
    });

    it('respects custom offset', () => {
      const triggerRect = createMockDOMRect({ top: 200, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 20,
      });

      expect(result.y).toBe(200 - 30 - 20);
    });

    it('respects alignment start', () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'bottom',
        alignment: 'start' as Alignment,
      });

      expect(result.x).toBe(100);
    });

    it('respects alignment end', () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'bottom',
        alignment: 'end' as Alignment,
      });

      expect(result.x).toBe(120);
    });

    it('returns position without arrow fields (arrow removed)', () => {
      const triggerRect = createMockDOMRect({ top: 200, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      for (const placement of ['top', 'bottom', 'left', 'right'] as const) {
        const result = computePosition({ triggerRect, tooltipRect, placement });
        expect(result.placement).toBe(placement);
        expect('arrowX' in result).toBe(false);
        expect('arrowY' in result).toBe(false);
      }
    });

    it('keeps preferred placement when it does not overlap avoidRects', () => {
      const triggerRect = createMockDOMRect({ top: 200, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
        avoidRects: [{ left: 1500, top: 800, right: 1900, bottom: 1000 }],
      });

      expect(result.placement).toBe('top');
      expect(result.y).toBe(200 - 30 - 8);
    });

    it('flips to opposite side when preferred placement overlaps avoidRects', () => {
      const triggerRect = createMockDOMRect({
        top: 200,
        left: 100,
        width: 100,
        height: 50,
        right: 200,
        bottom: 250,
      });
      const tooltipRect = { width: 80, height: 30 };

      // 盖住 top 位置（x:110..190, y:162..192）
      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
        avoidRects: [{ left: 0, top: 150, right: 300, bottom: 200 }],
      });

      expect(result.placement).toBe('bottom');
      expect(result.y).toBe(250 + 8);
    });

    it('tries remaining sides when both preferred and opposite overlap', () => {
      const triggerRect = createMockDOMRect({
        top: 500,
        left: 900,
        width: 100,
        height: 50,
        right: 1000,
        bottom: 550,
      });
      const tooltipRect = { width: 80, height: 30 };

      // 上下都被盖住，左右空旷 → 应选 left（trialOrder 中 left 先于 right）
      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
        avoidRects: [
          { left: 0, top: 400, right: 1920, bottom: 500 },
          { left: 0, top: 550, right: 1920, bottom: 650 },
        ],
      });

      expect(result.placement).toBe('left');
      const tip = {
        left: result.x,
        top: result.y,
        right: result.x + tooltipRect.width,
        bottom: result.y + tooltipRect.height,
      };
      const avoidRects = [
        { left: 0, top: 400, right: 1920, bottom: 500 },
        { left: 0, top: 550, right: 1920, bottom: 650 },
      ];
      const overlaps = avoidRects.some(
        (r) => tip.left < r.right && tip.right > r.left && tip.top < r.bottom && tip.bottom > r.top,
      );
      expect(overlaps).toBe(false);
    });

    it('falls back to original behavior when every side overlaps avoidRects', () => {
      const triggerRect = createMockDOMRect({ top: 10, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };
      const giant = [{ left: 0, top: 0, right: 1920, bottom: 1080 }];

      const withAvoid = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
        avoidRects: giant,
      });
      const withoutAvoid = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
      });

      expect(withAvoid).toEqual(withoutAvoid);
      expect(withAvoid.placement).toBe('bottom');
    });

    it('flips placement when not fitting in viewport', () => {
      const triggerRect = createMockDOMRect({ top: 10, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
      });

      expect(result.placement).toBe('bottom');
    });

    it('clamps position to viewport bounds', () => {
      const triggerRect = createMockDOMRect({ top: 100, left: -500, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'bottom',
        viewportPadding: 8,
      });

      expect(result.x).toBeGreaterThanOrEqual(8);
    });

    it('handles centered alignment by default', () => {
      const triggerRect = createMockDOMRect({ top: 100, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'bottom',
      });

      expect(result.x).toBe(100 + 50 - 40);
    });
  });
});
