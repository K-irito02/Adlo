import React, { useState } from "react";
import { renderIcon } from "../../design-system/icons";
import { TooltipSimple } from "./Tooltip";

export type GitStatusType = "synced" | "dirty" | "ahead" | "behind" | "conflict" | "none";

export interface StatusBarProps {
  workspaceName: string;
  workspacePath?: string;
  gitBranch?: string;
  gitStatus?: GitStatusType;
  gitAheadBehind?: { ahead: number; behind: number };
  currentModel?: string;
  onModelChange?: (model: string) => void;
  onGitClick?: () => void;
}

const GIT_STATUS_CONFIG: Record<GitStatusType, { label: string; dotClassName: string }> = {
  synced: { label: "Synced", dotClassName: "statusbar__dot--synced" },
  dirty: { label: "Uncommitted", dotClassName: "statusbar__dot--dirty" },
  ahead: { label: "Ahead", dotClassName: "statusbar__dot--ahead" },
  behind: { label: "Behind", dotClassName: "statusbar__dot--behind" },
  conflict: { label: "Conflict", dotClassName: "statusbar__dot--conflict" },
  none: { label: "No Git", dotClassName: "statusbar__dot--none" },
};

const MODEL_OPTIONS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "deepseek-v3", label: "DeepSeek V3" },
];

export function StatusBar({
  workspaceName,
  workspacePath,
  gitBranch,
  gitStatus = "none",
  gitAheadBehind,
  currentModel,
  onModelChange,
  onGitClick,
}: StatusBarProps) {
  const [modelOpen, setModelOpen] = useState(false);
  const statusConfig = GIT_STATUS_CONFIG[gitStatus] ?? GIT_STATUS_CONFIG.none;

  return (
    <footer className="statusbar" role="contentinfo">
      <div
        className="statusbar__section statusbar__section--left"
        onClick={onGitClick}
        role="button"
        tabIndex={onGitClick ? 0 : undefined}
        aria-label={`Git status: ${statusConfig.label}`}
      >
        <span className={`statusbar__dot ${statusConfig.dotClassName}`} />
        <span className="statusbar__label">{statusConfig.label}</span>
      </div>

      <div className="statusbar__sep" aria-hidden="true" />

      <TooltipSimple content={workspacePath ?? workspaceName} placement="top">
        <div
          className="statusbar__section"
          tabIndex={0}
          role="button"
          aria-label={`Workspace: ${workspacePath ?? workspaceName}`}
        >
          <span
            className="statusbar__icon"
            dangerouslySetInnerHTML={{ __html: renderIcon("folder", { size: "xs", decorative: true }).value }}
          />
          <span className="statusbar__label">{workspaceName}</span>
        </div>
      </TooltipSimple>

      <div className="statusbar__sep" aria-hidden="true" />

      <div
        className="statusbar__section"
        onClick={onGitClick}
        role="button"
        tabIndex={onGitClick ? 0 : undefined}
        aria-label={`Branch: ${gitBranch ?? "none"}`}
      >
        <span
          className="statusbar__icon"
          dangerouslySetInnerHTML={{ __html: renderIcon("git-branch", { size: "xs", decorative: true }).value }}
        />
        <span className="statusbar__label">{gitBranch ?? "\u2014"}</span>
        {gitAheadBehind ? (
          <span className="statusbar__branch-info">
            {gitAheadBehind.ahead > 0 ? (
              <span className="statusbar__branch-ahead">{` \u2191${gitAheadBehind.ahead}`}</span>
            ) : null}
            {gitAheadBehind.behind > 0 ? (
              <span className="statusbar__branch-behind">{` \u2193${gitAheadBehind.behind}`}</span>
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="statusbar__spacer" aria-hidden="true" />

      <div className="statusbar__section statusbar__section--model">
        <div className="statusbar__model-wrapper">
          <button
            type="button"
            className="statusbar__model-btn"
            onClick={() => setModelOpen((prev) => !prev)}
            aria-expanded={modelOpen}
            aria-haspopup="listbox"
            aria-label={`Current model: ${currentModel ?? "Select model"}`}
          >
            <span
              className="statusbar__model-icon"
              dangerouslySetInnerHTML={{ __html: renderIcon("brain", { size: "xs", decorative: true }).value }}
            />
            <span className="statusbar__label">{currentModel ?? "Model"}</span>
            <span
              className="statusbar__model-chevron"
              dangerouslySetInnerHTML={{ __html: renderIcon(modelOpen ? "chevron-up" : "chevron-down", { size: "xs", decorative: true }).value }}
            />
          </button>
          {modelOpen && onModelChange ? (
            <ul className="statusbar__model-dropdown" role="listbox" aria-label="Select model">
              {MODEL_OPTIONS.map((option) => (
                <li key={option.value} role="option" aria-selected={currentModel === option.value}>
                  <button
                    type="button"
                    className={`statusbar__model-option${currentModel === option.value ? " statusbar__model-option--active" : ""}`}
                    onClick={() => {
                      onModelChange(option.value);
                      setModelOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

export default StatusBar;
