/**
 * 编辑器相关的选择器
 */

import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './slicedStore';
import type { StoreState } from './StoreState';

export const editorSelectors = {
  getOpenTabs: (state: StoreState) => state.openTabs,
  useOpenTabs: () => useAppStore(useShallow((s) => s.openTabs)),

  getSelectedFilePath: (state: StoreState) => state.selectedFilePath,
  useSelectedFilePath: () => useAppStore((s) => s.selectedFilePath),

  getFileContent: (state: StoreState) => state.fileContent,
  useFileContent: () => useAppStore((s) => s.fileContent),

  getFileLastModifiedAt: (state: StoreState) => state.fileLastModifiedAt,
  useFileLastModifiedAt: () => useAppStore((s) => s.fileLastModifiedAt),

  getOutline: (state: StoreState) => state.outline,
  useOutline: () => useAppStore(useShallow((s) => s.outline)),

  getDirtyEditorPaths: (state: StoreState) => state.dirtyEditorPaths,
  useDirtyEditorPaths: () => useAppStore(useShallow((s) => s.dirtyEditorPaths)),

  getExternalFileChange: (state: StoreState) => state.externalFileChange,
  useExternalFileChange: () => useAppStore(useShallow((s) => s.externalFileChange)),

  isFileDirty: (relativePath: string) => (state: StoreState) =>
    state.dirtyEditorPaths.includes(relativePath),
  useIsFileDirty: (relativePath: string) =>
    useAppStore((s) => s.dirtyEditorPaths.includes(relativePath)),

  getOpenTabCount: (state: StoreState) => state.openTabs.length,
  useOpenTabCount: () => useAppStore((s) => s.openTabs.length),
};
