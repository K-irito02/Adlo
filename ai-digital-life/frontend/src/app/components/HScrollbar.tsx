import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { RevealScrollbarController } from '../hooks/useRevealScrollbar';

/** 点态位移变量名：与编辑器 `.adl-cm-hscroll` 同名语义（thumb 中心对齐的点偏移）。 */
const DOT_OFFSET_VAR = '--adl-hscroll-dot-offset';
const DOT_RADIUS = 3;
const THUMB_CLASS = 'adl-hscroll__thumb';

/**
 * 常驻水平滚动条（点态指示器），设计完整提取自文件面板/变更面板的
 * `.adl-cm-hscroll`（CodeMirror 自定义横条，editor-content.css）：
 *
 * - **常驻**：可滚动即显示（区别于 RevealScrollbar 的悬停显现垂直条）；
 * - **静止点态**：6px 圆点、反主题高亮（`--hscroll-thumb-bg`：浅色纯黑/深色纯白），
 *   通过 `--adl-hscroll-dot-offset` 对齐真实滑块中心，随滚动移动；
 * - **悬停展开**：轨道 hover 后展开为常规滑块（min-width 40px、6px 高、
 *   `--hscroll-thumb-hover-bg`），亮度仍略亮；拖拽为 dragging 态；
 * - **轨道点击跳转**：与编辑器 `_onTrackPointerDown` 同语义。
 *
 * 几何与拖拽复用 `useRevealScrollbar(axis='horizontal')`；editor 的
 * `HorizontalScrollManager` 与 CodeMirror 生命周期强耦合，仍保留其自有实现。
 */
export function HScrollbar({ controller }: { controller: RevealScrollbarController }) {
  const [dragging, setDragging] = useState(false);
  const { scrollRef, scrollable, thumbLength, thumbOffset, thumbListeners } = controller;
  if (!scrollable) {
    return null;
  }

  const dotOffset = thumbLength / 2 - DOT_RADIUS;

  const handleTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // 点在滑块上交给拖拽（thumb 的 pointerdown 未 stopPropagation），不触发跳转。
    if ((event.target as HTMLElement).closest(`.${THUMB_CLASS}`)) {
      return;
    }
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const trackRect = event.currentTarget.getBoundingClientRect();
    if (trackRect.width <= 0) {
      return;
    }
    const ratio = (event.clientX - trackRect.left) / trackRect.width;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    el.scrollLeft = ratio * maxScroll;
  };

  return (
    <div className="adl-hscroll" data-reveal-scrollbar aria-hidden="true">
      <div className="adl-hscroll__track" onPointerDown={handleTrackPointerDown}>
        <div
          className={dragging ? `${THUMB_CLASS} is-dragging` : THUMB_CLASS}
          style={
            {
              left: `${thumbOffset}px`,
              width: `${thumbLength}px`,
              [DOT_OFFSET_VAR]: `${dotOffset}px`,
            } as React.CSSProperties
          }
          onPointerDown={(event) => {
            setDragging(true);
            thumbListeners.onPointerDown(event);
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
        />
      </div>
    </div>
  );
}
