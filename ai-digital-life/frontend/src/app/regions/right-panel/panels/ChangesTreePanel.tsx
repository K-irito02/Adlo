import React from "react";
import { useUiStore } from "../../../stores/ui-store";
import { useAppStore } from "../../../stores/slicedStore";
import { MultiWorkspaceChangesTree } from "../../../features/workspace-changes-tree";
import { OutlineTree } from "../../../features/outline";
import { useNavigatorResize } from "../../../hooks/useNavigatorResize";
import { ChangesToolbar } from "./ChangesToolbar";
import type { WorkspaceTreeNode, ReorderWorkspacesInput } from "@ai-digital-life/kernel";
import type { ChangeTreeNode } from "../changesTree";

type ChangeFileState = "staged" | "modified" | "untracked" | "conflicted";

interface TreeDataProps {
  t: any;
  visibleWorkspaces: any[];
  activeWorkspaceId: string | undefined;
  workspaceChangesExpanded: Record<string, boolean>;
  changeCounts: Record<string, number>;
  changesTreeData: Record<string, ChangeTreeNode[]>;
  workspaceChangesTreeLoading: Record<string, boolean>;
  workspaceChangesTreeErrors: Record<string, string | undefined>;
  navigatorSelectedPath: string | undefined;
  selectedChangePreviewWorkspaceId: string | undefined;
  expandedPathsByWs: Record<string, Record<string, boolean>>;
  dirtyPathsSet: Set<string>;
  externalChangePath: string | undefined;
}

interface TreeCallbacks {
  onToggleExpand: (workspaceId: string) => void;
  onRefreshOne: (workspaceId: string) => void;
  onPinWorkspace: (workspaceId: string) => void;
  onUnpinWorkspace: (workspaceId: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onToggleFileTreePath: (workspaceId: string, path: string) => void;
  onOpenChangePreview: (workspacePath: string, relativePath: string) => void;
  onReorderWorkspaces: (input: ReorderWorkspacesInput) => void;
  getContextMenuItems: (node: ChangeTreeNode) => any[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
  renderMeta: (node: WorkspaceTreeNode) => React.ReactNode;
  onToggleAllDirectories: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onRefreshAll: () => void;
  onStatusFilterClick: (filter: ChangeFileState) => void;
  onToggleStructure: () => void;
  onExpandedOutlineIdsChange: (ids: Set<string>) => void;
  handleRevealOutlineLine: (line: number) => void;
}

interface NavigatorStateProps {
  hasExpandedDirectories: boolean;
  changesNavigatorMode: "tree" | "list" | "outline";
  onChangeNavigatorMode: (mode: "tree" | "list" | "outline") => void;
  allChangesExpanded: boolean;
  totalChangeCount: number;
  hasChangeEntries: boolean;
  snapshot: any;
  totalChangesStats?: { staged: number; unstaged: number; untracked: number };
  canToggleNavigatorStructure: boolean;
  structureToggleExpanded: boolean;
  changesNavigatorTitle: string;
  changeOutline: any[];
  expandedOutlineIds: Set<string>;
  changesStatusFilter: Set<ChangeFileState>;
  changeEntries: any[];
  hasVisibleWorkspaces: boolean;
}

export type ChangesTreePanelProps = TreeDataProps & TreeCallbacks & NavigatorStateProps;

export function ChangesTreePanel(props: ChangesTreePanelProps) {
  const {
    t, visibleWorkspaces, activeWorkspaceId,
    workspaceChangesExpanded, changeCounts, changesTreeData,
    workspaceChangesTreeLoading, workspaceChangesTreeErrors,
    navigatorSelectedPath, selectedChangePreviewWorkspaceId,
    expandedPathsByWs, dirtyPathsSet, externalChangePath,
    onToggleExpand, onRefreshOne, onPinWorkspace, onUnpinWorkspace,
    onHideFromRightPanels, onToggleFileTreePath, onOpenChangePreview,
    onReorderWorkspaces, getContextMenuItems, contextMenuPersistRef,
    clearMenuHighlightRef, renderMeta,
    onToggleAllDirectories, hasExpandedDirectories,
    changesNavigatorMode, onChangeNavigatorMode,
    allChangesExpanded, onExpandAll, onCollapseAll,
    totalChangeCount, hasChangeEntries, snapshot,
    totalChangesStats,
    canToggleNavigatorStructure, structureToggleExpanded,
    onToggleStructure, changesNavigatorTitle,
    changeOutline, expandedOutlineIds, onExpandedOutlineIdsChange,
    handleRevealOutlineLine, changesStatusFilter, onStatusFilterClick,
    changeEntries, onRefreshAll, hasVisibleWorkspaces,
  } = props;

  const changesNavigatorWidth = useAppStore((state) => state.changesNavigatorWidth);
  const setChangesNavigatorWidth = useAppStore((state) => state.setChangesNavigatorWidth);

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setChangesNavigatorWidth,
    minWidth: 180,
    maxWidth: 300
  });

  return (
    <aside className="adl-tool-navigator" aria-label={t.toolChanges}>
      <ChangesToolbar
        placement="navigator"
        t={t}
        allChangesExpanded={allChangesExpanded}
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
        changesNavigatorTitle={changesNavigatorTitle}
        totalChangeCount={totalChangeCount}
        hasVisibleWorkspaces={hasVisibleWorkspaces}
        onRefreshAll={onRefreshAll}
        changesNavigatorMode={changesNavigatorMode}
        onSetNavigatorMode={onChangeNavigatorMode}
        changesStatusFilter={changesStatusFilter}
        onStatusFilterClick={onStatusFilterClick}
        hasChangeEntries={hasChangeEntries}
        snapshot={snapshot}
        totalChangesStats={totalChangesStats}
        canToggleNavigatorStructure={canToggleNavigatorStructure}
        structureToggleExpanded={structureToggleExpanded}
        onToggleStructure={onToggleStructure}
      />
      {changesNavigatorMode === "outline" ? (
        changeOutline.length > 0 ? (
          <OutlineTree
            items={changeOutline}
            onNavigate={handleRevealOutlineLine}
            expandLabel={t.expandDetails as string}
            collapseLabel={t.collapseDetails as string}
            expandedIds={expandedOutlineIds}
            onExpandedIdsChange={onExpandedOutlineIdsChange}
          />
        ) : (
          <p className="adl-empty-hint">{t.noDiagnostics as string}</p>
        )
      ) : (
        <MultiWorkspaceChangesTree
          workspaces={visibleWorkspaces}
          activeWorkspaceId={activeWorkspaceId}
          expandedStates={workspaceChangesExpanded}
          treeData={changesTreeData as Record<string, WorkspaceTreeNode[]>}
          loadingStates={workspaceChangesTreeLoading}
          errorStates={workspaceChangesTreeErrors}
          selectedChangePreviewPath={navigatorSelectedPath}
          selectedChangePreviewWorkspaceId={selectedChangePreviewWorkspaceId}
          expandedPaths={expandedPathsByWs}
          dirtyPaths={dirtyPathsSet}
          externalChangePath={externalChangePath}
          onToggleExpand={onToggleExpand}
          onRefreshOne={onRefreshOne}
          onPinWorkspace={onPinWorkspace}
          onUnpinWorkspace={onUnpinWorkspace}
          changeCounts={changeCounts}
          onHideFromRightPanels={onHideFromRightPanels}
          onToggleFileTreePath={onToggleFileTreePath}
          onOpenChangePreview={onOpenChangePreview}
          onReorderWorkspaces={onReorderWorkspaces}
          getContextMenuItems={getContextMenuItems as any}
          contextMenuPersistRef={contextMenuPersistRef}
          clearMenuHighlightRef={clearMenuHighlightRef}
          t={t}
          renderMeta={renderMeta}
        />
      )}
      <div
        className="adl-tool-navigator__resize-handle"
        onPointerDown={handleNavigatorResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize changes navigator"
        aria-valuemin={180}
        aria-valuemax={300}
        aria-valuenow={changesNavigatorWidth}
      />
    </aside>
  );
}
