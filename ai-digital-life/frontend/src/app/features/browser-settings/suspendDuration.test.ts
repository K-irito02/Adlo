import { describe, it, expect } from 'vitest';
import {
  SUSPEND_MIN_MS,
  SUSPEND_MAX_MS,
  isSuspendPreset,
  isSuspendUnit,
  seedSuspendUnit,
  suspendMsFromCustom,
  suspendUnitMax,
  formatMsForUnit,
} from './suspendDuration';

describe('suspendDuration (自定义挂起时长纯函数)', () => {
  it('converts a custom amount to milliseconds per unit', () => {
    expect(suspendMsFromCustom(30, 's')).toBe(30_000);
    expect(suspendMsFromCustom(90, 's')).toBe(90_000);
    expect(suspendMsFromCustom(15, 'm')).toBe(900_000);
    expect(suspendMsFromCustom(2, 'h')).toBe(7_200_000);
    expect(suspendMsFromCustom(1, 'd')).toBe(86_400_000);
  });

  it('rejects non-finite and non-positive input instead of writing garbage', () => {
    expect(suspendMsFromCustom(Number.NaN, 'm')).toBeNull();
    expect(suspendMsFromCustom(Number.POSITIVE_INFINITY, 'm')).toBeNull();
    expect(suspendMsFromCustom(0, 'm')).toBeNull();
    expect(suspendMsFromCustom(-5, 'm')).toBeNull();
  });

  it('clamps to the 1-second .. 30-day window', () => {
    expect(SUSPEND_MIN_MS).toBe(1_000);
    expect(SUSPEND_MAX_MS).toBe(30 * 86_400_000);
    expect(suspendMsFromCustom(0.4, 's')).toBe(SUSPEND_MIN_MS);
    expect(suspendMsFromCustom(9999, 'd')).toBe(SUSPEND_MAX_MS);
  });

  it('formats stored milliseconds back into the active unit for draft conversion', () => {
    expect(formatMsForUnit(900_000, 'm')).toBe('15');
    expect(formatMsForUnit(900_000, 'h')).toBe('0.25');
    expect(formatMsForUnit(90_000, 's')).toBe('90');
    expect(formatMsForUnit(86_400_000, 'd')).toBe('1');
    expect(formatMsForUnit(5_400_000, 'h')).toBe('1.5');
  });

  it('exposes a per-unit max consistent with the 30-day ceiling', () => {
    expect(suspendUnitMax('s')).toBe(2_592_000);
    expect(suspendUnitMax('m')).toBe(43_200);
    expect(suspendUnitMax('h')).toBe(720);
    expect(suspendUnitMax('d')).toBe(30);
  });

  it('knows the preset ladder (Off/5/15/30/60/120 minutes)', () => {
    expect(isSuspendPreset(0)).toBe(true);
    expect(isSuspendPreset(300_000)).toBe(true);
    expect(isSuspendPreset(900_000)).toBe(true);
    expect(isSuspendPreset(1_800_000)).toBe(true);
    expect(isSuspendPreset(3_600_000)).toBe(true);
    expect(isSuspendPreset(7_200_000)).toBe(true);
    // 非档位值不得被吸附到最近档（自定义态承接）。
    expect(isSuspendPreset(420_000)).toBe(false);
    expect(isSuspendPreset(undefined)).toBe(false);
  });

  it('seeds a custom draft unit from the stored value', () => {
    expect(seedSuspendUnit(7 * 60_000)).toBe('m');
    expect(seedSuspendUnit(90_000)).toBe('s');
    expect(seedSuspendUnit(7_200_000)).toBe('h');
    expect(seedSuspendUnit(86_400_000)).toBe('d');
    // Off (0) 与非法值兜底到分钟，草稿仍可编辑。
    expect(seedSuspendUnit(0)).toBe('m');
  });

  it('guards select-transmitted unit strings', () => {
    expect(isSuspendUnit('s')).toBe(true);
    expect(isSuspendUnit('m')).toBe(true);
    expect(isSuspendUnit('h')).toBe(true);
    expect(isSuspendUnit('d')).toBe(true);
    expect(isSuspendUnit('x')).toBe(false);
  });
});
