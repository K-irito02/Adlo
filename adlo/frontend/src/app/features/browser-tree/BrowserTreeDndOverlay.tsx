import { DndOverlay } from '@features/dnd/DndOverlay';
import type { BrowserTreeDndIndicator } from './useBrowserTreeDnd';

interface BrowserTreeDndOverlayProps {
  indicator: BrowserTreeDndIndicator | null;
}

/**
 * 书签树/标签树的投放指示器：共享 `DndOverlay` 的几何与 portal 契约，
 * 仅保留书签树专属的类名（overlay / insert line / into / new-root）与层级样式。
 */
export function BrowserTreeDndOverlay({ indicator }: BrowserTreeDndOverlayProps) {
  if (!indicator || indicator.kind === 'invalid') {
    return null;
  }
  return (
    <DndOverlay
      indicator={{
        kind: indicator.kind === 'insert' ? 'insert' : 'into',
        top: indicator.top,
        left: indicator.left,
        width: indicator.width,
        height: indicator.height,
      }}
      overlayClassName="adl-browser-dnd-overlay"
      insertClassName="adl-browser-dnd-insert-line"
      intoClassName={
        indicator.kind === 'new-root' ? 'adl-browser-dnd-new-root' : 'adl-browser-dnd-into'
      }
    />
  );
}
