import React from "react";
import { IconHash } from "../../icons";
import type { CopyDict } from "../../i18n";

interface DiffToolbarProps {
  diffSideBySide: boolean;
  lineNumbersEnabled: boolean;
  wordWrapEnabled: boolean;
  agentAnnotationsEnabled: boolean;
  hasCollapsedHunks: boolean;
  activePatchRelativePath: string | undefined;
  onSetDiffLayout: (sideBySide: boolean) => void;
  onToggleLineNumbers: () => void;
  onToggleWordWrap: () => void;
  onToggleAgentAnnotations: () => void;
  onJumpPatchHunk: (direction: "previous" | "next") => void;
  onSetAllPatchHunksCollapsed: (collapsed: boolean, relativePath?: string) => void;
  t: CopyDict;
}

function DiffToolbar({
  diffSideBySide,
  lineNumbersEnabled,
  wordWrapEnabled,
  agentAnnotationsEnabled,
  hasCollapsedHunks,
  activePatchRelativePath,
  onSetDiffLayout,
  onToggleLineNumbers,
  onToggleWordWrap,
  onToggleAgentAnnotations,
  onJumpPatchHunk,
  onSetAllPatchHunksCollapsed,
  t,
}: DiffToolbarProps) {
  return (
    <div className="adl-diff-toolbar" role="group" aria-label={t.diffLayoutLabel as string}>
      <div className="adl-diff-toolbar__group">
        <span className="adl-diff-toolbar__label">{t.diffLayoutLabel as string}</span>
        <div className="adl-segmented">
          <button
            type="button"
            aria-pressed={!diffSideBySide ? "true" : "false"}
            onClick={() => onSetDiffLayout(false)}
          >
            {t.diffLayoutInline as string}
          </button>
          <button
            type="button"
            aria-pressed={diffSideBySide ? "true" : "false"}
            onClick={() => onSetDiffLayout(true)}
          >
            {t.diffLayoutSideBySide as string}
          </button>
        </div>
      </div>
      <div className="adl-diff-toolbar__group">
        <button
          type="button"
          className={`adl-diff-toolbar__toggle${lineNumbersEnabled ? " is-active" : ""}`}
          onClick={onToggleLineNumbers}
        >
          <IconHash size={12} decorative />
          <span>{t.fileLineNumbers as string}</span>
        </button>
        <button
          type="button"
          className={`adl-diff-toolbar__toggle${wordWrapEnabled ? " is-active" : ""}`}
          onClick={onToggleWordWrap}
        >
          <span>{t.fileWordWrap as string}</span>
        </button>
        <button
          type="button"
          className={`adl-diff-toolbar__toggle${agentAnnotationsEnabled ? " is-active" : ""}`}
          onClick={onToggleAgentAnnotations}
        >
          <span>{t.agentChangeAnnotations as string}</span>
        </button>
      </div>
      <div className="adl-diff-toolbar__group">
        <button
          type="button"
          className="adl-diff-toolbar__nav"
          onClick={() => onJumpPatchHunk("previous")}
        >
          {t.patchPreviousChange as string}
        </button>
        <button
          type="button"
          className="adl-diff-toolbar__nav"
          onClick={() => onJumpPatchHunk("next")}
        >
          {t.patchNextChange as string}
        </button>
        <button
          type="button"
          className="adl-diff-toolbar__nav"
          onClick={() => onSetAllPatchHunksCollapsed(!hasCollapsedHunks, activePatchRelativePath)}
        >
          {(hasCollapsedHunks ? t.fileExpandAll : t.fileCollapseAll) as string}
        </button>
      </div>
    </div>
  );
}

export { DiffToolbar };
export type { DiffToolbarProps };
