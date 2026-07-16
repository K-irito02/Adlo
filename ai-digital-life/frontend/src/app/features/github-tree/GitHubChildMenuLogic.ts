import type { CopyDict } from '@i18n';
import type { GitHubCategoryType, GitHubTreeNode } from './types';
import type { SectionCallbacks } from './GitHubCategorySection';
import { getChildNodeMoreMenuItems } from './GitHubEntryMenus';
import type { ChildMenuItem } from '../tree/treeEntryMenus';

export interface ChildMenuContext {
  childFolderId: string;
  childIsPinned: boolean;
  isWorkspaceChild: boolean;
  isUserFolderChild: boolean;
  isUserFolderRoot: boolean;
  showDeleteFolder: boolean;
}

export function getChildMenuContext(
  child: GitHubTreeNode,
  pinnedFolderIds: Set<string>,
  workspaceId: string | undefined
): ChildMenuContext {
  const childFolderId = child.path.startsWith('github-folder:')
    ? child.path.slice('github-folder:'.length)
    : '';
  const childIsPinned = pinnedFolderIds.has(childFolderId);
  const isWorkspaceChild = child.nodeType === 'folder' && !!workspaceId;
  const isUserFolderChild = child.nodeType === 'folder' && !workspaceId && child.path.includes('/');
  const isUserFolderRoot = child.nodeType === 'folder' && !workspaceId && !child.path.includes('/');
  const showDeleteFolder = isWorkspaceChild || isUserFolderChild || isUserFolderRoot;
  return {
    childFolderId,
    childIsPinned,
    isWorkspaceChild,
    isUserFolderChild,
    isUserFolderRoot,
    showDeleteFolder,
  };
}

export interface BuildChildFolderMenuItemsParams {
  child: GitHubTreeNode;
  name: string;
  categoryType: GitHubCategoryType;
  workspaceId: string | undefined;
  pinnedFolderIds: Set<string>;
  t: CopyDict;
  onStartRename: (folderId: string, currentName: string) => void;
  clearCiState: () => void;
  callbacks: SectionCallbacks;
  gitHubDeleteFolderConfig: (folderId: string) => void;
  gitHubDeleteFolderConfigRecursive: (folderId: string) => void;
  gitHubDeleteFolderDataRecursive: (folderId: string) => void;
  gitHubDeleteFolderConfigAndDataRecursive: (folderId: string) => void;
  gitHubDeleteFolder: (folderId: string) => void;
  gitHubPinFolder: (folderId: string) => void;
  gitHubUnpinFolder: (folderId: string) => void;
}

export function buildChildFolderMenuItems(
  params: BuildChildFolderMenuItemsParams
): Array<ChildMenuItem> {
  const ctx = getChildMenuContext(params.child, params.pinnedFolderIds, params.workspaceId);
  const childFolderId = ctx.childFolderId;
  return getChildNodeMoreMenuItems(
    params.child.nodeType,
    params.child.path,
    params.name,
    params.categoryType,
    params.onStartRename,
    () => params.clearCiState(),
    () => {
      if (params.workspaceId) {
        params.callbacks.onDeleteWorkspaceConfig(params.workspaceId);
        return;
      }
      params.gitHubDeleteFolderConfig(childFolderId);
    },
    () => params.clearCiState(),
    () => {
      if (params.workspaceId) {
        params.callbacks.onDeleteWorkspaceConfig(params.workspaceId);
        params.clearCiState();
        return;
      }
      params.gitHubDeleteFolderConfig(childFolderId);
      params.clearCiState();
    },
    () => {
      if (params.workspaceId) {
        params.callbacks.onOpenSettings(params.workspaceId);
        return;
      }
      params.callbacks.onOpenFolderSettings(childFolderId);
    },
    () => params.gitHubPinFolder(childFolderId),
    () => params.gitHubUnpinFolder(childFolderId),
    ctx.childIsPinned,
    () => {
      params.gitHubDeleteFolder(childFolderId);
      params.clearCiState();
    },
    ctx.showDeleteFolder,
    params.t,
    () => params.gitHubDeleteFolderConfigRecursive(childFolderId),
    () => params.gitHubDeleteFolderDataRecursive(childFolderId),
    () => params.gitHubDeleteFolderConfigAndDataRecursive(childFolderId)
  );
}
