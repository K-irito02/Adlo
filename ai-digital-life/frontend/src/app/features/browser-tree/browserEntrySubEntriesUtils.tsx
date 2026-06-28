import React from 'react';
import { IconClose, IconPlus, IconTrash, IconMoreVertical, IconRefreshCw } from '../../icons';
import type { BrowserTreeNode, BrowserCategoryType } from './types';
import type { SectionCallbacks } from './BrowserCategorySection';
import type { CopyDict } from '../../i18n';
import { useAppStore } from '../../stores/slicedStore';

export interface BrowserEntrySubEntriesProps {
  node: BrowserTreeNode;
  categoryType: BrowserCategoryType;
  expandedPaths: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  onOpenFile: (path: string) => void;
  callbacks: SectionCallbacks;
  counts: Map<string, number>;
  filterTabIds?: Set<string>;
}

export function getChildNodeHoverButtons(
  nodeType: string,
  categoryType: BrowserCategoryType,
  t: CopyDict
): Array<{ id: string; label: string; icon: React.ReactNode }> {
  if (categoryType === 'history') {
    if (nodeType === 'day') {
      return [
        {
          id: 'delete-self-tabs',
          label: t.browserContextDeleteSelfTabs,
          icon: <IconTrash size={12} decorative />,
        },
        {
          id: 'more',
          label: t.browserContextMore,
          icon: <IconMoreVertical size={12} decorative />,
        },
      ];
    }
    return [];
  }

  if (nodeType === 'folder') {
    return [
      {
        id: 'create-tab',
        label: t.browserContextCreateTab,
        icon: <IconPlus size={12} decorative />,
      },
      { id: 'more', label: t.browserContextMore, icon: <IconMoreVertical size={12} decorative /> },
    ];
  }

  return [];
}

export function getChildNodeMoreMenuItems(
  nodeType: string,
  categoryType: BrowserCategoryType,
  nodePath: string,
  callbacks: SectionCallbacks,
  t: CopyDict
): Array<{
  id: string;
  label: string;
  danger?: boolean;
  hint?: string;
  action: () => void;
}> {
  if (categoryType === 'history' && nodeType === 'day') {
    return [
      {
        id: 'open-all-tabs',
        label: t.browserContextOpenAllNewTabs,
        action: () => callbacks.onOpenAllInNewTabs(categoryType, nodePath),
      },
      {
        id: 'delete-self-tabs',
        label: t.browserContextDeleteSelfTabs,
        danger: true,
        hint: t.browserDeleteSelfTabsHint,
        action: () => callbacks.onDeleteOwnChildTabs(categoryType, nodePath),
      },
      {
        id: 'delete-this-dir',
        label: t.browserContextDeleteDir,
        danger: true,
        hint: t.browserDeleteDirHint,
        action: () => callbacks.onDeleteDirectory(nodePath),
      },
    ];
  }

  if (nodeType === 'folder') {
    const folderId = nodePath.startsWith('folder:') ? nodePath.slice('folder:'.length) : '';
    return [
      {
        id: 'open-all-tabs',
        label: t.browserContextOpenAllNewTabs,
        action: () => callbacks.onOpenAllInNewTabs(categoryType, nodePath),
      },
      {
        id: 'rename',
        label: t.browserContextRename,
        action: () => callbacks.onRenameDirectory(folderId),
      },
      {
        id: 'delete-all-tabs',
        label: t.browserContextDeleteAllTabs,
        danger: true,
        hint: t.browserDeleteAllTabsHint,
        action: () => callbacks.onDeleteAllChildTabs(categoryType, nodePath),
      },
      {
        id: 'delete-self-tabs',
        label: t.browserContextDeleteSelfTabs,
        danger: true,
        hint: t.browserDeleteSelfTabsHint,
        action: () => callbacks.onDeleteOwnChildTabs(categoryType, nodePath),
      },
      {
        id: 'delete-this-dir',
        label: t.browserContextDeleteDir,
        danger: true,
        hint: t.browserDeleteDirHint,
        action: () => callbacks.onDeleteDirectory(folderId),
      },
    ];
  }

  return [];
}

export function handleBookmarkToggle(url: string, title: string, tabId?: string): void {
  if (!url) return;
  const stillBookmarked = useAppStore.getState().browserBookmarks.some((b) => b.url === url);
  if (stillBookmarked) {
    useAppStore.getState().browserToggleBookmark({ url, title });
  } else {
    useAppStore.getState().browserSetPendingBookmark({ url, title, tabId: tabId || undefined });
  }
}

export function getTabContextMenuItems(
  node: BrowserTreeNode,
  callbacks: SectionCallbacks,
  t: CopyDict,
  isBookmarked: boolean
): Array<{
  id: string;
  label: string;
  danger?: boolean;
  hint?: string;
  action: () => void;
}> {
  return [
    {
      id: 'open-current',
      label: t.browserContextOpenCurrent,
      action: () => {
        if (node.tabId) {
          callbacks.onOpenTabInCurrentTab(node.tabId);
        }
      },
    },
    {
      id: 'open-new',
      label: t.browserContextOpenNewTab,
      action: () => {
        if (node.url) {
          callbacks.onOpenTabInNewTab(node.url, node.name);
        }
      },
    },
    {
      id: 'refresh',
      label: t.browserRefreshMeta,
      hint: t.browserRefreshMetaHint,
      action: () => {
        if (node.tabId && node.url) {
          callbacks.onRefreshTab(node.tabId, node.url);
        }
      },
    },
    {
      id: 'edit',
      label: t.browserContextEdit,
      action: () => {
        if (node.tabId && node.url) {
          callbacks.onEditTab(node.tabId, node.name, node.url);
        }
      },
    },
    {
      id: 'copy-link',
      label: t.browserContextCopyLink,
      action: () => {
        if (node.url) {
          callbacks.onCopyTabLink(node.url);
        }
      },
    },
    {
      id: 'bookmark-toggle',
      label: isBookmarked ? t.browserUnbookmark : t.browserBookmark,
      action: () => {
        handleBookmarkToggle(node.url || '', node.name, node.tabId);
      },
    },
    {
      id: 'delete',
      label: t.browserContextDelete,
      danger: true,
      action: () => {
        if (node.tabId && node.url) {
          callbacks.onDeleteTab(node.tabId, node.url);
        }
      },
    },
  ];
}

export function getTabHoverButtons(
  t: CopyDict,
  showClose: boolean
): Array<{ id: string; label: string; icon: React.ReactNode; isClose?: boolean }> {
  const btns: Array<{ id: string; label: string; icon: React.ReactNode; isClose?: boolean }> = [];
  if (showClose) {
    btns.push({
      id: 'close',
      label: t.browserClose,
      icon: <IconClose size={12} decorative />,
      isClose: true,
    });
  }
  btns.push(
    {
      id: 'refresh',
      label: t.browserRefreshMeta,
      icon: <IconRefreshCw size={12} decorative />,
    },
    {
      id: 'more',
      label: t.browserContextMore,
      icon: <IconMoreVertical size={12} decorative />,
    }
  );
  return btns;
}
