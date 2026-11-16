import React from 'react';
import { IconClose, IconPlus, IconDelete, IconMoreVertical, IconRefreshCw } from '@icons';
import type { BrowserTreeNode, BrowserCategoryType } from './types';
import type { SectionCallbacks } from './BrowserCategorySection';
import type { CopyDict } from '@i18n';
import { useAppStore } from '@stores/slicedStore';
import { isUrlBookmarked } from '@utils/browserDisplayUtils';

/**
 * 叶子行类型：背后可能有活标签页（tab）、来自历史（history），或只是一条书签
 * （bookmark，外部导入 / 新建书签「仅保存」/ 标签页已关闭）。三者共用同一套
 * 行级菜单与悬停动作；书签不再因为没有活标签页而被静默禁用。
 */
export function isLeafBrowserNodeType(nodeType: string): boolean {
  return nodeType === 'tab' || nodeType === 'history' || nodeType === 'bookmark';
}

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
}

export function getChildNodeHoverButtons(
  nodeType: string,
  categoryType: BrowserCategoryType,
  t: CopyDict,
): { id: string; label: string; icon: React.ReactNode }[] {
  if (categoryType === 'history') {
    if (nodeType === 'day') {
      return [
        {
          id: 'delete-self-tabs',
          label: t.browserContextDeleteSelfTabs,
          icon: <IconDelete size={12} decorative />,
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
        id: 'create-bookmark',
        label: t.browserContextCreateBookmark,
        icon: <IconPlus size={12} decorative />,
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

export function getChildNodeMoreMenuItems(
  nodeType: string,
  categoryType: BrowserCategoryType,
  nodePath: string,
  callbacks: SectionCallbacks,
  t: CopyDict,
  workspaceId?: string,
): {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  danger?: boolean;
  hint?: string;
  action: () => void;
}[] {
  if (categoryType === 'history' && nodeType === 'day') {
    return [
      {
        id: 'open-all-tabs',
        label: t.browserContextOpenAllNewTabs,
        action: () => callbacks.onOpenAllInNewTabs(categoryType, nodePath),
      },
      {
        id: 'open-all-center',
        label: t.centerTabOpenAllInCenter,
        action: () => callbacks.onOpenAllInCenter?.(categoryType, nodePath),
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
        id: 'create-bookmark',
        label: t.browserContextCreateBookmark,
        action: () => callbacks.onCreateTab(workspaceId, folderId || undefined),
      },
      {
        id: 'open-all-tabs',
        label: t.browserContextOpenAllNewTabs,
        action: () => callbacks.onOpenAllInNewTabs(categoryType, nodePath),
      },
      {
        id: 'open-all-center',
        label: t.centerTabOpenAllInCenter,
        action: () => callbacks.onOpenAllInCenter?.(categoryType, nodePath),
      },
      {
        id: 'rename',
        label: t.browserContextRename,
        action: () => callbacks.onRenameDirectory(folderId),
      },
      {
        id: 'delete-all-tabs',
        label: t.browserContextDeleteAllTabs,
        badge: t.nestedBadge,
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

function handleBookmarkToggle(url: string, title: string, bookmarkId?: string): void {
  if (!url) {
    return;
  }
  const state = useAppStore.getState();
  // 收藏身份只看 URL：导入/仅保存条目的标题与页面标题不同，按元组判断会重复收藏。
  if (isUrlBookmarked(state.browserBookmarks, url)) {
    state.browserRemoveBookmarksForUrl(url);
  } else {
    state.browserSetPendingBookmark({ url, title, bookmarkId: bookmarkId || undefined });
  }
}

export function getTabContextMenuItems(
  node: BrowserTreeNode,
  callbacks: SectionCallbacks,
  t: CopyDict,
  isBookmarked: boolean,
): {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  danger?: boolean;
  hint?: string;
  action: () => void;
}[] {
  return [
    {
      id: 'open-current',
      label: t.browserContextOpenCurrent,
      action: () => {
        if (node.url) {
          callbacks.onOpenTabInCurrentTab(node.url);
        }
      },
    },
    {
      id: 'open-new',
      label: t.browserContextOpenNewTab,
      action: () => {
        if (node.url) {
          callbacks.onOpenTabInNewTab(node.url, node.isSavedBookmark ? undefined : node.name);
        }
      },
    },
    {
      id: 'open-center',
      label: t.centerTabOpenInCenter,
      action: () => {
        if (node.url) {
          callbacks.onOpenInCenter?.(node.url, node.isSavedBookmark ? undefined : node.name);
        }
      },
    },
    {
      id: 'refresh',
      label: t.browserRefreshMeta,
      hint: t.browserRefreshMetaHint,
      action: () => {
        if (node.url) {
          callbacks.onRefreshTab(node.tabId, node.url);
        }
      },
    },
    {
      id: 'edit',
      label: t.browserContextEdit,
      action: () => {
        if (node.url) {
          callbacks.onEditTab(node.bookmarkId ?? node.tabId ?? '', node.name, node.url);
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
      // 书签行本身就是一条收藏：文案恒为「取消收藏」，动作只移除当前条目
      // （与删除一致）。不能按 URL 级清理，否则会静默删掉其它目录的副本。
      label:
        (node.isSavedBookmark && node.bookmarkId) || isBookmarked
          ? t.browserUnbookmark
          : t.browserBookmark,
      action: () => {
        if (node.isSavedBookmark && node.bookmarkId) {
          callbacks.onRemoveBookmarkTab?.(node.bookmarkId, node.url || '');
          return;
        }
        handleBookmarkToggle(node.url || '', node.name, node.bookmarkId);
      },
    },
    {
      id: 'delete',
      label: t.browserContextDelete,
      danger: true,
      action: () => {
        if (!node.url) {
          return;
        }
        if (node.isSavedBookmark) {
          callbacks.onRemoveBookmarkTab?.(node.bookmarkId ?? '', node.url);
        } else if (node.tabId) {
          callbacks.onDeleteTab(node.tabId, node.url);
        }
      },
    },
  ];
}

export function getTabHoverButtons(
  t: CopyDict,
  showClose: boolean,
): { id: string; label: string; icon: React.ReactNode; isClose?: boolean }[] {
  const btns: { id: string; label: string; icon: React.ReactNode; isClose?: boolean }[] = [];
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
    },
  );
  return btns;
}
