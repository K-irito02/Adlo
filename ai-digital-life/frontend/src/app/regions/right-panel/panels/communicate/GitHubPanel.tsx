import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  IconFoldVertical,
  IconUnfoldVertical,
  IconRefreshCw,
  IconTrash,
  IconFiles,
  IconList,
  IconFolderPlus,
} from '@app/icons';
import { TooltipSimple } from '@components/Tooltip';
import { NavigatorResizeHandle } from '@components/NavigatorResizeHandle';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useCIPanelProps } from '../../hooks/useCIPanelProps';
import { useNavigatorResize } from '@app/hooks/useNavigatorResize';
import { workspaceSelectors } from '@stores/selectors';
import { getAppCopy } from '@app/i18n';
import { useTCopy } from '@app/i18n/useTCopy';
import { GitHubTree } from '@features/github-tree/GitHubTree';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import type { SectionCallbacks } from '@features/github-tree/GitHubCategorySection';
import { GitHubLogViewer } from './GitHubLogViewer';
import { MenuHintItem } from './MenuHintItem';
import { OverviewView } from './OverviewView';
import { WorkflowsView } from './WorkflowsView';
import { JobsView } from './JobsView';
import { HelpView } from './HelpView';
import { GitHubSettingsDialog } from './GitHubSettingsDialog';

export function GitHubPanel() {
  const { t } = useTCopy();
  const {
    gitHubWorkspaceConfigs,
    loading,
    error: ciError,
    onSaveWorkspaceConfig,
    onRemoveWorkspaceConfig,
    onRefreshWorkspace,
    accessToken,
  } = useCIPanelProps();

  const {
    gitHubTreeExpanded,
    gitHubAllTreeExpanded,
    selectedGitHubTreePath,
    activeCiWorkspaceId,
    activeCiFolderId,
    activeWorkspaceSection,
    communicateNavigatorCollapsed,
    gitHubCiFolders,
  } = useAppStore(
    useShallow((s) => ({
      gitHubTreeExpanded: s.gitHubTreeExpanded,
      gitHubAllTreeExpanded: s.gitHubAllTreeExpanded,
      selectedGitHubTreePath: s.selectedGitHubTreePath,
      activeCiWorkspaceId: s.activeCiWorkspaceId,
      activeCiFolderId: s.activeCiFolderId,
      activeWorkspaceSection: s.activeWorkspaceSection,
      communicateNavigatorCollapsed: s.communicateNavigatorCollapsed,
      gitHubCiFolders: s.gitHubCiFolders,
    }))
  );
  const workspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const ciSnapshot = useAppStore(useShallow((s) => s.ciSnapshot));

  const displayPath = useMemo(() => {
    if (activeCiWorkspaceId) {
      const ws = workspaces.find((w) => w.id === activeCiWorkspaceId);
      return ws ? ws.name || ws.path : '';
    }
    if (activeCiFolderId) {
      const folder = gitHubCiFolders.find((f) => f.id === activeCiFolderId);
      return folder?.name || '';
    }
    return '';
  }, [activeCiWorkspaceId, activeCiFolderId, workspaces, gitHubCiFolders]);

  const {
    toggleGitHubTreePath,
    expandAllGitHubTree,
    collapseAllGitHubTree,
    setSelectedGitHubTreePath,
    setActiveCiWorkspaceId,
    setActiveCiFolderId,
    setActiveWorkspaceSection,
    gitHubCreateFolder,
    gitHubSaveFolderConfig,
    clearCiState,
    clearAllFolders,
    clearAllCiConfigs,
    clearAllCiConfigsAndData,
    resetAllToOriginal,
    restoreCiSnapshot,
    setCiAccessToken,
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
      gitHubSaveFolderConfig: s.gitHubSaveFolderConfig,
      clearCiState: s.clearCiState,
      clearAllFolders: s.clearAllFolders,
      clearAllCiConfigs: s.clearAllCiConfigs,
      clearAllCiConfigsAndData: s.clearAllCiConfigsAndData,
      resetAllToOriginal: s.resetAllToOriginal,
      restoreCiSnapshot: s.restoreCiSnapshot,
      setCiAccessToken: s.setCiAccessToken,
    }))
  );

  const gitHubNavigatorWidth = useAppStore((state) => state.gitHubNavigatorWidth);
  const setGitHubNavigatorWidth = useAppStore((state) => state.setGitHubNavigatorWidth);

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setGitHubNavigatorWidth,
    minWidth: 180,
    maxWidth: 420,
  });

  const selectedTreePathRef = useRef<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [gitHubViewMode, setGitHubViewMode] = useState<'tree' | 'list'>('tree');
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(null);
  const [settingsFolderId, setSettingsFolderId] = useState<string | null>(null);
  const [pendingLogJobId, setPendingLogJobId] = useState<number | null>(null);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const deleteMenuRef = useRef<HTMLDivElement>(null);
  const deleteCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 检查节点是否在按钮或菜单内（用于 relatedTarget 判断）
  const isInsideDeleteUI = useCallback((node: EventTarget | null): boolean => {
    if (!node) {
      return false;
    }
    const el = node as HTMLElement;
    return (
      (deleteButtonRef.current && deleteButtonRef.current.contains(el)) ||
      (deleteMenuRef.current && deleteMenuRef.current.contains(el)) ||
      false
    );
  }, []);

  // 启动关闭倒计时（给鼠标移动到菜单留出时间）
  const scheduleDeleteMenuClose = useCallback(() => {
    if (deleteCloseTimerRef.current) {
      clearTimeout(deleteCloseTimerRef.current);
      deleteCloseTimerRef.current = null;
    }
    deleteCloseTimerRef.current = setTimeout(() => {
      deleteCloseTimerRef.current = null;
      setDeleteMenuOpen(false);
    }, 180);
  }, []);

  // 取消关闭倒计时
  const cancelDeleteMenuClose = useCallback(() => {
    if (deleteCloseTimerRef.current) {
      clearTimeout(deleteCloseTimerRef.current);
      deleteCloseTimerRef.current = null;
    }
  }, []);

  // 组件卸载时清理可能残留的关闭定时器（菜单未展开但倒计时进行中）
  useEffect(() => {
    return () => {
      if (deleteCloseTimerRef.current) {
        clearTimeout(deleteCloseTimerRef.current);
        deleteCloseTimerRef.current = null;
      }
    };
  }, []);

  // 全局点击外部关闭删除菜单
  useEffect(() => {
    if (!deleteMenuOpen) {
      return;
    }
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const inButton = deleteButtonRef.current?.contains(target);
      const inMenu = deleteMenuRef.current?.contains(target);
      if (!inButton && !inMenu) {
        cancelDeleteMenuClose();
        setDeleteMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleGlobalClick);
    return () => {
      window.removeEventListener('mousedown', handleGlobalClick);
      cancelDeleteMenuClose();
    };
  }, [deleteMenuOpen, cancelDeleteMenuClose]);

  const handleSelectTreePath = useCallback(
    (path: string | null) => {
      selectedTreePathRef.current = path ?? null;
      setSelectedGitHubTreePath(path);
      if (path) {
        setShowHelp(false);
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
    ]
  );

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const clickedEntry = target.closest('.adl-browser-entry');
      const clickedFileTreeRow = target.closest('.adl-filetree__row');

      if (clickedEntry) {
        if (clickedFileTreeRow) {
          const row = clickedFileTreeRow as HTMLElement;
          const nodePath = row.dataset.path;
          if (nodePath) {
            handleSelectTreePath(nodePath);
            return;
          }
        }
        return;
      }

      handleSelectTreePath(null);
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [handleSelectTreePath]);

  const appInfo = workspaceSelectors.useAppInfo();
  const copy = getAppCopy(appInfo);

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
  const visibleWorkspaces = workspaces;

  useEffect(() => {
    if (activeWorkspaceSection === 'logs') {
      setPendingLogJobId(null);
    }
  }, [activeWorkspaceSection]);

  const handleTogglePath = useCallback(
    (path: string) => {
      toggleGitHubTreePath(path);
    },
    [toggleGitHubTreePath]
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

  const handleViewLogs = useCallback(
    (jobId: number) => {
      setPendingLogJobId(jobId);
      setActiveWorkspaceSection('logs');
    },
    [setActiveWorkspaceSection]
  );

  const handleRefreshAll = useCallback(() => {
    for (const wsId of Object.keys(gitHubWorkspaceConfigs)) {
      if (gitHubWorkspaceConfigs[wsId].configured) {
        onRefreshWorkspace(wsId);
      }
    }
  }, [gitHubWorkspaceConfigs, onRefreshWorkspace]);

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
        setShowHelp(false);
        restoreCiSnapshot(workspaceId);
      },
      onSelectSection: (workspaceId, section) => {
        setSelectedGitHubTreePath(`github-workspace:${workspaceId}:${section}`);
        setActiveCiWorkspaceId(workspaceId);
        setActiveWorkspaceSection(section);
        setShowHelp(false);
        restoreCiSnapshot(workspaceId);
      },
      onDeleteWorkspaceConfig: (workspaceId) => {
        onRemoveWorkspaceConfig(workspaceId);
      },
      onOpenSettings: (workspaceId) => {
        setSettingsWorkspaceId(workspaceId);
        setSettingsFolderId(null);
      },
      onOpenFolderSettings: (folderId) => {
        setSettingsFolderId(folderId);
        setSettingsWorkspaceId(null);
      },
      onRefreshWorkspace: (workspaceId) => {
        onRefreshWorkspace(workspaceId);
        setActiveCiWorkspaceId(workspaceId);
      },
      onDeleteFolderConfig: (_folderId) => {
        // This is handled via the store action at the tree entry level;
        // we expose it here if needed via callbacks.
      },
      onClearCiState: () => {
        clearCiState();
      },
    }),
    [
      setSelectedGitHubTreePath,
      setActiveCiWorkspaceId,
      setActiveWorkspaceSection,
      onRemoveWorkspaceConfig,
      onRefreshWorkspace,
      clearCiState,
      restoreCiSnapshot,
    ]
  );

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

  const handleSettingsSave = useCallback(
    (owner: string, repo: string, branch: string, token: string) => {
      if (settingsWorkspaceId) {
        onSaveWorkspaceConfig(settingsWorkspaceId, owner, repo, branch, token);
        setSettingsWorkspaceId(null);
      } else if (settingsFolderId) {
        gitHubSaveFolderConfig(settingsFolderId, owner, repo, branch, token);
        void setCiAccessToken(token);
        void onRefreshWorkspace(settingsFolderId);
        setSettingsFolderId(null);
      }
    },
    [
      settingsWorkspaceId,
      settingsFolderId,
      onSaveWorkspaceConfig,
      gitHubSaveFolderConfig,
      setCiAccessToken,
      onRefreshWorkspace,
    ]
  );

  const handleSettingsCancel = useCallback(() => {
    setSettingsWorkspaceId(null);
    setSettingsFolderId(null);
  }, []);

  const renderPrimary = () => {
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
            onClick={() => activeId && onRefreshWorkspace(activeId)}
          >
            {t.communicateRefreshAll}
          </button>
        </div>
      );
    }

    const sectionLabels: Record<string, string> = {
      overview: '概览',
      workflows: '工作流',
      jobs: '任务',
      logs: '日志',
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
            loading={loading}
            branch={activeConfig.branch}
            copy={copy}
            onViewLogs={handleViewLogs}
          />
        );
        break;
      case 'workflows':
        view = <WorkflowsView snapshot={ciSnapshot} />;
        break;
      case 'jobs':
        view = <JobsView snapshot={ciSnapshot} onViewLogs={handleViewLogs} />;
        break;
      case 'logs':
        view = (
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
        break;
    }

    return (
      <>
        {displayPath && isLeafSelected && (
          <div className="adl-github-path-header">
            [{displayPath}] / [{sectionLabel}]
          </div>
        )}
        {view}
      </>
    );
  };

  return (
    <>
      <div
        className={`adl-tool-surface adl-tool-surface--github${communicateNavigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
        style={{ '--adl-files-nav-width': `${gitHubNavigatorWidth}px` } as React.CSSProperties}
      >
        <aside className="adl-tool-navigator" aria-label="GitHub CI">
          <div className="adl-tool-navigator__context">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <TooltipSimple
                content={gitHubAllTreeExpanded ? t.collapseAll : t.expandAll}
                placement="top"
              >
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={gitHubAllTreeExpanded ? collapseAllGitHubTree : expandAllGitHubTree}
                  aria-label={gitHubAllTreeExpanded ? t.collapseAll : t.expandAll}
                >
                  {gitHubAllTreeExpanded ? (
                    <IconFoldVertical size={14} decorative />
                  ) : (
                    <IconUnfoldVertical size={14} decorative />
                  )}
                </button>
              </TooltipSimple>
              <span className="adl-tool-navigator__context-title">
                {showHelp
                  ? t.communicateHelp
                  : gitHubViewMode === 'tree'
                    ? t.changesFileTree
                    : t.communicateDirList}
              </span>
            </div>
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
              <span className="adl-tool-navigator__context-count">{visibleWorkspaces.length}</span>
              <TooltipSimple content={t.communicateRefreshAll} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={handleRefreshAll}
                  aria-label={t.communicateRefreshAll}
                >
                  <IconRefreshCw size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
          </div>
          <div className="adl-tool-navigator__context adl-tool-navigator__context--secondary">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <TooltipSimple content={t.changesFileTree} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${gitHubViewMode === 'tree' ? ' is-active' : ''}`}
                  onClick={() => setGitHubViewMode('tree')}
                  aria-label={t.changesFileTree}
                  aria-pressed={gitHubViewMode === 'tree'}
                >
                  <IconFiles size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content={t.communicateDirList} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${gitHubViewMode === 'list' ? ' is-active' : ''}`}
                  onClick={() => setGitHubViewMode('list')}
                  aria-label={t.communicateDirList}
                  aria-pressed={gitHubViewMode === 'list'}
                >
                  <IconList size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
            <div
              className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility"
              style={{ position: 'relative' }}
            >
              <TooltipSimple content={t.communicateNewDir} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={handleCreateFolder}
                  aria-label={t.communicateNewDir}
                >
                  <IconFolderPlus size={14} decorative />
                </button>
              </TooltipSimple>
              <button
                ref={deleteButtonRef}
                type="button"
                className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                onClick={(e) => e.preventDefault()}
                onMouseEnter={() => {
                  cancelDeleteMenuClose();
                  setDeleteMenuOpen(true);
                }}
                onMouseLeave={(e) => {
                  // 仅当鼠标移动到按钮+菜单之外时才启动关闭
                  if (!isInsideDeleteUI(e.relatedTarget)) {
                    scheduleDeleteMenuClose();
                  }
                }}
                aria-label={t.ciDeleteAllNewDirs}
              >
                <IconTrash size={14} decorative />
              </button>
              {deleteMenuOpen && deleteButtonRef.current
                ? createPortal(
                    <div
                      ref={deleteMenuRef}
                      data-menu-id="github-delete-all-menu"
                      className="adl-multitree-entry__menu"
                      role="menu"
                      onMouseEnter={() => {
                        cancelDeleteMenuClose();
                      }}
                      onMouseLeave={(e) => {
                        // 仅当鼠标移动到按钮+菜单之外时才启动关闭
                        if (!isInsideDeleteUI(e.relatedTarget)) {
                          scheduleDeleteMenuClose();
                        }
                      }}
                      style={{
                        position: 'fixed',
                        top: deleteButtonRef.current.getBoundingClientRect().bottom + 4,
                        left: deleteButtonRef.current.getBoundingClientRect().left,
                        zIndex: 99999,
                      }}
                    >
                      <MenuHintItem
                        label={t.ciDeleteAllNewDirs}
                        hint={t.ciDeleteAllNewDirsHint}
                        onClick={() => {
                          clearAllFolders();
                          setDeleteMenuOpen(false);
                        }}
                      />
                      <MenuHintItem
                        label={t.ciDeleteAllConfigs}
                        hint={t.ciDeleteAllConfigsHint}
                        onClick={() => {
                          clearAllCiConfigs();
                          setDeleteMenuOpen(false);
                        }}
                      />
                      <MenuHintItem
                        label={t.ciDeleteAllData}
                        hint={t.ciDeleteAllDataHint}
                        onClick={() => {
                          clearCiState();
                          setDeleteMenuOpen(false);
                        }}
                      />
                      <MenuHintItem
                        label={t.ciDeleteAllConfigsAndData}
                        hint={t.ciDeleteAllConfigsAndDataHint}
                        onClick={() => {
                          clearAllCiConfigsAndData();
                          setDeleteMenuOpen(false);
                        }}
                      />
                      <MenuHintItem
                        label={t.ciRestoreAll}
                        hint={t.ciRestoreAllHint}
                        onClick={() => {
                          resetAllToOriginal();
                          setDeleteMenuOpen(false);
                        }}
                      />
                    </div>,
                    document.body
                  )
                : null}
              <TooltipSimple content={t.communicateHelp} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${showHelp ? ' is-active' : ''}`}
                  onClick={() => setShowHelp((prev) => !prev)}
                  aria-label={t.communicateHelp}
                  aria-pressed={showHelp}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM7 5.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-.5v2h.5a.5.5 0 0 1 0 1H7a.5.5 0 0 1-.5-.5v-2.5a.5.5 0 0 1 .5-.5zm1 5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1z" />
                  </svg>
                </button>
              </TooltipSimple>
            </div>
          </div>
          {showHelp ? (
            <CustomScrollArea
              shellClassName="adl-multitree adl-multitree--github"
              scrollClassName="adl-multitree-scroll"
              scrollbarClassName="adl-multitree-scrollbar"
              thumbClassName="adl-multitree-scrollbar__thumb"
            >
              <div className="adl-github-category">
                <div
                  className="adl-github-category__label"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleHelpNav('gh-help-layout')}
                >
                  <span className="adl-github-category__label-text">{copy.ciHelpLayoutTitle}</span>
                </div>
                <div className="adl-github-category__entries">
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-layout-navigator')}
                  >
                    {copy.ciHelpLayoutNavigator}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-layout-primary')}
                  >
                    {copy.ciHelpLayoutPrimary}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-layout-toolbar')}
                  >
                    {copy.ciHelpLayoutToolbar}
                  </div>
                </div>
              </div>
              <div className="adl-github-category">
                <div
                  className="adl-github-category__label"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleHelpNav('gh-help-basic')}
                >
                  <span className="adl-github-category__label-text">{copy.ciHelpBasicTitle}</span>
                </div>
                <div className="adl-github-category__entries">
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-how-to-config')}
                  >
                    {copy.ciHelpHowToConfig}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-status-colors')}
                  >
                    {copy.ciHelpStatusColors}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-view-logs')}
                  >
                    {copy.ciHelpViewLogs}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-basic-autorefresh')}
                  >
                    {copy.ciHelpBasicAutoRefresh}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-multi-workspace')}
                  >
                    {copy.ciHelpMultiWorkspace}
                  </div>
                </div>
              </div>
              <div className="adl-github-category">
                <div
                  className="adl-github-category__label"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleHelpNav('gh-help-concepts')}
                >
                  <span className="adl-github-category__label-text">
                    {copy.ciHelpConceptsTitle}
                  </span>
                </div>
                <div className="adl-github-category__entries">
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-concept-workflow')}
                  >
                    {copy.ciHelpConceptWorkflowLabel}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-concept-job')}
                  >
                    {copy.ciHelpConceptJobLabel}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-concept-step')}
                  >
                    {copy.ciHelpConceptStepLabel}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-concept-run')}
                  >
                    {copy.ciHelpConceptRunLabel}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-concept-conclusion')}
                  >
                    {copy.ciHelpConceptConclusion}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-concept-status')}
                  >
                    {copy.ciHelpConceptStatus}
                  </div>
                </div>
              </div>
              <div className="adl-github-category">
                <div
                  className="adl-github-category__label"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleHelpNav('gh-help-troubleshooting')}
                >
                  <span className="adl-github-category__label-text">
                    {copy.ciHelpTroubleshootingTitle}
                  </span>
                </div>
                <div className="adl-github-category__entries">
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-trouble-noruns')}
                  >
                    {copy.ciHelpTroubleNoRuns}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-trace-ratelimit')}
                  >
                    {copy.ciHelpTroubleRateLimit}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-trouble-autorefresh')}
                  >
                    {copy.ciHelpTroubleNoAutoRefresh}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-trouble-incomplete')}
                  >
                    {copy.ciHelpTroubleIncompleteInfo}
                  </div>
                </div>
              </div>
              <div className="adl-github-category">
                <div
                  className="adl-github-category__label"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleHelpNav('gh-help-token')}
                >
                  <span className="adl-github-category__label-text">{copy.ciHelpTokenTitle}</span>
                </div>
                <div className="adl-github-category__entries">
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-token-why')}
                  >
                    {copy.ciHelpTokenWhyNeed}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-token-scopes')}
                  >
                    {copy.ciHelpTokenScopes}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-token-steps')}
                  >
                    {copy.ciHelpTokenSteps}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-token-old')}
                  >
                    {copy.ciHelpTokenOldMethod}
                  </div>
                  <div
                    className="adl-github-entry__leaf"
                    onClick={() => handleHelpNav('gh-help-token-security')}
                  >
                    {copy.ciHelpTokenSecurity}
                  </div>
                </div>
              </div>
            </CustomScrollArea>
          ) : (
            <GitHubTree
              workspaces={workspaces}
              gitHubWorkspaceConfigs={gitHubWorkspaceConfigs}
              gitHubCiFolders={gitHubCiFolders}
              gitHubTreeExpanded={gitHubTreeExpanded}
              selectedTreePath={selectedGitHubTreePath}
              onSelectTreePath={handleSelectTreePath}
              onTogglePath={handleTogglePath}
              callbacks={sectionCallbacks}
              labels={{
                ciWorkspaceCategory: copy.ciWorkspaceCategory,
                userFolderCategory: copy.ciUserFolderCategory,
                ciOverview: copy.ciOverview,
                ciWorkflows: copy.ciWorkflows,
                ciJobs: copy.ciJobs,
                ciLogs: copy.ciLogs,
              }}
              gitHubViewMode={gitHubViewMode}
            />
          )}
          <NavigatorResizeHandle
            label="Resize GitHub navigator"
            minWidth={180}
            maxWidth={420}
            currentWidth={gitHubNavigatorWidth}
            onPointerDown={handleNavigatorResizeStart}
          />
        </aside>

        <div className="adl-tool-primary adl-tool-primary--github">
          <div className="adl-tool-primary__scroll">{renderPrimary()}</div>
        </div>
      </div>

      {(settingsWorkspaceId || settingsFolderId) && (
        <GitHubSettingsDialog
          open={settingsWorkspaceId !== null || settingsFolderId !== null}
          workspaceName={settingsName}
          initialOwner={settingsInitialOwner}
          initialRepo={settingsInitialRepo}
          initialBranch={settingsInitialBranch}
          initialToken={accessToken}
          error={ciError}
          copy={copy}
          onSave={handleSettingsSave}
          onCancel={handleSettingsCancel}
        />
      )}
    </>
  );
}
