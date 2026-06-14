import type { CopyDict } from '../../i18n';
import type { GitHubCategoryType } from './types';

export const SUB_ENTRY_ICONS: Record<string, React.ReactNode> = {
  overview: (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M2 2h5v5H2V2zm0 7h5v5H2V9zm7-7h5v5H9V2zm0 7h5v5H9V9z" />
    </svg>
  ),
  workflows: (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M8 1a.5.5 0 0 1 .5.5v6h6a.5.5 0 0 1 0 1h-6v6a.5.5 0 0 1-1 0v-6h-6a.5.5 0 0 1 0-1h6v-6A.5.5 0 0 1 8 1z" />
    </svg>
  ),
  jobs: (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7zM3.5 4a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5h-9z" />
      <path d="M4.5 6.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z" />
    </svg>
  ),
  logs: (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm1 3h10v1H3V4zm0 3h10v1H3V7zm0 3h7v1H3v-1z" />
    </svg>
  ),
};

export type ChildMenuItem =
  | {
      id: string;
      label: string;
      danger?: boolean;
      action: () => void;
      hasHint?: boolean;
      hint?: string;
    }
  | {
      id: string;
      separator: true;
    };

export function getChildNodeMoreMenuItems(
  nodeType: string,
  nodePath: string,
  currentName: string,
  categoryType: GitHubCategoryType,
  onRename: (folderId: string, currentName: string) => void,
  onRefresh: () => void,
  onDeleteConfig: () => void,
  onDeleteData: () => void,
  onDeleteConfigAndData: () => void,
  onSettings: () => void,
  onPin: () => void,
  onUnpin: () => void,
  isPinned: boolean,
  onDeleteFolder: () => void,
  showDeleteFolder: boolean,
  t: CopyDict,
  onDeleteConfigRecursive?: () => void,
  onDeleteDataRecursive?: () => void,
  onDeleteConfigAndDataRecursive?: () => void
): Array<ChildMenuItem> {
  if (nodeType !== 'folder') {
    return [];
  }
  const folderId = nodePath.startsWith('github-folder:')
    ? nodePath.slice('github-folder:'.length)
    : '';
  const items: Array<ChildMenuItem> = [
    {
      id: 'refresh',
      label: t.refresh,
      action: onRefresh,
    },
    {
      id: isPinned ? 'unpin' : 'pin',
      label: isPinned ? t.unpin : t.pin,
      action: isPinned ? onUnpin : onPin,
    },
    {
      id: 'rename',
      label: t.rename,
      action: () => onRename(folderId, currentName),
    },
    {
      id: 'settings',
      label: t.settings,
      action: onSettings,
    },
    { id: 'sep-danger', separator: true },
  ];
  if (showDeleteFolder) {
    items.push({
      id: 'delete-folder',
      label: t.ciDeleteDir,
      danger: true as const,
      hasHint: true,
      hint: t.ciDeleteDirHint,
      action: onDeleteFolder,
    });
  }
  items.push(
    {
      id: 'delete-config',
      label: t.ciDeleteConfig,
      danger: true as const,
      action: onDeleteConfig,
    },
    {
      id: 'delete-data',
      label: t.ciDeleteData,
      danger: true as const,
      action: onDeleteData,
    },
    {
      id: 'delete-config-and-data',
      label: t.ciDeleteConfigAndData,
      danger: true as const,
      action: onDeleteConfigAndData,
    }
  );
  if (
    showDeleteFolder &&
    onDeleteConfigRecursive &&
    onDeleteDataRecursive &&
    onDeleteConfigAndDataRecursive
  ) {
    items.push({ id: 'sep-recursive', separator: true });
    items.push({
      id: 'delete-config-recursive',
      label: t.ciDeleteNestedConfig,
      danger: true as const,
      hasHint: true,
      hint: t.ciDeleteNestedConfigHint,
      action: onDeleteConfigRecursive,
    });
    items.push({
      id: 'delete-data-recursive',
      label: t.ciDeleteNestedData,
      danger: true as const,
      hasHint: true,
      hint: t.ciDeleteNestedDataHint,
      action: onDeleteDataRecursive,
    });
    items.push({
      id: 'delete-config-and-data-recursive',
      label: t.ciDeleteNestedAll,
      danger: true as const,
      hasHint: true,
      hint: t.ciDeleteNestedAllHint,
      action: onDeleteConfigAndDataRecursive,
    });
  }
  return items;
}
