import { useCallback } from 'react';
import { useAppStore } from '../../../stores/slicedStore';
import { useGitPushAutoRefresh } from '../../../features/terminal/useGitPushAutoRefresh';
import type { PlatformId } from '../../../stores/slices/communicateSlice';
import type { GitHubSection } from '../../../stores/slices/githubSlice';

export interface CommunicationPanelProps {
  activePlatform: PlatformId;
  activeGitHubSection: GitHubSection;
  onSetActivePlatform: (platform: PlatformId) => void;
  onSetActiveGitHubSection: (section: GitHubSection) => void;
  onToggleNavigator: () => void;
  communicateNavigatorCollapsed: boolean;
}

export function useCommunicationPanelProps(): CommunicationPanelProps {
  useGitPushAutoRefresh();

  const activePlatform = useAppStore((s) => s.activePlatform);
  const activeGitHubSection = useAppStore((s) => s.activeGitHubSection);
  const communicateNavigatorCollapsed = useAppStore((s) => s.communicateNavigatorCollapsed);
  const setActivePlatform = useAppStore((s) => s.setActivePlatform);
  const setActiveGitHubSection = useAppStore((s) => s.setActiveGitHubSection);
  const toggleCommunicateNavigator = useAppStore((s) => s.toggleCommunicateNavigator);

  const onSetActivePlatform = useCallback(
    (platform: PlatformId) => setActivePlatform(platform),
    [setActivePlatform]
  );

  const onSetActiveGitHubSection = useCallback(
    (section: GitHubSection) => setActiveGitHubSection(section),
    [setActiveGitHubSection]
  );

  const onToggleNavigator = useCallback(
    () => toggleCommunicateNavigator(),
    [toggleCommunicateNavigator]
  );

  return {
    activePlatform,
    activeGitHubSection,
    onSetActivePlatform,
    onSetActiveGitHubSection,
    onToggleNavigator,
    communicateNavigatorCollapsed,
  };
}
