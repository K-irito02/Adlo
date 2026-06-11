import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../../stores/slicedStore';
import { useGitPushAutoRefresh } from '../../../features/terminal/useGitPushAutoRefresh';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import type { GitWorkspaceCiConfig } from '../../../stores/slices/githubSlice';

export interface UseCIPanelPropsResult {
  gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig>;
  accessToken: string;
  loading: boolean;
  error: string | null;
  snapshot: CiStatusSnapshot | null;
  onSaveWorkspaceConfig: (
    workspaceId: string,
    owner: string,
    repo: string,
    branch: string,
    token: string
  ) => void;
  onRemoveWorkspaceConfig: (workspaceId: string) => void;
  onRefreshWorkspace: (workspaceId: string) => void;
}

export function useCIPanelProps(): UseCIPanelPropsResult {
  useGitPushAutoRefresh();

  const {
    gitHubWorkspaceConfigs,
    ciAccessToken,
    ciLoading,
    ciError,
    ciSnapshot,
    setGitHubWorkspaceConfig,
    removeGitHubWorkspaceConfig,
    refreshCiStatusForWorkspace,
    setCiAccessToken,
  } = useAppStore(
    useShallow((s) => ({
      gitHubWorkspaceConfigs: s.gitHubWorkspaceConfigs,
      ciAccessToken: s.ciAccessToken,
      ciLoading: s.ciLoading,
      ciError: s.ciError,
      ciSnapshot: s.ciSnapshot,
      setGitHubWorkspaceConfig: s.setGitHubWorkspaceConfig,
      removeGitHubWorkspaceConfig: s.removeGitHubWorkspaceConfig,
      refreshCiStatusForWorkspace: s.refreshCiStatusForWorkspace,
      setCiAccessToken: s.setCiAccessToken,
    }))
  );

  const onSaveWorkspaceConfig = useCallback(
    (workspaceId: string, owner: string, repo: string, branch: string, token: string) => {
      const config: GitWorkspaceCiConfig = {
        owner,
        repo,
        branch: branch || 'main',
        workflowId: null,
        accessToken: token || null,
        configured: !!(owner && repo),
      };
      setGitHubWorkspaceConfig(workspaceId, config);
      void setCiAccessToken(token);
      void refreshCiStatusForWorkspace(workspaceId);
    },
    [setGitHubWorkspaceConfig, setCiAccessToken, refreshCiStatusForWorkspace]
  );

  const onRemoveWorkspaceConfig = useCallback(
    (workspaceId: string) => {
      removeGitHubWorkspaceConfig(workspaceId);
    },
    [removeGitHubWorkspaceConfig]
  );

  const onRefreshWorkspace = useCallback(
    (workspaceId: string) => {
      void refreshCiStatusForWorkspace(workspaceId);
    },
    [refreshCiStatusForWorkspace]
  );

  return {
    gitHubWorkspaceConfigs,
    accessToken: ciAccessToken,
    loading: ciLoading,
    error: ciError,
    snapshot: ciSnapshot,
    onSaveWorkspaceConfig,
    onRemoveWorkspaceConfig,
    onRefreshWorkspace,
  };
}
