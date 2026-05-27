import React, { useState } from "react";
import { IconTerminal } from "../../icons";
import type { TerminalProfile } from "../../ui-store";
import type { CopyDict } from "../../copy";
import type { RecentWorkspaceEntry } from "@ai-digital-life/kernel";

function ShellPrefix({ profile }: { profile?: TerminalProfile }) {
  const map: Record<string, { text: string; color: string }> = {
    powershell: { text: "PS", color: "var(--green, #4ade80)" },
    cmd: { text: ">", color: "var(--blue, #60a5fa)" },
    bash: { text: "$", color: "var(--yellow, #facc15)" },
  };
  const entry = map[profile ?? "powershell"];
  return (
    <span
      className="adl-terminal-empty__prefix"
      style={{ color: entry?.color }}
    >
      {entry?.text ?? "$"}
    </span>
  );
}

interface TerminalEmptyStateProps {
  shellTypeItems: Array<{ id: string; label: string; profile: TerminalProfile }>;
  workspaces: RecentWorkspaceEntry[];
  defaultProfile: TerminalProfile;
  onSelectProfile: (profile: TerminalProfile, workspaceId?: string) => void;
  t: CopyDict;
}

export function TerminalEmptyState({ shellTypeItems, workspaces, defaultProfile, onSelectProfile, t }: TerminalEmptyStateProps) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");

  const handleCreateTerminal = (profile: TerminalProfile) => {
    onSelectProfile(profile, selectedWorkspaceId);
  };

  return (
    <div className="adl-terminal-empty">
      <div className="adl-terminal-empty__card">
        <div className="adl-terminal-empty__header">
          <IconTerminal size={16} decorative />
          <span>{t.terminalPanel}</span>
        </div>
        <p className="adl-terminal-empty__text">
          {t.noOpenTerminalSessions}<br />
          {t.selectShellType}
        </p>
        <div className="adl-terminal-empty__items">
          {shellTypeItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="adl-terminal-empty__item"
              onClick={() => handleCreateTerminal(item.profile)}
            >
              <ShellPrefix profile={item.profile} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="adl-terminal-empty__workspace-section">
          <span className="adl-terminal-empty__workspace-label">{t.terminalBindWorkspace}:</span>
          <div className="adl-terminal-empty__workspace-items">
            <button
              type="button"
              className={`adl-terminal-empty__workspace-item${selectedWorkspaceId === "" ? " is-active" : ""}`}
              onClick={() => setSelectedWorkspaceId("")}
            >
              <span>{t.terminalIndependent}</span>
            </button>
            {workspaces
              .filter(w => !w.removedFromSidebar && w.available)
              .map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  className={`adl-terminal-empty__workspace-item${selectedWorkspaceId === workspace.id ? " is-active" : ""}`}
                  onClick={() => setSelectedWorkspaceId(workspace.id)}
                  title={workspace.path}
                >
                  <span>{workspace.name}</span>
                </button>
              ))}
          </div>
        </div>
        <p className="adl-terminal-empty__footer">
          {t.clickToCreateOrUseToolbar}
        </p>
      </div>
    </div>
  );
}
