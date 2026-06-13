import { describe, expect, it } from 'vitest';
import { deriveRightPanelOverlayState } from './rightPanelLayout';

describe('rightPanelLayout', () => {
  it('clears overlay state when the panel is collapsed from partial overlay', () => {
    expect(deriveRightPanelOverlayState('overlay_partial', true)).toEqual({
      overlayActive: false,
      overlayExpanded: false,
    });
  });

  it('clears overlay state when the panel is collapsed from full overlay', () => {
    expect(deriveRightPanelOverlayState('overlay_full', true)).toEqual({
      overlayActive: false,
      overlayExpanded: false,
    });
  });

  it('keeps full overlay visible only while expanded', () => {
    expect(deriveRightPanelOverlayState('overlay_full', false)).toEqual({
      overlayActive: true,
      overlayExpanded: true,
    });
  });
});
