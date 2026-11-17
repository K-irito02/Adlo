import { describe, expect, it } from 'vitest';
import {
  classifyDiffTier,
  shouldSkipChangeOutline,
  TEXT_HEAVY_PREVIEW_CHARS,
} from './heavyPreviewLimits';
import { profileDiffCost } from './diffCost';

describe('profileDiffCost', () => {
  it('counts lines without splitting the string', () => {
    const profile = profileDiffCost('a\nb\nc', 'a\nb\nc\nd');
    expect(profile.baseLines).toBe(3);
    expect(profile.currentLines).toBe(4);
  });

  it('treats empty content as zero lines', () => {
    const profile = profileDiffCost('', 'x\ny');
    expect(profile.baseLines).toBe(0);
    expect(profile.currentLines).toBe(2);
    expect(profile.baseChars).toBe(0);
  });

  it('counts trailing newline as an extra line', () => {
    expect(profileDiffCost('a\n', '').baseLines).toBe(2);
  });
});

describe('shouldSkipChangeOutline', () => {
  it('skips only the heavy tier (same source as the panel tier)', () => {
    expect(shouldSkipChangeOutline('a', 'b')).toBe(false);
    expect(shouldSkipChangeOutline('x', 'x\n'.repeat(3000))).toBe(false);
    expect(shouldSkipChangeOutline('x', 'x\n'.repeat(10000))).toBe(true);
    const large = 'x'.repeat(TEXT_HEAVY_PREVIEW_CHARS + 1);
    expect(shouldSkipChangeOutline(large, large)).toBe(true);
  });
});

describe('classifyDiffTier', () => {
  it('keeps small diffs in the light tier', () => {
    expect(classifyDiffTier(profileDiffCost('a\nb', 'a\nc'))).toBe('light');
  });

  it('does not degrade a normal 1500-line code diff (cells signal is not a viewer cost)', () => {
    const base = 'a\n'.repeat(1500);
    const current = 'b\n'.repeat(1500);
    expect(classifyDiffTier(profileDiffCost(base, current))).toBe('light');
  });

  it('degrades by line count alone', () => {
    // base 1 行、current 3001 行、字符很少：只由行数触发。
    const profile = profileDiffCost('x', 'x\n'.repeat(3000));
    expect(profile.currentChars).toBeLessThan(TEXT_HEAVY_PREVIEW_CHARS);
    expect(classifyDiffTier(profile)).toBe('degraded');
  });

  it('promotes by line count alone', () => {
    const profile = profileDiffCost('x', 'x\n'.repeat(10001));
    expect(profile.currentChars).toBeLessThan(TEXT_HEAVY_PREVIEW_CHARS);
    expect(classifyDiffTier(profile)).toBe('heavy');
  });

  it('degrades past the light character budget', () => {
    const content = 'x'.repeat(300 * 1024);
    expect(classifyDiffTier(profileDiffCost(content, content))).toBe('degraded');
  });

  it('promotes to heavy past the character gate', () => {
    const content = 'x'.repeat(TEXT_HEAVY_PREVIEW_CHARS + 1);
    expect(classifyDiffTier(profileDiffCost(content, content))).toBe('heavy');
  });

  it('locks the absolute 1 MiB character gate', () => {
    expect(TEXT_HEAVY_PREVIEW_CHARS).toBe(1024 * 1024);
    const gate = 'x'.repeat(TEXT_HEAVY_PREVIEW_CHARS);
    expect(classifyDiffTier(profileDiffCost(gate, gate))).toBe('degraded');
    const over = 'x'.repeat(TEXT_HEAVY_PREVIEW_CHARS + 1);
    expect(classifyDiffTier(profileDiffCost(over, over))).toBe('heavy');
  });

  it('keeps the exact threshold values inside the lighter tier', () => {
    expect(classifyDiffTier(profileDiffCost('x', 'x\n'.repeat(2999)))).toBe('light');
    expect(classifyDiffTier(profileDiffCost('x', 'x\n'.repeat(3000)))).toBe('degraded');
    expect(classifyDiffTier(profileDiffCost('x', 'x\n'.repeat(9999)))).toBe('degraded');
    expect(classifyDiffTier(profileDiffCost('x', 'x\n'.repeat(10000)))).toBe('heavy');
    const gate = 'x'.repeat(TEXT_HEAVY_PREVIEW_CHARS);
    expect(classifyDiffTier(profileDiffCost(gate, gate))).toBe('degraded');
  });
});
