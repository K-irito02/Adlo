/**
 * Store Selectors - 从主 store 中提取特定领域的数据
 *
 * 每个选择器提供纯函数版本（get*）和 React Hook 版本（use*），
 * 对返回对象/数组的 Hook 使用 useShallow 避免不必要的重渲染。
 *
 * 此文件为 barrel 文件，重新导出领域特定的 selector 文件。
 */

import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './slicedStore';
import type { StoreState } from './StoreState';

// 重新导出领域特定的 selector
export { workspaceSelectors } from './workspaceSelectors';
export { editorSelectors } from './editorSelectors';
export { terminalSelectors } from './terminalSelectors';
export { browserSelectors } from './browserSelectors';

// ============================================
// 补丁相关的选择器
// ============================================
export const patchSelectors = {
  getActivePatchSet: (state: StoreState) => state.activePatchSet,
  useActivePatchSet: () => useAppStore(useShallow((s) => s.activePatchSet)),

  getLatestPatchApplication: (state: StoreState) => state.latestPatchApplication,
  useLatestPatchApplication: () => useAppStore(useShallow((s) => s.latestPatchApplication)),

  getSelectedChangePreviewPath: (state: StoreState) => state.selectedChangePreviewPath,
  useSelectedChangePreviewPath: () => useAppStore((s) => s.selectedChangePreviewPath),

  getChangePreview: (state: StoreState) => state.changePreview,
  useChangePreview: () => useAppStore(useShallow((s) => s.changePreview)),

  isChangePreviewLoading: (state: StoreState) => state.changePreviewLoading,
  useIsChangePreviewLoading: () => useAppStore((s) => s.changePreviewLoading),

  hasActivePatchSet: (state: StoreState) => Boolean(state.activePatchSet),
  useHasActivePatchSet: () => useAppStore((s) => Boolean(s.activePatchSet)),
};

// ============================================
// 搜索相关的选择器
// ============================================
export const searchSelectors = {
  getSearchQuery: (state: StoreState) => state.searchQuery,
  useSearchQuery: () => useAppStore((s) => s.searchQuery),

  getSearchResults: (state: StoreState) => state.searchResults,
  useSearchResults: () => useAppStore(useShallow((s) => s.searchResults)),

  hasSearchResults: (state: StoreState) => state.searchResults.length > 0,
  useHasSearchResults: () => useAppStore((s) => s.searchResults.length > 0),
};

// ============================================
// 组合选择器
// ============================================

export const combinedSelectors = {
  canOpenNewTab: (state: StoreState) => state.openTabs.length < 20,
  useCanOpenNewTab: () => useAppStore((s) => s.openTabs.length < 20),

  isWorkspaceReady: (state: StoreState) =>
    Boolean(state.appInfo?.currentWorkspace) && state.indexingStatus?.state !== 'indexing',
  useIsWorkspaceReady: () =>
    useAppStore(
      (s) => Boolean(s.appInfo?.currentWorkspace) && s.indexingStatus?.state !== 'indexing',
    ),

  getCurrentFileTab: (state: StoreState) => {
    if (!state.selectedFilePath) {
      return undefined;
    }
    const tabsByPath = new Map(state.openTabs.map((tab) => [tab.path, tab]));
    return tabsByPath.get(state.selectedFilePath);
  },
  useCurrentFileTab: () =>
    useAppStore(
      useShallow((s) => {
        if (!s.selectedFilePath) {
          return undefined;
        }
        const tabsByPath = new Map(s.openTabs.map((tab) => [tab.path, tab]));
        return tabsByPath.get(s.selectedFilePath);
      }),
    ),
};
