import React, { useMemo, useRef } from 'react';
import { IconChevronDown, IconChevronRight } from '@icons';
import type { ChangesPanelProps } from '../types';

import {
  countReviewedHunks,
  filterPatchFileSummaries,
  summarizePatchFile,
  summarizePatchSet,
} from '@features/patch-review';
import { PatchReviewSummary, PatchFileCard } from '@features/patch-review';
import { DiffToolbar } from '../DiffToolbar';
import { useEditorOptions } from '../hooks';
import { detectEditorLanguage } from '@utils/workspacePaths';
import { DiffViewer } from '@features/diff-viewer';
import { useTCopy } from '@i18n/useTCopy';
import { useResolvedTheme } from '@hooks/useResolvedTheme';

type PatchReviewSectionProps = Pick<
  ChangesPanelProps,
  | 'activePatchSet'
  | 'selectedPatchFilePath'
  | 'selectedPatchHunkId'
  | 'collapsedPatchHunkIds'
  | 'patchReviewFilter'
  | 'diffSideBySide'
  | 'latestPatchApplication'
  | 'appInfo'
  | 'onSetHunkDecision'
  | 'onApplyPatchSet'
  | 'onRollbackPatchSet'
  | 'onAcceptAllHunks'
  | 'onRejectAllHunks'
  | 'onSelectPatchFile'
  | 'onSelectPatchHunk'
  | 'onTogglePatchHunkCollapse'
  | 'onSetAllPatchHunksCollapsed'
  | 'onSetPatchReviewFilter'
  | 'onJumpPatchHunk'
  | 'onDiffMount'
>;

const PatchReviewSection = React.memo(function PatchReviewSection(props: PatchReviewSectionProps) {
  const { t } = useTCopy();
  const {
    activePatchSet,
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    diffSideBySide,
    latestPatchApplication,
    appInfo,
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
    onJumpPatchHunk,
    onDiffMount,
  } = props;

  const activeCardRef = useRef<Record<string, HTMLElement | null>>({});
  const changesDiffViewerRef = useRef<HTMLDivElement | null>(null);

  const reviewCounts = useMemo(() => countReviewedHunks(activePatchSet), [activePatchSet]);
  const patchSummaries = useMemo(
    () => summarizePatchSet(activePatchSet, collapsedPatchHunkIds),
    [activePatchSet, collapsedPatchHunkIds]
  );
  const filteredPatchSummaries = useMemo(
    () => filterPatchFileSummaries(patchSummaries, patchReviewFilter),
    [patchSummaries, patchReviewFilter]
  );
  const activeSummary =
    filteredPatchSummaries.find((summary) => summary.relativePath === selectedPatchFilePath) ??
    filteredPatchSummaries[0];

  const activeFilePatchFromSet = useMemo(() => {
    if (!activePatchSet || !selectedPatchFilePath) {
      return undefined;
    }
    return activePatchSet.filePatches.find((p) => p.relativePath === selectedPatchFilePath);
  }, [activePatchSet, selectedPatchFilePath]);

  const activePatchFileSummary = useMemo(
    () =>
      activeFilePatchFromSet
        ? summarizePatchFile(activeFilePatchFromSet, collapsedPatchHunkIds)
        : undefined,
    [activeFilePatchFromSet, collapsedPatchHunkIds]
  );

  const changePreviewLanguage = useMemo(() => {
    const filePath = activeFilePatchFromSet?.relativePath;
    const fallbackLang = activeFilePatchFromSet?.language;
    return detectEditorLanguage(filePath, fallbackLang);
  }, [activeFilePatchFromSet]);

  const changePreviewTheme = useResolvedTheme();
  const changePreviewLocale = appInfo?.config.language ?? 'zh-CN';

  const changesEditorOptions = useEditorOptions();
  const diffExtensions = useMemo(() => [], []);
  const validation = latestPatchApplication?.validation;

  if (!activePatchSet) {
    return null;
  }

  return (
    <div className="adl-tool-primary__scroll adl-tool-primary__scroll--changes">
      {validation ? (
        <div className="adl-banner adl-banner--info">
          <strong>{validation.status}</strong>
          <span>{validation.summary}</span>
          {latestPatchApplication?.rolledBack ? (
            <span className="adl-chip adl-chip--warning">{t.changesRolledBack}</span>
          ) : null}
          {latestPatchApplication?.patchSet.status === 'applied' ? (
            <span className="adl-chip adl-chip--success">{t.changesApplied}</span>
          ) : null}
        </div>
      ) : null}

      <>
        <PatchReviewSummary
          activePatchSet={activePatchSet}
          reviewCounts={reviewCounts}
          patchReviewFilter={patchReviewFilter}
          onSetPatchReviewFilter={onSetPatchReviewFilter}
          onAcceptAllHunks={onAcceptAllHunks}
          onRejectAllHunks={onRejectAllHunks}
        />

        {filteredPatchSummaries.length > 0 ? (
          <div className="adl-patch-review-files">
            {filteredPatchSummaries.map((summary) => (
              <PatchFileCard
                key={summary.relativePath}
                summary={summary}
                activeSummary={activeSummary}
                activeCardRef={activeCardRef}
                selectedPatchHunkId={selectedPatchHunkId}
                onSelectPatchFile={onSelectPatchFile}
                onTogglePatchHunkCollapse={onTogglePatchHunkCollapse}
                onSelectPatchHunk={onSelectPatchHunk}
                onSetHunkDecision={onSetHunkDecision}
              />
            ))}
          </div>
        ) : (
          <p className="adl-empty-hint">{t.noPatch}</p>
        )}

        <div className="adl-patch-card__footer">
          {activeFilePatchFromSet && activePatchFileSummary ? (
            <div className="adl-tool-editor" ref={changesDiffViewerRef}>
              <DiffToolbar
                diffSideBySide={diffSideBySide}
                lineNumbersEnabled={changesEditorOptions.lineNumbersEnabled}
                wordWrapEnabled={changesEditorOptions.wordWrapEnabled}
                agentAnnotationsEnabled={changesEditorOptions.agentAnnotationsEnabled}
                hasCollapsedHunks={!!activePatchFileSummary.hunks.some((h) => h.isCollapsed)}
                activePatchRelativePath={selectedPatchFilePath}
                onSetDiffLayout={() => {}}
                onToggleLineNumbers={() => changesEditorOptions.setLineNumbersEnabled((v) => !v)}
                onToggleWordWrap={() => changesEditorOptions.setWordWrapEnabled((v) => !v)}
                onToggleAgentAnnotations={() =>
                  changesEditorOptions.setAgentAnnotationsEnabled((v) => !v)
                }
                onJumpPatchHunk={onJumpPatchHunk}
                onSetAllPatchHunksCollapsed={onSetAllPatchHunksCollapsed}
              />
              <div className="adl-diff-hunk-strip" aria-label={t.patchReview as string}>
                <div className="adl-diff-hunk-strip__header">
                  <div>
                    <strong>{activePatchFileSummary.relativePath}</strong>
                    <small>
                      {activePatchFileSummary.totalHunks}
                      {' · '}
                      {activePatchFileSummary.acceptedHunks + activePatchFileSummary.rejectedHunks}
                      {'/'}
                      {activePatchFileSummary.totalHunks}
                    </small>
                  </div>
                </div>
                <div className="adl-diff-hunk-strip__list">
                  {activePatchFileSummary.hunks.map((hunk, index) => (
                    <div
                      key={hunk.id}
                      className={`adl-diff-hunk-pill adl-diff-hunk-pill--${hunk.changeKind}${selectedPatchHunkId === hunk.id ? ' is-active' : ''}`}
                    >
                      <button
                        type="button"
                        className="adl-diff-hunk-pill__main"
                        onClick={() =>
                          onSelectPatchHunk(
                            activeFilePatchFromSet.relativePath,
                            hunk.id,
                            hunk.targetLine,
                            { activateTool: false }
                          )
                        }
                      >
                        <span className="adl-diff-hunk-pill__index">{index + 1}</span>
                        <span className="adl-diff-hunk-pill__body">
                          <strong>{hunk.preview}</strong>
                          <small>
                            {hunk.newStart || hunk.oldStart}
                            {hunk.isCollapsed ? ` · ${t.expandDetails}` : ''}
                          </small>
                        </span>
                        <span className={`adl-decision-chip adl-decision-chip--${hunk.decision}`}>
                          {hunk.decision === 'accepted'
                            ? t.approvalApproved
                            : hunk.decision === 'rejected'
                              ? t.approvalRejected
                              : t.approvalPendingCount}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="adl-diff-hunk-pill__toggle"
                        onClick={(event) => {
                          event.stopPropagation();
                          onTogglePatchHunkCollapse(hunk.id);
                        }}
                        aria-label={
                          (hunk.isCollapsed ? t.expandDetails : t.collapseDetails) as string
                        }
                      >
                        {hunk.isCollapsed ? (
                          <IconChevronRight size={12} decorative />
                        ) : (
                          <IconChevronDown size={12} decorative />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="adl-tool-editor__surface">
                <DiffViewer
                  original={activeFilePatchFromSet.beforeContent}
                  modified={activeFilePatchFromSet.afterContent}
                  language={changePreviewLanguage}
                  theme={changePreviewTheme}
                  locale={changePreviewLocale}
                  sideBySide={diffSideBySide}
                  collapseUnchanged={true}
                  fileKey={selectedPatchFilePath}
                  readOnly={changesEditorOptions.diffOptions.readOnly}
                  lineNumbers={changesEditorOptions.diffOptions.lineNumbers}
                  wordWrap={changesEditorOptions.diffOptions.wordWrap}
                  onMount={onDiffMount}
                  extensions={diffExtensions}
                />
              </div>
            </div>
          ) : null}
          <button
            data-testid="patch-apply"
            type="button"
            className="adl-btn adl-btn--primary"
            onClick={onApplyPatchSet}
          >
            {t.applyPatch}
          </button>
          <button type="button" className="adl-btn adl-btn--ghost" onClick={onRollbackPatchSet}>
            {t.rollbackPatch}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--ghost"
            onClick={() => onSetAllPatchHunksCollapsed(false, activeSummary?.relativePath)}
          >
            {t.fileExpandAll}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--ghost"
            onClick={() => onSetAllPatchHunksCollapsed(true, activeSummary?.relativePath)}
          >
            {t.fileCollapseAll}
          </button>
        </div>
      </>
    </div>
  );
});

export { PatchReviewSection };
