import { useMemo } from 'react';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type { TerminalTabState } from '@stores/slices/terminalSlice';
import { MultiWorkspaceContainer } from '../multi-workspace/MultiWorkspaceContainer';
import { WorkspaceTerminalEntry } from './WorkspaceTerminalEntry';
import { useTCopy } from '@i18n/useTCopy';

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
  onCloseAllTabs: (workspaceId?: string) => void;
}

const INDEPENDENT_WORKSPACE_ID = '__independent__';

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
  onCloseAllTabs,
}: MultiWorkspaceTerminalProps) {
  const { t } = useTCopy();
  const tabsByWorkspace = useMemo(() => {
    const map: Record<string, TerminalTabState[]> = {};
    for (const tab of terminalTabs) {
      const key = tab.workspaceId || INDEPENDENT_WORKSPACE_ID;
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(tab);
    }
    return map;
  }, [terminalTabs]);

  const independentTabs = tabsByWorkspace[INDEPENDENT_WORKSPACE_ID] ?? [];

  const independentWorkspace: RecentWorkspaceEntry = {
    id: INDEPENDENT_WORKSPACE_ID,
    name: t.terminalIndependent,
    path: '',
    rootPath: '',
    available: true,
    removedFromSidebar: false,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
  };

  const handleCreateIndependentTab = () => {
    onCreateTab('');
  };

  const hasNoWorkspaces = workspaces.length === 0;
  const hasNoIndependentTabs = independentTabs.length === 0;

  return (
    <div className="adl-multitree adl-multitree--terminal">
      <WorkspaceTerminalEntry
        key={INDEPENDENT_WORKSPACE_ID}
        workspace={independentWorkspace}
        isExpanded={expandedStates[INDEPENDENT_WORKSPACE_ID] !== false}
        tabs={independentTabs}
        activeTabId={activeTabId}
        tabCount={independentTabs.length}
        onToggleExpand={() => onToggleExpand(INDEPENDENT_WORKSPACE_ID)}
        onCreateTab={handleCreateIndependentTab}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onTogglePin={onTogglePin}
        onHideFromRightPanels={() => {}}
        onCloseAllTabs={() => onCloseAllTabs('')}
        isIndependent
        t={t}
      />
      {workspaces.length > 0 && (
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
              onCloseAllTabs={() => onCloseAllTabs(workspace.id)}
              t={t}
            />
          )}
        />
      )}
      {hasNoWorkspaces && hasNoIndependentTabs && (
        <div className="adl-multitree__empty">
          <p className="adl-empty-hint">{t.workspaceEmpty as string}</p>
        </div>
      )}
    </div>
  );
}
