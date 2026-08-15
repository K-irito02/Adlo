import React from 'react';
import { IconPlus, IconMoreVertical } from '@icons';
import type { BrowserTreeNode, BrowserCategoryType } from './types';
import type { SectionCallbacks } from './BrowserCategorySection';
import type { CopyDict } from '@i18n';

export type FlatItem =
  | { type: 'tab'; node: BrowserTreeNode }
  | { type: 'separator'; label: string };

export function buildFlatTabItems(
  node: BrowserTreeNode,
  showSeparators: boolean,
  filterTabIds?: Set<string>,
): FlatItem[] {
  const items: FlatItem[] = [];

  for (const child of node.children) {
    if (child.kind === 'file') {
      if (!filterTabIds || (child.tabId && filterTabIds.has(child.tabId))) {
        items.push({ type: 'tab', node: child });
      }
    }
  }

  for (const dir of node.children) {
    if (dir.kind !== 'directory') {
      continue;
    }
    const subItems = collectSubDirItems(dir, dir.name, showSeparators, filterTabIds);
    if (subItems.length > 0) {
      const hasDirectTabs = dir.children.some(
        (c) => c.kind === 'file' && (!filterTabIds || (c.tabId && filterTabIds.has(c.tabId))),
      );
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
  filterTabIds?: Set<string>,
): FlatItem[] {
  const items: FlatItem[] = [];

  for (const child of dir.children) {
    if (child.kind === 'file') {
      if (!filterTabIds || (child.tabId && filterTabIds.has(child.tabId))) {
        items.push({ type: 'tab', node: child });
      }
    }
  }

  for (const subDir of dir.children) {
    if (subDir.kind !== 'directory') {
      continue;
    }
    const childPath = `${pathSoFar}/${subDir.name}`;
    const deeper = collectSubDirItems(subDir, childPath, showSeparators, filterTabIds);
    if (deeper.length > 0) {
      const hasDirectTabs = subDir.children.some(
        (c) => c.kind === 'file' && (!filterTabIds || (c.tabId && filterTabIds.has(c.tabId))),
      );
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
  if (categoryType === 'history' || (nodeType !== 'workspace' && nodeType !== 'folder')) {
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
): { id: string; label: string; danger?: boolean; hint?: string; action: () => void }[] {
  if (categoryType === 'history') {
    return [
      {
        id: 'delete-history-label',
        label: t.browserContextDeleteAllHistory,
        danger: true,
        hint: t.browserDeleteHistoryLabelHint,
        action: () => callbacks.onDeleteHistory('label', nodePath),
      },
      {
        id: 'delete-history-year',
        label: t.browserDeleteHistoryYearLabel,
        danger: true,
        hint: t.browserDeleteHistoryYearHint,
        action: () => callbacks.onDeleteHistory('year', nodePath),
      },
      {
        id: 'delete-history-month',
        label: t.browserDeleteHistoryMonthLabel,
        danger: true,
        hint: t.browserDeleteHistoryMonthHint,
        action: () => callbacks.onDeleteHistory('month', nodePath),
      },
      {
        id: 'delete-history-day',
        label: t.browserDeleteHistoryDayLabel,
        danger: true,
        hint: t.browserDeleteHistoryDayHint,
        action: () => callbacks.onDeleteHistory('day', nodePath),
      },
    ];
  }

  const items: {
    id: string;
    label: string;
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

  if (nodeType === 'workspace') {
    const wsId = nodePath.startsWith('workspace:') ? nodePath.slice('workspace:'.length) : '';
    items.push({
      id: 'remove-from-area',
      label: t.browserContextRemoveFromView,
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
