/**
 * GitHub Repo 删除操作纯函数
 * 从 githubRepoSlice.ts 提取的递归删除计算逻辑（无 store 访问、无副作用、无持久化）。
 *
 * 三个递归删除方法（gitHubDeleteFolderConfigRecursive /
 * gitHubDeleteFolderDataRecursive / gitHubDeleteFolderConfigAndDataRecursive）
 * 共享同一组后代 ID 与受影响工作区 ID 计算，统一由本模块的
 * `computeFolderDeleteOutcome` 提供。
 *
 * Slice 仅负责调用 set() 与 scheduleFoldersWrite()；本模块只接收状态切片与参数，
 * 返回计算结果，便于 slice 决定持久化范围。
 */
import type { GitHubCiFolderState } from './githubRepoSliceTypes';
import { collectDescendantFolderIds, collectAffectedWorkspaceIds } from './githubRepoSliceHelpers';

/** Computed outcome of a recursive folder delete operation. */
export interface FolderDeleteOutcome {
  /**
   * Set of folder ids that would be affected by the recursive delete
   * (the target folder + all descendants).
   */
  idsToDelete: Set<string>;
  /**
   * Whether CI data (ciSnapshot / ciJobs / ciError) should be cleared.
   * True when no workspaces are affected OR the active CI workspace is
   * among the affected workspaces.
   */
  shouldClearCiData: boolean;
}

/**
 * Compute the outcome of recursively deleting a folder's config/data.
 *
 * Pure: does not touch the store, call any persistence layer, or generate
 * non-deterministic values. The slice is responsible for translating the
 * returned `idsToDelete` / `shouldClearCiData` into actual state mutations
 * (clearing ciConfig on folders, clearing CI snapshot/jobs/error) and
 * triggering persistence.
 *
 * @param folders Current gitHubCiFolders array
 * @param folderId Target folder id (root of the recursive delete)
 * @param activeCiWorkspaceId Currently active CI workspace id (or null)
 */
export function computeFolderDeleteOutcome(
  folders: GitHubCiFolderState[],
  folderId: string,
  activeCiWorkspaceId: string | null,
): FolderDeleteOutcome {
  const idsToDelete = collectDescendantFolderIds(folders, folderId);
  const affectedWorkspaceIds = collectAffectedWorkspaceIds(folders, idsToDelete);
  const shouldClearCiData =
    affectedWorkspaceIds.size === 0 ||
    (activeCiWorkspaceId != null && affectedWorkspaceIds.has(activeCiWorkspaceId));
  return { idsToDelete, shouldClearCiData };
}
