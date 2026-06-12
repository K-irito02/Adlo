import { useMemo } from 'react';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { GitWorkspaceCiConfig, GitHubCiFolderState } from '../../stores/slices/githubCiConfigSlice';
import type { GitHubCategoryState, GitHubTreeNode } from './types';

const SUB_ENTRY_DEFS = [
  { id: 'overview', pathSuffix: 'overview' },
  { id: 'workflows', pathSuffix: 'workflows' },
  { id: 'jobs', pathSuffix: 'jobs' },
  { id: 'logs', pathSuffix: 'logs' },
] as const;

export interface SubEntryLabels {
  ciOverview: string;
  ciWorkflows: string;
  ciJobs: string;
  ciLogs: string;
}

function buildSubEntryNodes(
  prefix: string,
  wsId: string | undefined,
  subEntryLabels: SubEntryLabels
): GitHubTreeNode[] {
  const labelMap: Record<string, string> = {
    overview: subEntryLabels.ciOverview,
    workflows: subEntryLabels.ciWorkflows,
    jobs: subEntryLabels.ciJobs,
    logs: subEntryLabels.ciLogs,
  };
  return SUB_ENTRY_DEFS.map((entry) => ({
    path: `${prefix}:${entry.pathSuffix}`,
    name: labelMap[entry.id],
    kind: 'file' as const,
    children: [],
    nodeType: entry.id as GitHubTreeNode['nodeType'],
    workspaceId: wsId,
  }));
}

function sortWorkspacesByPinOrder(workspaces: RecentWorkspaceEntry[]): RecentWorkspaceEntry[] {
  return [...workspaces].sort((a, b) => {
    if (a.isPinned && !b.isPinned) {
      return -1;
    }
    if (!a.isPinned && b.isPinned) {
      return 1;
    }
    if (a.isPinned && b.isPinned) {
      return (a.pinnedOrder || 0) - (b.pinnedOrder || 0);
    }
    return 0;
  });
}

function sortFoldersByPinOrder(folders: GitHubCiFolderState[]): GitHubCiFolderState[] {
  return [...folders].sort((a, b) => {
    const aPinned = a.pinnedOrder !== undefined;
    const bPinned = b.pinnedOrder !== undefined;
    if (aPinned && !bPinned) {
      return -1;
    }
    if (!aPinned && bPinned) {
      return 1;
    }
    if (aPinned && bPinned) {
      return (a.pinnedOrder || 0) - (b.pinnedOrder || 0);
    }
    return a.createdAt - b.createdAt;
  });
}

function buildCiFolderNode(
  folder: GitHubCiFolderState,
  allFolders: GitHubCiFolderState[],
  subEntryLabels: SubEntryLabels
): GitHubTreeNode {
  const childFolders = sortFoldersByPinOrder(
    allFolders.filter(
      (f) => f.parentId === folder.id && (!f.parentType || f.parentType === 'folder')
    )
  );
  const folderChildren = childFolders.map((child) =>
    buildCiFolderNode(child, allFolders, subEntryLabels)
  );

  return {
    path: `github-folder:${folder.id}`,
    name: folder.name,
    kind: 'directory' as const,
    children: [
      ...buildSubEntryNodes(`github-folder:${folder.id}`, undefined, subEntryLabels),
      ...folderChildren,
    ],
    nodeType: 'folder' as const,
  };
}

function buildRootUserFolderNodes(
  folders: GitHubCiFolderState[],
  subEntryLabels: SubEntryLabels
): GitHubTreeNode[] {
  const rootFolders = sortFoldersByPinOrder(
    folders.filter((f) => !f.parentId && f.parentType !== 'workspace')
  );
  return rootFolders.map((folder) => buildCiFolderNode(folder, folders, subEntryLabels));
}

function buildWorkspaceChildFolders(
  wsId: string,
  allFolders: GitHubCiFolderState[],
  subEntryLabels: SubEntryLabels
): GitHubTreeNode[] {
  const wsFolders = sortFoldersByPinOrder(
    allFolders.filter((f) => f.parentType === 'workspace' && f.parentId === wsId)
  );
  return wsFolders.map((folder) => buildCiFolderNode(folder, allFolders, subEntryLabels));
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
  } & SubEntryLabels
): UseGithubTreeDataResult {
  const subEntryLabels = useMemo<SubEntryLabels>(
    () => ({
      ciOverview: labels.ciOverview,
      ciWorkflows: labels.ciWorkflows,
      ciJobs: labels.ciJobs,
      ciLogs: labels.ciLogs,
    }),
    [labels.ciOverview, labels.ciWorkflows, labels.ciJobs, labels.ciLogs]
  );

  const ciWorkspaceNodes = useMemo(
    () =>
      sortWorkspacesByPinOrder(workspaces).map((ws) => {
        const config = gitHubWorkspaceConfigs[ws.id];
        const folderChildren = buildWorkspaceChildFolders(ws.id, gitHubCiFolders, subEntryLabels);
        return {
          path: `github-workspace:${ws.id}`,
          name: ws.name || ws.path,
          kind: 'directory' as const,
          children: [
            ...buildSubEntryNodes(`github-workspace:${ws.id}`, ws.id, subEntryLabels),
            ...folderChildren,
          ],
          nodeType: 'workspace' as const,
          workspaceId: ws.id,
          config,
        };
      }),
    [workspaces, gitHubWorkspaceConfigs, gitHubCiFolders, subEntryLabels]
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
    () => buildRootUserFolderNodes(gitHubCiFolders, subEntryLabels),
    [gitHubCiFolders, subEntryLabels]
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
