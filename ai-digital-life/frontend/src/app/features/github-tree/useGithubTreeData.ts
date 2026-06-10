import { useMemo } from 'react';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type {
  GitWorkspaceCiConfig,
  GitHubCiFolderState,
} from '../../stores/slices/communicateSlice';
import type { GitHubCategoryState, GitHubTreeNode } from './types';

const DEFAULT_SUB_ENTRIES = [
  { id: 'overview', name: 'Overview', pathSuffix: 'overview' },
  { id: 'workflows', name: 'Workflows', pathSuffix: 'workflows' },
  { id: 'jobs', name: 'Jobs', pathSuffix: 'jobs' },
  { id: 'logs', name: 'Logs', pathSuffix: 'logs' },
] as const;

function buildSubEntryNodes(prefix: string, wsId: string | undefined): GitHubTreeNode[] {
  return DEFAULT_SUB_ENTRIES.map((entry) => ({
    path: `${prefix}:${entry.pathSuffix}`,
    name: entry.name,
    kind: 'file' as const,
    children: [],
    nodeType: entry.id as GitHubTreeNode['nodeType'],
    workspaceId: wsId,
  }));
}

function buildCiFolderNode(
  folder: GitHubCiFolderState,
  allFolders: GitHubCiFolderState[]
): GitHubTreeNode {
  const childFolders = allFolders.filter(
    (f) => f.parentId === folder.id && (!f.parentType || f.parentType === 'folder')
  );
  const folderChildren = childFolders.map((child) => buildCiFolderNode(child, allFolders));

  return {
    path: `github-folder:${folder.id}`,
    name: folder.name,
    kind: 'directory' as const,
    children: [...folderChildren, ...buildSubEntryNodes(`github-folder:${folder.id}`, undefined)],
    nodeType: 'folder' as const,
  };
}

function buildRootUserFolderNodes(folders: GitHubCiFolderState[]): GitHubTreeNode[] {
  const rootFolders = folders.filter((f) => !f.parentId && f.parentType !== 'workspace');
  return rootFolders.map((folder) => buildCiFolderNode(folder, folders));
}

function buildWorkspaceChildFolders(
  wsId: string,
  allFolders: GitHubCiFolderState[]
): GitHubTreeNode[] {
  const wsFolders = allFolders.filter((f) => f.parentType === 'workspace' && f.parentId === wsId);
  return wsFolders.map((folder) => buildCiFolderNode(folder, allFolders));
}

export interface UseGithubTreeDataResult {
  ciWorkspaceCategory: GitHubCategoryState;
  userFolderCategory: GitHubCategoryState;
}

export function useGithubTreeData(
  workspaces: RecentWorkspaceEntry[],
  gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig>,
  gitHubCiFolders: GitHubCiFolderState[],
  labels: {
    ciWorkspaceCategory: string;
    userFolderCategory: string;
  }
): UseGithubTreeDataResult {
  const ciWorkspaceNodes = useMemo(
    () =>
      workspaces.map((ws) => {
        const config = gitHubWorkspaceConfigs[ws.id];
        const folderChildren = buildWorkspaceChildFolders(ws.id, gitHubCiFolders);
        return {
          path: `github-workspace:${ws.id}`,
          name: ws.name || ws.path,
          kind: 'directory' as const,
          children: [...folderChildren, ...buildSubEntryNodes(`github-workspace:${ws.id}`, ws.id)],
          nodeType: 'workspace' as const,
          workspaceId: ws.id,
          config,
        };
      }),
    [workspaces, gitHubWorkspaceConfigs, gitHubCiFolders]
  );

  const ciWorkspaceCategory: GitHubCategoryState = useMemo(
    () => ({
      id: 'ci-workspace',
      label: labels.ciWorkspaceCategory,
      isExpanded: true,
      isPermanent: false,
      nodes: ciWorkspaceNodes,
    }),
    [ciWorkspaceNodes, labels.ciWorkspaceCategory]
  );

  const userFolderNodes = useMemo(
    () => buildRootUserFolderNodes(gitHubCiFolders),
    [gitHubCiFolders]
  );

  const userFolderCategory: GitHubCategoryState = useMemo(
    () => ({
      id: 'user-folder',
      label: labels.userFolderCategory,
      isExpanded: true,
      isPermanent: false,
      nodes: userFolderNodes,
    }),
    [userFolderNodes, labels.userFolderCategory]
  );

  return { ciWorkspaceCategory, userFolderCategory };
}
