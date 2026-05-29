import React, { useMemo } from "react";
import type { RecentWorkspaceEntry } from "@ai-digital-life/kernel";
import type { BrowserTabState, TabFolderState } from "../../stores/slices/browserSlice";
import { CustomScrollArea } from "../file-tree/CustomScrollArea";
import { IconGlobe, IconTrash, IconClose } from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";

export interface FlatTabListProps {
  browserTabs: BrowserTabState[];
  workspaces: RecentWorkspaceEntry[];
  tabFolders: TabFolderState[];
  activeTabId: string | undefined;
  viewMode: "tree" | "list" | "all";
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onOpenInNewTab: (tab: BrowserTabState) => void;
  onDeleteAllTabs?: () => void;
  t: any;
}

export function FlatTabList({
  browserTabs,
  workspaces,
  tabFolders,
  activeTabId,
  viewMode,
  onSelectTab,
  onCloseTab,
  onOpenInNewTab,
  t,
}: FlatTabListProps) {
  const getWorkspaceName = (workspaceId: string | undefined): string => {
    if (!workspaceId) return "未分类";
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (workspace) return workspace.name;
    const folder = tabFolders.find(f => f.id === workspaceId);
    if (folder) return folder.name;
    return "未分类";
  };

  const sortedTabs = useMemo(() => {
    const tabsCopy = [...browserTabs];
    if (viewMode === "all") {
      return tabsCopy;
    }
    return tabsCopy;
  }, [browserTabs, viewMode]);

  const groupedTabs = useMemo(() => {
    if (viewMode === "all") {
      return { "全部标签": sortedTabs };
    }

    const groups: Record<string, BrowserTabState[]> = {};

    if (viewMode === "tree" || viewMode === "list") {
      for (const workspace of workspaces) {
        const workspaceTabs = sortedTabs.filter(t => t.workspaceId === workspace.id);
        if (workspaceTabs.length > 0) {
          groups[workspace.name] = workspaceTabs;
        }
      }
      for (const folder of tabFolders) {
        const folderTabs = sortedTabs.filter(t => t.workspaceId === folder.id);
        if (folderTabs.length > 0) {
          groups[folder.name] = folderTabs;
        }
      }
    }

    return groups;
  }, [sortedTabs, workspaces, tabFolders, viewMode]);

  const handleTabClick = (tab: BrowserTabState) => {
    onSelectTab(tab.id);
  };

  const handleCloseClick = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onCloseTab(tabId);
  };

  const handleOpenInNewTab = (e: React.MouseEvent, tab: BrowserTabState) => {
    e.stopPropagation();
    onOpenInNewTab(tab);
  };

  return (
    <CustomScrollArea
      shellClassName="adl-flat-tab-list"
      scrollClassName="adl-flat-tab-list-scroll"
      scrollbarClassName="adl-flat-tab-list-scrollbar"
      thumbClassName="adl-flat-tab-list-scrollbar__thumb"
    >
      {Object.entries(groupedTabs).map(([groupName, tabs]) => (
        <div key={groupName} className="adl-flat-tab-list__group">
          {viewMode !== "all" && (
            <div className="adl-flat-tab-list__group-header">
              <span className="adl-flat-tab-list__group-title">{groupName}</span>
              <span className="adl-flat-tab-list__group-count">{tabs.length}</span>
            </div>
          )}
          <div className="adl-flat-tab-list__items">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`adl-flat-tab-item${activeTabId === tab.id ? " is-active" : ""}`}
                onClick={() => handleTabClick(tab)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") handleTabClick(tab); }}
              >
                <IconGlobe size={14} decorative className="adl-flat-tab-item__icon" />
                <span className="adl-flat-tab-item__title">{tab.title || "无标题"}</span>
                <div className="adl-flat-tab-item__actions">
                  <TooltipSimple content="在新标签中打开" placement="top">
                    <button
                      type="button"
                      className="adl-icon-btn adl-icon-btn--xs"
                      onClick={(e) => handleOpenInNewTab(e, tab)}
                      aria-label="在新标签中打开"
                    >
                      <IconGlobe size={12} />
                    </button>
                  </TooltipSimple>
                  <TooltipSimple content="关闭" placement="top">
                    <button
                      type="button"
                      className="adl-icon-btn adl-icon-btn--xs"
                      onClick={(e) => handleCloseClick(e, tab.id)}
                      aria-label="关闭"
                    >
                      <IconClose size={12} />
                    </button>
                  </TooltipSimple>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {sortedTabs.length === 0 && (
        <div className="adl-flat-tab-list__empty">
          <p className="adl-empty-hint">{t.workspaceEmpty || "暂无已打开的标签"}</p>
        </div>
      )}
    </CustomScrollArea>
  );
}
