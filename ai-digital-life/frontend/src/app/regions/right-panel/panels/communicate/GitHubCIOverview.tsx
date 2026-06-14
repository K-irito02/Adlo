import React, { useMemo } from 'react';
import { IconChevronRight } from '@app/icons';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { workspaceSelectors } from '@stores/selectors';
import { getAppCopy } from '@app/i18n';
import { useTCopy } from '@app/i18n/useTCopy';
import type { GitHubCiFolderState } from '@stores/slices/githubCiConfigSlice';
import { OverviewView } from './OverviewView';
import { WorkflowsView } from './WorkflowsView';
import { JobsView } from './JobsView';
import { HelpView } from './HelpView';

interface GitHubCIOverviewProps {
  showHelp: boolean;
  onViewLogs: (jobId: number) => void;
}

export function GitHubCIOverview({ showHelp, onViewLogs }: GitHubCIOverviewProps) {
  const { t, locale } = useTCopy();

  const {
    activeCiWorkspaceId,
    activeCiFolderId,
    activeWorkspaceSection,
    selectedGitHubTreePath,
    gitHubCiFolders,
  } = useAppStore(
    useShallow((s) => ({
      activeCiWorkspaceId: s.activeCiWorkspaceId,
      activeCiFolderId: s.activeCiFolderId,
      activeWorkspaceSection: s.activeWorkspaceSection,
      selectedGitHubTreePath: s.selectedGitHubTreePath,
      gitHubCiFolders: s.gitHubCiFolders,
    }))
  );

  const workspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const ciSnapshot = useAppStore(useShallow((s) => s.ciSnapshot));
  const ciLoading = useAppStore((s) => s.ciLoading);
  const ciError = useAppStore((s) => s.ciError);
  const gitHubWorkspaceConfigs = useAppStore((s) => s.gitHubWorkspaceConfigs);
  const refreshCiStatusForWorkspace = useAppStore((s) => s.refreshCiStatusForWorkspace);

  const activeId = activeCiWorkspaceId ?? activeCiFolderId;

  const displayPath = useMemo(() => {
    if (activeCiWorkspaceId) {
      const ws = workspaces.find((w) => w.id === activeCiWorkspaceId);
      return ws ? ws.name || ws.path : '';
    }
    if (activeCiFolderId) {
      const folder = gitHubCiFolders.find((f) => f.id === activeCiFolderId);
      if (!folder) {
        return '';
      }
      const parts: string[] = [folder.name];
      let current = folder;
      while (
        current.parentId &&
        (current.parentType === 'folder' || current.parentType === 'workspace')
      ) {
        if (current.parentType === 'workspace') {
          const ws = workspaces.find((w) => w.id === current.parentId);
          if (ws) {
            parts.unshift(ws.name || ws.path);
          }
          break;
        }
        const parent = gitHubCiFolders.find((f) => f.id === current.parentId);
        if (!parent) {
          break;
        }
        parts.unshift(parent.name);
        current = parent;
      }
      return parts.join(' / ');
    }
    return '';
  }, [activeCiWorkspaceId, activeCiFolderId, workspaces, gitHubCiFolders]);

  const folderCategory = useMemo<'workspace' | 'user' | null>(() => {
    if (activeCiWorkspaceId) {
      return 'workspace';
    }
    if (activeCiFolderId) {
      const folder = gitHubCiFolders.find((f) => f.id === activeCiFolderId);
      if (!folder) {
        return null;
      }
      let current: GitHubCiFolderState | undefined = folder;
      while (current) {
        if (current.parentType === 'workspace') {
          return 'workspace';
        }
        if (!current.parentId) {
          return 'user';
        }
        const pid: string = current.parentId;
        current = gitHubCiFolders.find((f) => f.id === pid);
      }
      return 'user';
    }
    return null;
  }, [activeCiWorkspaceId, activeCiFolderId, gitHubCiFolders]);

  const activeConfig = useMemo(() => {
    if (activeCiFolderId) {
      const folder = gitHubCiFolders.find((f) => f.id === activeCiFolderId);
      return folder?.ciConfig ?? null;
    }
    if (activeCiWorkspaceId) {
      return gitHubWorkspaceConfigs[activeCiWorkspaceId] ?? null;
    }
    return null;
  }, [activeCiWorkspaceId, activeCiFolderId, gitHubWorkspaceConfigs, gitHubCiFolders]);

  const appInfo = workspaceSelectors.useAppInfo();
  const copy = getAppCopy(appInfo);

  if (showHelp) {
    return <HelpView copy={copy} />;
  }

  if (activeWorkspaceSection === 'help') {
    return <HelpView copy={copy} />;
  }

  if (!(activeCiWorkspaceId || activeCiFolderId) || !activeConfig) {
    return (
      <div className="adl-github__empty">
        <p>{t.ciSelectWorkspace}</p>
      </div>
    );
  }

  if (ciError && !ciSnapshot) {
    return (
      <div className="adl-github__empty">
        <svg
          viewBox="0 0 24 24"
          width="32"
          height="32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <p>{ciError}</p>
        <button
          type="button"
          className="adl-btn adl-btn--ghost adl-btn--square"
          style={{ marginTop: 8 }}
          onClick={() => activeId && refreshCiStatusForWorkspace(activeId)}
        >
          {t.communicateRefreshAll}
        </button>
      </div>
    );
  }

  const sectionLabels: Record<string, string> = {
    overview: t.ciOverview,
    workflows: t.ciWorkflows,
    jobs: t.ciJobs,
    logs: t.ciLogs,
  };
  const isLeafSelected = selectedGitHubTreePath?.split(':').length ?? 0 >= 3;
  const treeSection = selectedGitHubTreePath?.split(':').pop();
  const sectionLabel =
    sectionLabels[treeSection ?? ''] || sectionLabels[activeWorkspaceSection] || '';

  let view: React.ReactNode = null;
  switch (activeWorkspaceSection) {
    case 'overview':
      view = (
        <OverviewView
          snapshot={ciSnapshot}
          loading={ciLoading}
          branch={activeConfig.branch}
          copy={copy}
          locale={locale}
          onViewLogs={onViewLogs}
        />
      );
      break;
    case 'workflows':
      view = <WorkflowsView snapshot={ciSnapshot} />;
      break;
    case 'jobs':
      view = <JobsView snapshot={ciSnapshot} onViewLogs={onViewLogs} />;
      break;
  }

  const categoryLabel =
    folderCategory === 'workspace'
      ? copy.ciWorkspaceCategory
      : folderCategory === 'user'
        ? copy.ciUserFolderCategory
        : '';

  const hasActiveItem = !!(activeCiWorkspaceId || activeCiFolderId);
  const showBreadcrumb = hasActiveItem && (isLeafSelected || !!activeWorkspaceSection);
  const displayFallback = activeCiWorkspaceId ?? activeCiFolderId ?? '';

  return (
    <>
      {showBreadcrumb && (
        <div className="adl-github-path-header">
          <span>{categoryLabel}</span>
          <IconChevronRight width={10} height={10} />
          <span>{displayPath || displayFallback}</span>
          <IconChevronRight width={10} height={10} />
          <span>{sectionLabel}</span>
        </div>
      )}
      {view}
    </>
  );
}
