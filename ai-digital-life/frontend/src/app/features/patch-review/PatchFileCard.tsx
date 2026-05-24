import React from "react";
import { IconFileText } from "../../icons";
import { getChangeKindLabel } from "../../regions/right-panel/ChangesPanel/utils";
import { PatchHunkCard } from "./PatchHunkCard";
import type { PatchFileSummary } from "./patchReview";
import type { PatchHunkDecision } from "@ai-digital-life/kernel";

export interface PatchFileCardProps {
  summary: PatchFileSummary;
  activeSummary: PatchFileSummary | undefined;
  activeCardRef: React.MutableRefObject<Record<string, HTMLElement | null>>;
  selectedPatchHunkId: string | undefined;
  t: any;
  onSelectPatchFile: (
    relativePath: string,
    options?: { activateTool: boolean; line?: number; hunkId?: string }
  ) => void;
  onTogglePatchHunkCollapse: (hunkId: string) => void;
  onSelectPatchHunk: (
    relativePath: string,
    hunkId: string,
    targetLine: number,
    options?: { activateTool: boolean }
  ) => void;
  onSetHunkDecision: (hunkId: string, decision: PatchHunkDecision) => void;
}

export function PatchFileCard({
  summary,
  activeSummary,
  activeCardRef,
  selectedPatchHunkId,
  t,
  onSelectPatchFile,
  onTogglePatchHunkCollapse,
  onSelectPatchHunk,
  onSetHunkDecision
}: PatchFileCardProps) {
  const isActiveFile = summary.relativePath === activeSummary?.relativePath;
  return (
    <article
      ref={(element) => {
        activeCardRef.current[summary.relativePath] = element;
      }}
      className={`adl-patch-file-card${isActiveFile ? " is-active" : ""}`}
    >
      <header className="adl-patch-file-card__header">
        <button
          type="button"
          className="adl-patch-file-card__open"
          onClick={() =>
            onSelectPatchFile(summary.relativePath, {
              activateTool: true,
              line: summary.hunks[0]?.targetLine,
              hunkId: summary.hunks[0]?.id
            })
          }
        >
          <IconFileText size={14} decorative />
          <span>{summary.relativePath}</span>
        </button>
        <div className="adl-patch-file-card__header-meta">
          <span className={`adl-change-badge adl-change-badge--${summary.changeKind}`}>
            {getChangeKindLabel(summary.changeKind, t)}
          </span>
          <span className="adl-chip adl-chip--info">
            {summary.acceptedHunks + summary.rejectedHunks}/{summary.totalHunks}
          </span>
        </div>
      </header>

      <div className="adl-patch-file-card__progress">
        <span>{t.currentTask}</span>
        <div className="adl-review-progress" aria-hidden="true">
          <span style={{ width: `${Math.max(8, Math.round(summary.reviewedRatio * 100))}%` }} />
        </div>
      </div>

      <div className="adl-patch-file-card__hunks">
        {summary.hunks.map((hunk) => (
          <PatchHunkCard
            key={hunk.id}
            summary={hunk}
            relativePath={summary.relativePath}
            selectedPatchHunkId={selectedPatchHunkId}
            t={t}
            onTogglePatchHunkCollapse={onTogglePatchHunkCollapse}
            onSelectPatchHunk={onSelectPatchHunk}
            onSetHunkDecision={onSetHunkDecision}
          />
        ))}
      </div>
    </article>
  );
}
