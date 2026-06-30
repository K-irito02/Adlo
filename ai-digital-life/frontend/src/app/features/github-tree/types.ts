import type { GitWorkspaceCiConfig } from '@stores/slices/githubRepoSlice';

export type GitHubCategoryType = 'ci-workspace' | 'user-folder';

export type GitHubNodeType = 'workspace' | 'folder' | 'overview' | 'workflows' | 'jobs' | 'logs';

export interface GitHubTreeNode {
  path: string;
  name: string;
  kind: 'directory' | 'file';
  children: GitHubTreeNode[];
  nodeType: GitHubNodeType;
  workspaceId?: string;
  config?: GitWorkspaceCiConfig;
}

export interface GitHubCategoryState {
  id: GitHubCategoryType;
  label: string;
  isExpanded: boolean;
  isPermanent: boolean;
  nodes: GitHubTreeNode[];
}
