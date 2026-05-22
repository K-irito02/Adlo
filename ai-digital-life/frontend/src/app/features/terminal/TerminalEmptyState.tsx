import React from "react";
import { IconTerminal } from "../../icons";
import type { TerminalProfile } from "../../ui-store";
import type { CopyDict } from "../../copy";

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
  onSelectProfile: (profile: TerminalProfile) => void;
  t: CopyDict;
}

export function TerminalEmptyState({ shellTypeItems, onSelectProfile, t }: TerminalEmptyStateProps) {
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
              onClick={() => onSelectProfile(item.profile)}
            >
              <ShellPrefix profile={item.profile} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <p className="adl-terminal-empty__footer">
          {t.clickToCreateOrUseToolbar}
        </p>
      </div>
    </div>
  );
}
