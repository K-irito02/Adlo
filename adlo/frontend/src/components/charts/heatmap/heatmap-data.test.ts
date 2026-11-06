import { describe, expect, it } from 'vitest';
import { buildHeatmapFillScale, HEATMAP_DEFAULT_LEVEL_STYLES } from './heatmap-colors';
import {
  buildHeatmapLevelResolver,
  buildHeatmapLevelThresholds,
  getHeatmapContributionLevel,
} from './heatmap-data';

describe('buildHeatmapLevelThresholds', () => {
  it('falls back to the fixed scale when there are no positive counts', () => {
    const thresholds = buildHeatmapLevelThresholds([0, 0, -1]);
    expect(thresholds.strategy).toBe('fixed');
  });

  it('keeps the fixed semantic scale when every positive count is identical', () => {
    const oneResolver = buildHeatmapLevelResolver([1, 1, 1]);
    expect(oneResolver(1)).toBe(getHeatmapContributionLevel(1));

    const fiveResolver = buildHeatmapLevelResolver([5, 5, 5]);
    expect(fiveResolver(5)).toBe(getHeatmapContributionLevel(5));
  });

  it('splits positive counts into quartile buckets and keeps the max darkest', () => {
    const counts = Array.from({ length: 16 }, (_, i) => i + 1);
    const resolver = buildHeatmapLevelResolver(counts);

    expect(resolver(0)).toBe(0);
    expect(resolver(4)).toBe(1);
    expect(resolver(8)).toBe(2);
    expect(resolver(12)).toBe(3);
    expect(resolver(13)).toBe(4);
    expect(resolver(16)).toBe(4);
  });

  it('uses the dataset distribution, so the same count can move levels', () => {
    const lowSpread = buildHeatmapLevelResolver([1, 2, 3, 4]);
    const highSpread = buildHeatmapLevelResolver([4, 8, 12, 16]);

    expect(lowSpread(4)).toBe(4);
    expect(highSpread(4)).toBe(1);
    expect(highSpread(8)).toBe(2);
    expect(highSpread(16)).toBe(4);
  });

  it('ignores empty cells and ghost sentinels when computing quartiles', () => {
    // P25 lands on 10 here, so retaining 0 / -1 would drag the boundaries down
    // to [1,10,20] and move count 10 from level 1 to level 2.
    const positive = [1, 10, 20, 30, 40, 50, 60, 70];
    const clean = buildHeatmapLevelResolver(positive);
    const withZeros = buildHeatmapLevelResolver([...Array(100).fill(0), ...positive]);
    const withGhosts = buildHeatmapLevelResolver([...Array(100).fill(-1), ...positive]);

    expect(clean(10)).toBe(1);
    expect(clean(70)).toBe(4);
    for (const resolver of [withZeros, withGhosts]) {
      expect(resolver(1)).toBe(clean(1));
      expect(resolver(10)).toBe(clean(10));
      expect(resolver(70)).toBe(clean(70));
    }
  });

  it('steps boundaries across distinct values when the quantiles are tied', () => {
    // 100 cells at 1 flatten P25/P50/P75 onto 1. Level 2/3 must still be
    // reachable instead of sending 2/3/4 straight to the darkest level.
    const resolver = buildHeatmapLevelResolver([...Array(100).fill(1), 2, 3, 4]);

    expect(resolver(1)).toBe(1);
    expect(resolver(2)).toBe(2);
    expect(resolver(3)).toBe(3);
    expect(resolver(4)).toBe(4);
  });

  it('keeps the maximum darkest when the top quartile is flat', () => {
    const resolver = buildHeatmapLevelResolver([1, 2, 3, 4, 4, 4, 4, 4]);

    expect(resolver(1)).toBe(1);
    expect(resolver(2)).toBe(1);
    expect(resolver(3)).toBe(2);
    expect(resolver(4)).toBe(4);
  });

  it('handles non-finite and fractional counts safely', () => {
    expect(getHeatmapContributionLevel(Number.NaN)).toBe(0);
    expect(getHeatmapContributionLevel(Number.POSITIVE_INFINITY)).toBe(0);
    expect(getHeatmapContributionLevel(null)).toBe(0);
    expect(buildHeatmapLevelThresholds([])).toEqual({ thresholds: [0, 0, 0], strategy: 'fixed' });

    const fractional = buildHeatmapLevelResolver([0.1, 0.4]);
    // The cap must stay positive for fractional maxima; the old `max - 0.5`
    // produced negative bounds and sent the minimum straight to level 4.
    expect(fractional(0.1)).toBe(1);
    expect(fractional(0.4)).toBe(4);

    const quantile = buildHeatmapLevelResolver([1, 2, 3, 4]);
    expect(quantile(Number.NaN)).toBe(0);
    expect(quantile(Number.POSITIVE_INFINITY)).toBe(0);
    expect(quantile(null)).toBe(0);
    expect(quantile(undefined)).toBe(0);
  });

  it('drives the five-level fill scale with the same resolver', () => {
    const resolver = buildHeatmapLevelResolver(Array.from({ length: 16 }, (_, i) => i + 1));
    const fillScale = buildHeatmapFillScale(HEATMAP_DEFAULT_LEVEL_STYLES, resolver);

    expect(fillScale(0)).toBe(HEATMAP_DEFAULT_LEVEL_STYLES[0].color);
    expect(fillScale(4)).toBe(HEATMAP_DEFAULT_LEVEL_STYLES[1].color);
    expect(fillScale(16)).toBe(HEATMAP_DEFAULT_LEVEL_STYLES[4].color);
  });
});
