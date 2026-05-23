import React, { useMemo } from "react";
import type { RecentWorkspaceEntry } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../copy";
import type { TerminalTabState } from "../../stores/slices/terminalSlice";
import { CustomScrollArea } from "../../features/file-tree/CustomScrollArea";
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
  const pinnedWorkspaces = useMemo(
    () => workspaces.filter((w) => w.isPinned),
    [workspaces],
  );

  const unpinnedWorkspaces = useMemo(
    () => workspaces.filter((w) => !w.isPinned),
    [workspaces],
  );

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
            {pinnedWorkspaces.map((workspace) => (
              <WorkspaceTerminalEntry
                key={workspace.id}
                workspace={workspace}
                isExpanded={expandedStates[workspace.id] ?? false}
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
                onPinWorkspace={() => {}}
                onUnpinWorkspace={() => {}}
                t={t}
              />
            ))}
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
            {unpinnedWorkspaces.map((workspace) => (
              <WorkspaceTerminalEntry
                key={workspace.id}
                workspace={workspace}
                isExpanded={expandedStates[workspace.id] ?? false}
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
                onPinWorkspace={() => {}}
                onUnpinWorkspace={() => {}}
                t={t}
              />
            ))}
          </div>
        </>
      ) : null}
    </CustomScrollArea>
  );
}
