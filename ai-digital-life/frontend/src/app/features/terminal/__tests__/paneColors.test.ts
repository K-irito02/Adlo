import { describe, expect, it } from 'vitest';
import { PANE_COLORS, paneColor } from '../paneColors';

describe('paneColors', () => {
  it('exposes at least 8 mutually distinct colors', () => {
    expect(PANE_COLORS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(PANE_COLORS).size).toBe(PANE_COLORS.length);
  });

  it('uses the curated palette for the first PANE_COLORS.length indices', () => {
    PANE_COLORS.forEach((color, index) => {
      expect(paneColor(index)).toBe(color);
    });
  });

  it('maps the first 8 indices to the --pane-color-N design tokens', () => {
    for (let index = 0; index < PANE_COLORS.length; index += 1) {
      expect(paneColor(index)).toBe(`var(--pane-color-${index + 1})`);
    }
  });

  it('gives every pane a distinct color past the curated palette (spec §9)', () => {
    const colors = Array.from({ length: 16 }, (_, index) => paneColor(index));
    expect(new Set(colors).size).toBe(16);
  });

  it('maps neighbouring indices to different colors', () => {
    expect(paneColor(0)).not.toBe(paneColor(1));
    expect(paneColor(PANE_COLORS.length)).not.toBe(paneColor(PANE_COLORS.length - 1));
  });

  it('always returns a valid color, including for negative indices', () => {
    expect(paneColor(PANE_COLORS.length)).toMatch(/^hsl\(\d+ 60% 45%\)$/);
    expect(paneColor(-1)).toMatch(/^hsl\(\d+ 60% 45%\)$/);
  });
});
