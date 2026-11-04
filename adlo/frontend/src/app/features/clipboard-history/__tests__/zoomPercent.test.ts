import { describe, expect, it } from 'vitest';
import { clampZoomRatio, formatZoomPercent, parseZoomPercentInput } from '../zoomPercent';

describe('parseZoomPercentInput', () => {
  it('accepts a bare number and an optional percent sign (half- and full-width)', () => {
    expect(parseZoomPercentInput('120')).toBe(120);
    expect(parseZoomPercentInput('120%')).toBe(120);
    expect(parseZoomPercentInput('120％')).toBe(120);
    expect(parseZoomPercentInput('  120 %  ')).toBe(120);
  });

  it('accepts decimals, a leading plus and a leading-dot form', () => {
    expect(parseZoomPercentInput('120.5')).toBe(120.5);
    expect(parseZoomPercentInput('+80')).toBe(80);
    expect(parseZoomPercentInput('.5')).toBe(0.5);
  });

  it("keeps out-of-range numbers (clamping is the caller's job, not a rejection)", () => {
    expect(parseZoomPercentInput('9999')).toBe(9999);
    expect(parseZoomPercentInput('-5')).toBe(-5);
    expect(parseZoomPercentInput('0')).toBe(0);
  });

  it('rejects empty, non-numeric and malformed entries', () => {
    for (const raw of ['', '   ', '%', 'abc', '12abc', '1.2.3', '1e3', '--5', '1,5']) {
      expect(parseZoomPercentInput(raw), raw).toBeNull();
    }
  });
});

describe('clampZoomRatio', () => {
  it('converts percent to a ratio and clamps to the bounds', () => {
    expect(clampZoomRatio(120, 0.5, 4)).toBe(1.2);
    expect(clampZoomRatio(9999, 0.5, 4)).toBe(4);
    expect(clampZoomRatio(-5, 0.25, 4)).toBe(0.25);
  });

  it('rounds to two decimals so the scale cannot jitter', () => {
    expect(clampZoomRatio(120.1234, 0.5, 4)).toBe(1.2);
  });
});

describe('formatZoomPercent', () => {
  it('renders whole percents', () => {
    expect(formatZoomPercent(1)).toBe('100%');
    expect(formatZoomPercent(0.333)).toBe('33%');
    expect(formatZoomPercent(4)).toBe('400%');
  });
});
