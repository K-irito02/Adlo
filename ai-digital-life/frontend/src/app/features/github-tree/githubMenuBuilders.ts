import type { CopyDict } from '@i18n';
import type { GitHubCategoryType, GitHubTreeNode } from './types';
import type { MainMenuItem } from './GitHubEntryMenus';

export interface MenuBuilderParams {
  node: GitHubTreeNode;
  categoryType: GitHubCategoryType;
  isPinned: boolean;
  isWorkspaceRoot: boolean;
  isUserFolderRoot: boolean;
  isNestedFolder: boolean;
  folderId: string;
  workspaceId: string | undefined;
  t: CopyDict;
  onRefreshWorkspace: (wsId: string) => void;
  onOpenSettings: (wsId: string) => void;
  onOpenFolderSettings: (folderId: string) => void;
  onDeleteWorkspaceConfig: (wsId: string) => void;
  handleStartRename: (folderId: string, folderName: string) => void;
  clearCiState: () => void;
  gitHubUnpinFolder: (folderId: string) => void;
  gitHubPinFolder: (folderId: string) => void;
  gitHubUnpinWorkspace: (workspaceId: string) => void;
  gitHubPinWorkspace: (workspaceId: string) => void;
  gitHubDeleteFolder: (folderId: string) => void;
  gitHubDeleteFolderConfig: (folderId: string) => void;
  gitHubDeleteFolderConfigRecursive: (folderId: string) => void;
  gitHubDeleteFolderDataRecursive: (folderId: string) => void;
  gitHubDeleteFolderConfigAndDataRecursive: (folderId: string) => void;
  removeWorkspaceFromSidebar: (workspaceId: string) => void;
}

export function buildRefreshMenuItems(params: MenuBuilderParams): MainMenuItem[] {
  const { node, isWorkspaceRoot, workspaceId, t, onRefreshWorkspace, clearCiState } = params;
  const items: MainMenuItem[] = [];

  if (node.workspaceId || isWorkspaceRoot) {
    const wsId = node.workspaceId || workspaceId;
    items.push({
      id: 'refresh',
      label: t.refresh,
      action: () => (wsId ? onRefreshWorkspace(wsId) : clearCiState()),
    });
  } else if (node.nodeType === 'folder') {
    items.push({
      id: 'refresh',
      label: t.refresh,
      action: () => clearCiState(),
    });
  }

  return items;
}

export function buildPinMenuItems(params: MenuBuilderParams): MainMenuItem[] {
  const {
    node,
    isPinned,
    folderId,
    t,
    gitHubUnpinFolder,
    gitHubPinFolder,
    gitHubUnpinWorkspace,
    gitHubPinWorkspace,
  } = params;
  const items: MainMenuItem[] = [];

  if (node.nodeType === 'folder') {
    if (isPinned) {
      items.push({
        id: 'unpin',
        label: t.unpin,
        action: () => gitHubUnpinFolder(folderId),
      });
    } else {
      items.push({
        id: 'pin',
        label: t.pin,
        action: () => gitHubPinFolder(folderId),
      });
    }
  } else if (node.nodeType === 'workspace') {
    if (isPinned) {
      items.push({
        id: 'unpin-workspace',
        label: t.unpin,
        action: () => gitHubUnpinWorkspace(node.workspaceId!),
      });
    } else {
      items.push({
        id: 'pin-workspace',
        label: t.pin,
        action: () => gitHubPinWorkspace(node.workspaceId!),
      });
    }
  }

  return items;
}

export function buildRenameMenuItems(params: MenuBuilderParams): MainMenuItem[] {
  const { node, categoryType, folderId, t, handleStartRename } = params;
  const items: MainMenuItem[] = [];

  if (!(categoryType === 'ci-workspace' && node.nodeType === 'workspace')) {
    if (node.nodeType === 'folder') {
      items.push({
        id: 'rename',
        label: t.rename,
        action: () => handleStartRename(folderId, node.name),
      });
    }
  }

  return items;
}

export function buildSettingsMenuItems(params: MenuBuilderParams): MainMenuItem[] {
  const { node, folderId, t, onOpenSettings, onOpenFolderSettings } = params;
  const items: MainMenuItem[] = [];

  if (node.workspaceId) {
    items.push({
      id: 'settings',
      label: t.settings,
      action: () => onOpenSettings(node.workspaceId!),
    });
  } else if (node.nodeType === 'folder') {
    items.push({
      id: 'settings',
      label: t.settings,
      action: () => onOpenFolderSettings(folderId),
    });
  }

  return items;
}

export function buildHideMenuItems(params: MenuBuilderParams): MainMenuItem[] {
  const { node, workspaceId, t, removeWorkspaceFromSidebar } = params;
  const items: MainMenuItem[] = [];

  if (node.nodeType === 'workspace') {
    items.push({
      id: 'hide-from-area',
      label: t.workspaceRemoveEntry,
      hasHint: true,
      hint: t.workspaceRemoveEntryHint,
      action: () => {
        if (workspaceId) {
          removeWorkspaceFromSidebar(workspaceId);
        }
      },
    });
  }

  return items;
}

export function buildDeleteMenuItems(params: MenuBuilderParams): MainMenuItem[] {
  const {
    node,
    isNestedFolder,
    isUserFolderRoot,
    folderId,
    t,
    onDeleteWorkspaceConfig,
    clearCiState,
    gitHubDeleteFolder,
    gitHubDeleteFolderConfig,
  } = params;
  const items: MainMenuItem[] = [];

  items.push({ id: 'sep-danger', separator: true });

  if (isNestedFolder || isUserFolderRoot) {
    items.push({
      id: 'delete-folder',
      label: t.ciDeleteDir,
      danger: true as const,
      hasHint: true,
      hint: t.ciDeleteDirHint,
      action: () => {
        gitHubDeleteFolder(folderId);
        clearCiState();
      },
    });
  }

  if (node.workspaceId) {
    items.push({
      id: 'delete-config',
      label: t.ciDeleteConfig,
      danger: true as const,
      action: () => onDeleteWorkspaceConfig(node.workspaceId!),
    });
  } else if (node.nodeType === 'folder') {
    items.push({
      id: 'delete-config',
      label: t.ciDeleteConfig,
      danger: true as const,
      action: () => gitHubDeleteFolderConfig(folderId),
    });
  }

  if (node.workspaceId || node.nodeType === 'folder') {
    items.push({
      id: 'delete-data',
      label: t.ciDeleteData,
      danger: true as const,
      action: () => clearCiState(),
    });
  }

  if (node.workspaceId) {
    items.push({
      id: 'delete-config-and-data',
      label: t.ciDeleteConfigAndData,
      danger: true as const,
      action: () => {
        onDeleteWorkspaceConfig(node.workspaceId!);
        clearCiState();
      },
    });
  } else if (node.nodeType === 'folder') {
    items.push({
      id: 'delete-config-and-data',
      label: t.ciDeleteConfigAndData,
      danger: true as const,
      action: () => {
        gitHubDeleteFolderConfig(folderId);
        clearCiState();
      },
    });
  }

  return items;
}

export function buildDeleteRecursiveMenuItems(params: MenuBuilderParams): MainMenuItem[] {
  const {
    node,
    isNestedFolder,
    isUserFolderRoot,
    folderId,
    t,
    gitHubDeleteFolderConfigRecursive,
    gitHubDeleteFolderDataRecursive,
    gitHubDeleteFolderConfigAndDataRecursive,
  } = params;
  const items: MainMenuItem[] = [];

  if (isNestedFolder || isUserFolderRoot || node.nodeType === 'workspace') {
    items.push({ id: 'sep-recursive', separator: true });
    items.push({
      id: 'delete-config-recursive',
      label: t.ciDeleteNestedConfig,
      badge: t.nestedBadge,
      danger: true as const,
      hasHint: true,
      hint: t.ciDeleteNestedConfigHint,
      action: () => {
        gitHubDeleteFolderConfigRecursive(folderId);
      },
    });
    items.push({
      id: 'delete-data-recursive',
      label: t.ciDeleteNestedData,
      badge: t.nestedBadge,
      danger: true as const,
      hasHint: true,
      hint: t.ciDeleteNestedDataHint,
      action: () => {
        gitHubDeleteFolderDataRecursive(folderId);
      },
    });
    items.push({
      id: 'delete-config-and-data-recursive',
      label: t.ciDeleteNestedAll,
      badge: t.nestedBadge,
      danger: true as const,
      hasHint: true,
      hint: t.ciDeleteNestedAllHint,
      action: () => {
        gitHubDeleteFolderConfigAndDataRecursive(folderId);
      },
    });
  }

  return items;
}
