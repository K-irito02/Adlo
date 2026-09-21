/**
 * GitHub Repo 切片辅助函数
 * 工作区配置与 CI 文件夹的落盘形状处理（token 剥离）与纯集合运算。
 * 读写通道（Task 29）：写经 persist()（唯一写通道），读经 hydrateAll()；
 * 本模块不再持有任何去抖写入器与 localStorage 键。
 */
import type { GitWorkspaceCiConfig, GitHubCiFolderState } from './githubRepoSliceTypes';
import { persist } from '../persisted/persist';

/** Strip accessToken for secure localStorage persistence */
export function stripTokenFromConfig(
  config: GitWorkspaceCiConfig,
): Omit<GitWorkspaceCiConfig, 'accessToken'> & { accessToken: null } {
  return { ...config, accessToken: null };
}

export function stripTokenFromFolders(folders: GitHubCiFolderState[]): GitHubCiFolderState[] {
  return folders.map((f) => {
    if (f.ciConfig?.accessToken) {
      return { ...f, ciConfig: { ...f.ciConfig, accessToken: null } };
    }
    return f;
  });
}

export function scheduleWorkspaceConfigsWrite(configs: Record<string, GitWorkspaceCiConfig>): void {
  const stripped: Record<string, ReturnType<typeof stripTokenFromConfig>> = {};
  for (const [id, cfg] of Object.entries(configs)) {
    stripped[id] = stripTokenFromConfig(cfg);
  }
  persist('adl:browser.workspaceConfigs', stripped);
}

export function scheduleFoldersWrite(folders: GitHubCiFolderState[]): void {
  persist('adl:browser.ciFolders', stripTokenFromFolders(folders));
}

/**
 * Collect the given folder id and all of its descendant folder ids
 * (recursively, via `parentId` links). Pure — no store access.
 */
export function collectDescendantFolderIds(
  folders: GitHubCiFolderState[],
  folderId: string,
): Set<string> {
  const idsToDelete = new Set<string>([folderId]);
  const findDescendants = (parentId: string) => {
    for (const f of folders) {
      if (f.parentId === parentId && !idsToDelete.has(f.id)) {
        idsToDelete.add(f.id);
        findDescendants(f.id);
      }
    }
  };
  findDescendants(folderId);
  return idsToDelete;
}

/**
 * Given a set of folder ids, walk each up to its workspace root and collect
 * the affected workspace ids. Pure — no store access.
 */
export function collectAffectedWorkspaceIds(
  folders: GitHubCiFolderState[],
  idsToDelete: Set<string>,
): Set<string> {
  const affectedWorkspaceIds = new Set<string>();
  for (const id of idsToDelete) {
    let currentId: string | null = id;
    while (currentId) {
      const folder = folders.find((f) => f.id === currentId);
      if (!folder) {
        break;
      }
      if (folder.parentType === 'workspace') {
        if (folder.parentId) {
          affectedWorkspaceIds.add(folder.parentId);
        }
        break;
      }
      currentId = folder.parentId ?? null;
    }
  }
  return affectedWorkspaceIds;
}
