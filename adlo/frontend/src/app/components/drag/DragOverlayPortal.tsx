import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface DragOverlayPortalProps {
  visible: boolean;
  position: { x: number; y: number };
  centered?: boolean;
  width?: number;
  height?: number;
  children: ReactNode;
}

export function DragOverlayPortal({
  visible,
  position,
  centered = true,
  width,
  height,
  children,
}: DragOverlayPortalProps) {
  if (!visible) {
    return null;
  }

  return createPortal(
    <>
      {/* Transparent fullscreen blocker: captures pointer events to prevent
          tooltip/hover penetration to elements beneath the drag overlay.
          Document-level mousemove/mouseup listeners still fire via event
          bubbling, and the drag system only uses e.clientX/Y, not e.target. */}
      <div
        className="adl-drag-blocker"
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          cursor: 'grabbing',
          background: 'transparent',
        }}
      />
      <div
        className="adl-drag-overlay-portal"
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          pointerEvents: 'none',
          zIndex: 9999,
        }}
      >
        <div
          className="adl-sortable-item adl-dragging"
          style={{
            position: 'absolute',
            top: centered ? position.y : 0,
            left: centered ? position.x : 0,
            width: width ?? 'auto',
            height: height ?? 'auto',
            transform: centered
              ? 'translate(-50%, -50%)'
              : `translate(${position.x}px, ${position.y}px)`,
          }}
        >
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
