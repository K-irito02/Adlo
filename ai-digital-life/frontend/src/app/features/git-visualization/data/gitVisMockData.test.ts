import { describe, it, expect } from 'vitest';
import {
  toBklitAreaData,
  generateCodeLineEvolutionData,
  toHeatmapColumns,
  generateClockHeatmapData,
  generateContributorActivityData,
  generateContributorModuleData,
} from './gitVisMockData';

describe('bklit data adapters', () => {
  it('toBklitAreaData converts evolution data', () => {
    const result = toBklitAreaData(generateCodeLineEvolutionData());
    expect(result.length).toBe(40);
    expect(result[0]).toHaveProperty('date');
    expect(result[0]).toHaveProperty('added');
    expect(result[0]).toHaveProperty('deleted');
  });

  it('toHeatmapColumns converts calendar data to columns', () => {
    const result = toHeatmapColumns();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('bin');
    expect(result[0]).toHaveProperty('bins');
  });

  it('generateClockHeatmapData produces 24 columns × 7 rows with labels', () => {
    const result = generateClockHeatmapData();
    expect(result.length).toBe(24);
    expect(result[0].bins.length).toBe(7);
    expect(result[0]).toHaveProperty('columnLabel');
  });

  it('generateContributorActivityData has correct dimensions', () => {
    const result = generateContributorActivityData();
    expect(result.length).toBe(48);
    expect(result[0].bins.length).toBe(6);
  });

  it('generateContributorModuleData has correct dimensions', () => {
    const result = generateContributorModuleData();
    expect(result.length).toBe(5);
    expect(result[0].bins.length).toBe(6);
    expect(result[0]).toHaveProperty('columnLabel');
  });
});
