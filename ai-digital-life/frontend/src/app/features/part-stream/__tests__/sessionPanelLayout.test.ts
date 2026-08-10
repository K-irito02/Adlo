import { describe, expect, it } from 'vitest';
import { sessionPanelWidthMax, clampSessionPanelWidth } from '../sessionPanelLayout';

describe('sessionPanelLayout', () => {
  it('caps chat panel width reserving review pane minimum', () => {
    expect(sessionPanelWidthMax({ available: 1400, split: false })).toBe(920);
    expect(sessionPanelWidthMax({ available: 1400, split: true })).toBe(600);
  });
  it('clamps stored width to max', () => {
    expect(clampSessionPanelWidth({ width: 1200, available: 1000, split: false })).toBe(520);
    expect(clampSessionPanelWidth({ width: 300, available: 1000, split: false })).toBe(300);
    expect(clampSessionPanelWidth({ width: 500, available: undefined, split: false })).toBe(500);
  });
});
