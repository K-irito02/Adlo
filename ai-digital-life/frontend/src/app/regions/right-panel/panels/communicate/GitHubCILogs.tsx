import { useMemo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { GitHubLogViewer } from './GitHubLogViewer';

interface GitHubCILogsProps {
  pendingLogJobId: number | null;
}

export function GitHubCILogs({ pendingLogJobId }: GitHubCILogsProps) {
  const activeCiWorkspaceId = useAppStore((s) => s.activeCiWorkspaceId);
  const activeCiFolderId = useAppStore((s) => s.activeCiFolderId);
  const ciSnapshot = useAppStore((s) => s.ciSnapshot);
  const gitHubCiFolders = useAppStore((s) => s.gitHubCiFolders);
  const gitHubWorkspaceConfigs = useAppStore((s) => s.gitHubWorkspaceConfigs);

  const activeId = activeCiWorkspaceId ?? activeCiFolderId;

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

  if (!activeConfig || !activeId) {
    return null;
  }

  return (
    <GitHubLogViewer
      key={activeId ?? 'no-dir'}
      snapshot={ciSnapshot}
      config={{
        owner: activeConfig.owner,
        repo: activeConfig.repo,
        branch: activeConfig.branch,
      }}
      dirKey={activeId ?? 'no-dir'}
      initialJobId={pendingLogJobId}
    />
  );
}
