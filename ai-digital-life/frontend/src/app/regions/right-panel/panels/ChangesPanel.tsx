import React from 'react';
import type { ChangesPanelProps } from '../types';
import { ChangesToolbar } from './ChangesToolbar';
import { ChangesConfirmDialogs } from './ChangesConfirmDialogs';
import { RenameDialog } from '../../../components/RenameDialog';
import { ChangesTreePanel } from './ChangesTreePanel';
import { PatchReviewSection } from './PatchReviewSection';
import { DiffEditorSection } from './DiffEditorSection';
import { useChangesPanelState } from './ChangesPanel/useChangesPanelState';
import { useBranchSelection } from './ChangesPanel/useBranchSelection';

const ChangesPanel = React.memo(function ChangesPanel(props: ChangesPanelProps) {
  const { selectedBranch, branchOptions, handleSelectBranch } = useBranchSelection(props);
  const {
    t,
    formatT,
    appInfo,
    activePatchSet,
    latestPatchApplication,
    selectedPatchFilePath,
    selectedChangePreviewPath,
    selectedChangePreviewWorkspaceId,
    changePreview,
    changePreviewLoading,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    onSetHunkDecision,
    onApplyPatchSet,
    onRollbackPatchSet,
    onAcceptAllHunks,
    onRejectAllHunks,
    onSelectPatchFile,
    onSelectPatchHunk,
    onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed,
    onSetPatchReviewFilter,
    onHideFromRightPanels,
    navigatorCollapsed,
    changesNavigatorMode,
    previewEnabled,
    toggleNavigator,
    changesNavigatorWidth,
    setChangesNavigatorMode,
    setPreviewEnabled,
    workspaceChangesTreeLoading,
    workspaceChangesTreeErrors,
    onPinWorkspace,
    onUnpinWorkspace,
    snapshot,
    lineNumbersEnabled,
    wordWrapEnabled,
    changesPreviewContainerRef,
    changesStatusFilter,
    changeEntries,
    hasExpandedDirectories,
    navigatorSelectedPath,
    changeOutline,
    expandedOutlineIds,
    setExpandedOutlineIds,
    changesMenuItems,
    handleDiffMount,
    handleRevealOutlineLine,
    handleToggleAllDirectories,
    handleToggleNavigatorStructure,
    handleStatusFilterClick,
    handleSelectNavigatorNode,
    changesRenameDialogOpen,
    changesRenamingPath,
    changesDeleteConfirmPath,
    changesContextMenuPersistRef,
    changesClearMenuHighlightRef,
    handleChangesRenameConfirm,
    handleChangesRenameCancel,
    handleChangesDeleteConfirm,
    handleChangesDeleteCancel,
    getContextMenuItems,
    renderNavigatorMeta,
    renderNavigatorCount,
    activeWorkspaceId,
    visibleWorkspaces,
    allChangesExpanded,
    canToggleNavigatorStructure,
    structureToggleExpanded,
    changesNavigatorTitle,
    changesTreeData,
    changeCounts,
    totalChangeCount,
    totalChangesStats,
    expandedPathsByWs,
    dirtyPathsSet,
    handleToggleExpand,
    handleExpandAll,
    handleCollapseAll,
    handleRefreshOneWorkspace,
    handleToggleFileTreePath,
    handleReorderWorkspaces,
    handleRefreshAllChanges,
  } = useChangesPanelState(props);

  return (
    <div className="adl-tool-panel adl-tool-panel--changes">
      <ChangesToolbar
        placement="top"
        navigatorCollapsed={navigatorCollapsed}
        onToggleNavigator={() => toggleNavigator('changes')}
        branchOptions={branchOptions}
        selectedBranch={selectedBranch}
        onSelectBranch={handleSelectBranch}
        hasActivePatchSet={!!activePatchSet}
        diffSideBySide={props.diffSideBySide}
        onSetDiffLayout={props.onSetDiffLayout}
        hasChangePreview={!!changePreview}
        previewEnabled={previewEnabled}
        onTogglePreview={() => setPreviewEnabled(!previewEnabled)}
        changesMenuItems={changesMenuItems}
      />

      <div
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
        style={{ '--adl-files-nav-width': `${changesNavigatorWidth}px` } as React.CSSProperties}
      >
        <ChangesTreePanel
          visibleWorkspaces={visibleWorkspaces}
          activeWorkspaceId={activeWorkspaceId}
          workspaceChangesExpanded={props.workspaceChangesExpanded}
          changeCounts={changeCounts}
          changesTreeData={changesTreeData}
          workspaceChangesTreeLoading={workspaceChangesTreeLoading}
          workspaceChangesTreeErrors={workspaceChangesTreeErrors}
          navigatorSelectedPath={navigatorSelectedPath}
          selectedChangePreviewWorkspaceId={selectedChangePreviewWorkspaceId}
          expandedPathsByWs={expandedPathsByWs}
          dirtyPathsSet={dirtyPathsSet}
          externalChangePath={props.externalChangePath}
          onToggleExpand={handleToggleExpand}
          onRefreshOne={handleRefreshOneWorkspace}
          onPinWorkspace={onPinWorkspace}
          onUnpinWorkspace={onUnpinWorkspace}
          onHideFromRightPanels={onHideFromRightPanels}
          onToggleFileTreePath={handleToggleFileTreePath}
          onOpenChangePreview={handleSelectNavigatorNode}
          onReorderWorkspaces={handleReorderWorkspaces}
          getContextMenuItems={getContextMenuItems}
          contextMenuPersistRef={changesContextMenuPersistRef}
          clearMenuHighlightRef={changesClearMenuHighlightRef}
          renderMeta={renderNavigatorMeta}
          renderCount={renderNavigatorCount}
          onToggleAllDirectories={handleToggleAllDirectories}
          hasExpandedDirectories={hasExpandedDirectories}
          changesNavigatorMode={changesNavigatorMode}
          onChangeNavigatorMode={setChangesNavigatorMode}
          allChangesExpanded={allChangesExpanded}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
          totalChangeCount={totalChangeCount}
          hasChangeEntries={totalChangeCount > 0}
          snapshot={snapshot}
          totalChangesStats={totalChangesStats}
          canToggleNavigatorStructure={canToggleNavigatorStructure}
          structureToggleExpanded={structureToggleExpanded}
          onToggleStructure={handleToggleNavigatorStructure}
          changesNavigatorTitle={changesNavigatorTitle}
          changeOutline={changeOutline}
          expandedOutlineIds={expandedOutlineIds}
          onExpandedOutlineIdsChange={setExpandedOutlineIds}
          handleRevealOutlineLine={handleRevealOutlineLine}
          changesStatusFilter={changesStatusFilter}
          onStatusFilterClick={handleStatusFilterClick}
          changeEntries={changeEntries}
          onRefreshAll={handleRefreshAllChanges}
          hasVisibleWorkspaces={visibleWorkspaces.length > 0}
        />

        <div className={`adl-tool-primary${activePatchSet ? ' adl-tool-primary--scrollable' : ''}`}>
          {activePatchSet ? (
            <PatchReviewSection
              activePatchSet={activePatchSet}
              selectedPatchFilePath={selectedPatchFilePath}
              selectedPatchHunkId={selectedPatchHunkId}
              collapsedPatchHunkIds={collapsedPatchHunkIds}
              patchReviewFilter={patchReviewFilter}
              diffSideBySide={props.diffSideBySide}
              latestPatchApplication={latestPatchApplication}
              appInfo={appInfo}
              onSetHunkDecision={onSetHunkDecision}
              onApplyPatchSet={onApplyPatchSet}
              onRollbackPatchSet={onRollbackPatchSet}
              onAcceptAllHunks={onAcceptAllHunks}
              onRejectAllHunks={onRejectAllHunks}
              onSelectPatchFile={onSelectPatchFile}
              onSelectPatchHunk={onSelectPatchHunk}
              onTogglePatchHunkCollapse={onTogglePatchHunkCollapse}
              onSetAllPatchHunksCollapsed={onSetAllPatchHunksCollapsed}
              onSetPatchReviewFilter={onSetPatchReviewFilter}
              onJumpPatchHunk={props.onJumpPatchHunk}
              onDiffMount={handleDiffMount}
            />
          ) : (
            <DiffEditorSection
              changePreview={changePreview}
              changePreviewLoading={changePreviewLoading}
              diffSideBySide={props.diffSideBySide}
              latestPatchApplication={latestPatchApplication}
              appInfo={appInfo}
              totalChangeCount={totalChangeCount}
              visibleWorkspacesLength={visibleWorkspaces.length}
              previewEnabled={previewEnabled}
              lineNumbersEnabled={lineNumbersEnabled}
              wordWrapEnabled={wordWrapEnabled}
              onDiffMount={handleDiffMount}
              previewContainerRef={changesPreviewContainerRef}
            />
          )}
        </div>
      </div>
      <ChangesConfirmDialogs
        changesDeleteConfirmPath={changesDeleteConfirmPath}
        onDeleteConfirm={handleChangesDeleteConfirm}
        onDeleteCancel={handleChangesDeleteCancel}
      />
      {changesRenameDialogOpen && changesRenamingPath ? (
        <RenameDialog
          open={changesRenameDialogOpen}
          initialValue={changesRenamingPath.split('/').pop() || ''}
          title={t.changesRename}
          itemInfo={formatT(t, 'changesCurrentPath', { path: changesRenamingPath })}
          placeholder={t.changesEnterNewName}
          onConfirm={handleChangesRenameConfirm}
          onCancel={handleChangesRenameCancel}
        />
      ) : null}
    </div>
  );
});

export { ChangesPanel };