import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useNavigatorResize } from '@app/hooks/useNavigatorResize';
import { useTCopy } from '@app/i18n/useTCopy';
import { NavigatorResizeHandle } from '@components/NavigatorResizeHandle';
import type { SectionCallbacks } from '@features/github-tree/GitHubCategorySection';
import { GitHubCITreeToolbar } from './GitHubCITreeToolbar';
import { GitHubCITreeContent } from './GitHubCITreeContent';

interface GitHubCITreeProps {
  showHelp: boolean;
  onSetShowHelp: (v: boolean) => void;
  onOpenSettings: (workspaceId: string) => void;
  onOpenFolderSettings: (folderId: string) => void;
}

export function GitHubCITree({
  showHelp,
  onSetShowHelp,
  onOpenSettings,
  onOpenFolderSettings,
}: GitHubCITreeProps) {
  const { t } = useTCopy();

  const {
    gitHubTreeExpanded,
    gitHubAllTreeExpanded,
    selectedGitHubTreePath,
    gitHubCiFolders,
    gitHubWorkspaceConfigs,
  } = useAppStore(
    useShallow((s) => ({
      gitHubTreeExpanded: s.gitHubTreeExpanded,
      gitHubAllTreeExpanded: s.gitHubAllTreeExpanded,
      selectedGitHubTreePath: s.selectedGitHubTreePath,
      gitHubCiFolders: s.gitHubCiFolders,
      gitHubWorkspaceConfigs: s.gitHubWorkspaceConfigs,
    })),
  );
  const workspaces = useAppStore(useShallow((s) => s.recentWorkspaces));

  const {
    toggleGitHubTreePath,
    expandAllGitHubTree,
    collapseAllGitHubTree,
    setSelectedGitHubTreePath,
    setActiveCiWorkspaceId,
    setActiveCiFolderId,
    setActiveWorkspaceSection,
    gitHubCreateFolder,
    clearCiState,
    clearAllFolders,
    clearAllCiConfigs,
    clearAllCiConfigsAndData,
    resetAllToOriginal,
    restoreCiSnapshot,
    refreshCiStatusForWorkspace,
    removeGitHubWorkspaceConfig,
  } = useAppStore(
    useShallow((s) => ({
      toggleGitHubTreePath: s.toggleGitHubTreePath,
      expandAllGitHubTree: s.expandAllGitHubTree,
      collapseAllGitHubTree: s.collapseAllGitHubTree,
      setSelectedGitHubTreePath: s.setSelectedGitHubTreePath,
      setActiveCiWorkspaceId: s.setActiveCiWorkspaceId,
      setActiveCiFolderId: s.setActiveCiFolderId,
      setActiveWorkspaceSection: s.setActiveWorkspaceSection,
      gitHubCreateFolder: s.gitHubCreateFolder,
      clearCiState: s.clearCiState,
      clearAllFolders: s.clearAllFolders,
      clearAllCiConfigs: s.clearAllCiConfigs,
      clearAllCiConfigsAndData: s.clearAllCiConfigsAndData,
      resetAllToOriginal: s.resetAllToOriginal,
      restoreCiSnapshot: s.restoreCiSnapshot,
      refreshCiStatusForWorkspace: s.refreshCiStatusForWorkspace,
      removeGitHubWorkspaceConfig: s.removeGitHubWorkspaceConfig,
    })),
  );

  const gitHubNavigatorWidth = useAppStore((state) => state.gitHubNavigatorWidth);
  const setGitHubNavigatorWidth = useAppStore((state) => state.setGitHubNavigatorWidth);

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setGitHubNavigatorWidth,
    minWidth: 180,
    maxWidth: 420,
  });

  const [gitHubViewMode, setGitHubViewMode] = useState<'tree' | 'list'>('tree');

  const selectedTreePathRef = useRef<string | null>(null);

  const handleSelectTreePath = useCallback(
    (path: string | null) => {
      selectedTreePathRef.current = path ?? null;
      setSelectedGitHubTreePath(path);
      if (path) {
        onSetShowHelp(false);
      }
      if (path?.startsWith('github-workspace:')) {
        const parts = path.split(':');
        const wsId = parts[1];
        const section = parts[2] as 'overview' | 'workflows' | 'jobs' | 'logs' | undefined;
        if (wsId) {
          setActiveCiWorkspaceId(wsId);
          setActiveCiFolderId(null);
          if (section) {
            setActiveWorkspaceSection(section);
          }
          restoreCiSnapshot(wsId);
        }
      } else if (path?.startsWith('github-folder:')) {
        const parts = path.split(':');
        const folderId = parts[1];
        const section = parts[2] as 'overview' | 'workflows' | 'jobs' | 'logs' | undefined;
        setActiveCiFolderId(folderId ?? null);
        setActiveCiWorkspaceId(null);
        if (section) {
          setActiveWorkspaceSection(section);
        }
        if (folderId) {
          restoreCiSnapshot(folderId);
        }
      }
    },
    [
      setSelectedGitHubTreePath,
      setActiveCiWorkspaceId,
      setActiveCiFolderId,
      setActiveWorkspaceSection,
      restoreCiSnapshot,
      onSetShowHelp,
    ],
  );

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (!target.closest('.adl-tool-surface--github')) {
        handleSelectTreePath(null);
        return;
      }

      if (target.closest('.adl-tool-primary--github')) {
        return;
      }

      const treeNode = target.closest<HTMLElement>('[data-path]');
      if (treeNode) {
        const nodePath = treeNode.dataset.path;
        if (nodePath) {
          handleSelectTreePath(nodePath);
        }
      }
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [handleSelectTreePath]);

  const visibleWorkspaces = workspaces;

  const handleTogglePath = useCallback(
    (path: string) => {
      toggleGitHubTreePath(path);
    },
    [toggleGitHubTreePath],
  );

  const handleCreateFolder = useCallback(() => {
    const path = selectedTreePathRef.current;
    if (path?.startsWith('github-folder:')) {
      const folderId = path.slice('github-folder:'.length);
      gitHubCreateFolder(folderId, 'folder');
    } else if (path?.startsWith('github-workspace:')) {
      const wsId = path.slice('github-workspace:'.length);
      gitHubCreateFolder(wsId, 'workspace');
    } else {
      gitHubCreateFolder(undefined, undefined);
    }
  }, [gitHubCreateFolder]);

  const handleRefreshAll = useCallback(() => {
    for (const wsId of Object.keys(gitHubWorkspaceConfigs)) {
      if (gitHubWorkspaceConfigs[wsId].configured) {
        refreshCiStatusForWorkspace(wsId);
      }
    }
  }, [gitHubWorkspaceConfigs, refreshCiStatusForWorkspace]);

  const handleHelpNav = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const sectionCallbacks: SectionCallbacks = useMemo(
    () => ({
      onSelectWorkspace: (workspaceId) => {
        setSelectedGitHubTreePath(`github-workspace:${workspaceId}`);
        setActiveCiWorkspaceId(workspaceId);
        setActiveWorkspaceSection('overview');
        onSetShowHelp(false);
        restoreCiSnapshot(workspaceId);
      },
      onSelectSection: (workspaceId, section) => {
        setSelectedGitHubTreePath(`github-workspace:${workspaceId}:${section}`);
        setActiveCiWorkspaceId(workspaceId);
        setActiveWorkspaceSection(section);
        onSetShowHelp(false);
        restoreCiSnapshot(workspaceId);
      },
      onDeleteWorkspaceConfig: (workspaceId) => {
        removeGitHubWorkspaceConfig(workspaceId);
      },
      onOpenSettings: (workspaceId) => {
        onOpenSettings(workspaceId);
      },
      onOpenFolderSettings: (folderId) => {
        onOpenFolderSettings(folderId);
      },
      onRefreshWorkspace: (workspaceId) => {
        refreshCiStatusForWorkspace(workspaceId);
        setActiveCiWorkspaceId(workspaceId);
      },
      onDeleteFolderConfig: () => {},
      onClearCiState: () => {
        clearCiState();
      },
    }),
    [
      setSelectedGitHubTreePath,
      setActiveCiWorkspaceId,
      setActiveWorkspaceSection,
      onOpenSettings,
      onOpenFolderSettings,
      refreshCiStatusForWorkspace,
      clearCiState,
      restoreCiSnapshot,
      onSetShowHelp,
      removeGitHubWorkspaceConfig,
    ],
  );

  return (
    <aside className="adl-tool-navigator" aria-label={t.ciNavigatorTitle}>
      <GitHubCITreeToolbar
        gitHubAllTreeExpanded={gitHubAllTreeExpanded}
        onExpandAll={expandAllGitHubTree}
        onCollapseAll={collapseAllGitHubTree}
        showHelp={showHelp}
        onSetShowHelp={onSetShowHelp}
        gitHubViewMode={gitHubViewMode}
        onSetGitHubViewMode={setGitHubViewMode}
        workspaceCount={visibleWorkspaces.length}
        onRefreshAll={handleRefreshAll}
        onCreateFolder={handleCreateFolder}
        onClearAllFolders={clearAllFolders}
        onClearAllCiConfigs={clearAllCiConfigs}
        onClearCiState={clearCiState}
        onClearAllCiConfigsAndData={clearAllCiConfigsAndData}
        onResetAllToOriginal={resetAllToOriginal}
      />
      <GitHubCITreeContent
        showHelp={showHelp}
        handleHelpNav={handleHelpNav}
        copy={t}
        workspaces={workspaces}
        gitHubWorkspaceConfigs={gitHubWorkspaceConfigs}
        gitHubCiFolders={gitHubCiFolders}
        gitHubTreeExpanded={gitHubTreeExpanded}
        selectedGitHubTreePath={selectedGitHubTreePath}
        onSelectTreePath={handleSelectTreePath}
        onTogglePath={handleTogglePath}
        sectionCallbacks={sectionCallbacks}
        gitHubViewMode={gitHubViewMode}
      />
      <NavigatorResizeHandle
        label={t.ciResizeNavigator}
        minWidth={180}
        maxWidth={420}
        currentWidth={gitHubNavigatorWidth}
        onPointerDown={handleNavigatorResizeStart}
      />
    </aside>
  );
}
