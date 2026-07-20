import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { StoreState } from '@stores/StoreState';

export function useChangesPanelStore() {
  const {
    navigatorCollapsed,
    changesNavigatorMode,
    previewEnabled,
    expandedPaths,
    toggleNavigator,
    changesNavigatorWidth,
    setChangesNavigatorMode,
    setPreviewEnabled,
    toggleChangesTreePath,
    setChangesTreePathExpanded,
    expandChangesTreePathChain,
    collapseAllChangesTreePaths,
  } = useAppStore(
    useShallow((state) => ({
      navigatorCollapsed: state.navigatorCollapsedByTool?.changes ?? false,
      changesNavigatorMode: state.changesNavigatorMode,
      previewEnabled: state.changesPreviewEnabled,
      expandedPaths: state.expandedChangesTreePaths,
      toggleNavigator: state.toggleNavigator,
      changesNavigatorWidth: state.changesNavigatorWidth,
      setChangesNavigatorMode: state.setChangesNavigatorMode,
      setPreviewEnabled: state.setChangesPreviewEnabled,
      toggleChangesTreePath: state.toggleChangesTreePath,
      setChangesTreePathExpanded: state.setChangesTreePathExpanded,
      expandChangesTreePathChain: state.expandChangesTreePathChain,
      collapseAllChangesTreePaths: state.collapseAllChangesTreePaths,
    })),
  );
  const workspaceChangesTreeLoading = useAppStore(
    useShallow((state: StoreState) => state.workspaceChangesTreeLoading),
  );
  const workspaceChangesTreeErrors = useAppStore(
    useShallow((state: StoreState) => state.workspaceChangesTreeErrors),
  );
  return {
    navigatorCollapsed,
    changesNavigatorMode,
    previewEnabled,
    expandedPaths,
    toggleNavigator,
    changesNavigatorWidth,
    setChangesNavigatorMode,
    setPreviewEnabled,
    toggleChangesTreePath,
    setChangesTreePathExpanded,
    expandChangesTreePathChain,
    collapseAllChangesTreePaths,
    workspaceChangesTreeLoading,
    workspaceChangesTreeErrors,
  };
}
