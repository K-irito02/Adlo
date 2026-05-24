import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentRunDetail,
  AppInfo,
  GitBranchSummary,
  GitSnapshot,
  ModelProviderId,
  ModelGatewayHealthSnapshot,
  RecentWorkspaceEntry,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceMeta
} from "@ai-digital-life/kernel";
import type { CopyDict } from "../copy";
import { MODEL_PROVIDER_IDS } from "../constants";
import { MODEL_OPTIONS } from "../constants";
import {
  IconCheck,
  IconChevronRight,
  IconFolder,
  IconFolderOpen,
  IconGitBranch,
  IconPlus,
  IconUpload
} from "../icons";
import { TooltipSimple } from "../components/Tooltip";
import { WorkspaceSplitButton } from "../components/WorkspaceSplitButton";
import { modelLabel, gitIcon, gitStatusLabel, modelHealthLabel, modelHealthTone, isDirtyWorktree, type GitStatus } from "./StatusBar/utils";

type OpenMenu = "workspace" | "branch" | "model" | undefined;
type PendingBranchAction =
  | { kind: "switch"; input: WorkspaceGitBranchSwitchInput }
  | { kind: "create"; input: WorkspaceGitBranchCreateInput };

interface StatusBarProps {
  t: CopyDict;
  appInfo?: AppInfo;
  currentWorkspace?: WorkspaceMeta;
  recentWorkspaces: RecentWorkspaceEntry[];
  gitSnapshot?: GitSnapshot;
  gitBranches: GitBranchSummary[];
  modelHealth?: ModelGatewayHealthSnapshot;
  isStreaming: boolean;
  activeRun?: AgentRunDetail;
  workspaceContextMode: "workspace" | "global";
  onSelectModel: (providerId: ModelProviderId, modelId?: string) => void;
  onOpenWorkspace: (workspacePath: string) => Promise<{ ok: boolean; error?: string }>;
  onClearWorkspaceContext: () => Promise<void>;
  onPickWorkspaceDirectory: () => Promise<string | undefined>;
  onRefreshGitBranches: () => Promise<void>;
  onSwitchGitBranch: (input: WorkspaceGitBranchSwitchInput) => Promise<void>;
  onCreateGitBranch: (input: WorkspaceGitBranchCreateInput) => Promise<void>;
  inline?: boolean;
}

export function StatusBar({
  t,
  appInfo,
  currentWorkspace,
  recentWorkspaces,
  gitSnapshot,
  gitBranches,
  modelHealth,
  isStreaming,
  activeRun,
  workspaceContextMode,
  onSelectModel,
  onOpenWorkspace,
  onClearWorkspaceContext,
  onPickWorkspaceDirectory,
  onRefreshGitBranches,
  onSwitchGitBranch,
  onCreateGitBranch,
  inline = false
}: StatusBarProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>();
  const [branchDraft, setBranchDraft] = useState("");
  const [baseBranchDraft, setBaseBranchDraft] = useState("");
  const [baseBranchMenuOpen, setBaseBranchMenuOpen] = useState(false);
  const [pendingBranchAction, setPendingBranchAction] = useState<PendingBranchAction>();
  const rootRef = useRef<HTMLDivElement>(null);
  const baseBranchMenuWrapRef = useRef<HTMLDivElement>(null);
  const ContainerTag = inline ? "div" : "footer";
  const effectiveGitSnapshot = gitSnapshot ?? currentWorkspace?.gitSnapshot;
  const currentBranch = effectiveGitSnapshot?.branch ?? "main";
  const hasWorkspace = Boolean(currentWorkspace);
  const hasDirtyChanges = isDirtyWorktree(effectiveGitSnapshot);

  const gitStatus: GitStatus = !effectiveGitSnapshot?.isRepo
    ? "no-repo"
    : effectiveGitSnapshot.conflicts.length > 0
      ? "conflict"
      : effectiveGitSnapshot.ahead && effectiveGitSnapshot.ahead > 0
        ? "unpushed"
        : hasDirtyChanges
          ? "dirty"
          : "synced";

  const activeProvider = useMemo(() => {
    const providers = appInfo?.config.modelPreferences.providers;
    if (!providers) return undefined;
    return Object.entries(providers)
      .map(([id, value]) => ({ id, ...value }))
      .filter((provider) => provider.enabled)
      .sort((left, right) => left.priority - right.priority)[0];
  }, [appInfo?.config.modelPreferences.providers]);

  const activeProviderHealth = useMemo(() => {
    if (!activeProvider) return undefined;
    return modelHealth?.providers.find((provider) => provider.providerId === activeProvider.id);
  }, [activeProvider, modelHealth?.providers]);

  const activeModelLabel = useMemo(() => {
    if (!activeProvider?.id) return "—";
    return modelLabel(activeProvider.id as ModelProviderId, activeProvider.modelId);
  }, [activeProvider?.id, activeProvider?.modelId]);

  const workspaceStatusLabel = useMemo(() => {
    if (currentWorkspace) {
      return currentWorkspace.name;
    }
    return workspaceContextMode === "global" ? t.conversations : t.workspaceLabel;
  }, [currentWorkspace, t.conversations, t.workspaceLabel, workspaceContextMode]);

  const workspaceStatusHint = useMemo(() => {
    if (currentWorkspace) {
      return currentWorkspace.path;
    }
    return t.workspaceStatusGlobalHint;
  }, [currentWorkspace, t.workspaceStatusGlobalHint]);

  useEffect(() => {
    if (!openMenu) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(undefined);
        setPendingBranchAction(undefined);
        setBaseBranchMenuOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(undefined);
        setPendingBranchAction(undefined);
        setBaseBranchMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!baseBranchMenuOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!baseBranchMenuWrapRef.current?.contains(event.target as Node)) {
        setBaseBranchMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [baseBranchMenuOpen]);

  useEffect(() => {
    if (openMenu === "branch" && hasWorkspace) {
      void onRefreshGitBranches();
    }
  }, [hasWorkspace, onRefreshGitBranches, openMenu]);

  const handleSwitchBranch = async (input: WorkspaceGitBranchSwitchInput) => {
    await onSwitchGitBranch(input);
    setPendingBranchAction(undefined);
    setOpenMenu(undefined);
  };

  const handleCreateBranch = async (input: WorkspaceGitBranchCreateInput) => {
    await onCreateGitBranch(input);
    setPendingBranchAction(undefined);
    setOpenMenu(undefined);
    setBranchDraft("");
    setBaseBranchDraft("");
  };

  const handleSubmitCreateBranch = async () => {
    const branchName = branchDraft.trim();
    if (!branchName) {
      return;
    }
    const input: WorkspaceGitBranchCreateInput = {
      branchName,
      baseBranch: baseBranchDraft.trim() || undefined,
      allowStash: false
    };
    const requiresStash =
      hasDirtyChanges &&
      Boolean(input.baseBranch) &&
      input.baseBranch !== currentBranch;
    if (requiresStash) {
      setPendingBranchAction({
        kind: "create",
        input: { ...input, allowStash: true }
      });
      return;
    }
    await handleCreateBranch(input);
  };

  const baseBranchLabel = useMemo(() => {
    if (!baseBranchDraft.trim()) {
      return t.branchCreateFromCurrent;
    }
    return baseBranchDraft.trim();
  }, [baseBranchDraft, t.branchCreateFromCurrent]);

  return (
    <ContainerTag
      ref={rootRef}
      className={`adl-statusbar${inline ? " adl-statusbar--inline" : ""}`}
      role={inline ? "group" : "contentinfo"}
      aria-label={inline ? "Conversation status" : undefined}
    >
      <TooltipSimple content={gitStatusLabel(t, gitStatus)} placement="top">
        <button type="button" className="adl-statusbar__item adl-statusbar__item--readonly">
          {gitIcon(gitStatus)}
          <span>{gitStatusLabel(t, gitStatus)}</span>
        </button>
      </TooltipSimple>

      <span className="adl-statusbar__sep" aria-hidden="true" />

      <div className="adl-statusbar__slot">
        <TooltipSimple content={workspaceStatusHint} placement="top">
          <button
            type="button"
            className="adl-statusbar__item"
            onClick={() => setOpenMenu((current) => (current === "workspace" ? undefined : "workspace"))}
            aria-haspopup="dialog"
          >
            <IconFolderOpen size={12} decorative />
            <span>{workspaceStatusLabel}</span>
          </button>
        </TooltipSimple>
        {openMenu === "workspace" ? (
          <div className="adl-statusbar__menu adl-statusbar__menu--workspace" role="dialog">
            <div className="adl-statusbar__menu-section">
              <strong className="adl-statusbar__menu-title">{t.workspaceLabel}</strong>
              <p className="adl-statusbar__menu-hint">
                {currentWorkspace?.path ?? t.workspaceStatusGlobalHint}
              </p>
            </div>

            <div className="adl-statusbar__menu-section">
              <strong className="adl-statusbar__menu-subtitle">{t.workspaceRecentTitle}</strong>
              <div className="adl-statusbar__menu-list">
                {recentWorkspaces.length === 0 ? (
                  <span className="adl-statusbar__menu-empty">{t.workspaceRecentEmpty}</span>
                ) : (
                  recentWorkspaces.slice(0, 6).map((workspace) => (
                    <button
                      key={workspace.id}
                      type="button"
                      className={`adl-statusbar__menu-option${currentWorkspace?.id === workspace.id ? " is-active" : ""}`}
                      onClick={() => {
                        onOpenWorkspace(workspace.path);
                        setOpenMenu(undefined);
                      }}
                    >
                      <span className="adl-statusbar__menu-option-main">{workspace.name}</span>
                      <span className="adl-statusbar__menu-option-sub">{workspace.path}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="adl-statusbar__menu-section">
              <strong className="adl-statusbar__menu-subtitle">{t.workspaceOpenTitle}</strong>

              <WorkspaceSplitButton
              t={t}
              onPickWorkspaceDirectory={onPickWorkspaceDirectory}
              onOpenWorkspace={onOpenWorkspace}
              onClose={() => setOpenMenu(undefined)}
            />
            </div>

            <div className="adl-statusbar__menu-section">
              <button
                type="button"
                className="adl-statusbar__menu-option adl-statusbar__menu-option--global"
                onClick={() => {
                  void onClearWorkspaceContext().then(() => {
                    setOpenMenu(undefined);
                  });
                }}
              >
                <span className="adl-statusbar__menu-option-main">{t.workspaceGlobalMode}</span>
                <span className="adl-statusbar__menu-option-sub">{t.workspaceStatusGlobalHint}</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <span className="adl-statusbar__sep" aria-hidden="true" />

      <div className="adl-statusbar__slot">
        <TooltipSimple
          content={hasWorkspace ? currentBranch : t.branchDisabledHint}
          placement="top"
        >
          <button
            type="button"
            className="adl-statusbar__item"
            onClick={() => hasWorkspace && setOpenMenu((current) => (current === "branch" ? undefined : "branch"))}
            aria-haspopup="dialog"
            disabled={!hasWorkspace}
          >
            <IconGitBranch size={12} decorative />
            <span>{hasWorkspace ? currentBranch : t.branchGlobalLabel}</span>
          </button>
        </TooltipSimple>
        {openMenu === "branch" && hasWorkspace ? (
          <div className="adl-statusbar__menu adl-statusbar__menu--branch" role="dialog">
            <div className="adl-statusbar__menu-section">
              <strong className="adl-statusbar__menu-title">{t.gitSummaryBranch}</strong>
              <p className="adl-statusbar__menu-hint">{currentBranch}</p>
            </div>

            {pendingBranchAction ? (
              <div className="adl-statusbar__menu-section adl-statusbar__menu-section--warning">
                <strong className="adl-statusbar__menu-subtitle">{t.branchStashConfirmTitle}</strong>
                <p className="adl-statusbar__menu-hint">{t.branchStashConfirmBody}</p>
                <div className="adl-statusbar__menu-actions">
                  <button
                    type="button"
                    className="adl-btn adl-btn--primary adl-btn--sm"
                    onClick={() =>
                      void (pendingBranchAction.kind === "switch"
                        ? handleSwitchBranch(pendingBranchAction.input)
                        : handleCreateBranch(pendingBranchAction.input))
                    }
                  >
                    <IconCheck size={14} decorative />
                    {t.approve}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--ghost adl-btn--sm"
                    onClick={() => setPendingBranchAction(undefined)}
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="adl-statusbar__menu-section">
              <strong className="adl-statusbar__menu-subtitle">{t.branchAvailableTitle}</strong>
              <div className="adl-statusbar__menu-list">
                {gitBranches.map((branch) => (
                  <button
                    key={branch.name}
                    type="button"
                    className={`adl-statusbar__menu-option${branch.isCurrent ? " is-active" : ""}`}
                    onClick={() => {
                      if (branch.isCurrent) {
                        return;
                      }
                      const input: WorkspaceGitBranchSwitchInput = {
                        branchName: branch.name,
                        allowStash: false
                      };
                      if (hasDirtyChanges) {
                        setPendingBranchAction({
                          kind: "switch",
                          input: { ...input, allowStash: true }
                        });
                        return;
                      }
                      void handleSwitchBranch(input);
                    }}
                  >
                    <span className="adl-statusbar__menu-option-main">{branch.name}</span>
                    {branch.isCurrent ? <IconCheck size={14} decorative /> : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="adl-statusbar__menu-section">
              <strong className="adl-statusbar__menu-subtitle">{t.branchCreateTitle}</strong>
              <div className="adl-statusbar__menu-row adl-statusbar__menu-row--branch-create">
                <input
                  className="adl-statusbar__input"
                  value={branchDraft}
                  onChange={(event) => setBranchDraft(event.currentTarget.value)}
                  placeholder={t.branchCreatePlaceholder}
                />
                <div className="adl-statusbar__submenu-wrap" ref={baseBranchMenuWrapRef}>
                  <button
                    type="button"
                    className="adl-statusbar__submenu-trigger"
                    aria-haspopup="menu"
                    aria-expanded={baseBranchMenuOpen}
                    onClick={() => setBaseBranchMenuOpen((current) => !current)}
                  >
                    <span className="adl-statusbar__submenu-label">{baseBranchLabel}</span>
                    <IconChevronRight size={14} decorative />
                  </button>
                  {baseBranchMenuOpen ? (
                    <div className="adl-statusbar__submenu" role="menu" aria-label={t.branchCreateFromCurrent}>
                      <button
                        type="button"
                        role="menuitem"
                        className={`adl-statusbar__menu-option${!baseBranchDraft.trim() ? " is-active" : ""}`}
                        onClick={() => {
                          setBaseBranchDraft("");
                          setBaseBranchMenuOpen(false);
                        }}
                      >
                        <span className="adl-statusbar__menu-option-main">{t.branchCreateFromCurrent}</span>
                        {!baseBranchDraft.trim() ? <IconCheck size={14} decorative /> : null}
                      </button>
                      {gitBranches.map((branch) => (
                        <button
                          key={branch.name}
                          type="button"
                          role="menuitem"
                          className={`adl-statusbar__menu-option${baseBranchDraft === branch.name ? " is-active" : ""}`}
                          onClick={() => {
                            setBaseBranchDraft(branch.name);
                            setBaseBranchMenuOpen(false);
                          }}
                        >
                          <span className="adl-statusbar__menu-option-main">{branch.name}</span>
                          {baseBranchDraft === branch.name ? <IconCheck size={14} decorative /> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="adl-statusbar__menu-actions">
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost adl-btn--sm"
                  onClick={() => void handleSubmitCreateBranch()}
                  disabled={!branchDraft.trim()}
                >
                  <IconPlus size={14} decorative />
                  {t.branchCreateAction}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <span className="adl-statusbar__spacer" />
      <span className="adl-statusbar__sep" aria-hidden="true" />

      <div className="adl-statusbar__slot">
        <button
          type="button"
          className="adl-statusbar__item adl-statusbar__model-trigger"
          onClick={() => setOpenMenu((current) => (current === "model" ? undefined : "model"))}
          aria-haspopup="menu"
        >
          <span>{t.modelLabel}</span>
          <TooltipSimple content={activeModelLabel} placement="top">
            <strong className="adl-statusbar__model-name">{activeModelLabel}</strong>
          </TooltipSimple>
          <TooltipSimple content={modelHealthLabel(t, activeProviderHealth?.healthy)} placement="top">
            <span
              className={`adl-statusbar__model-dot adl-statusbar__model-dot--${modelHealthTone(activeProviderHealth?.healthy)}`}
              aria-label={modelHealthLabel(t, activeProviderHealth?.healthy)}
              role="img"
            />
          </TooltipSimple>
        </button>
        {openMenu === "model" ? (
          <div className="adl-statusbar__menu adl-statusbar__menu--model" role="menu">
            {MODEL_PROVIDER_IDS.flatMap((providerId) => {
              const health = modelHealth?.providers.find((provider) => provider.providerId === providerId);
              const preference = appInfo?.config.modelPreferences.providers[providerId];
              if (!preference) return [];

              const configured = { id: preference.modelId, label: preference.modelId };
              const baseOptions = MODEL_OPTIONS[providerId] ?? [];
              const options = baseOptions.some((option) => option.id === configured.id)
                ? baseOptions
                : [configured, ...baseOptions];

              return options.map((option) => {
                const isActive = providerId === activeProvider?.id && option.id === activeProvider.modelId;
                return (
                  <button
                    key={`${providerId}:${option.id}`}
                    type="button"
                    role="menuitem"
                    className={`adl-statusbar__menu-option${isActive ? " is-active" : ""}`}
                    onClick={() => {
                      onSelectModel(providerId, option.id);
                      setOpenMenu(undefined);
                    }}
                  >
                    <span className="adl-statusbar__menu-option-main">{option.label}</span>
                    {isActive ? (
                      <IconCheck size={14} decorative />
                    ) : (
                      <span
                        className={`adl-statusbar__model-option-dot adl-statusbar__model-option-dot--${modelHealthTone(health?.healthy)}`}
                        aria-label={modelHealthLabel(t, health?.healthy)}
                        role="img"
                      />
                    )}
                  </button>
                );
              });
            })}
          </div>
        ) : null}
      </div>
    </ContainerTag>
  );
}
