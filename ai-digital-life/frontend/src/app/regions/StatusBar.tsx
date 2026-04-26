import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AgentRunDetail, AppInfo, IndexingStatus, ModelGatewayHealthSnapshot, WorkspaceMeta } from "@ai-digital-life/kernel";
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
  activeRun?: AgentRunDetail;
  indexingStatus?: IndexingStatus;
  onSelectModel: (providerId: string) => void;
  inline?: boolean;
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

function modelHealthLabel(t: CopyDict, healthy?: boolean): string {
  return healthy ? t.statusHealthy : t.statusDegraded;
}

function modelHealthTone(healthy?: boolean): "healthy" | "degraded" {
  return healthy ? "healthy" : "degraded";
}

export function StatusBar({
  t,
  appInfo,
  currentWorkspace,
  modelHealth,
  isStreaming,
  activeRun,
  indexingStatus,
  onSelectModel,
  inline = false
}: StatusBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const ContainerTag = inline ? "div" : "footer";

  const gitSnapshot = currentWorkspace?.gitSnapshot;
  const gitStatus: GitStatus = !gitSnapshot?.isRepo
    ? "no-repo"
    : gitSnapshot.conflicts.length > 0
      ? "conflict"
      : gitSnapshot.ahead && gitSnapshot.ahead > 0
        ? "unpushed"
        : gitSnapshot.staged.length > 0 ||
            gitSnapshot.unstaged.length > 0 ||
            gitSnapshot.untracked.length > 0
          ? "dirty"
          : "synced";

  const activeProvider = useMemo(() => {
    const providers = appInfo?.config.modelPreferences.providers;
    if (!providers) return undefined;
    return Object.entries(providers)
      .map(([id, value]) => ({ id, ...value }))
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority)[0];
  }, [appInfo?.config.modelPreferences.providers]);

  const activeProviderHealth = useMemo(() => {
    if (!activeProvider) return undefined;
    return modelHealth?.providers.find((provider) => provider.providerId === activeProvider.id);
  }, [activeProvider, modelHealth?.providers]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      if (!modelRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <ContainerTag
      className={`adl-statusbar${inline ? " adl-statusbar--inline" : ""}`}
      role={inline ? "group" : "contentinfo"}
      aria-label={inline ? "Conversation status" : undefined}
    >
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
        <span>{gitSnapshot?.branch ?? "main"}</span>
      </span>
      <span className="adl-statusbar__spacer" />
      <span className="adl-statusbar__item" aria-live="polite">
        {isStreaming
          ? t.agentGenerating
          : activeRun?.run.status === "waiting-approval"
            ? t.agentWaitingApproval
            : t.statusReady}
      </span>
      {indexingStatus && (
        <>
          <span className="adl-statusbar__sep" aria-hidden="true" />
          <span className={`adl-statusbar__item adl-statusbar__item--${indexingStatus.state}`}>
            {indexingStatus.state === "indexing"
              ? t.indexingInProgress
              : indexingStatus.state === "indexed"
                ? t.indexingCompleted
                : indexingStatus.state === "error"
                  ? t.indexingError
                  : t.indexingIdle}
          </span>
        </>
      )}
      <span className="adl-statusbar__sep" aria-hidden="true" />
      <div className="adl-statusbar__model" ref={modelRef}>
        <button
          type="button"
          className="adl-statusbar__item adl-statusbar__model-trigger"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span>{t.modelLabel}</span>
          <TooltipSimple content={activeProvider?.modelId ?? "—"} placement="top">
            <strong className="adl-statusbar__model-name">{activeProvider?.modelId ?? "—"}</strong>
          </TooltipSimple>
          <TooltipSimple content={modelHealthLabel(t, activeProviderHealth?.healthy)} placement="top">
            <span
              className={`adl-statusbar__model-dot adl-statusbar__model-dot--${modelHealthTone(activeProviderHealth?.healthy)}`}
              aria-label={modelHealthLabel(t, activeProviderHealth?.healthy)}
              role="img"
            />
          </TooltipSimple>
        </button>
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
                  className={`adl-statusbar__model-option${providerId === activeProvider?.id ? " is-active" : ""}`}
                  onClick={() => {
                    onSelectModel(providerId);
                    setMenuOpen(false);
                  }}
                  aria-label={preference.modelId}
                >
                  <TooltipSimple content={preference.modelId} placement="left">
                    <span className="adl-statusbar__model-option-name">{preference.modelId}</span>
                  </TooltipSimple>
                  <TooltipSimple content={modelHealthLabel(t, health?.healthy)} placement="left">
                    <span
                      className={`adl-statusbar__model-option-dot adl-statusbar__model-option-dot--${modelHealthTone(health?.healthy)}`}
                      aria-label={modelHealthLabel(t, health?.healthy)}
                      role="img"
                    />
                  </TooltipSimple>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </ContainerTag>
  );
}
