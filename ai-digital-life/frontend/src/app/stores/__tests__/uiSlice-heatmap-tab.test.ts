import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readJson, writeJson } from '../storageHelpers';
import { ACTIVE_HEATMAP_TAB_KEY, type HeatmapTab } from '../slices/uiSliceTypes';

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
