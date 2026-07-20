import { useCallback, useRef, type MutableRefObject } from 'react';
import type { CopyDict } from '@i18n';
import { useFileContextMenuItems } from './hooks/useFileContextMenuItems';

export interface UseFileNavigatorContextMenuParams {
  t: CopyDict;
  setRenamingPath: (path: string | null) => void;
  setRenameDialogOpen: (open: boolean) => void;
  setDeleteConfirmPath: (path: string | null) => void;
}

export interface UseFileNavigatorContextMenuResult {
  getContextMenuItems: ReturnType<typeof useFileContextMenuItems>['getContextMenuItems'];
  contextMenuPersistRef: MutableRefObject<boolean>;
  clearMenuHighlightRef: MutableRefObject<(() => void) | undefined>;
}

export function useFileNavigatorContextMenu(
  params: UseFileNavigatorContextMenuParams,
): UseFileNavigatorContextMenuResult {
  const { t, setRenamingPath, setRenameDialogOpen, setDeleteConfirmPath } = params;
  const contextMenuPersistRef = useRef(false);
  const clearMenuHighlightRef = useRef<(() => void) | undefined>(undefined);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.warn('[FileNavigatorContextMenu] clipboard write failed');
    }
  }, []);

  const { getContextMenuItems } = useFileContextMenuItems({
    t,
    copyToClipboard,
    contextMenuPersistRef,
    setRenamingPath,
    setRenameDialogOpen,
    setDeleteConfirmPath,
    showMenuForDirectories: true,
  });

  return { getContextMenuItems, contextMenuPersistRef, clearMenuHighlightRef };
}
