import { describe, it, expect } from 'vitest';
import { computeHeatmapDimensions } from './heatmap-utils';

describe('computeHeatmapDimensions min/max clamp', () => {
  const margin = { top: 24, right: 16, bottom: 0, left: 40 };

  it('expands the SVG width past the container when the min clamp overflows (calendar narrow-window case)', () => {
    // 53 week columns in a 300px container: unclamped cell ≈ 4.6px, min 10px
    // forces a 530px plot — the SVG must expand so horizontal scroll reveals
    // cells instead of clipping them to blank.
    const dims = computeHeatmapDimensions({
      width: 300,
      parentHeight: 200,
      margin,
      columnCount: 53,
      rowCount: 7,
      binSize: 0,
      layout: 'fluid',
      separator: null,
      minBinSize: 10,
      maxBinSize: 14,
    });
    expect(dims.binWidth).toBe(10);
    expect(dims.width).toBeGreaterThan(300);
    expect(dims.width).toBe(margin.left + 53 * 10 + margin.right);
  });

  it('keeps the SVG at container width when cells fit without clamping', () => {
    const dims = computeHeatmapDimensions({
      width: 600,
      parentHeight: 200,
      margin,
      columnCount: 53,
      rowCount: 7,
      binSize: 0,
      layout: 'fluid',
      separator: null,
      minBinSize: 10,
      maxBinSize: 14,
    });
    // (600 - 56) / 53 ≈ 10.26 — inside [10, 14], no overflow.
    expect(dims.binWidth).toBeGreaterThanOrEqual(10);
    expect(dims.binWidth).toBeLessThanOrEqual(14);
    expect(dims.width).toBe(600);
  });

  it('caps cell size at maxBinSize on a wide container and keeps the SVG at container width', () => {
    const dims = computeHeatmapDimensions({
      width: 1200,
      parentHeight: 200,
      margin,
      columnCount: 53,
      rowCount: 7,
      binSize: 0,
      layout: 'fluid',
      separator: null,
      minBinSize: 10,
      maxBinSize: 14,
    });
    expect(dims.binWidth).toBe(14);
    expect(dims.width).toBe(1200);
  });

  it('clamps a fixed binSize into [minBinSize, maxBinSize]', () => {
    const dims = computeHeatmapDimensions({
      width: 600,
      parentHeight: 200,
      margin,
      columnCount: 20,
      rowCount: 7,
      binSize: 30,
      layout: 'fluid',
      separator: null,
      minBinSize: 14,
      maxBinSize: 20,
    });
    expect(dims.binWidth).toBe(20);
    // Fixed-size fluid charts always expand the SVG to fit the whole plot.
    expect(dims.width).toBe(margin.left + 20 * 20 + margin.right);
  });

  it('normalizes an inverted min/max pair instead of pinning to the smaller value', () => {
    const dims = computeHeatmapDimensions({
      width: 600,
      parentHeight: 200,
      margin,
      columnCount: 20,
      rowCount: 7,
      binSize: 0,
      layout: 'fluid',
      separator: null,
      minBinSize: 20,
      maxBinSize: 10,
    });
    // min>max is swapped → effective range [10, 20]; (600 - 56) / 20 = 27.2 → 20.
    expect(dims.binWidth).toBe(20);
  });

  it('defaults (no clamp) reproduce the container width for a fitting fluid grid', () => {
    const dims = computeHeatmapDimensions({
      width: 600,
      parentHeight: 200,
      margin,
      columnCount: 10,
      rowCount: 7,
      binSize: 0,
      layout: 'fluid',
      separator: null,
    });
    expect(dims.width).toBe(600);
    expect(dims.binWidth).toBeCloseTo((600 - 56) / 10, 5);
  });

  it('does not divide by zero for degenerate column/row counts', () => {
    const dims = computeHeatmapDimensions({
      width: 600,
      parentHeight: 200,
      margin,
      columnCount: 0,
      rowCount: 0,
      binSize: 0,
      layout: 'fluid',
      separator: null,
      minBinSize: 10,
      maxBinSize: 14,
    });
    expect(Number.isFinite(dims.binWidth)).toBe(true);
    expect(Number.isFinite(dims.width)).toBe(true);
    expect(dims.binWidth).toBe(14);
  });

  it('keeps separator spacing additive under the min clamp (overflow width includes it)', () => {
    // 53 columns + one 8px separator gap in a 300px container: the min clamp
    // fires, and the expanded SVG width must still include the separator
    // spacing so the grid is never clipped at the separator boundary.
    const dims = computeHeatmapDimensions({
      width: 300,
      parentHeight: 200,
      margin,
      columnCount: 53,
      rowCount: 7,
      binSize: 0,
      layout: 'fluid',
      separator: { spacing: 8, atColumns: [10] },
      minBinSize: 10,
      maxBinSize: 14,
    });
    expect(dims.binWidth).toBe(10);
    // 53 × 10 cells + 1 × 8 separator = 538 plot, + margins = 594.
    expect(dims.width).toBe(margin.left + 53 * 10 + 8 + margin.right);
  });
});
