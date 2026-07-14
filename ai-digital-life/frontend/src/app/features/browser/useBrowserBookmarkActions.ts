import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { clearFaviconCacheForUrl, clearPageMetaCacheForUrl } from '@utils/fetchPageMeta';

export function useBrowserBookmarkActions() {
  const { browserRemoveTabBookmarks } = useAppStore(
    useShallow((state) => ({
      browserRemoveTabBookmarks: state.browserRemoveTabBookmarks,
    }))
  );

  const handleRemoveBookmarkTab = useCallback(
    (tabId: string, url: string) => {
      const state = useAppStore.getState();
      const owningFolder = state.browserTabFolders.find((f) =>
        f.tabs?.some((t) => t.tabId === tabId && t.url === url)
      );
      const scopeFolderId = owningFolder?.id;
      browserRemoveTabBookmarks(tabId, url, scopeFolderId);
      if (url) {
        clearFaviconCacheForUrl(url);
        clearPageMetaCacheForUrl(url);
      }
    },
    [browserRemoveTabBookmarks]
  );

  return {
    handleRemoveBookmarkTab,
  };
}
