import { describe, expect, it } from 'vitest';
import { PANE_COLORS, paneColor } from '../paneColors';

describe('paneColors', () => {
  it('exposes at least 8 mutually distinct colors', () => {
    expect(PANE_COLORS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(PANE_COLORS).size).toBe(PANE_COLORS.length);
  });

  it('maps neighbouring indices to different colors', () => {
    expect(paneColor(0)).not.toBe(paneColor(1));
  });

  it('wraps out-of-range indices modulo the palette length', () => {
    expect(paneColor(PANE_COLORS.length)).toBe(paneColor(0));
    expect(paneColor(PANE_COLORS.length + 2)).toBe(paneColor(2));
  });

  it('normalizes negative indices into range', () => {
    expect(paneColor(-1)).toBe(paneColor(PANE_COLORS.length - 1));
  });
});
