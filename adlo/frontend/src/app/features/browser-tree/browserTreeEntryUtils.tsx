import React from 'react';
import { IconDelete, IconMoreVertical, IconPlus } from '@icons';
import type { BrowserTreeNode, BrowserCategoryType } from './types';
import type { SectionCallbacks } from './BrowserCategorySection';
import type { CopyDict } from '@i18n';

export type FlatItem =
  | { type: 'tab'; node: BrowserTreeNode }
  | { type: 'separator'; label: string };

export function buildFlatTabItems(node: BrowserTreeNode, showSeparators: boolean): FlatItem[] {
  const items: FlatItem[] = [];

  for (const child of node.children) {
    if (child.kind === 'file') {
      items.push({ type: 'tab', node: child });
    }
  }

  for (const dir of node.children) {
    if (dir.kind !== 'directory') {
      continue;
    }
    const subItems = collectSubDirItems(dir, dir.name, showSeparators);
    if (subItems.length > 0) {
      const hasDirectTabs = dir.children.some((c) => c.kind === 'file');
      if (showSeparators && hasDirectTabs) {
        items.push({ type: 'separator', label: dir.name });
      }
      items.push(...subItems);
    }
  }

  return items;
}

export function collectSubDirItems(
  dir: BrowserTreeNode,
  pathSoFar: string,
  showSeparators: boolean,
): FlatItem[] {
  const items: FlatItem[] = [];

  for (const child of dir.children) {
    if (child.kind === 'file') {
      items.push({ type: 'tab', node: child });
    }
  }

  for (const subDir of dir.children) {
    if (subDir.kind !== 'directory') {
      continue;
    }
    const childPath = `${pathSoFar}/${subDir.name}`;
    const deeper = collectSubDirItems(subDir, childPath, showSeparators);
    if (deeper.length > 0) {
      const hasDirectTabs = subDir.children.some((c) => c.kind === 'file');
      if (showSeparators && hasDirectTabs) {
        items.push({ type: 'separator', label: childPath });
      }
      items.push(...deeper);
    }
  }

  return items;
}

export function getEntryHoverButtons(
  nodeType: string,
  categoryType: BrowserCategoryType,
  t: CopyDict,
): { id: string; label: string; icon: React.ReactNode }[] {
  if (categoryType === 'history') {
    // 历史记录顶层：只保留「删除全部历史记录」；右键菜单已取消。
    if (nodeType === 'history') {
      return [
        {
          id: 'delete-history-label',
          label: t.browserContextDeleteAllHistory,
          icon: <IconDelete size={12} decorative />,
        },
      ];
    }
    return [];
  }
  if (nodeType !== 'workspace' && nodeType !== 'folder') {
    return [
      {
        id: 'more',
        label: t.browserContextMore,
        icon: <IconMoreVertical size={12} decorative />,
      },
    ];
  }
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

export function getEntryMoreMenuItems(
  nodeType: string,
  categoryType: BrowserCategoryType,
  nodePath: string,
  callbacks: SectionCallbacks,
  t: CopyDict,
): {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  danger?: boolean;
  hint?: string;
  action: () => void;
}[] {
  if (categoryType === 'history') {
    // 本函数对 history 返回空数组；删除入口由悬停图标按钮提供（顶层删除全部、年/月/日删除目录）。
    return [];
  }

  const items: {
    id: string;
    label: string;
    icon?: React.ReactNode;
    badge?: string;
    danger?: boolean;
    hint?: string;
    action: () => void;
  }[] = [];
  if (nodeType === 'workspace' || nodeType === 'folder') {
    items.push({
      id: 'create-bookmark',
      label: t.browserContextCreateBookmark,
      action: () => {
        const wsId = nodePath.startsWith('workspace:') ? nodePath.slice('workspace:'.length) : '';
        const folderId = nodePath.startsWith('folder:') ? nodePath.slice('folder:'.length) : '';
        callbacks.onCreateTab(wsId || undefined, folderId || undefined);
      },
    });
  }
  items.push({
    id: 'open-all-tabs',
    label: t.browserContextOpenAllNewTabs,
    action: () => callbacks.onOpenAllInNewTabs(categoryType, nodePath),
  });

  items.push({
    id: 'open-all-center',
    label: t.centerTabOpenAllInCenter,
    action: () => callbacks.onOpenAllInCenter?.(categoryType, nodePath),
  });

  if (nodeType === 'workspace') {
    const wsId = nodePath.startsWith('workspace:') ? nodePath.slice('workspace:'.length) : '';
    items.push({
      id: 'remove-from-area',
      label: t.workspaceRemoveEntry,
      hint: t.workspaceRemoveEntryHint,
      action: () => callbacks.onRemoveFromArea(wsId),
    });
  }

  if (nodeType === 'folder' && categoryType === 'userFolder') {
    const folderId = nodePath.startsWith('folder:') ? nodePath.slice('folder:'.length) : '';
    items.push({
      id: 'rename',
      label: t.browserContextRename,
      action: () => callbacks.onRenameDirectory(folderId),
    });
  }

  items.push({
    id: 'delete-all-tabs',
    label: t.browserContextDeleteAllTabs,
    badge: t.nestedBadge,
    danger: true,
    hint: t.browserDeleteAllTabsHint,
    action: () => callbacks.onDeleteAllChildTabs(categoryType, nodePath),
  });

  items.push({
    id: 'delete-self-tabs',
    label: t.browserContextDeleteSelfTabs,
    danger: true,
    hint: t.browserDeleteSelfTabsHint,
    action: () => callbacks.onDeleteOwnChildTabs(categoryType, nodePath),
  });

  if (nodeType === 'folder' && categoryType === 'userFolder') {
    const folderId = nodePath.startsWith('folder:') ? nodePath.slice('folder:'.length) : '';
    items.push({
      id: 'delete-this-dir',
      label: t.browserContextDeleteDir,
      danger: true,
      hint: t.browserDeleteDirHint,
      action: () => callbacks.onDeleteDirectory(folderId),
    });
  }

  return items;
}
