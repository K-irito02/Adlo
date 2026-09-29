import { REVEAL_HIGHLIGHT_CLASS, REVEAL_HIGHLIGHT_VIEWPORT_CLASS } from '@utils/revealHighlight';

/**
 * 主内容显示区域「落点高亮的常驻覆盖层」（右侧面板通用）。
 *
 * 宿主内渲染一次即可，由 `@utils/revealHighlight` 的 `highlightElement` 按类名查找并驱动
 * （几何写入内联样式、时长写入 CSS 变量）。宿主须是**不滚动**且 `position: relative` 的容器：
 * - 文件面板：`.adl-tool-editor__surface--preview`（预览面）
 * - 设置面板：`.adl-settings-panel__content-outer`（主内容视口）
 *
 * 视口夹层负责裁剪：高亮条在平滑滚动期间可能位于可视区之外，不裁剪会给宿主制造可滚动溢出。
 */
export function RevealHighlightLayers() {
  return (
    <div className={REVEAL_HIGHLIGHT_VIEWPORT_CLASS} aria-hidden="true">
      <div className={REVEAL_HIGHLIGHT_CLASS} />
    </div>
  );
}
