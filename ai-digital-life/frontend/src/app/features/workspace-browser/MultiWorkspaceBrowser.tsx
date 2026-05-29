import React, { useMemo, useCallback } from "react";
import type { RecentWorkspaceEntry } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../copy";
import type { BrowserTabState, TabFolderState, BrowserHistoryState } from "../../stores/slices/browserSlice";
import { MultiWorkspaceContainer } from "../multi-workspace/MultiWorkspaceContainer";
import { WorkspaceBrowserEntry } from "./WorkspaceBrowserEntry";
import { TabFolderEntry } from "./TabFolderEntry";
import { IconHistory } from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";

export interface MultiWorkspaceBrowserProps {
  workspaces: RecentWorkspaceEntry[];
  tabFolders: TabFolderState[];
  browserHistory?: BrowserHistoryState[];
  expandedStates: Record<string, boolean>;
  browserTabs: BrowserTabState[];
  activeTabId: string | undefined;
  onToggleExpand: (id: string) => void;
  onCreateTab: (workspaceId: string) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onRefreshTree?: () => void;
  onCloseAllTabs?: (workspaceId: string) => void;
  onDeleteTabFolder: (folderId: string) => void;
  onRenameTabFolder?: (folderId: string, newName: string) => void;
  onOpenHistoryItem?: (url: string, title: string) => void;
  t: CopyDict;
  editingTabId?: string | null;
  editValue?: string;
  editInputRef?: React.RefObject<HTMLInputElement | null>;
  isDragging?: boolean;
  dragOverTabId?: string | null;
  onDragStart?: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onDrop?: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onTabContextMenu?: (e: React.MouseEvent, tabId: string, isPinned: boolean) => void;
  onTabDoubleClick?: (tabId: string, title: string) => void;
  onEditChange?: (value: string) => void;
  onEditSubmit?: () => void;
  onEditKeyDown?: (e: React.KeyboardEvent) => void;
}

const INDEPENDENT_WORKSPACE_ID = "__independent__";

function HistoryEntry({ 
  item, 
  onClick 
}: { 
  item: BrowserHistoryState; 
  onClick: (url: string, title: string) => void; 
}) {
  // 格式化时间戳为相对时间
  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    return `${days}天前`;
  };

  return (
    <div 
      className="adl-browser-history-entry"
      onClick={() => onClick(item.url, item.title)}
    >
      <div className="adl-browser-history-entry__icon">
        <IconHistory size={12} decorative />
      </div>
      <div className="adl-browser-history-entry__content">
        <div className="adl-browser-history-entry__title" title={item.title}>
          {item.title}
        </div>
        <div className="adl-browser-history-entry__url" title={item.url}>
          {item.url}
        </div>
      </div>
      <div className="adl-browser-history-entry__time">
        {formatTime(item.visitedAt)}
      </div>
    </div>
  );
}

export function MultiWorkspaceBrowser({
  workspaces,
  tabFolders,
  browserHistory = [],
  expandedStates,
  browserTabs,
  activeTabId,
  onToggleExpand,
  onCreateTab,
  onSelectTab,
  onCloseTab,
  onTogglePin,
  onHideFromRightPanels,
  onRefreshTree,
  onCloseAllTabs,
  onDeleteTabFolder,
  onRenameTabFolder,
  onOpenHistoryItem,
  t,
  editingTabId = null,
  editValue = "",
  editInputRef = { current: null },
  isDragging = false,
  dragOverTabId = null,
  onDragStart = () => {},
  onDragEnd = () => {},
  onDragOver = () => {},
  onDrop = () => {},
  onTabContextMenu = () => {},
  onTabDoubleClick = () => {},
  onEditChange = () => {},
  onEditSubmit = () => {},
  onEditKeyDown = () => {},
}: MultiWorkspaceBrowserProps) {
  const tabsByWorkspace = useMemo(() => {
    const map: Record<string, BrowserTabState[]> = {};
    for (const tab of browserTabs) {
      const key = tab.workspaceId || INDEPENDENT_WORKSPACE_ID;
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(tab);
    }
    return map;
  }, [browserTabs]);

  const tabsById = useMemo(() => {
    const map: Record<string, BrowserTabState> = {};
    for (const tab of browserTabs) {
      map[tab.id] = tab;
    }
    return map;
  }, [browserTabs]);

  const getTabsForFolder = useCallback((folder: TabFolderState) => {
    if (!folder.tabs) return [];
    return folder.tabs
      .map(tabId => tabsById[tabId])
      .filter(Boolean) as BrowserTabState[];
  }, [tabsById]);

  const hasNoWorkspaces = workspaces.length === 0;
  const hasNoFolders = tabFolders.length === 0;
  const hasNoHistory = browserHistory.length === 0;

  return (
    <div className="adl-multitree adl-multitree--browser">
      {(workspaces.length > 0 || tabFolders.length > 0 || browserHistory.length > 0) && (
        <MultiWorkspaceContainer
          visibleWorkspaces={workspaces}
          expandedState={expandedStates}
          onToggleExpand={onToggleExpand}
          tabFolders={tabFolders}
          browserHistory={browserHistory}
          renderContent={(workspace, isExpanded) => (
            <WorkspaceBrowserEntry
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
              editingTabId={editingTabId}
              editValue={editValue}
              editInputRef={editInputRef}
              isDragging={isDragging}
              dragOverTabId={dragOverTabId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onTabContextMenu={onTabContextMenu}
              onTabDoubleClick={onTabDoubleClick}
              onEditChange={onEditChange}
              onEditSubmit={onEditSubmit}
              onEditKeyDown={onEditKeyDown}
            />
          )}
          renderTabFolderContent={(folder, isExpanded) => (
            <TabFolderEntry
              key={folder.id}
              folder={folder}
              tabs={getTabsForFolder(folder)}
              isExpanded={isExpanded}
              onToggleExpand={() => onToggleExpand(folder.id)}
              onCreateTab={() => onCreateTab("")}
              onDeleteFolder={() => onDeleteTabFolder(folder.id)}
              onDeleteAllFolderTabs={() => {}}
              onRenameFolder={(newName) => onRenameTabFolder?.(folder.id, newName)}
              activeTabId={activeTabId}
              editingTabId={editingTabId}
              editValue={editValue}
              editInputRef={editInputRef}
              isDragging={isDragging}
              dragOverTabId={dragOverTabId}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              onTogglePin={onTogglePin}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onTabContextMenu={onTabContextMenu}
              onTabDoubleClick={onTabDoubleClick}
              onEditChange={onEditChange}
              onEditSubmit={onEditSubmit}
              onEditKeyDown={onEditKeyDown}
              t={t}
            />
          )}
          renderHistoryContent={(item) => (
            <HistoryEntry 
              key={item.id} 
              item={item} 
              onClick={onOpenHistoryItem || (() => {})} 
            />
          )}
        />
      )}
      {hasNoWorkspaces && hasNoFolders && hasNoHistory && (
        <div className="adl-multitree__empty">
          <p className="adl-empty-hint">{t.workspaceEmpty as string}</p>
        </div>
      )}
    </div>
  );
}
