import React, { useMemo } from "react";
import type { RecentWorkspaceEntry } from "@ai-digital-life/kernel";
import { CustomScrollArea } from "../file-tree/CustomScrollArea";

export interface MultiWorkspaceContainerProps {
  visibleWorkspaces: RecentWorkspaceEntry[];
  expandedState: Record<string, boolean>;
  onToggleExpand: (workspaceId: string) => void;
  renderContent: (workspace: RecentWorkspaceEntry, isExpanded: boolean) => React.ReactNode;
  allExpanded?: boolean;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
}

export const MultiWorkspaceContainer = React.memo(function MultiWorkspaceContainer({
  visibleWorkspaces,
  expandedState,
  renderContent,
}: MultiWorkspaceContainerProps) {
  const pinnedWorkspaces = useMemo(
    () => visibleWorkspaces.filter((w) => w.isPinned),
    [visibleWorkspaces],
  );

  const unpinnedWorkspaces = useMemo(
    () => visibleWorkspaces.filter((w) => !w.isPinned),
    [visibleWorkspaces],
  );

  if (visibleWorkspaces.length === 0) {
    return null;
  }

  return (
    <CustomScrollArea
      shellClassName="adl-multitree"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      {pinnedWorkspaces.length > 0 ? (
        <>
          <div className="adl-multitree-section-label" role="heading" aria-level={2}>
            <span>已置顶</span>
            <span className="adl-multitree-section-label__count">{pinnedWorkspaces.length}</span>
          </div>
          <div className="adl-multitree__bucket">
            {pinnedWorkspaces.map((w) => renderContent(w, expandedState[w.id] ?? false))}
          </div>
        </>
      ) : null}

      {unpinnedWorkspaces.length > 0 ? (
        <>
          {pinnedWorkspaces.length > 0 ? (
            <div className="adl-multitree__separator" />
          ) : null}
          <div className="adl-multitree-section-label" role="heading" aria-level={2}>
            <span>未置顶</span>
            <span className="adl-multitree-section-label__count">{unpinnedWorkspaces.length}</span>
          </div>
          <div className="adl-multitree__bucket">
            {unpinnedWorkspaces.map((w) => renderContent(w, expandedState[w.id] ?? false))}
          </div>
        </>
      ) : null}
    </CustomScrollArea>
  );
});