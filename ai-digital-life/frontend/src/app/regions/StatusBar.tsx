import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentRunDetail,
  AppInfo,
  GitBranchSummary,
  GitSnapshot,
  ModelGatewayHealthSnapshot,
  RecentWorkspaceEntry,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceMeta,
} from '@ai-digital-life/kernel';
import { useTCopy } from '../i18n/useTCopy';
import { resolveDemoEntityText } from '../i18n/resolveDemoEntityText';
import { IconFolderOpen } from '../icons';
import { TooltipSimple } from '../components/Tooltip';
import { WorkspaceSplitButton } from '../components/WorkspaceSplitButton';
import { modelLabel, isDirtyWorktree, type GitStatus } from './StatusBar/utils';
import { StatusBarGitInfo } from './StatusBarGitInfo';
import { StatusBarEditorInfo } from './StatusBarEditorInfo';
import { useRevealScrollbar } from '../hooks/useRevealScrollbar';
import { RevealScrollbar } from '../components/RevealScrollbar';

type OpenMenu = 'workspace' | 'branch' | 'model' | undefined;

interface StatusBarProps {
  appInfo?: AppInfo;
  currentWorkspace?: WorkspaceMeta;
  recentWorkspaces: RecentWorkspaceEntry[];
  gitSnapshot?: GitSnapshot;
  gitBranches: GitBranchSummary[];
  modelHealth?: ModelGatewayHealthSnapshot;
  isStreaming: boolean;
  activeRun?: AgentRunDetail;
  workspaceContextMode: 'workspace' | 'global';
  onOpenWorkspace: (workspacePath: string) => Promise<{ ok: boolean; error?: string }>;
  onClearWorkspaceContext: () => Promise<void>;
  onPickWorkspaceDirectory: () => Promise<string | undefined>;
  onRefreshGitBranches: () => Promise<void>;
  onSwitchGitBranch: (input: WorkspaceGitBranchSwitchInput) => Promise<void>;
  onCreateGitBranch: (input: WorkspaceGitBranchCreateInput) => Promise<void>;
  inline?: boolean;
}

const StatusBar = React.memo(function StatusBar({
  appInfo,
  currentWorkspace,
  recentWorkspaces,
  gitSnapshot,
  gitBranches,
  modelHealth,
  isStreaming: _isStreaming,
  activeRun: _activeRun,
  workspaceContextMode,
  onOpenWorkspace,
  onClearWorkspaceContext,
  onPickWorkspaceDirectory,
  onRefreshGitBranches,
  onSwitchGitBranch,
  onCreateGitBranch,
  inline = false,
}: StatusBarProps) {
  const { t } = useTCopy();
  const [openMenu, setOpenMenu] = useState<OpenMenu>();
  const rootRef = useRef<HTMLDivElement>(null);
  const recentScrollbar = useRevealScrollbar([recentWorkspaces.length, openMenu === 'workspace']);

  const ContainerTag = inline ? 'div' : 'footer';
  const effectiveGitSnapshot = gitSnapshot ?? currentWorkspace?.gitSnapshot;
  const currentBranch = effectiveGitSnapshot?.branch ?? 'main';
  const hasWorkspace = Boolean(currentWorkspace);
  const hasDirtyChanges = isDirtyWorktree(effectiveGitSnapshot);

  const gitStatus: GitStatus = !effectiveGitSnapshot?.isRepo
    ? 'no-repo'
    : effectiveGitSnapshot.conflicts.length > 0
      ? 'conflict'
      : effectiveGitSnapshot.ahead && effectiveGitSnapshot.ahead > 0
        ? 'unpushed'
        : hasDirtyChanges
          ? 'dirty'
          : 'synced';

  const activeProvider = useMemo(() => {
    const providers = appInfo?.config.modelPreferences.providers;
    if (!providers) {
      return undefined;
    }
    return Object.entries(providers)
      .map(([id, value]) => ({ id, ...value }))
      .filter((provider) => provider.enabled)
      .sort((left, right) => left.priority - right.priority)[0];
  }, [appInfo?.config.modelPreferences.providers]);

  const activeProviderHealth = useMemo(() => {
    if (!activeProvider) {
      return undefined;
    }
    return modelHealth?.providers.find((provider) => provider.providerId === activeProvider.id);
  }, [activeProvider, modelHealth?.providers]);

  const activeModelLabel = !activeProvider?.id
    ? '—'
    : modelLabel(activeProvider.id, activeProvider.modelId);

  const workspaceStatusLabel = useMemo(() => {
    if (currentWorkspace) {
      return resolveDemoEntityText(currentWorkspace.name, t);
    }
    return workspaceContextMode === 'global' ? t.conversations : t.workspaceLabel;
  }, [currentWorkspace, t, workspaceContextMode]);

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
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(undefined);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [openMenu]);

  return (
    <ContainerTag
      ref={rootRef}
      className={`adl-statusbar${inline ? ' adl-statusbar--inline' : ''}`}
      role={inline ? 'group' : 'contentinfo'}
      aria-label={inline ? t.conversationStatus : undefined}
    >
      <StatusBarGitInfo
        gitStatus={gitStatus}
        hasWorkspace={hasWorkspace}
        currentBranch={currentBranch}
        gitBranches={gitBranches}
        gitSnapshot={effectiveGitSnapshot}
        isOpen={openMenu === 'branch'}
        onToggle={() => setOpenMenu((current) => (current === 'branch' ? undefined : 'branch'))}
        onRequestClose={() => setOpenMenu(undefined)}
        onRefreshGitBranches={onRefreshGitBranches}
        onSwitchGitBranch={onSwitchGitBranch}
        onCreateGitBranch={onCreateGitBranch}
      />

      <span className="adl-statusbar__sep" aria-hidden="true" />

      <div className="adl-statusbar__slot">
        <TooltipSimple content={workspaceStatusHint} placement="top">
          <button
            type="button"
            className="adl-statusbar__item"
            onClick={() =>
              setOpenMenu((current) => (current === 'workspace' ? undefined : 'workspace'))
            }
            aria-haspopup="dialog"
          >
            <IconFolderOpen size={12} decorative />
            <span>{workspaceStatusLabel}</span>
          </button>
        </TooltipSimple>
        {openMenu === 'workspace' ? (
          <div className="adl-statusbar__menu adl-statusbar__menu--workspace" role="dialog">
            <div className="adl-statusbar__menu-section">
              <strong className="adl-statusbar__menu-subtitle">{t.workspaceRecentTitle}</strong>
              <div className="adl-reveal-scrollbar-host" {...recentScrollbar.hoverProps}>
                <div
                  className="adl-statusbar__menu-list adl-reveal-scroll"
                  ref={recentScrollbar.scrollRef}
                >
                  {recentWorkspaces.length === 0 ? (
                    <span className="adl-statusbar__menu-empty">{t.workspaceRecentEmpty}</span>
                  ) : (
                    recentWorkspaces.map((workspace) => (
                      <button
                        key={workspace.id}
                        type="button"
                        title={`${resolveDemoEntityText(workspace.name, t)}\n${workspace.path}`}
                        className={`adl-statusbar__menu-option${currentWorkspace?.id === workspace.id ? ' is-active' : ''}`}
                        onClick={() => {
                          onOpenWorkspace(workspace.path);
                          setOpenMenu(undefined);
                        }}
                      >
                        <span className="adl-statusbar__menu-option-main">
                          {resolveDemoEntityText(workspace.name, t)}
                        </span>
                        <span className="adl-statusbar__menu-option-sub">{workspace.path}</span>
                      </button>
                    ))
                  )}
                </div>
                <RevealScrollbar controller={recentScrollbar} />
              </div>
            </div>

            <div className="adl-statusbar__menu-section">
              <strong className="adl-statusbar__menu-subtitle">{t.workspaceOpenTitle}</strong>

              <WorkspaceSplitButton
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
                <span className="adl-statusbar__menu-option-sub">
                  {t.workspaceStatusGlobalHint}
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <StatusBarEditorInfo
        appInfo={appInfo}
        modelHealth={modelHealth}
        activeModelLabel={activeModelLabel}
        activeProviderId={activeProvider?.id}
        activeProviderModelId={activeProvider?.modelId}
        activeProviderHealthHealthy={activeProviderHealth?.healthy}
        isOpen={openMenu === 'model'}
        onToggle={() => setOpenMenu((current) => (current === 'model' ? undefined : 'model'))}
        onRequestClose={() => setOpenMenu(undefined)}
      />
    </ContainerTag>
  );
});

export { StatusBar };
