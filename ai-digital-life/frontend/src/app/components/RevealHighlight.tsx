import { REVEAL_HIGHLIGHT_CLASS, REVEAL_HIGHLIGHT_VIEWPORT_CLASS } from '@utils/revealHighlight';

/**
 * 主内容显示区域「落点高亮的常驻覆盖层」（右侧面板通用）。
 *
 * 宿主内渲染一次即可，由 `@utils/revealHighlight` 的 `highlightElement` 按类名查找并驱动
 * （几何写入内联样式、时长写入 CSS 变量）。宿主契约：
 * - `position: relative`（覆盖层以其为定位锚）；
 * - **不得实际滚动** —— 对齐只按 `offsetParent` 的矩形差计算，宿主一旦真滚动，高亮条不会跟随。
 *   两处消费方按事实成立：设置面板 `.adl-settings-panel__content-outer` 无 `overflow` 声明；
 *   文件面板 `.adl-tool-editor__surface--preview` 虽声明 `overflow-y: auto`，但
 *   `editor-surface.css` 的填充规则把直接子元素夹在 `height: 100%`，故实际不滚
 *   —— 该前提由 `revealOverlayWiring.test.ts` 守护。
 */
export function RevealHighlightLayers() {
  return (
    <div className={REVEAL_HIGHLIGHT_VIEWPORT_CLASS} aria-hidden="true">
      <div className={REVEAL_HIGHLIGHT_CLASS} />
    </div>
  );
}
