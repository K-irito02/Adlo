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
} from '../../../../icons';
import { TooltipSimple } from '../../../../components/Tooltip';
import { useAppStore } from '../../../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useCIPanelProps } from '../../hooks/useCIPanelProps';
import { workspaceSelectors } from '../../../../stores/selectors';
import { getAppCopy } from '../../../../i18n';
import { GitHubTree } from '../../../../features/github-tree/GitHubTree';
import type { SectionCallbacks } from '../../../../features/github-tree/GitHubCategorySection';
import { GitHubLogViewer } from './GitHubLogViewer';
import { MenuHintItem } from './MenuHintItem';
import { OverviewView } from './OverviewView';
import { WorkflowsView } from './WorkflowsView';
import { JobsView } from './JobsView';
import { HelpView } from './HelpView';
import { GitHubSettingsDialog } from './GitHubSettingsDialog';





export function GitHubPanel() {
  const {
    gitHubWorkspaceConfigs,
    loading,
    error: ciError,
    onSaveWorkspaceConfig,
    onRemoveWorkspaceConfig,
    onRefreshWorkspace,
  } = useCIPanelProps();

  const {
    gitHubTreeExpanded,
    gitHubAllTreeExpanded,
    selectedGitHubTreePath,
    activeCiWorkspaceId,
    activeWorkspaceSection,
    communicateNavigatorCollapsed,
  } = useAppStore(
    useShallow((s) => ({
      gitHubTreeExpanded: s.gitHubTreeExpanded,
      gitHubAllTreeExpanded: s.gitHubAllTreeExpanded,
      selectedGitHubTreePath: s.selectedGitHubTreePath,
      activeCiWorkspaceId: s.activeCiWorkspaceId,
      activeWorkspaceSection: s.activeWorkspaceSection,
      communicateNavigatorCollapsed: s.communicateNavigatorCollapsed,
    }))
  );
  const workspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const ciSnapshot = useAppStore(useShallow((s) => s.ciSnapshot));

  const {
    toggleGitHubTreePath,
    expandAllGitHubTree,
    collapseAllGitHubTree,
    setSelectedGitHubTreePath,
    setActiveCiWorkspaceId,
    setActiveCiFolderId,
    setActiveWorkspaceSection,
    setSelectedLogJobId,
    gitHubCiFolders,
    gitHubCreateFolder,
    gitHubSaveFolderConfig,
    clearCiState,
    clearAllFolders,
    clearAllCiConfigs,
    clearAllCiConfigsAndData,
    resetAllToOriginal,
  } = useAppStore(
    useShallow((s) => ({
      toggleGitHubTreePath: s.toggleGitHubTreePath,
      expandAllGitHubTree: s.expandAllGitHubTree,
      collapseAllGitHubTree: s.collapseAllGitHubTree,
      setSelectedGitHubTreePath: s.setSelectedGitHubTreePath,
      setActiveCiWorkspaceId: s.setActiveCiWorkspaceId,
      setActiveCiFolderId: s.setActiveCiFolderId,
      setActiveWorkspaceSection: s.setActiveWorkspaceSection,
      setSelectedLogJobId: s.setSelectedLogJobId,
      gitHubCiFolders: s.gitHubCiFolders,
      gitHubCreateFolder: s.gitHubCreateFolder,
      gitHubSaveFolderConfig: s.gitHubSaveFolderConfig,
      clearCiState: s.clearCiState,
      clearAllFolders: s.clearAllFolders,
      clearAllCiConfigs: s.clearAllCiConfigs,
      clearAllCiConfigsAndData: s.clearAllCiConfigsAndData,
      resetAllToOriginal: s.resetAllToOriginal,
    }))
  );

  const selectedTreePathRef = useRef<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [gitHubViewMode, setGitHubViewMode] = useState<'tree' | 'list'>('tree');
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(null);
  const [settingsFolderId, setSettingsFolderId] = useState<string | null>(null);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const deleteMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteTooltipOpen, setDeleteTooltipOpen] = useState(false);

  // 清理定时器
  const clearDeleteMenuTimer = useCallback(() => {
    if (deleteMenuTimerRef.current) {
      clearTimeout(deleteMenuTimerRef.current);
      deleteMenuTimerRef.current = null;
    }
  }, []);

  // 检查鼠标是否在相关元素上
  const isMouseOverDeleteUI = useCallback(() => {
    const button = deleteButtonRef.current;
    const menu = document.querySelector('[data-menu-id="github-delete-all-menu"]');
    const tooltip = document.querySelector('[data-tooltip-id="github-delete-tooltip"]');

    return (
      (button && button.matches(':hover')) ||
      (menu && (menu as HTMLElement).matches(':hover')) ||
      (tooltip && (tooltip as HTMLElement).matches(':hover'))
    );
  }, []);

  const handleSelectTreePath = useCallback(
    (path: string | null) => {
      selectedTreePathRef.current = path ?? null;
      setSelectedGitHubTreePath(path);
      setShowHelp(false);
      if (path?.startsWith('github-workspace:')) {
        const parts = path.split(':');
        const wsId = parts[1];
        if (wsId) {
          setActiveCiWorkspaceId(wsId);
          setActiveCiFolderId(null);
        }
      } else if (path?.startsWith('github-folder:')) {
        const parts = path.split(':');
        const folderId = parts[1];
        setActiveCiFolderId(folderId ?? null);
      }
    },
    [setSelectedGitHubTreePath, setActiveCiWorkspaceId, setActiveCiFolderId]
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

  const activeConfig = activeCiWorkspaceId ? gitHubWorkspaceConfigs[activeCiWorkspaceId] : null;
  const visibleWorkspaces = workspaces;

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
      setSelectedLogJobId(jobId);
      setActiveWorkspaceSection('logs');
    },
    [setSelectedLogJobId, setActiveWorkspaceSection]
  );

  const handleRefreshAll = useCallback(() => {
    for (const wsId of Object.keys(gitHubWorkspaceConfigs)) {
      if (gitHubWorkspaceConfigs[wsId].configured) {
        onRefreshWorkspace(wsId);
      }
    }
  }, [gitHubWorkspaceConfigs, onRefreshWorkspace]);

  const sectionCallbacks: SectionCallbacks = useMemo(
    () => ({
      onSelectWorkspace: (workspaceId) => {
        setSelectedGitHubTreePath(`github-workspace:${workspaceId}`);
        setActiveCiWorkspaceId(workspaceId);
        setActiveWorkspaceSection('overview');
        setShowHelp(false);
      },
      onSelectSection: (workspaceId, section) => {
        setSelectedGitHubTreePath(`github-workspace:${workspaceId}:${section}`);
        setActiveCiWorkspaceId(workspaceId);
        setActiveWorkspaceSection(section);
        setShowHelp(false);
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
        setSettingsFolderId(null);
      }
    },
    [settingsWorkspaceId, settingsFolderId, onSaveWorkspaceConfig, gitHubSaveFolderConfig]
  );

  const handleSettingsCancel = useCallback(() => {
    setSettingsWorkspaceId(null);
    setSettingsFolderId(null);
  }, []);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (deleteMenuTimerRef.current) {
        clearTimeout(deleteMenuTimerRef.current);
      }
    };
  }, []);

  const renderPrimary = () => {
    if (showHelp) {
      return <HelpView copy={copy} />;
    }

    if (activeWorkspaceSection === 'help') {
      return <HelpView copy={copy} />;
    }

    if (!activeCiWorkspaceId || !activeConfig) {
      return (
        <div className="adl-github__empty">
          <p>请选择一个工作区查看 CI 状态</p>
        </div>
      );
    }

    switch (activeWorkspaceSection) {
      case 'overview':
        return (
          <OverviewView
            snapshot={ciSnapshot}
            loading={loading}
            branch={activeConfig.branch}
            copy={copy}
            onViewLogs={handleViewLogs}
          />
        );
      case 'workflows':
        return <WorkflowsView snapshot={ciSnapshot} />;
      case 'jobs':
        return <JobsView snapshot={ciSnapshot} onViewLogs={handleViewLogs} />;
      case 'logs':
        return (
          <GitHubLogViewer
            snapshot={ciSnapshot}
            config={{
              owner: activeConfig.owner,
              repo: activeConfig.repo,
              branch: activeConfig.branch,
            }}
          />
        );
    }
  };

  return (
    <>
      <div
        className={`adl-tool-surface adl-tool-surface--github${communicateNavigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
        style={{ '--adl-files-nav-width': '200px' } as React.CSSProperties}
      >
        <aside className="adl-tool-navigator" aria-label="GitHub CI">
          <div className="adl-tool-navigator__context">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <TooltipSimple
                content={gitHubAllTreeExpanded ? '全部折叠' : '全部展开'}
                placement="top"
              >
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={gitHubAllTreeExpanded ? collapseAllGitHubTree : expandAllGitHubTree}
                  aria-label={gitHubAllTreeExpanded ? '全部折叠' : '全部展开'}
                >
                  {gitHubAllTreeExpanded ? (
                    <IconFoldVertical size={14} decorative />
                  ) : (
                    <IconUnfoldVertical size={14} decorative />
                  )}
                </button>
              </TooltipSimple>
              <span className="adl-tool-navigator__context-title">
                {gitHubViewMode === 'tree' ? '文件树' : '目录列表'}
              </span>
            </div>
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
              <span className="adl-tool-navigator__context-count">{visibleWorkspaces.length}</span>
              <TooltipSimple content="刷新全部" placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={handleRefreshAll}
                  aria-label="刷新全部"
                >
                  <IconRefreshCw size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
          </div>
          <div className="adl-tool-navigator__context adl-tool-navigator__context--secondary">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <TooltipSimple content="文件树" placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${gitHubViewMode === 'tree' ? ' is-active' : ''}`}
                  onClick={() => setGitHubViewMode('tree')}
                  aria-label="文件树"
                  aria-pressed={gitHubViewMode === 'tree'}
                >
                  <IconFiles size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content="目录列表" placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${gitHubViewMode === 'list' ? ' is-active' : ''}`}
                  onClick={() => setGitHubViewMode('list')}
                  aria-label="目录列表"
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
              <TooltipSimple content="新建目录" placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={handleCreateFolder}
                  aria-label="新建目录"
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
                  clearDeleteMenuTimer();
                  setDeleteMenuOpen(true);
                  setDeleteTooltipOpen(true);
                }}
                onMouseLeave={() => {
                  // 延迟检查，确保鼠标不在菜单上
                  deleteMenuTimerRef.current = setTimeout(() => {
                    if (!isMouseOverDeleteUI()) {
                      setDeleteMenuOpen(false);
                      setDeleteTooltipOpen(false);
                    }
                  }, 100);
                }}
                aria-label="删除全部新建目录/CI配置/数据"
              >
                <TooltipSimple
                  content="删除全部新建目录/CI配置/数据"
                  placement="top"
                  id="github-delete-tooltip"
                  open={deleteTooltipOpen}
                  onOpenChange={(open) => {
                    clearDeleteMenuTimer();
                    if (open) {
                      setDeleteMenuOpen(true);
                    }
                  }}
                >
                  <IconTrash size={14} decorative />
                </TooltipSimple>
              </button>
              {deleteMenuOpen && deleteButtonRef.current
                ? createPortal(
                    <div
                      className="adl-multitree-entry__menu"
                      role="menu"
                      data-menu-id="github-delete-all-menu"
                      onMouseEnter={() => {
                        clearDeleteMenuTimer();
                        setDeleteTooltipOpen(true);
                      }}
                      onMouseLeave={() => {
                        // 延迟检查，确保鼠标不在按钮或 tooltip 上
                        deleteMenuTimerRef.current = setTimeout(() => {
                          if (!isMouseOverDeleteUI()) {
                            setDeleteMenuOpen(false);
                            setDeleteTooltipOpen(false);
                          }
                        }, 100);
                      }}
                      style={{
                        position: 'fixed',
                        top: deleteButtonRef.current.getBoundingClientRect().bottom + 4,
                        left: deleteButtonRef.current.getBoundingClientRect().left,
                        zIndex: 99999,
                      }}
                    >
                      <MenuHintItem
                        label="删除全部新建目录"
                        hint="删除所有通过'新建目录'创建的目录节点及其CI配置和数据。工作区目录不受影响。"
                        onClick={() => {
                          clearAllFolders();
                          setDeleteMenuOpen(false);
                        }}
                      />
                      <MenuHintItem
                        label="删除全部CI配置"
                        hint="清空所有工作区和文件夹绑定的GitHub仓库配置（owner/repo/branch/token）。保留目录结构和CI运行数据。"
                        onClick={() => {
                          clearAllCiConfigs();
                          setDeleteMenuOpen(false);
                        }}
                      />
                      <MenuHintItem
                        label="删除全部数据"
                        hint="清空当前面板显示的所有CI运行状态（快照/作业列表/错误信息）。保留配置信息。"
                        onClick={() => {
                          clearCiState();
                          setDeleteMenuOpen(false);
                        }}
                      />
                      <MenuHintItem
                        label="删除全部CI配置及数据"
                        hint="同时清空所有工作区和文件夹的GitHub配置以及所有CI运行数据。保留目录结构。"
                        onClick={() => {
                          clearAllCiConfigsAndData();
                          setDeleteMenuOpen(false);
                        }}
                      />
                      <MenuHintItem
                        label="恢复还原"
                        hint="清空所有内容——删除所有新建目录、所有CI配置及数据，恢复到仅显示工作区目录顶级目录的初始状态。"
                        onClick={() => {
                          resetAllToOriginal();
                          setDeleteMenuOpen(false);
                        }}
                      />
                    </div>,
                    document.body
                  )
                : null}
              <TooltipSimple content="Help" placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={() => setShowHelp(true)}
                  aria-label="Help"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM7 5.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-.5v2h.5a.5.5 0 0 1 0 1H7a.5.5 0 0 1-.5-.5v-2.5a.5.5 0 0 1 .5-.5zm1 5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1z" />
                  </svg>
                </button>
              </TooltipSimple>
            </div>
          </div>
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
              ciWorkspaceCategory: '工作区目录',
              userFolderCategory: '非工作区目录',
            }}
            gitHubViewMode={gitHubViewMode}
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
          error={ciError}
          copy={copy}
          onSave={handleSettingsSave}
          onCancel={handleSettingsCancel}
        />
      )}
    </>
  );
}
