import { createPortal } from 'react-dom';

export interface DndIndicator {
  kind: 'insert' | 'into' | 'invalid';
  top: number;
  left: number;
  width: number;
  height: number;
}

interface DndOverlayProps {
  indicator: DndIndicator | null;
  overlayClassName?: string;
  insertClassName?: string;
  intoClassName?: string;
}

/**
 * 拖拽投放指示器：只保留细插入线与柔和容器高亮；禁用态不渲染（由光标表达）。
 *
 * 必须 portal 到 `document.body`：右侧面板内容容器带 `transform` / `will-change`，
 * 会成为 `position: fixed` 的包含块，留在面板内会让视口坐标再叠加一次面板原点偏移。
 */
export function DndOverlay({
  indicator,
  overlayClassName = 'adl-dnd-overlay',
  insertClassName = 'adl-dnd-insert-line',
  intoClassName = 'adl-dnd-into',
}: DndOverlayProps) {
  if (!indicator || indicator.kind === 'invalid') {
    return null;
  }

  return createPortal(
    <div className={overlayClassName} aria-hidden="true">
      {indicator.kind === 'insert' ? (
        <div
          className={`${insertClassName} adl-dnd-insert-line`}
          style={{
            top: indicator.top,
            left: indicator.left,
            width: indicator.width,
          }}
        />
      ) : (
        <div
          className={intoClassName}
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
