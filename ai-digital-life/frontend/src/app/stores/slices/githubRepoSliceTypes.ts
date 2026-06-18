/**
 * GitHub Repo 切片类型定义
 * 从 githubRepoSlice.ts 提取，供 githubRepoSlice.ts 和消费者使用
 */

/** Per-workspace CI configuration */
export interface GitWorkspaceCiConfig {
  owner: string;
  repo: string;
  branch: string;
  workflowId: string | null;
  accessToken: string | null;
  /** Whether this workspace has been configured */
  configured: boolean;
}

export interface GitHubCiFolderState {
  id: string;
  name: string;
  createdAt: number;
  parentId?: string;
  parentType?: 'workspace' | 'folder';
  /** Optional CI configuration for this folder */
  ciConfig?: GitWorkspaceCiConfig;
  /** Pin order within siblings (smaller number = higher priority, undefined = not pinned) */
  pinnedOrder?: number;
}
