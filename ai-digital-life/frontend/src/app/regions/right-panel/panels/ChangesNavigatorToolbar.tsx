import React from 'react';
import {
  IconFileText,
  IconFiles,
  IconFoldVertical,
  IconList,
  IconRefreshCw,
  IconUnfoldVertical,
} from '../../../icons';
import { TooltipSimple } from '../../../components/Tooltip';
import { useTCopy } from '../../../i18n/useTCopy';
import type { ChangeFileState } from '../changesTree';

export interface ChangesNavigatorToolbarProps {
  allChangesExpanded: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  changesNavigatorTitle: string;
  totalChangeCount: number;
  hasVisibleWorkspaces: boolean;
  onRefreshAll: () => void;
  changesNavigatorMode: 'tree' | 'list' | 'outline';
  onSetNavigatorMode: (mode: 'tree' | 'list' | 'outline') => void;
  changesStatusFilter: Set<ChangeFileState>;
  onStatusFilterClick: (filter: ChangeFileState) => void;
  hasChangeEntries: boolean;
  snapshot?: { staged: string[]; unstaged: string[]; untracked: string[] };
  totalChangesStats?: { staged: number; unstaged: number; untracked: number };
  canToggleNavigatorStructure: boolean;
  structureToggleExpanded: boolean;
  onToggleStructure: () => void;
}

export function ChangesNavigatorToolbar({
  allChangesExpanded: _allChangesExpanded,
  onExpandAll: _onExpandAll,
  onCollapseAll: _onCollapseAll,
  changesNavigatorTitle,
  totalChangeCount,
  hasVisibleWorkspaces: _hasVisibleWorkspaces,
  onRefreshAll,
  changesNavigatorMode,
  onSetNavigatorMode,
  changesStatusFilter,
  onStatusFilterClick,
  hasChangeEntries: _hasChangeEntries,
  snapshot,
  totalChangesStats,
  canToggleNavigatorStructure,
  structureToggleExpanded,
  onToggleStructure,
}: ChangesNavigatorToolbarProps) {
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
              onClick={onToggleStructure}
              aria-label={structureToggleExpanded ? t.fileCollapseAll : t.fileExpandAll}
              disabled={!canToggleNavigatorStructure}
            >
              {structureToggleExpanded ? (
                <IconFoldVertical size={14} decorative />
              ) : (
                <IconUnfoldVertical size={14} decorative />
              )}
            </button>
          </TooltipSimple>
          <span className="adl-tool-navigator__context-title">{changesNavigatorTitle}</span>
        </div>
        <span className="adl-tool-navigator__meta">{totalChangeCount}</span>
        <TooltipSimple content={t.changesRefresh} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
            onClick={onRefreshAll}
            aria-label={t.changesRefresh}
          >
            <IconRefreshCw size={14} decorative />
          </button>
        </TooltipSimple>
      </div>
      <div className="adl-tool-navigator__context adl-tool-navigator__context--tabs">
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
          <TooltipSimple content={t.fileTreeView} placement="top">
            <button
              type="button"
              className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${changesNavigatorMode === 'tree' ? ' is-active' : ''}`}
              aria-pressed={changesNavigatorMode === 'tree' ? 'true' : 'false'}
              onClick={() => onSetNavigatorMode('tree')}
              aria-label={t.fileTreeView}
            >
              <IconFiles size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.changesListView} placement="top">
            <button
              type="button"
              className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${changesNavigatorMode === 'list' ? ' is-active' : ''}`}
              aria-pressed={changesNavigatorMode === 'list' ? 'true' : 'false'}
              onClick={() => onSetNavigatorMode('list')}
              aria-label={t.changesListView}
            >
              <IconFileText size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.outline} placement="top">
            <button
              type="button"
              className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${changesNavigatorMode === 'outline' ? ' is-active' : ''}`}
              aria-pressed={changesNavigatorMode === 'outline' ? 'true' : 'false'}
              onClick={() => onSetNavigatorMode('outline')}
              aria-label={t.outline}
            >
              <IconList size={14} decorative />
            </button>
          </TooltipSimple>
        </div>
      </div>
      {changesNavigatorMode !== 'outline' ? (
        <div className="adl-tool-navigator__summary" aria-label={t.toolChanges}>
          <div className="adl-tool-navigator__summary-stats">
            <button
              type="button"
              className={`adl-tool-navigator__summary-stat${changesStatusFilter.has('staged') ? ' is-active' : ''}`}
              onClick={() => onStatusFilterClick('staged')}
              aria-pressed={changesStatusFilter.has('staged')}
              aria-label={t.changesStaged}
            >
              <span className="adl-tool-navigator__summary-label">{t.changesStaged}</span>
              <strong className="adl-tool-navigator__summary-value">
                <span className="adl-tool-navigator__summary-code" aria-hidden="true">
                  S:
                </span>
                {totalChangesStats?.staged ?? snapshot?.staged.length ?? 0}
              </strong>
            </button>
            <button
              type="button"
              className={`adl-tool-navigator__summary-stat${changesStatusFilter.has('modified') ? ' is-active' : ''}`}
              onClick={() => onStatusFilterClick('modified')}
              aria-pressed={changesStatusFilter.has('modified')}
              aria-label={t.changesModified}
            >
              <span className="adl-tool-navigator__summary-label">{t.changesModified}</span>
              <strong className="adl-tool-navigator__summary-value">
                <span className="adl-tool-navigator__summary-code" aria-hidden="true">
                  M:
                </span>
                {totalChangesStats?.unstaged ?? snapshot?.unstaged.length ?? 0}
              </strong>
            </button>
            <button
              type="button"
              className={`adl-tool-navigator__summary-stat${changesStatusFilter.has('untracked') ? ' is-active' : ''}`}
              onClick={() => onStatusFilterClick('untracked')}
              aria-pressed={changesStatusFilter.has('untracked')}
              aria-label={t.changesUntracked}
            >
              <span className="adl-tool-navigator__summary-label">{t.changesUntracked}</span>
              <strong className="adl-tool-navigator__summary-value">
                <span className="adl-tool-navigator__summary-code" aria-hidden="true">
                  U:
                </span>
                {totalChangesStats?.untracked ?? snapshot?.untracked.length ?? 0}
              </strong>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
