import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { removeSiteMetaIfUnreferenced } from './siteMetaCleanup';

export function useBrowserBookmarkActions() {
  const { browserRemoveBookmark } = useAppStore(
    useShallow((state) => ({
      browserRemoveBookmark: state.browserRemoveBookmark,
    })),
  );

  const handleRemoveBookmark = useCallback(
    (bookmarkId: string, url: string) => {
      const state = useAppStore.getState();
      const owningFolder = state.browserBookmarkFolders.find((folder) =>
        folder.entries?.some((entry) => entry.id === bookmarkId && entry.url === url),
      );
      browserRemoveBookmark(bookmarkId, url, owningFolder?.id);
      if (url) {
        removeSiteMetaIfUnreferenced(url);
      }
    },
    [browserRemoveBookmark],
  );

  return {
    handleRemoveBookmark,
  };
}
