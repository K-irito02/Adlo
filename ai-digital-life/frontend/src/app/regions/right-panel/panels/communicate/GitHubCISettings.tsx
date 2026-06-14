import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { workspaceSelectors } from '@stores/selectors';
import { getAppCopy } from '@app/i18n';
import { GitHubSettingsDialog } from './GitHubSettingsDialog';

interface GitHubCISettingsProps {
  settingsWorkspaceId: string | null;
  settingsFolderId: string | null;
  onClose: () => void;
}

export function GitHubCISettings({
  settingsWorkspaceId,
  settingsFolderId,
  onClose,
}: GitHubCISettingsProps) {
  const workspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const gitHubCiFolders = useAppStore((s) => s.gitHubCiFolders);
  const gitHubWorkspaceConfigs = useAppStore((s) => s.gitHubWorkspaceConfigs);
  const ciAccessToken = useAppStore((s) => s.ciAccessToken);
  const ciError = useAppStore((s) => s.ciError);
  const gitHubSaveFolderConfig = useAppStore((s) => s.gitHubSaveFolderConfig);
  const setCiAccessToken = useAppStore((s) => s.setCiAccessToken);
  const setGitHubWorkspaceConfig = useAppStore((s) => s.setGitHubWorkspaceConfig);
  const refreshCiStatusForWorkspace = useAppStore((s) => s.refreshCiStatusForWorkspace);

  const settingsConfig = settingsWorkspaceId
    ? gitHubWorkspaceConfigs[settingsWorkspaceId]
    : settingsFolderId
      ? gitHubCiFolders.find((f) => f.id === settingsFolderId)?.ciConfig
      : null;
  const settingsInitialOwner = settingsConfig?.owner ?? '';
  const settingsInitialRepo = settingsConfig?.repo ?? '';
  const settingsInitialBranch = settingsConfig?.branch ?? 'main';
  const settingsName = settingsWorkspaceId
    ? (workspaces.find((w) => w.id === settingsWorkspaceId)?.name ?? settingsWorkspaceId)
    : settingsFolderId
      ? (gitHubCiFolders.find((f) => f.id === settingsFolderId)?.name ?? settingsFolderId)
      : '';

  const appInfo = workspaceSelectors.useAppInfo();
  const copy = getAppCopy(appInfo);

  const handleSave = useCallback(
    (owner: string, repo: string, branch: string, token: string) => {
      if (settingsWorkspaceId) {
        const config = {
          owner,
          repo,
          branch: branch || 'main',
          workflowId: null,
          accessToken: token || null,
          configured: !!(owner && repo),
        };
        setGitHubWorkspaceConfig(settingsWorkspaceId, config);
        void setCiAccessToken(token);
        void refreshCiStatusForWorkspace(settingsWorkspaceId);
        onClose();
      } else if (settingsFolderId) {
        gitHubSaveFolderConfig(settingsFolderId, owner, repo, branch, token);
        void setCiAccessToken(token);
        void refreshCiStatusForWorkspace(settingsFolderId);
        onClose();
      }
    },
    [
      settingsWorkspaceId,
      settingsFolderId,
      setGitHubWorkspaceConfig,
      setCiAccessToken,
      refreshCiStatusForWorkspace,
      gitHubSaveFolderConfig,
      onClose,
    ]
  );

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!settingsWorkspaceId && !settingsFolderId) {
    return null;
  }

  return (
    <GitHubSettingsDialog
      open={settingsWorkspaceId !== null || settingsFolderId !== null}
      workspaceName={settingsName}
      initialOwner={settingsInitialOwner}
      initialRepo={settingsInitialRepo}
      initialBranch={settingsInitialBranch}
      initialToken={ciAccessToken}
      error={ciError}
      copy={copy}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
