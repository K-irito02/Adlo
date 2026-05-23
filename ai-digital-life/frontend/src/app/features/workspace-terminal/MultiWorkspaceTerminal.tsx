import React, { useMemo } from "react";
import type { RecentWorkspaceEntry } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../copy";
import type { TerminalTabState } from "../../stores/slices/terminalSlice";
import { MultiWorkspaceContainer } from "../multi-workspace/MultiWorkspaceContainer";
import { WorkspaceTerminalEntry } from "./WorkspaceTerminalEntry";

export interface MultiWorkspaceTerminalProps {
  workspaces: RecentWorkspaceEntry[];
  expandedStates: Record<string, boolean>;
  terminalTabs: TerminalTabState[];
  activeTabId: string | undefined;
  onToggleExpand: (workspaceId: string) => void;
  onCreateTab: (workspaceId: string) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onRefreshTree?: () => void;
  onCloseAllTabs?: (workspaceId: string) => void;
  t: CopyDict;
}

export function MultiWorkspaceTerminal({
  workspaces,
  expandedStates,
  terminalTabs,
  activeTabId,
  onToggleExpand,
  onCreateTab,
  onSelectTab,
  onCloseTab,
  onTogglePin,
  onHideFromRightPanels,
  onRefreshTree,
  onCloseAllTabs,
  t,
}: MultiWorkspaceTerminalProps) {
  const tabsByWorkspace = useMemo(() => {
    const map: Record<string, TerminalTabState[]> = {};
    for (const tab of terminalTabs) {
      if (!map[tab.workspaceId]) {
        map[tab.workspaceId] = [];
      }
      map[tab.workspaceId].push(tab);
    }
    return map;
  }, [terminalTabs]);

  if (workspaces.length === 0) {
    return (
      <div className="adl-multitree">
        <div className="adl-multitree__empty">
          <p className="adl-empty-hint">{t.workspaceEmpty as string}</p>
        </div>
      </div>
    );
  }

  return (
    <MultiWorkspaceContainer
      visibleWorkspaces={workspaces}
      expandedState={expandedStates}
      onToggleExpand={onToggleExpand}
      renderContent={(workspace, isExpanded) => (
        <WorkspaceTerminalEntry
          key={workspace.id}
          workspace={workspace}
          isExpanded={isExpanded}
          tabs={tabsByWorkspace[workspace.id] ?? []}
          activeTabId={activeTabId}
          tabCount={(tabsByWorkspace[workspace.id] ?? []).length}
          onToggleExpand={() => onToggleExpand(workspace.id)}
          onCreateTab={() => onCreateTab(workspace.id)}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onTogglePin={onTogglePin}
          onHideFromRightPanels={onHideFromRightPanels}
          onRefreshTree={() => onRefreshTree?.()}
          onCloseAllTabs={() => onCloseAllTabs?.(workspace.id)}
          t={t}
        />
      )}
    />
  );
}