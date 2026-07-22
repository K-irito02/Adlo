import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readJson, writeJson } from '../storageHelpers';
import {
  ACTIVE_HEATMAP_TAB_KEY,
  CHART_COLOR_PRESET_KEY,
  type ChartColorPreset,
  type HeatmapTab,
} from '../slices/uiSliceTypes';

describe('ACTIVE_HEATMAP_TAB_KEY', () => {
  it('should have the correct key value', () => {
    expect(ACTIVE_HEATMAP_TAB_KEY).toBe('adl-ui:active-heatmap-tab');
  });
});

describe('HeatmapTab', () => {
  it('should accept valid tab values', () => {
    const tabs: HeatmapTab[] = ['calendar', 'clock', 'activity', 'module'];
    expect(tabs).toHaveLength(4);
  });
});

describe('activeHeatmapTab persistence', () => {
  const key = ACTIVE_HEATMAP_TAB_KEY;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should return default value when localStorage is empty', () => {
    const result = readJson<HeatmapTab>(key, 'calendar');
    expect(result).toBe('calendar');
  });

  it('should persist and retrieve a value via localStorage', () => {
    writeJson(key, 'clock');
    const result = readJson<HeatmapTab>(key, 'calendar');
    expect(result).toBe('clock');
  });

  it('should persist each valid tab value', () => {
    const values: HeatmapTab[] = ['calendar', 'clock', 'activity', 'module'];
    for (const v of values) {
      writeJson(key, v);
      expect(readJson<HeatmapTab>(key, 'calendar')).toBe(v);
    }
  });
});

describe('CHART_COLOR_PRESET_KEY', () => {
  it('should have the correct key value', () => {
    expect(CHART_COLOR_PRESET_KEY).toBe('adl-ui:chart-color-preset');
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
  const key = CHART_COLOR_PRESET_KEY;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should return default value when localStorage is empty', () => {
    const result = readJson<ChartColorPreset>(key, 'bklit-default');
    expect(result).toBe('bklit-default');
  });

  it('should persist and retrieve a value via localStorage', () => {
    writeJson(key, 'cool-ocean');
    const result = readJson<ChartColorPreset>(key, 'bklit-default');
    expect(result).toBe('cool-ocean');
  });

  it('should persist each valid preset value', () => {
    const values: ChartColorPreset[] = [
      'bklit-default',
      'cool-ocean',
      'warm-sunset',
      'high-contrast',
    ];
    for (const v of values) {
      writeJson(key, v);
      expect(readJson<ChartColorPreset>(key, 'bklit-default')).toBe(v);
    }
  });
});
