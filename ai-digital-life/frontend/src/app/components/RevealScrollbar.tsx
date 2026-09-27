import type { RevealScrollbarController } from '../hooks/useRevealScrollbar';

/** Marker attribute + selector shared with click-exemption consumers (decoupled from the CSS class name). */
export const REVEAL_SCROLLBAR_ATTR = 'data-reveal-scrollbar';
export const REVEAL_SCROLLBAR_SELECTOR = `[${REVEAL_SCROLLBAR_ATTR}]`;

/** 悬停显现式滚动条（竖）。横向点态常驻条见 `HScrollbar`（rev2：横轴样式
 * 已随 settings 换用 HScrollbar 移除，勿向本组件传 `axis: 'horizontal'` 控制器）。 */
export function RevealScrollbar({ controller }: { controller: RevealScrollbarController }) {
  if (!controller.scrollable) {
    return null;
  }
  const { visible, thumbStyle, thumbListeners } = controller;
  return (
    <div
      className="adl-reveal-scrollbar"
      data-reveal-scrollbar
      data-visible={visible}
      aria-hidden="true"
    >
      <div className="adl-reveal-scrollbar__thumb" style={thumbStyle} {...thumbListeners} />
    </div>
  );
}
