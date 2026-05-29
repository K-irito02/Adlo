import React, { useMemo } from "react";
import type { RecentWorkspaceEntry } from "@ai-digital-life/kernel";
import type { TabFolderState, BrowserHistoryState } from "../../stores/slices/browserSlice";
import { CustomScrollArea } from "../file-tree/CustomScrollArea";

export interface MultiWorkspaceContainerProps {
  visibleWorkspaces: RecentWorkspaceEntry[];
  expandedState: Record<string, boolean>;
  onToggleExpand: (workspaceId: string) => void;
  renderContent: (workspace: RecentWorkspaceEntry, isExpanded: boolean) => React.ReactNode;
  tabFolders?: TabFolderState[];
  renderTabFolderContent?: (folder: TabFolderState, isExpanded: boolean) => React.ReactNode;
  browserHistory?: BrowserHistoryState[];
  renderHistoryContent?: (item: BrowserHistoryState) => React.ReactNode;
  allExpanded?: boolean;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
}

const HISTORY_FOLDER_ID = "__history_folder__";

export const MultiWorkspaceContainer = React.memo(function MultiWorkspaceContainer({
  visibleWorkspaces,
  expandedState,
  onToggleExpand,
  renderContent,
  tabFolders = [],
  renderTabFolderContent,
  browserHistory = [],
  renderHistoryContent,
}: MultiWorkspaceContainerProps) {
  if (visibleWorkspaces.length === 0 && tabFolders.length === 0 && browserHistory.length === 0) {
    return null;
  }

  return (
    <CustomScrollArea
      shellClassName="adl-multitree"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      {/* 工作区目录 */}
      {visibleWorkspaces.length > 0 ? (
        <>
          <div className="adl-multitree-section-label" role="heading" aria-level={2}>
            <span>工作区目录</span>
            <span className="adl-multitree-section-label__count">{visibleWorkspaces.length}</span>
          </div>
          <div className="adl-multitree__bucket">
            {visibleWorkspaces.map((w) => renderContent(w, expandedState[w.id] ?? false))}
          </div>
        </>
      ) : null}

      {/* 自建目录 */}
      {tabFolders.length > 0 ? (
        <>
          <div className="adl-multitree-section-label" role="heading" aria-level={2}>
            <span>自建目录</span>
            <span className="adl-multitree-section-label__count">{tabFolders.length}</span>
          </div>
          <div className="adl-multitree__bucket">
            {tabFolders.map((folder) => 
              renderTabFolderContent ? 
                renderTabFolderContent(folder, expandedState[folder.id] ?? false) : 
                null
            )}
          </div>
        </>
      ) : null}
      
      {/* 历史目录 */}
      {browserHistory.length > 0 ? (
        <>
          <div className="adl-multitree-section-label" role="heading" aria-level={2}>
            <span>历史目录</span>
            <span className="adl-multitree-section-label__count">{browserHistory.length}</span>
          </div>
          <div className="adl-multitree__bucket">
            {/* 历史记录工作区头部 */}
            <div className="adl-multitree-entry">
              <div className="adl-multitree-entry__header">
                <div className="adl-multitree-entry__expand">
                  <span className="tooltip-trigger" style={{ display: "inline-flex" }}>
                    <button
                      type="button"
                      className="adl-multitree-entry__expand-btn"
                      aria-label="展开"
                      aria-expanded={expandedState[HISTORY_FOLDER_ID] ?? false}
                      onClick={() => onToggleExpand(HISTORY_FOLDER_ID)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                      </svg>
                    </button>
                  </span>
                </div>
                <div className="adl-multitree-entry__namezone" role="button" tabIndex={0} aria-label="历史记录">
                  <span className="adl-multitree-entry__name">历史记录</span>
                  <span className="adl-multitree-entry__count">{browserHistory.length}</span>
                </div>
              </div>
              {expandedState[HISTORY_FOLDER_ID] ?? false ? (
                <div className="adl-multitree-entry__children">
                  {browserHistory.map((item) => 
                    renderHistoryContent ? renderHistoryContent(item) : null
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </CustomScrollArea>
  );
});