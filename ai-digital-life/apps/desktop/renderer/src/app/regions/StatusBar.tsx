import React, { useMemo, useState } from "react";
import type { AppInfo, ModelGatewayHealthSnapshot, WorkspaceMeta } from "@ai-digital-life/kernel";
import type { CopyDict } from "../copy";
import { MODEL_PROVIDER_IDS } from "../constants";
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconCircle,
  IconFolder,
  IconGitBranch,
  IconUpload
} from "../icons";
import { TooltipSimple } from "../components/Tooltip";

type GitStatus = "synced" | "dirty" | "unpushed" | "conflict" | "no-repo";

interface StatusBarProps {
  t: CopyDict;
  appInfo?: AppInfo;
  currentWorkspace?: WorkspaceMeta;
  modelHealth?: ModelGatewayHealthSnapshot;
  isStreaming: boolean;
  onSelectModel: (providerId: string) => void;
}

function gitIcon(status: GitStatus, size: 12 | 14 | 16 = 12) {
  switch (status) {
    case "synced":
      return <IconCheckCircle size={size} decorative />;
    case "dirty":
      return <IconCircle size={size} decorative />;
    case "unpushed":
      return <IconUpload size={size} decorative />;
    case "conflict":
      return <IconAlertTriangle size={size} decorative />;
    default:
      return <IconFolder size={size} decorative />;
  }
}

function gitStatusLabel(t: CopyDict, status: GitStatus): string {
  switch (status) {
    case "synced":
      return t.statusbarGitSynced;
    case "dirty":
      return t.statusbarGitDirty;
    case "unpushed":
      return t.statusbarGitUnpushed;
    case "conflict":
      return t.statusbarGitConflict;
    default:
      return t.statusbarGitNoRepo;
  }
}

export function StatusBar({
  t,
  appInfo,
  currentWorkspace,
  modelHealth,
  isStreaming,
  onSelectModel
}: StatusBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Placeholder until a dedicated Git IPC channel lands. Inferred from
  // workspace availability so the layout renders meaningfully in Phase 2.
  const gitStatus: GitStatus = currentWorkspace ? "synced" : "no-repo";

  const activeProvider = useMemo(() => {
    const providers = appInfo?.config.modelPreferences.providers;
    if (!providers) return undefined;
    return Object.entries(providers)
      .map(([id, value]) => ({ id, ...value }))
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority)[0];
  }, [appInfo?.config.modelPreferences.providers]);

  return (
    <footer className="adl-statusbar" role="contentinfo">
      <TooltipSimple content={gitStatusLabel(t, gitStatus)} placement="top">
        <button
          type="button"
          className="adl-statusbar__item"
        >
          {gitIcon(gitStatus)}
          <span>{gitStatusLabel(t, gitStatus)}</span>
        </button>
      </TooltipSimple>
      <span className="adl-statusbar__sep" aria-hidden="true" />
      <span className="adl-statusbar__item">
        <IconFolder size={12} decorative />
        <span>{currentWorkspace?.name ?? t.workspaceLabel}</span>
      </span>
      <span className="adl-statusbar__sep" aria-hidden="true" />
      <span className="adl-statusbar__item">
        <IconGitBranch size={12} decorative />
        <span>main</span>
      </span>
      <span className="adl-statusbar__spacer" />
      <span className="adl-statusbar__item" aria-live="polite">
        {isStreaming ? t.agentGenerating : t.statusReady}
      </span>
      <span className="adl-statusbar__sep" aria-hidden="true" />
      <div className="adl-statusbar__model">
        <TooltipSimple content={`${t.modelLabel}: ${activeProvider?.modelId ?? "—"}`} placement="top">
          <button
            type="button"
            className="adl-statusbar__item adl-statusbar__model-trigger"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span>{t.modelLabel}</span>
            <strong>{activeProvider?.modelId ?? "—"}</strong>
          </button>
        </TooltipSimple>
        {menuOpen ? (
          <div className="adl-statusbar__model-menu" role="menu">
            {MODEL_PROVIDER_IDS.map((providerId) => {
              const health = modelHealth?.providers.find((p) => p.providerId === providerId);
              const preference = appInfo?.config.modelPreferences.providers[providerId];
              if (!preference) return null;
              return (
                <button
                  key={providerId}
                  type="button"
                  role="menuitem"
                  className="adl-statusbar__model-option"
                  onClick={() => {
                    onSelectModel(providerId);
                    setMenuOpen(false);
                  }}
                >
                  <span>{providerId}</span>
                  <span
                    className={`adl-chip adl-chip--${health?.healthy ? "success" : "warning"}`}
                  >
                    {health?.healthy ? "healthy" : "degraded"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </footer>
  );
}
