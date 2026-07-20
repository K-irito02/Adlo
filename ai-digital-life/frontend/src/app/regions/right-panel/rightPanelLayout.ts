export type RightPanelMode = 'docked' | 'overlay_partial' | 'overlay_full';

export interface RightPanelOverlayState {
  overlayActive: boolean;
  overlayExpanded: boolean;
}

export function deriveRightPanelOverlayState(
  mode: RightPanelMode,
  collapsed: boolean,
): RightPanelOverlayState {
  if (collapsed || mode === 'docked') {
    return {
      overlayActive: false,
      overlayExpanded: false,
    };
  }

  return {
    overlayActive: true,
    overlayExpanded: mode === 'overlay_full',
  };
}
