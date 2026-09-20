import React from 'react';
import type { FileOutlineItem } from '@ai-digital-life/kernel';
import { useTCopy } from '@i18n/useTCopy';
import {
  IconNewFile,
  IconFiles,
  IconFileText,
  IconFoldVertical,
  IconNewFolder,
  IconList,
  IconRefreshCw,
  IconUnfoldVertical,
  IconSettings,
} from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import type { UseFileCreationResult } from './hooks';
import type { FilesSearchScope, FilesSearchViewMode } from '@stores/types';

interface FileNavigatorToolbarProps {
  navigatorTitle: string;
  workspaceCount: number;
  structureToggleExpanded: boolean;
  canToggleNavigatorStructure: boolean;
  navigatorMode: 'tree' | 'search' | 'outline';
  outline: FileOutlineItem[];
  onToggleNavigatorStructure: () => void;
  onRefreshAll: () => void;
  isRefreshingAll: boolean;
  onSetNavigatorMode: (mode: 'tree' | 'search' | 'outline') => void;
  fileCreation: UseFileCreationResult;
  /** 是否处于检索文件模式：第二行切换为检索结果视图按钮，并隐藏新建文件/文件夹 */
  isSearchMode: boolean;
  searchView: FilesSearchViewMode;
  onSetSearchView: (view: FilesSearchViewMode) => void;
  /** 检索范围分段控制器：占据原新建文件/文件夹按钮位置 */
  searchScope: FilesSearchScope;
  onSetSearchScope: (scope: FilesSearchScope) => void;
  /** 检索设置弹窗入口：仅检索文件模式下在标题右侧显示齿轮按钮 */
  onOpenSearchSettings?: () => void;
}

const FileNavigatorToolbar = React.memo(function FileNavigatorToolbar({
  navigatorTitle,
  workspaceCount,
  structureToggleExpanded,
  canToggleNavigatorStructure,
  navigatorMode,
  outline,
  onToggleNavigatorStructure,
  onRefreshAll,
  isRefreshingAll,
  onSetNavigatorMode,
  fileCreation,
  isSearchMode,
  searchView,
  onSetSearchView,
  searchScope,
  onSetSearchScope,
  onOpenSearchSettings,
}: FileNavigatorToolbarProps) {
  const { t } = useTCopy();

  return (
    <>
      <div className="adl-tool-navigator__context">
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
          <TooltipSimple
            content={structureToggleExpanded ? t.fileCollapseAll : t.fileExpandAll}
            placement="top"
          >
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={onToggleNavigatorStructure}
              aria-label={(structureToggleExpanded ? t.fileCollapseAll : t.fileExpandAll) as string}
              disabled={!canToggleNavigatorStructure}
            >
              {structureToggleExpanded ? (
                <IconFoldVertical size={14} decorative />
              ) : (
                <IconUnfoldVertical size={14} decorative />
              )}
            </button>
          </TooltipSimple>
          <span className="adl-tool-navigator__context-title">{navigatorTitle as string}</span>
          {isSearchMode && onOpenSearchSettings ? (
            <TooltipSimple content={t.searchSettings} placement="top">
              <button
                type="button"
                className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                onClick={onOpenSearchSettings}
                aria-label={t.searchSettings as string}
              >
                <IconSettings size={12} decorative />
              </button>
            </TooltipSimple>
          ) : null}
        </div>
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
          {workspaceCount > 0 ? (
            <span className="adl-tool-navigator__context-count">{workspaceCount}</span>
          ) : null}
          <TooltipSimple content={t.communicateRefreshAll} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={onRefreshAll}
              aria-label={t.fileRefresh as string}
            >
              <IconRefreshCw
                size={14}
                decorative
                className={isRefreshingAll ? 'adl-spin' : undefined}
              />
            </button>
          </TooltipSimple>
        </div>
      </div>
      <div className="adl-tool-navigator__context adl-tool-navigator__context--secondary">
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
          {isSearchMode ? (
            <>
              <TooltipSimple content={t.fileTreeView} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${searchView === 'tree' ? ' is-active' : ''}`}
                  onClick={() => onSetSearchView('tree')}
                  aria-label={t.fileTreeView as string}
                  aria-pressed={searchView === 'tree' ? 'true' : 'false'}
                >
                  <IconFiles size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content={t.searchListView} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${searchView === 'list' ? ' is-active' : ''}`}
                  onClick={() => onSetSearchView('list')}
                  aria-label={t.searchListView as string}
                  aria-pressed={searchView === 'list' ? 'true' : 'false'}
                >
                  <IconFileText size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content={t.outline} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${searchView === 'outline' ? ' is-active' : ''}`}
                  onClick={() => onSetSearchView('outline')}
                  aria-label={t.outline as string}
                  aria-pressed={searchView === 'outline' ? 'true' : 'false'}
                >
                  <IconList size={14} decorative />
                </button>
              </TooltipSimple>
            </>
          ) : (
            <>
              <TooltipSimple content={t.fileTreeView} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'tree' ? ' is-active' : ''}`}
                  onClick={() => onSetNavigatorMode('tree')}
                  aria-label={t.fileTreeView as string}
                  aria-pressed={navigatorMode === 'tree' ? 'true' : 'false'}
                >
                  <IconFiles size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content={t.changesOutline} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'outline' ? ' is-active' : ''}`}
                  onClick={() => onSetNavigatorMode('outline')}
                  aria-label={(outline.length > 0 ? t.outline : t.toolFiles) as string}
                  aria-pressed={navigatorMode === 'outline' ? 'true' : 'false'}
                >
                  <IconList size={14} decorative />
                </button>
              </TooltipSimple>
            </>
          )}
        </div>
        {isSearchMode ? (
          <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
            <TooltipSimple content={t.searchScopeLabel} placement="top">
              <div
                className="adl-tool-context__diff-view"
                role="group"
                aria-label={t.searchScopeLabel as string}
              >
                <button
                  type="button"
                  className={`adl-tool-context__toggle-btn${searchScope === 'file' ? ' is-active' : ''}`}
                  aria-pressed={searchScope === 'file' ? 'true' : 'false'}
                  onClick={() => onSetSearchScope('file')}
                >
                  {t.searchScopeFile}
                </button>
                <button
                  type="button"
                  className={`adl-tool-context__toggle-btn${searchScope === 'content' ? ' is-active' : ''}`}
                  aria-pressed={searchScope === 'content' ? 'true' : 'false'}
                  onClick={() => onSetSearchScope('content')}
                >
                  {t.searchScopeContent}
                </button>
              </div>
            </TooltipSimple>
          </div>
        ) : (
          <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
            <TooltipSimple content={t.fileNewFile} placement="top">
              <button
                type="button"
                className="adl-tool-context__iconbtn adl-tool-navigator__context-btn adl-tool-navigator__create-action"
                onClick={() => fileCreation.startCreate('file')}
                aria-label={t.fileNewFile as string}
              >
                <IconNewFile size={14} decorative />
              </button>
            </TooltipSimple>
            <TooltipSimple content={t.fileNewFolder} placement="top">
              <button
                type="button"
                className="adl-tool-context__iconbtn adl-tool-navigator__context-btn adl-tool-navigator__create-action"
                onClick={() => fileCreation.startCreate('folder')}
                aria-label={t.fileNewFolder as string}
              >
                <IconNewFolder size={14} decorative />
              </button>
            </TooltipSimple>
          </div>
        )}
      </div>
    </>
  );
});

export { FileNavigatorToolbar };
export type { FileNavigatorToolbarProps };
