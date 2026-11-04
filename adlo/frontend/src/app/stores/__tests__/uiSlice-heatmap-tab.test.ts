import { describe, it, expect, beforeEach } from 'vitest';
import { persistField } from '../persisted/apply';
import { hydrateAll, resetHydrationForTest } from '../persisted/hydrate';
import { flushCrossSliceWrites } from '../storageHelpers';
import type { ChartColorPreset, HeatmapTab } from '../slices/uiSliceTypes';

describe('HeatmapTab', () => {
  it('should accept valid tab values', () => {
    const tabs: HeatmapTab[] = ['calendar', 'clock', 'activity', 'module'];
    expect(tabs).toHaveLength(4);
  });
});

describe('activeHeatmapTab persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('defaults to calendar when nothing is stored', () => {
    expect(hydrateAll().patch.activeHeatmapTab).toBe('calendar');
  });

  it('restores a persisted tab', () => {
    persistField('adl:changes.activeHeatmapTab', 'clock');
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.activeHeatmapTab).toBe('clock');
  });

  it('falls back to default for an invalid value', () => {
    localStorage.setItem('adl:changes.activeHeatmapTab', '"bogus"');
    expect(hydrateAll().patch.activeHeatmapTab).toBe('calendar');
  });
});

describe('ChartColorPreset', () => {
  it('should accept valid preset values', () => {
    const presets: ChartColorPreset[] = [
      'bklit-default',
      'cool-ocean',
      'warm-sunset',
      'high-contrast',
    ];
    expect(presets).toHaveLength(4);
  });
});

describe('chartColorPreset persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('defaults to bklit-default when nothing is stored', () => {
    expect(hydrateAll().patch.chartColorPreset).toBe('bklit-default');
  });

  it('restores a persisted preset', () => {
    persistField('adl:changes.chartColorPreset', 'cool-ocean');
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.chartColorPreset).toBe('cool-ocean');
  });

  it('falls back to default for an invalid value', () => {
    localStorage.setItem('adl:changes.chartColorPreset', '"bogus"');
    expect(hydrateAll().patch.chartColorPreset).toBe('bklit-default');
  });
});
