import type { ReactNode } from 'react';
import { IconFolder, IconMoreVertical, IconRefreshCw, IconSettings } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import type { CopyDict } from '@i18n';
import type { GitHubTreeNode } from './types';
import type { SectionCallbacks } from './GitHubCategorySection';
import { SUB_ENTRY_ICONS } from './GitHubEntryMenus';

export function renderSubEntryIcon(childNode: GitHubTreeNode): ReactNode {
  if (childNode.nodeType === 'folder') {
    return (
      <span className="adl-filetree__file-icon adl-filetree__file-icon--default" aria-hidden="true">
        <IconFolder size={14} decorative />
      </span>
    );
  }
  const parts = childNode.path.split(':');
  const section = parts[parts.length - 1];
  const icon = section ? SUB_ENTRY_ICONS[section] : null;
  if (icon) {
    return <span className="adl-github-entry__icon">{icon}</span>;
  }
  return undefined;
}

export function renderChildMeta(
  childNode: GitHubTreeNode,
  t: CopyDict,
  callbacks: SectionCallbacks,
  onOpenChildMenu: (childNode: GitHubTreeNode, x: number, y: number) => void
): ReactNode {
  if (childNode.nodeType !== 'folder') {
    return null;
  }
  const childFolderId = childNode.path.startsWith('github-folder:')
    ? childNode.path.slice('github-folder:'.length)
    : '';
  return (
    <span className="adl-browser-node__actions">
      <TooltipSimple content={t.refresh} placement="top">
        <button
          type="button"
          className="adl-icon-btn adl-icon-btn--xs"
          onClick={(e) => {
            e.stopPropagation();
            callbacks.onRefreshWorkspace(childFolderId);
          }}
          aria-label={t.refresh}
        >
          <IconRefreshCw size={12} decorative />
        </button>
      </TooltipSimple>
      <TooltipSimple content={t.settings} placement="top">
        <button
          type="button"
          className="adl-icon-btn adl-icon-btn--xs"
          onClick={(e) => {
            e.stopPropagation();
            callbacks.onOpenFolderSettings(childFolderId);
          }}
          aria-label={t.settings}
        >
          <IconSettings size={12} decorative />
        </button>
      </TooltipSimple>
      <TooltipSimple content={t.moreActions} placement="top">
        <button
          type="button"
          className="adl-icon-btn adl-icon-btn--xs"
          onClick={(e) => {
            e.stopPropagation();
            onOpenChildMenu(childNode, e.clientX + 4, e.clientY);
          }}
          aria-label={t.moreActions}
        >
          <IconMoreVertical size={12} decorative />
        </button>
      </TooltipSimple>
    </span>
  );
}

export function renderChildCount(childNode: GitHubTreeNode): number | undefined {
  if (childNode.kind === 'directory') {
    return childNode.children.length;
  }
  return undefined;
}
