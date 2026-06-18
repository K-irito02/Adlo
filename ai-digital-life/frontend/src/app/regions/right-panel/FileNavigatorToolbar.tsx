import React from 'react';
import type { FileOutlineItem } from '@ai-digital-life/kernel';
import { useTCopy } from '../../i18n/useTCopy';
import {
  IconFilePlus,
  IconFiles,
  IconFoldVertical,
  IconFolderPlus,
  IconList,
  IconRefreshCw,
  IconUnfoldVertical,
} from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import { FileCreationBar } from './FileCreationBar';
import type { UseFileCreationResult } from './hooks';

interface FileNavigatorToolbarProps {
  navigatorTitle: string;
  workspaceCount: number;
  structureToggleExpanded: boolean;
  canToggleNavigatorStructure: boolean;
  navigatorMode: 'tree' | 'search' | 'outline';
  outline: FileOutlineItem[];
  onToggleNavigatorStructure: () => void;
  onRefreshAll: () => void;
  onSetNavigatorMode: (mode: 'tree' | 'search' | 'outline') => void;
  fileCreation: UseFileCreationResult;
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
  onSetNavigatorMode,
  fileCreation,
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
              <IconRefreshCw size={14} decorative />
            </button>
          </TooltipSimple>
        </div>
      </div>
      <div className="adl-tool-navigator__context adl-tool-navigator__context--secondary">
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
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
        </div>
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
          <TooltipSimple content={t.fileNewFile} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={() => fileCreation.startCreate('file')}
              aria-label={t.fileNewFile as string}
            >
              <IconFilePlus size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.fileNewFolder} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={() => fileCreation.startCreate('folder')}
              aria-label={t.fileNewFolder as string}
            >
              <IconFolderPlus size={14} decorative />
            </button>
          </TooltipSimple>
        </div>
      </div>

      {fileCreation.createTarget ? (
        <FileCreationBar
          createTarget={fileCreation.createTarget}
          createPathValue={fileCreation.createPathValue}
          createInputRef={fileCreation.createInputRef}
          isValidPath={(value) => {
            const trimmed = value.trim();
            if (!trimmed) {
              return false;
            }
            if (
              /^[A-Za-z]:[\\/]/.test(trimmed) ||
              trimmed.startsWith('/') ||
              trimmed.startsWith('\\')
            ) {
              return false;
            }
            return true;
          }}
          onPathChange={fileCreation.setCreatePathValue}
          onSubmit={fileCreation.submitCreate}
          onCancel={fileCreation.cancelCreate}
        />
      ) : null}
    </>
  );
});

export { FileNavigatorToolbar };
export type { FileNavigatorToolbarProps };
