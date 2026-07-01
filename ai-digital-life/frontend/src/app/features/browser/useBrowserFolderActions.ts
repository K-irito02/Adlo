import { useBrowserFolderCrud } from './useBrowserFolderCrud';
import { useBrowserFolderReorder } from './useBrowserFolderReorder';

export function useBrowserFolderActions() {
  const reorder = useBrowserFolderReorder();
  const crud = useBrowserFolderCrud();

  return {
    ...reorder,
    ...crud,
  };
}
