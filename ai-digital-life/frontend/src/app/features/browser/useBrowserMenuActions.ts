import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { clearFaviconCacheForUrl, clearPageMetaCacheForUrl } from '@utils/fetchPageMeta';

export function useBrowserMenuActions() {
  const { browserDeleteHistoryByLevel } = useAppStore(
    useShallow((state) => ({
      browserDeleteHistoryByLevel: state.browserDeleteHistoryByLevel,
    }))
  );

  const handleRemoveFromArea = useCallback((workspaceId: string) => {
    useAppStore.getState().hideWorkspaceFromRightPanels(workspaceId);
  }, []);

  const handleDeleteHistoryLevel = useCallback(
    (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => {
      const state = useAppStore.getState();
      const deletedEntries = state.browserHistory.filter((h) => {
        if (level === 'label') {
          return true;
        }
        const d = new Date(h.visitedAt);
        const y = String(d.getFullYear());
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dy = String(d.getDate()).padStart(2, '0');
        if (level === 'year') {
          const year = nodePath.replace('history:year:', '');
          return String(d.getFullYear()) === year;
        }
        if (level === 'month') {
          const monthKey = nodePath.replace('history:month:', '');
          return `${y}-${m}` === monthKey;
        }
        const dayKey = nodePath.replace('history:day:', '');
        return `${y}-${m}-${dy}` === dayKey;
      });
      deletedEntries.forEach((entry) => {
        if (entry.url) {
          clearFaviconCacheForUrl(entry.url);
          clearPageMetaCacheForUrl(entry.url);
        }
      });
      browserDeleteHistoryByLevel(level, nodePath);
    },
    [browserDeleteHistoryByLevel]
  );

  return {
    handleRemoveFromArea,
    handleDeleteHistoryLevel,
  };
}
