import React from "react";
import { renderIcon } from "../../design-system/icons";
import type { ToolType } from "./RightPanel";

export interface ToolContextAreaProps {
  activeTool: ToolType;
  contextData?: Record<string, unknown>;
  onAction?: (action: string, payload?: unknown) => void;
}

function FilesContext({ onAction }: Pick<ToolContextAreaProps, "onAction">) {
  return (
    <div className="tool-context-area tool-context-area--files">
      <div className="tool-context-area__breadcrumb">
        <span
          className="tool-context-area__breadcrumb-icon"
          dangerouslySetInnerHTML={{ __html: renderIcon("folder", { size: "xs", decorative: true }).value }}
        />
        <span className="tool-context-area__breadcrumb-text">workspace</span>
        <span
          className="tool-context-area__breadcrumb-sep"
          dangerouslySetInnerHTML={{ __html: renderIcon("chevron-right", { size: "xs", decorative: true }).value }}
        />
        <span className="tool-context-area__breadcrumb-text">src</span>
      </div>
      <div className="tool-context-area__search">
        <span
          className="tool-context-area__search-icon"
          dangerouslySetInnerHTML={{ __html: renderIcon("search", { size: "xs", decorative: true }).value }}
        />
        <input
          type="text"
          className="tool-context-area__search-input input--sm"
          placeholder="Search files..."
          readOnly
        />
      </div>
      <div className="tool-context-area__actions">
        <button
          type="button"
          className="tool-context-area__action-btn btn btn--ghost btn--sm"
          title="New file"
          onClick={() => onAction?.("new-file")}
        >
          <span dangerouslySetInnerHTML={{ __html: renderIcon("file-plus", { size: "xs", decorative: true }).value }} />
        </button>
        <button
          type="button"
          className="tool-context-area__action-btn btn btn--ghost btn--sm"
          title="New folder"
          onClick={() => onAction?.("new-folder")}
        >
          <span dangerouslySetInnerHTML={{ __html: renderIcon("folder-plus", { size: "xs", decorative: true }).value }} />
        </button>
        <button
          type="button"
          className="tool-context-area__action-btn btn btn--ghost btn--sm"
          title="Refresh"
          onClick={() => onAction?.("refresh-files")}
        >
          <span dangerouslySetInnerHTML={{ __html: renderIcon("refresh", { size: "xs", decorative: true }).value }} />
        </button>
      </div>
    </div>
  );
}

function ChangesContext({ contextData, onAction }: ToolContextAreaProps) {
  const branch = (contextData?.branch as string) ?? "main";
  const ahead = (contextData?.ahead as number) ?? 0;
  const behind = (contextData?.behind as number) ?? 0;
  const staged = (contextData?.staged as number) ?? 0;
  const unstaged = (contextData?.unstaged as number) ?? 0;

  return (
    <div className="tool-context-area tool-context-area--changes">
      <div className="tool-context-area__branch-selector">
        <span
          className="tool-context-area__branch-icon"
          dangerouslySetInnerHTML={{ __html: renderIcon("git-branch", { size: "xs", decorative: true }).value }}
        />
        <select
          className="tool-context-area__branch-select select--sm"
          value={branch}
          onChange={() => {}}
          aria-label="Branch selector"
        >
          <option value={branch}>{branch}</option>
        </select>
        {ahead > 0 ? (
          <span className="pill pill--info tool-context-area__ahead-badge">{ahead} ahead</span>
        ) : null}
        {behind > 0 ? (
          <span className="pill pill--warning tool-context-area__behind-badge">{behind} behind</span>
        ) : null}
      </div>
      <div className="tool-context-area__stats">
        <span className="tool-context-area__stat">
          <span className="tool-context-area__stat-label">Staged</span>
          <span className="tool-context-area__stat-value">{staged}</span>
        </span>
        <span className="tool-context-area__stat-sep" aria-hidden="true" />
        <span className="tool-context-area__stat">
          <span className="tool-context-area__stat-label">Changed</span>
          <span className="tool-context-area__stat-value">{unstaged}</span>
        </span>
      </div>
      <div className="tool-context-area__actions">
        <button
          type="button"
          className="tool-context-area__action-btn btn btn--ghost btn--sm"
          title="Stage all"
          onClick={() => onAction?.("stage-all")}
        >
          <span dangerouslySetInnerHTML={{ __html: renderIcon("check-circle", { size: "xs", decorative: true }).value }} />
        </button>
        <button
          type="button"
          className="tool-context-area__action-btn btn btn--ghost btn--sm"
          title="Commit"
          onClick={() => onAction?.("commit")}
        >
          <span dangerouslySetInnerHTML={{ __html: renderIcon("archive", { size: "xs", decorative: true }).value }} />
        </button>
        <button
          type="button"
          className="tool-context-area__action-btn btn btn--ghost btn--sm"
          title="Push"
          onClick={() => onAction?.("push")}
        >
          <span dangerouslySetInnerHTML={{ __html: renderIcon("upload", { size: "xs", decorative: true }).value }} />
        </button>
        <button
          type="button"
          className="tool-context-area__action-btn btn btn--ghost btn--sm"
          title="Pull"
          onClick={() => onAction?.("pull")}
        >
          <span dangerouslySetInnerHTML={{ __html: renderIcon("download", { size: "xs", decorative: true }).value }} />
        </button>
      </div>
    </div>
  );
}

function BrowserContext({ contextData, onAction }: ToolContextAreaProps) {
  const url = (contextData?.url as string) ?? "";

  return (
    <div className="tool-context-area tool-context-area--browser">
      <div className="tool-context-area__nav-buttons">
        <button
          type="button"
          className="tool-context-area__action-btn btn btn--ghost btn--sm"
          title="Back"
          onClick={() => onAction?.("browser-back")}
        >
          <span dangerouslySetInnerHTML={{ __html: renderIcon("chevron-left", { size: "xs", decorative: true }).value }} />
        </button>
        <button
          type="button"
          className="tool-context-area__action-btn btn btn--ghost btn--sm"
          title="Forward"
          onClick={() => onAction?.("browser-forward")}
        >
          <span dangerouslySetInnerHTML={{ __html: renderIcon("chevron-right", { size: "xs", decorative: true }).value }} />
        </button>
        <button
          type="button"
          className="tool-context-area__action-btn btn btn--ghost btn--sm"
          title="Refresh"
          onClick={() => onAction?.("browser-refresh")}
        >
          <span dangerouslySetInnerHTML={{ __html: renderIcon("refresh", { size: "xs", decorative: true }).value }} />
        </button>
        <button
          type="button"
          className="tool-context-area__action-btn btn btn--ghost btn--sm"
          title="Home"
          onClick={() => onAction?.("browser-home")}
        >
          <span dangerouslySetInnerHTML={{ __html: renderIcon("home", { size: "xs", decorative: true }).value }} />
        </button>
      </div>
      <div className="tool-context-area__address-bar">
        <span
          className="tool-context-area__address-icon"
          dangerouslySetInnerHTML={{ __html: renderIcon("shield", { size: "xs", decorative: true }).value }}
        />
        <input
          type="text"
          className="tool-context-area__address-input input--sm"
          value={url}
          onChange={() => {}}
          placeholder="Enter URL..."
          readOnly
          aria-label="Address bar"
        />
      </div>
      <button
        type="button"
        className="tool-context-area__action-btn btn btn--ghost btn--sm"
        title="Bookmark"
        onClick={() => onAction?.("browser-bookmark")}
      >
        <span dangerouslySetInnerHTML={{ __html: renderIcon("bookmark", { size: "xs", decorative: true }).value }} />
      </button>
    </div>
  );
}

function TerminalContext({ contextData, onAction }: ToolContextAreaProps) {
  const terminals = (contextData?.terminals as string[]) ?? ["terminal-1"];
  const shellType = (contextData?.shellType as string) ?? "bash";

  return (
    <div className="tool-context-area tool-context-area--terminal">
      <div className="tool-context-area__terminal-tabs">
        {terminals.map((term, index) => (
          <button
            key={term}
            type="button"
            className={`tool-context-area__terminal-tab${index === 0 ? " tool-context-area__terminal-tab--active" : ""}`}
            onClick={() => onAction?.("switch-terminal", term)}
          >
            {term}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="tool-context-area__action-btn btn btn--ghost btn--sm"
        title="New terminal"
        onClick={() => onAction?.("new-terminal")}
      >
        <span dangerouslySetInnerHTML={{ __html: renderIcon("plus", { size: "xs", decorative: true }).value }} />
      </button>
      <select
        className="tool-context-area__shell-select select--sm"
        value={shellType}
        onChange={() => {}}
        aria-label="Shell type"
      >
        <option value="bash">bash</option>
        <option value="powershell">PowerShell</option>
        <option value="cmd">CMD</option>
      </select>
    </div>
  );
}

const CONTEXT_RENDERERS: Record<ToolType, React.ComponentType<ToolContextAreaProps>> = {
  files: FilesContext,
  changes: ChangesContext,
  browser: BrowserContext,
  terminal: TerminalContext,
};

export function ToolContextArea(props: ToolContextAreaProps) {
  const Renderer = CONTEXT_RENDERERS[props.activeTool];
  return <Renderer {...props} />;
}

export default ToolContextArea;
