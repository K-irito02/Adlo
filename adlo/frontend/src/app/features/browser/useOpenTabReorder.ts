import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { createDragGhost } from '@features/browser/dragGhost';
import type { DragGhostHandle } from '@features/browser/dragGhost';

const DRAG_THRESHOLD = 4;

interface OpenTabReorderHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, tabId: string) => void;
}

interface OpenTabReorderResult {
  visibleTabs: BrowserTabState[];
  overIndex: number | null;
  handlers: OpenTabReorderHandlers;
}

interface TabDragSession {
  tabId: string;
  row: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  ghost?: DragGhostHandle;
}

export function sortPinnedFirst(tabs: BrowserTabState[]): BrowserTabState[] {
  return [...tabs].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return 0;
  });
}

export function mergePanelTabOrder(
  fullTabs: BrowserTabState[],
  orderedPanelTabs: BrowserTabState[],
): BrowserTabState[] {
  const panelQueue = [...orderedPanelTabs];
  return fullTabs.map((tab) => (tab.location === 'center' ? tab : (panelQueue.shift() ?? tab)));
}

export function validateTarget(tabs: BrowserTabState[], tabId: string, index: number): boolean {
  const visible = sortPinnedFirst(tabs);
  const dragged = visible.find((tab) => tab.id === tabId);
  if (!dragged) {
    return false;
  }
  const pinnedCount = visible.filter((tab) => tab.isPinned).length;
  if (dragged.isPinned && index > pinnedCount) {
    return false;
  }
  if (!dragged.isPinned && index < pinnedCount) {
    return false;
  }
  return true;
}

export function reorderTabs(
  tabs: BrowserTabState[],
  tabId: string,
  index: number,
): BrowserTabState[] | null {
  if (!validateTarget(tabs, tabId, index)) {
    return null;
  }
  const visible = sortPinnedFirst(tabs);
  const from = visible.findIndex((tab) => tab.id === tabId);
  if (from < 0) {
    return null;
  }
  const [moved] = visible.splice(from, 1);
  let insertIndex = index;
  if (from < insertIndex) {
    insertIndex -= 1;
  }
  visible.splice(Math.max(0, Math.min(insertIndex, visible.length)), 0, moved);
  return visible;
}

function targetIndexAt(
  visibleTabs: BrowserTabState[],
  element: Element | null,
  clientY: number,
): number | null {
  if (!element) {
    return null;
  }
  if (element.closest('[data-tab-end]')) {
    return visibleTabs.length;
  }
  const row = element.closest<HTMLElement>('[data-tab-index]');
  if (!row) {
    return null;
  }
  const index = Number(row.dataset.tabIndex);
  if (!Number.isFinite(index)) {
    return null;
  }
  const rect = row.getBoundingClientRect();
  return clientY > rect.top + rect.height / 2 ? index + 1 : index;
}

export function useOpenTabReorder(
  panelTabs: BrowserTabState[],
  onReorder: (tabs: BrowserTabState[]) => void,
): OpenTabReorderResult {
  const sessionRef = useRef<TabDragSession | null>(null);
  const suppressClickRef = useRef(false);
  const overIndexRef = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const visibleTabs = useMemo(() => sortPinnedFirst(panelTabs), [panelTabs]);
  const visibleTabsRef = useRef(visibleTabs);
  visibleTabsRef.current = visibleTabs;

  const setDropIndex = useCallback((index: number | null) => {
    overIndexRef.current = index;
    setOverIndex(index);
  }, []);

  const cleanup = useCallback(() => {
    sessionRef.current?.ghost?.remove();
    sessionRef.current = null;
    setDropIndex(null);
    document.body.classList.remove('adl-browser-tab-dragging');
    document.body.classList.remove('adl-browser-dnd-not-allowed');
  }, [setDropIndex]);

  useEffect(() => () => cleanup(), [cleanup]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>, tabId: string) => {
    if (event.button > 0) {
      return;
    }
    sessionRef.current = {
      tabId,
      row: event.currentTarget,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      if (!session.active) {
        if (
          Math.hypot(event.clientX - session.startX, event.clientY - session.startY) <
          DRAG_THRESHOLD
        ) {
          return;
        }
        session.active = true;
        session.ghost = createDragGhost(session.row, event.clientX, event.clientY);
        try {
          session.row.setPointerCapture(session.pointerId);
        } catch {
          // Pointer capture is best-effort; window listeners still handle the drag.
        }
        document.body.classList.add('adl-browser-tab-dragging');
      }
      event.preventDefault();
      session.ghost?.move(event.clientX, event.clientY);
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const targetIndex = targetIndexAt(visibleTabsRef.current, target, event.clientY);
      const valid = targetIndex !== null && validateTarget(panelTabs, session.tabId, targetIndex);
      document.body.classList.toggle('adl-browser-dnd-not-allowed', !valid);
      if (!valid) {
        setDropIndex(null);
        return;
      }
      setDropIndex(targetIndex);
    };

    const handleUp = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      const wasActive = session.active;
      const targetIndex = overIndexRef.current;
      if (wasActive) {
        event.preventDefault();
        suppressClickRef.current = true;
        if (targetIndex !== null) {
          const next = reorderTabs(panelTabs, session.tabId, targetIndex);
          if (next) {
            onReorder(next);
          }
        }
      }
      cleanup();
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    const handleCancel = () => cleanup();

    const blockClick = (event: MouseEvent) => {
      if (!suppressClickRef.current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('pointermove', handleMove, { passive: false, capture: true });
    window.addEventListener('pointerup', handleUp, true);
    window.addEventListener('pointercancel', handleCancel, true);
    window.addEventListener('blur', cleanup);
    document.addEventListener('click', blockClick, true);
    document.addEventListener('auxclick', blockClick, true);
    return () => {
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('pointerup', handleUp, true);
      window.removeEventListener('pointercancel', handleCancel, true);
      window.removeEventListener('blur', cleanup);
      document.removeEventListener('click', blockClick, true);
      document.removeEventListener('auxclick', blockClick, true);
    };
  }, [cleanup, onReorder, panelTabs, setDropIndex]);

  return {
    visibleTabs,
    overIndex,
    handlers: {
      onPointerDown: handlePointerDown,
    },
  };
}
