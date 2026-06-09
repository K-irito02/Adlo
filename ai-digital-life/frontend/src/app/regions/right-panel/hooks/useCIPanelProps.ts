import { useCallback, useEffect } from 'react';
import { useAppStore } from '../../../stores/slicedStore';
import { useGitPushAutoRefresh } from '../../../features/terminal/useGitPushAutoRefresh';
import type { CIPanelProps } from '../types';

export function useCIPanelProps(): CIPanelProps {
  useGitPushAutoRefresh();

  const ciConfig = useAppStore((s) => s.ciConfig);
  const ciAccessToken = useAppStore((s) => s.ciAccessToken);
  const ciLoading = useAppStore((s) => s.ciLoading);
  const ciError = useAppStore((s) => s.ciError);
  const ciSnapshot = useAppStore((s) => s.ciSnapshot);
  const refreshCiStatus = useAppStore((s) => s.refreshCiStatus);
  const setCiConfig = useAppStore((s) => s.setCiConfig);
  const setCiAccessToken = useAppStore((s) => s.setCiAccessToken);
  const clearCiAccessToken = useAppStore((s) => s.clearCiAccessToken);

  const onRefresh = useCallback(() => {
    void refreshCiStatus();
  }, [refreshCiStatus]);

  const onConfigChange = useCallback(
    (owner: string, repo: string, branch: string, token: string) => {
      setCiConfig({ owner, repo, branch, workflowId: null, accessToken: null });
      void setCiAccessToken(token);
      void refreshCiStatus();
    },
    [setCiConfig, setCiAccessToken, refreshCiStatus]
  );

  const onClearToken = useCallback(() => {
    void clearCiAccessToken();
  }, [clearCiAccessToken]);

  useEffect(() => {
    if (ciConfig.owner && ciConfig.repo) {
      void refreshCiStatus();
    }
  }, [ciConfig.owner, ciConfig.repo, refreshCiStatus]);

  return {
    config: ciConfig,
    accessToken: ciAccessToken,
    loading: ciLoading,
    error: ciError,
    snapshot: ciSnapshot,
    onRefresh,
    onConfigChange,
    onClearToken,
  };
}
