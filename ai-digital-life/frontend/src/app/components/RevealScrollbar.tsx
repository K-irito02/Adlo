import type { RevealScrollbarController } from '../hooks/useRevealScrollbar';

export function RevealScrollbar({ controller }: { controller: RevealScrollbarController }) {
  if (!controller.scrollable) {
    return null;
  }
  const { visible, thumbStyle, thumbListeners } = controller;
  return (
    <div className="adl-reveal-scrollbar" data-visible={visible} aria-hidden="true">
      <div className="adl-reveal-scrollbar__thumb" style={thumbStyle} {...thumbListeners} />
    </div>
  );
}
