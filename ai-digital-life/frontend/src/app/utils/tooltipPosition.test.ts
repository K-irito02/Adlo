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

    it('slides on preferred side when overlap can be cleared without flipping', () => {
      const triggerRect = createMockDOMRect({
        top: 200,
        left: 100,
        width: 100,
        height: 50,
        right: 200,
        bottom: 250,
      });
      const tooltipRect = { width: 80, height: 30 };

      // 盖住 top 位置（x:110..190, y:162..192），但右侧有空位 →
      // 留在 top、右滑到 x=300（贴住避让区右缘），不翻边
      const avoid = { left: 0, top: 150, right: 300, bottom: 200 };
      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
        avoidRects: [avoid],
      });

      expect(result.placement).toBe('top');
      expect(result.y).toBe(200 - 30 - 8);
      expect(result.x + tooltipRect.width).toBeLessThanOrEqual(avoid.right + 80);
      expect(result.x).toBe(300);
    });

    it('flips to opposite side when sliding cannot clear the overlap', () => {
      const triggerRect = createMockDOMRect({
        top: 200,
        left: 100,
        width: 100,
        height: 50,
        right: 200,
        bottom: 250,
      });
      const tooltipRect = { width: 80, height: 30 };

      // 整条横带都被盖住：top 无论怎么滑都躲不开 → 翻到 bottom
      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
        avoidRects: [{ left: 0, top: 150, right: 1920, bottom: 200 }],
      });

      expect(result.placement).toBe('bottom');
      expect(result.y).toBe(250 + 8);
    });

    it('keeps the preferred side by clamping when only viewport padding is short (toolbar above a WebView)', () => {
      // 真机几何：中心工具栏 28px 按钮紧贴 36px 标题栏（顶部仅 44px），
      // 30px tooltip + offset 8 + padding 8 需要 46px → 首选 top 差 2px 就“放不下”。
      // 修复前会翻到 bottom，落进中心 WebView 避让矩形后被横轴滑到矩形右缘（≈x840）。
      // 期望：留在 top、钳进视口，tooltip 仍悬在按钮正上方。
      const triggerRect = createMockDOMRect({
        top: 44,
        left: 84,
        width: 28,
        height: 28,
        right: 112,
        bottom: 72,
      });
      const tooltipRect = { width: 40, height: 30 };
      const webview = { left: 56, top: 80, right: 840, bottom: 1080 };

      const withAvoid = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
        avoidRects: [webview],
      });
      const withoutAvoid = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
      });

      expect(withAvoid.placement).toBe('top');
      expect(withAvoid).toEqual(withoutAvoid);
      expect(withAvoid.y).toBe(8);
      // 不得被滑移到 WebView 远缘
      expect(withAvoid.x).toBeLessThan(webview.right);
    });

    it('still flips when the preferred side would be clipped by the viewport', () => {
      // 贴边容差只覆盖“内边距不足”，不覆盖“tooltip 被裁切”：
      // 顶部仅 10px 空间、30px tooltip 会被裁掉 → 必须换边。
      const triggerRect = createMockDOMRect({ top: 10, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
        avoidRects: [{ left: 0, top: 0, right: 1920, bottom: 1080 }],
      });

      expect(result.placement).toBe('bottom');
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

    it('slides along cross axis to stay on preferred side instead of flipping', () => {
      // 截图场景：导航栏删除按钮紧贴 Webview 左缘，tooltip 居中会压住 Webview。
      // 期望：仍在 top，但 x 左移、右缘贴住 Webview 左缘。
      const triggerRect = createMockDOMRect({
        top: 155,
        left: 411,
        width: 28,
        height: 28,
        right: 439,
        bottom: 183,
      });
      const tooltipRect = { width: 230, height: 46 };
      const webview = { left: 445, top: 60, right: 1280, bottom: 1000 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
        avoidRects: [webview],
      });

      expect(result.placement).toBe('top');
      expect(result.y).toBe(155 - 46 - 8);
      // 右缘不得压入 Webview，且仍在视口内
      expect(result.x + tooltipRect.width).toBeLessThanOrEqual(webview.left);
      expect(result.x).toBeGreaterThanOrEqual(8);
    });

    it('slides vertically for left/right placements when overlapping avoidRects', () => {
      const triggerRect = createMockDOMRect({
        top: 400,
        left: 411,
        width: 28,
        height: 28,
        right: 439,
        bottom: 428,
      });
      const tooltipRect = { width: 120, height: 40 };
      // Webview 紧贴触发点右侧，right 位与之重叠
      const webview = { left: 447, top: 0, right: 1280, bottom: 1080 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'right',
        offset: 8,
        avoidRects: [webview],
      });

      const tip = {
        left: result.x,
        top: result.y,
        right: result.x + tooltipRect.width,
        bottom: result.y + tooltipRect.height,
      };
      const overlaps = tip.left < webview.right && tip.right > webview.left;
      expect(overlaps).toBe(false);
      expect(tip.top).toBeGreaterThanOrEqual(8);
      expect(tip.bottom).toBeLessThanOrEqual(1080 - 8);
    });

    it('keeps centered position when preferred side is already clear', () => {
      const triggerRect = createMockDOMRect({ top: 400, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
        avoidRects: [{ left: 1500, top: 0, right: 1920, bottom: 1080 }],
      });

      expect(result.placement).toBe('top');
      expect(result.x).toBe(100 + 50 - 40);
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

    it('treats empty avoidRects the same as omitting them', () => {
      const triggerRect = createMockDOMRect({ top: 200, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      const withEmpty = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        avoidRects: [],
      });
      const without = computePosition({ triggerRect, tooltipRect, placement: 'top' });

      expect(withEmpty).toEqual(without);
    });

    it('does not throw for zero-size tooltip rect', () => {
      const triggerRect = createMockDOMRect({ top: 200, left: 100, width: 100, height: 50 });

      const result = computePosition({
        triggerRect,
        tooltipRect: { width: 0, height: 0 },
        placement: 'top',
      });

      expect(result.placement).toBe('top');
      expect(result.y).toBe(200 - 0 - 8);
    });

    it('normalizes inverted and drops zero-area avoidRects', () => {
      const triggerRect = createMockDOMRect({ top: 200, left: 100, width: 100, height: 50 });
      const tooltipRect = { width: 80, height: 30 };

      // 反转矩形应被矫正为正常矩形；零面积应被丢弃（等价于无避让）
      const inverted = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        avoidRects: [{ left: 300, top: 200, right: 0, bottom: 150 }],
      });
      const normalized = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        avoidRects: [{ left: 0, top: 150, right: 300, bottom: 200 }],
      });
      expect(inverted).toEqual(normalized);

      const zeroArea = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        avoidRects: [{ left: 100, top: 100, right: 100, bottom: 100 }],
      });
      const without = computePosition({ triggerRect, tooltipRect, placement: 'top' });
      expect(zeroArea).toEqual(without);
    });

    it('ignores zero-area avoidRects even when preferred side does not fit viewport', () => {
      // 归一化后变空必须等价于未传入：走原有"首选→对侧→fallback"路径。
      // 几何经挑选具判别力：top/bottom 主轴都放不下时，
      // 旧分支（未短路）会试出 left，而原有逻辑回退 bottom——两者 placement 不同。
      // （tooltip 高度取值仅为构造分支分歧，非真实尺寸。）
      const triggerRect = createMockDOMRect({
        top: 500,
        left: 100,
        width: 100,
        height: 50,
        right: 200,
        bottom: 550,
      });
      const tooltipRect = { width: 80, height: 1000 };

      const zeroArea = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
        avoidRects: [{ left: 500, top: 500, right: 500, bottom: 700 }],
      });
      const without = computePosition({ triggerRect, tooltipRect, placement: 'top', offset: 8 });

      expect(zeroArea).toEqual(without);
      expect(zeroArea.placement).toBe('bottom');
    });

    it('falls back to another side when the gap between avoidRects is too narrow to slide into', () => {
      const triggerRect = createMockDOMRect({
        top: 500,
        left: 900,
        width: 100,
        height: 50,
        right: 1000,
        bottom: 550,
      });
      const tooltipRect = { width: 80, height: 30 };

      // 两块 Webview 中间只剩 20px 缝（< tooltip 宽 80），滑移无解 → 必须换边，
      // 且结果不得与任何一块重叠
      const leftBlock = { left: 0, top: 400, right: 900, bottom: 650 };
      const rightBlock = { left: 920, top: 400, right: 1920, bottom: 650 };
      const result = computePosition({
        triggerRect,
        tooltipRect,
        placement: 'top',
        offset: 8,
        avoidRects: [leftBlock, rightBlock],
      });

      const tip = {
        left: result.x,
        top: result.y,
        right: result.x + tooltipRect.width,
        bottom: result.y + tooltipRect.height,
      };
      const overlaps = [leftBlock, rightBlock].some(
        (r) => tip.left < r.right && tip.right > r.left && tip.top < r.bottom && tip.bottom > r.top,
      );
      expect(overlaps).toBe(false);
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
