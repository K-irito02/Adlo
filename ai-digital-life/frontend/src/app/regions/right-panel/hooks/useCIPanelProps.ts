import { useCallback } from 'react';
import { useAppStore } from '../../../stores/slicedStore';
import { useGitPushAutoRefresh } from '../../../features/terminal/useGitPushAutoRefresh';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import type { GitWorkspaceCiConfig } from '../../../stores/slices/communicateSlice';

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

  const gitHubWorkspaceConfigs = useAppStore((s) => s.gitHubWorkspaceConfigs);
  const ciAccessToken = useAppStore((s) => s.ciAccessToken);
  const ciLoading = useAppStore((s) => s.ciLoading);
  const ciError = useAppStore((s) => s.ciError);
  const ciSnapshot = useAppStore((s) => s.ciSnapshot);
  const setGitHubWorkspaceConfig = useAppStore((s) => s.setGitHubWorkspaceConfig);
  const removeGitHubWorkspaceConfig = useAppStore((s) => s.removeGitHubWorkspaceConfig);
  const refreshCiStatusForWorkspace = useAppStore((s) => s.refreshCiStatusForWorkspace);
  const setCiAccessToken = useAppStore((s) => s.setCiAccessToken);

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
