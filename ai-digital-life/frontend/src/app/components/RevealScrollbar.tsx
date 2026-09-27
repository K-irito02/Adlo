import type { RevealScrollbarController } from '../hooks/useRevealScrollbar';

/** Marker attribute + selector shared with click-exemption consumers (decoupled from the CSS class name). */
export const REVEAL_SCROLLBAR_ATTR = 'data-reveal-scrollbar';
export const REVEAL_SCROLLBAR_SELECTOR = `[${REVEAL_SCROLLBAR_ATTR}]`;

export function RevealScrollbar({ controller }: { controller: RevealScrollbarController }) {
  if (!controller.scrollable) {
    return null;
  }
  const { visible, thumbStyle, thumbListeners, axis } = controller;
  return (
    <div
      className="adl-reveal-scrollbar"
      data-reveal-scrollbar
      data-axis={axis}
      data-visible={visible}
      aria-hidden="true"
    >
      <div className="adl-reveal-scrollbar__thumb" style={thumbStyle} {...thumbListeners} />
    </div>
  );
}
