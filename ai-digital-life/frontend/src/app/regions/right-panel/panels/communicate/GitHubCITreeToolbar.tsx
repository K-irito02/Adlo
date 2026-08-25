import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  IconFoldVertical,
  IconUnfoldVertical,
  IconRefreshCw,
  IconDelete,
  IconFiles,
  IconList,
  IconFolderPlus,
} from '@app/icons';
import { TooltipSimple } from '@components/Tooltip';
import { useTCopy } from '@app/i18n/useTCopy';
import { MenuHintItem } from './MenuHintItem';

interface GitHubCITreeToolbarProps {
  gitHubAllTreeExpanded: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  showHelp: boolean;
  onSetShowHelp: (v: boolean) => void;
  gitHubViewMode: 'tree' | 'list';
  onSetGitHubViewMode: (v: 'tree' | 'list') => void;
  workspaceCount: number;
  onRefreshAll: () => void;
  onCreateFolder: () => void;
  onClearAllFolders: () => void;
  onClearAllCiConfigs: () => void;
  onClearCiState: () => void;
  onClearAllCiConfigsAndData: () => void;
  onResetAllToOriginal: () => void;
}

export function GitHubCITreeToolbar({
  gitHubAllTreeExpanded,
  onExpandAll,
  onCollapseAll,
  showHelp,
  onSetShowHelp,
  gitHubViewMode,
  onSetGitHubViewMode,
  workspaceCount,
  onRefreshAll,
  onCreateFolder,
  onClearAllFolders,
  onClearAllCiConfigs,
  onClearCiState,
  onClearAllCiConfigsAndData,
  onResetAllToOriginal,
}: GitHubCITreeToolbarProps) {
  const { t } = useTCopy();

  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const deleteMenuRef = useRef<HTMLDivElement>(null);
  const deleteCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <>
      <div className="adl-tool-navigator__context">
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
          <TooltipSimple
            content={gitHubAllTreeExpanded ? t.collapseAll : t.expandAll}
            placement="top"
          >
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={gitHubAllTreeExpanded ? onCollapseAll : onExpandAll}
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
          <span className="adl-tool-navigator__context-count">{workspaceCount}</span>
          <TooltipSimple content={t.communicateRefreshAll} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={onRefreshAll}
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
              onClick={() => onSetGitHubViewMode('tree')}
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
              onClick={() => onSetGitHubViewMode('list')}
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
              onClick={onCreateFolder}
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
            <IconDelete size={14} decorative />
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
                    zIndex: 'var(--z-toast-top)',
                  }}
                >
                  <MenuHintItem
                    label={t.ciDeleteAllNewDirs}
                    hint={t.ciDeleteAllNewDirsHint}
                    onClick={() => {
                      onClearAllFolders();
                      setDeleteMenuOpen(false);
                    }}
                  />
                  <MenuHintItem
                    label={t.ciDeleteAllConfigs}
                    hint={t.ciDeleteAllConfigsHint}
                    onClick={() => {
                      onClearAllCiConfigs();
                      setDeleteMenuOpen(false);
                    }}
                  />
                  <MenuHintItem
                    label={t.ciDeleteAllData}
                    hint={t.ciDeleteAllDataHint}
                    onClick={() => {
                      onClearCiState();
                      setDeleteMenuOpen(false);
                    }}
                  />
                  <MenuHintItem
                    label={t.ciDeleteAllConfigsAndData}
                    hint={t.ciDeleteAllConfigsAndDataHint}
                    onClick={() => {
                      onClearAllCiConfigsAndData();
                      setDeleteMenuOpen(false);
                    }}
                  />
                  <MenuHintItem
                    label={t.ciRestoreAll}
                    hint={t.ciRestoreAllHint}
                    onClick={() => {
                      onResetAllToOriginal();
                      setDeleteMenuOpen(false);
                    }}
                  />
                </div>,
                document.body,
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
    </>
  );
}
