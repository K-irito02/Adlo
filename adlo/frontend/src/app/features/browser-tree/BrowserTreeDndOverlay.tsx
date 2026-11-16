import { createPortal } from 'react-dom';
import type { BrowserTreeDndIndicator } from './useBrowserTreeDnd';

interface BrowserTreeDndOverlayProps {
  indicator: BrowserTreeDndIndicator | null;
}

/**
 * 拖拽投放指示器：只保留细插入线与柔和容器高亮。
 * 不使用虚线框、文字提示或幽灵占位行；禁用态由光标表达。
 *
 * 必须 portal 到 `document.body`：右侧面板内容容器带有
 * `transform` / `will-change`，会成为 `position: fixed` 的包含块，
 * 若把 overlay 留在面板内部，视口坐标会被再叠加一次面板原点偏移，
 * 导致插入线和高亮整体错位一行。portal 后 fixed 以视口为基准，
 * 与 `getBoundingClientRect()` 坐标系一致。
 */
export function BrowserTreeDndOverlay({ indicator }: BrowserTreeDndOverlayProps) {
  if (!indicator || indicator.kind === 'invalid') {
    return null;
  }

  return createPortal(
    <div className="adl-browser-dnd-overlay" aria-hidden="true">
      {indicator.kind === 'insert' ? (
        <div
          className="adl-browser-dnd-insert-line"
          style={{
            top: indicator.top,
            left: indicator.left,
            width: indicator.width,
          }}
        />
      ) : (
        <div
          className={
            indicator.kind === 'into' ? 'adl-browser-dnd-into' : 'adl-browser-dnd-new-root'
          }
          style={{
            top: indicator.top,
            left: indicator.left,
            width: indicator.width,
            height: indicator.height,
          }}
        />
      )}
    </div>,
    document.body,
  );
}
