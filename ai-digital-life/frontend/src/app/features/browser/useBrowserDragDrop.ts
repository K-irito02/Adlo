import { useCallback, useState } from 'react';
import type { BrowserTabState } from '../../stores/slices/browserSlice';

export function useBrowserDragDrop(
  browserTabs: BrowserTabState[],
  browserReorderTabs: (tabs: BrowserTabState[]) => void
) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string, isPinned: boolean) => {
    e.dataTransfer.setData('text/plain', tabId);
    e.dataTransfer.setData('application/x-browser-tab-isPinned', String(isPinned));
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragOverTabId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, tabId: string, isPinned: boolean) => {
    e.preventDefault();
    const draggedIsPinned = e.dataTransfer.getData('application/x-browser-tab-isPinned') === 'true';
    if (draggedIsPinned === isPinned) {
      setDragOverTabId(tabId);
      e.dataTransfer.dropEffect = 'move';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetTabId: string, targetIsPinned: boolean) => {
      e.preventDefault();
      const draggedTabId = e.dataTransfer.getData('text/plain');
      const draggedIsPinned =
        e.dataTransfer.getData('application/x-browser-tab-isPinned') === 'true';
      if (!draggedTabId || draggedIsPinned !== targetIsPinned || draggedTabId === targetTabId) {
        setDragOverTabId(null);
        return;
      }
      const currentTabs = [...browserTabs];
      const draggedIndex = currentTabs.findIndex((t) => t.id === draggedTabId);
      const targetIndex = currentTabs.findIndex((t) => t.id === targetTabId);
      if (draggedIndex === -1 || targetIndex === -1) {
        setDragOverTabId(null);
        return;
      }
      const [removed] = currentTabs.splice(draggedIndex, 1);
      currentTabs.splice(targetIndex, 0, removed);
      browserReorderTabs(currentTabs);
      setDragOverTabId(null);
    },
    [browserTabs, browserReorderTabs]
  );

  return {
    isDragging,
    dragOverTabId,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
  };
}
