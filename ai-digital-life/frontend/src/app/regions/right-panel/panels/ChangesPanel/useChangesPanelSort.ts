import { useMemo, useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { CopyDict } from '@app/i18n';
import {
  computeAllChangesExpanded,
  computeCanToggleNavigatorStructure,
  computeStructureToggleExpanded,
  computeChangesNavigatorTitle,
  toggleNavigatorStructure,
} from './useChangesPanelStateUtils';

export function useChangesPanelSort(
  visibleWorkspaces: RecentWorkspaceEntry[],
  workspaceChangesExpanded: Record<string, boolean>,
  hasExpandableOutlineItems: boolean,
  hasExpandedOutlineItems: boolean,
  t: CopyDict,
  handleToggleAllOutlineItems: () => void
) {
  const changesNavigatorMode = useAppStore((s) => s.changesNavigatorMode);
  const setChangesNavigatorMode = useAppStore((s) => s.setChangesNavigatorMode);

  const allChangesExpanded = useMemo(
    () => computeAllChangesExpanded(visibleWorkspaces, workspaceChangesExpanded),
    [visibleWorkspaces, workspaceChangesExpanded]
  );

  const canToggleNavigatorStructure = useMemo(
    () =>
      computeCanToggleNavigatorStructure(
        changesNavigatorMode,
        visibleWorkspaces,
        hasExpandableOutlineItems
      ),
    [changesNavigatorMode, visibleWorkspaces, hasExpandableOutlineItems]
  );

  const structureToggleExpanded = useMemo(
    () =>
      computeStructureToggleExpanded(
        changesNavigatorMode,
        allChangesExpanded,
        hasExpandedOutlineItems
      ),
    [changesNavigatorMode, allChangesExpanded, hasExpandedOutlineItems]
  );

  const changesNavigatorTitle = useMemo(
    () => computeChangesNavigatorTitle(changesNavigatorMode, t),
    [changesNavigatorMode, t]
  );

  const handleExpandAll = useCallback(() => {
    useAppStore.getState().expandAllWorkspaceChanges();
  }, []);

  const handleCollapseAll = useCallback(() => {
    useAppStore.getState().collapseAllWorkspaceChanges();
  }, []);

  const handleToggleNavigatorStructure = useCallback(() => {
    toggleNavigatorStructure(
      changesNavigatorMode,
      allChangesExpanded,
      handleCollapseAll,
      handleExpandAll,
      handleToggleAllOutlineItems
    );
  }, [
    changesNavigatorMode,
    allChangesExpanded,
    handleCollapseAll,
    handleExpandAll,
    handleToggleAllOutlineItems,
  ]);

  return {
    changesNavigatorMode,
    setChangesNavigatorMode,
    allChangesExpanded,
    canToggleNavigatorStructure,
    structureToggleExpanded,
    changesNavigatorTitle,
    handleToggleNavigatorStructure,
    handleExpandAll,
    handleCollapseAll,
  };
}
