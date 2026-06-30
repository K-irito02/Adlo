import { useBrowserTagActions } from './useBrowserTagActions';
import { useBrowserFolderActions } from './useBrowserFolderActions';
import { useBrowserBookmarkActions } from './useBrowserBookmarkActions';
import { useBrowserMenuActions } from './useBrowserMenuActions';

export function useBrowserTreeActions() {
  const tagActions = useBrowserTagActions();
  const folderActions = useBrowserFolderActions();
  const bookmarkActions = useBrowserBookmarkActions();
  const menuActions = useBrowserMenuActions();

  return {
    ...folderActions,
    ...tagActions,
    ...bookmarkActions,
    ...menuActions,
  };
}
