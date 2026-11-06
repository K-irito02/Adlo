import { useMemo } from 'react';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type { TerminalTabState } from '@stores/slices/terminalSlice';
import { isPanelTab } from '@stores/slices/tabLocation';
import { MultiWorkspaceContainer } from '../multi-workspace/MultiWorkspaceContainer';
import { WorkspaceTerminalEntry } from './WorkspaceTerminalEntry';
import { useTCopy } from '@i18n/useTCopy';

export interface MultiWorkspaceTerminalProps {
  workspaces: RecentWorkspaceEntry[];
  expandedStates: Record<string, boolean>;
  terminalTabs: TerminalTabState[];
  activeTabId: string | undefined;
  editingTabId: string | null;
  editValue: string;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  onToggleExpand: (workspaceId: string) => void;
  onCreateTab: (workspaceId: string) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onCloseAllTabs: (workspaceId?: string) => void;
  onDoubleClick: (tabId: string, title: string) => void;
  onEditChange: (value: string) => void;
  onEditSubmit: () => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
}

const INDEPENDENT_WORKSPACE_ID = '__independent__';

export function MultiWorkspaceTerminal({
  workspaces,
  expandedStates,
  terminalTabs,
  activeTabId,
  editingTabId,
  editValue,
  editInputRef,
  onToggleExpand,
  onCreateTab,
  onSelectTab,
  onCloseTab,
  onTogglePin,
  onHideFromRightPanels,
  onCloseAllTabs,
  onDoubleClick,
  onEditChange,
  onEditSubmit,
  onEditKeyDown,
}: MultiWorkspaceTerminalProps) {
  const { t } = useTCopy();
  const tabsByWorkspace = useMemo(() => {
    const map: Record<string, TerminalTabState[]> = {};
    // 转入中心的终端标签不在面板目录树中重复显示（spec 目标 #5）。
    for (const tab of terminalTabs.filter(isPanelTab)) {
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

  return (
    <div className="adl-multitree adl-multitree--terminal">
      <WorkspaceTerminalEntry
        key={INDEPENDENT_WORKSPACE_ID}
        workspace={independentWorkspace}
        isExpanded={expandedStates[INDEPENDENT_WORKSPACE_ID] !== false}
        tabs={independentTabs}
        activeTabId={activeTabId}
        editingTabId={editingTabId}
        editValue={editValue}
        editInputRef={editInputRef}
        tabCount={independentTabs.length}
        onToggleExpand={() => onToggleExpand(INDEPENDENT_WORKSPACE_ID)}
        onCreateTab={handleCreateIndependentTab}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onTogglePin={onTogglePin}
        onHideFromRightPanels={() => {}}
        onCloseAllTabs={() => onCloseAllTabs('')}
        isIndependent
        onDoubleClick={onDoubleClick}
        onEditChange={onEditChange}
        onEditSubmit={onEditSubmit}
        onEditKeyDown={onEditKeyDown}
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
              editingTabId={editingTabId}
              editValue={editValue}
              editInputRef={editInputRef}
              tabCount={(tabsByWorkspace[workspace.id] ?? []).length}
              onToggleExpand={() => onToggleExpand(workspace.id)}
              onCreateTab={() => onCreateTab(workspace.id)}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              onTogglePin={onTogglePin}
              onHideFromRightPanels={onHideFromRightPanels}
              onCloseAllTabs={() => onCloseAllTabs(workspace.id)}
              onDoubleClick={onDoubleClick}
              onEditChange={onEditChange}
              onEditSubmit={onEditSubmit}
              onEditKeyDown={onEditKeyDown}
              t={t}
            />
          )}
        />
      )}
    </div>
  );
}
