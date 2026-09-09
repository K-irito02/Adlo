import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { asWorkspaceID } from '@shared/branded';
import { removeSiteMetaIfUnreferenced } from './siteMetaCleanup';

export function useBrowserMenuActions() {
  const { browserDeleteHistoryByLevel } = useAppStore(
    useShallow((state) => ({
      browserDeleteHistoryByLevel: state.browserDeleteHistoryByLevel,
    })),
  );

  const handleRemoveFromArea = useCallback((workspaceId: string) => {
    useAppStore.getState().removeWorkspaceFromSidebar(asWorkspaceID(workspaceId));
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
      browserDeleteHistoryByLevel(level, nodePath);
      deletedEntries.forEach((entry) => removeSiteMetaIfUnreferenced(entry.url));
    },
    [browserDeleteHistoryByLevel],
  );

  return {
    handleRemoveFromArea,
    handleDeleteHistoryLevel,
  };
}
