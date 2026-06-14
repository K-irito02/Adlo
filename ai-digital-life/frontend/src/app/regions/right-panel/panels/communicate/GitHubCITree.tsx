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
import { useNavigatorResize } from '@app/hooks/useNavigatorResize';
import { workspaceSelectors } from '@stores/selectors';
import { getAppCopy } from '@app/i18n';
import { useTCopy } from '@app/i18n/useTCopy';
import { GitHubTree } from '@features/github-tree/GitHubTree';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import type { SectionCallbacks } from '@features/github-tree/GitHubCategorySection';
import { MenuHintItem } from './MenuHintItem';

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
    }))
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
    }))
  );

  const gitHubNavigatorWidth = useAppStore((state) => state.gitHubNavigatorWidth);
  const setGitHubNavigatorWidth = useAppStore((state) => state.setGitHubNavigatorWidth);

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setGitHubNavigatorWidth,
    minWidth: 180,
    maxWidth: 420,
  });

  const [gitHubViewMode, setGitHubViewMode] = useState<'tree' | 'list'>('tree');
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const deleteMenuRef = useRef<HTMLDivElement>(null);
  const deleteCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedTreePathRef = useRef<string | null>(null);

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

  const cancelDeleteMenuClose = useCallback(() => {
    if (deleteCloseTimerRef.current) {
      clearTimeout(deleteCloseTimerRef.current);
      deleteCloseTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (deleteCloseTimerRef.current) {
        clearTimeout(deleteCloseTimerRef.current);
        deleteCloseTimerRef.current = null;
      }
    };
  }, []);

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
    ]
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

  const appInfo = workspaceSelectors.useAppInfo();
  const copy = getAppCopy(appInfo);

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
    ]
  );

  return (
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
              onClick={() => onSetShowHelp(!showHelp)}
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
              <span className="adl-github-category__label-text">{copy.ciHelpConceptsTitle}</span>
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
        label={t.ciResizeNavigator}
        minWidth={180}
        maxWidth={420}
        currentWidth={gitHubNavigatorWidth}
        onPointerDown={handleNavigatorResizeStart}
      />
    </aside>
  );
}
