import React from 'react';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';

export interface MultiWorkspaceContainerProps {
  visibleWorkspaces: RecentWorkspaceEntry[];
  expandedState: Record<string, boolean>;
  onToggleExpand: (workspaceId: string) => void;
  renderContent: (workspace: RecentWorkspaceEntry, isExpanded: boolean) => React.ReactNode;
}

export const MultiWorkspaceContainer = React.memo(function MultiWorkspaceContainer({
  visibleWorkspaces,
  expandedState,
  renderContent,
}: MultiWorkspaceContainerProps) {
  return (
    <div className="adl-multitree">
      {visibleWorkspaces.map((ws) => (
        <React.Fragment key={ws.id}>
          {renderContent(ws, expandedState[ws.id] ?? false)}
        </React.Fragment>
      ))}
    </div>
  );
});
