/**
 * GitHub Repo 切片辅助函数
 * 从 githubRepoSlice.ts 提取的 localStorage 持久化逻辑
 */
import type { GitWorkspaceCiConfig, GitHubCiFolderState } from './githubRepoSliceTypes';
import { createDebouncedWrite, readJson } from '../shared';

const GH_WORKSPACE_CONFIGS_KEY = 'adl-ui:github-workspace-configs';
const GH_CI_FOLDERS_KEY = 'adl-ui:github-ci-folders';

const { scheduleWrite: schedulePersist } = createDebouncedWrite(300);

/** Strip accessToken for secure localStorage persistence */
export function stripTokenFromConfig(
  config: GitWorkspaceCiConfig
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
  schedulePersist(GH_WORKSPACE_CONFIGS_KEY, stripped);
}

export function scheduleFoldersWrite(folders: GitHubCiFolderState[]): void {
  schedulePersist(GH_CI_FOLDERS_KEY, stripTokenFromFolders(folders));
}

export async function hydrateGitHubConfigs(): Promise<Record<string, GitWorkspaceCiConfig>> {
  const saved = readJson<
    Record<string, Omit<GitWorkspaceCiConfig, 'accessToken'> & { accessToken?: string | null }>
  >(GH_WORKSPACE_CONFIGS_KEY, {});
  const result: Record<string, GitWorkspaceCiConfig> = {};
  for (const [id, cfg] of Object.entries(saved)) {
    if (cfg && typeof cfg === 'object' && cfg.owner) {
      result[id] = {
        owner: cfg.owner,
        repo: cfg.repo,
        branch: cfg.branch ?? 'main',
        workflowId: cfg.workflowId ?? null,
        accessToken: null,
        configured: cfg.configured ?? true,
      };
    }
  }
  return result;
}

export async function hydrateGitHubFolders(): Promise<GitHubCiFolderState[]> {
  const saved = readJson<GitHubCiFolderState[]>(GH_CI_FOLDERS_KEY, []);
  if (!Array.isArray(saved)) {
    return [];
  }
  return saved.map((f) => {
    if (f.ciConfig) {
      return { ...f, ciConfig: { ...f.ciConfig, accessToken: null } };
    }
    return f;
  });
}
