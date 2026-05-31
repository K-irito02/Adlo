import React from "react";
import type { RecentWorkspaceEntry } from "@ai-digital-life/kernel";
import { CustomScrollArea } from "../file-tree/CustomScrollArea";

export interface MultiWorkspaceContainerProps {
  visibleWorkspaces: RecentWorkspaceEntry[];
  expandedState: Record<string, boolean>;
  onToggleExpand: (workspaceId: string) => void;
  renderContent: (workspace: RecentWorkspaceEntry, isExpanded: boolean) => React.ReactNode;
}

export const MultiWorkspaceContainer = React.memo(function MultiWorkspaceContainer({
  visibleWorkspaces,
  expandedState,
  onToggleExpand,
  renderContent,
}: MultiWorkspaceContainerProps) {
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
      {visibleWorkspaces.length > 0 ? (
        <>
          <div className="adl-multitree-section-label" role="heading" aria-level={2}>
            <span>&nbsp;</span>
            <span className="adl-multitree-section-label__count">{visibleWorkspaces.length}</span>
          </div>
          <div className="adl-multitree__bucket">
            {visibleWorkspaces.map((w) => renderContent(w, expandedState[w.id] ?? false))}
          </div>
        </>
      ) : null}
    </CustomScrollArea>
  );
});
