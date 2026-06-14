import React, { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useCIPanelProps } from '../../hooks/useCIPanelProps';
import { GitHubCITree } from './GitHubCITree';
import { GitHubCIOverview } from './GitHubCIOverview';
import { GitHubCILogs } from './GitHubCILogs';
import { GitHubCISettings } from './GitHubCISettings';

export function GitHubPanel() {
  useCIPanelProps();

  const communicateNavigatorCollapsed = useAppStore((s) => s.communicateNavigatorCollapsed);
  const gitHubNavigatorWidth = useAppStore((s) => s.gitHubNavigatorWidth);
  const activeWorkspaceSection = useAppStore((s) => s.activeWorkspaceSection);

  const [showHelp, setShowHelp] = useState(false);
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(null);
  const [settingsFolderId, setSettingsFolderId] = useState<string | null>(null);
  const [pendingLogJobId, setPendingLogJobId] = useState<number | null>(null);

  const handleViewLogs = useCallback((jobId: number) => {
    setPendingLogJobId(jobId);
    useAppStore.getState().setActiveWorkspaceSection('logs');
  }, []);

  const handleSettingsClose = useCallback(() => {
    setSettingsWorkspaceId(null);
    setSettingsFolderId(null);
  }, []);

  useEffect(() => {
    if (activeWorkspaceSection === 'logs') {
      setPendingLogJobId(null);
    }
  }, [activeWorkspaceSection]);

  return (
    <>
      <div
        className={`adl-tool-surface adl-tool-surface--github${communicateNavigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
        style={{ '--adl-files-nav-width': `${gitHubNavigatorWidth}px` } as React.CSSProperties}
      >
        <GitHubCITree
          showHelp={showHelp}
          onSetShowHelp={setShowHelp}
          onOpenSettings={setSettingsWorkspaceId}
          onOpenFolderSettings={setSettingsFolderId}
        />

        <div className="adl-tool-primary adl-tool-primary--github">
          <div className="adl-tool-primary__scroll">
            {activeWorkspaceSection === 'logs' ? (
              <GitHubCILogs pendingLogJobId={pendingLogJobId} />
            ) : (
              <GitHubCIOverview showHelp={showHelp} onViewLogs={handleViewLogs} />
            )}
          </div>
        </div>
      </div>

      {(settingsWorkspaceId || settingsFolderId) && (
        <GitHubCISettings
          settingsWorkspaceId={settingsWorkspaceId}
          settingsFolderId={settingsFolderId}
          onClose={handleSettingsClose}
        />
      )}
    </>
  );
}
