/**
 * GitHub 切片辅助函数
 * 从 githubSlice.ts 提取的类型、Bridge 检测和 CI 配置持久化逻辑
 */
import type { CiRepoConfig } from '@ai-digital-life/kernel';
import type { DigitalLifeBridge } from '../../../shared/ipc';

const CI_CONFIG_KEY = 'adl-ui:ci-config';
const CI_ACCESS_TOKEN_KEY = 'adl-ui:ci-access-token';
const CI_AUTO_REFRESH_ON_PUSH_KEY = 'adl-ui:ci-auto-refresh-on-push';
const ACTIVE_GITHUB_SECTION_KEY = 'adl-ui:active-github-section';

export type GitHubSection = 'overview' | 'workflows' | 'jobs' | 'logs' | 'settings' | 'help';

export function getBridge(): DigitalLifeBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return (window as unknown as { digitalLife: DigitalLifeBridge | undefined }).digitalLife ?? null;
}

export function isTauriMode(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
}

export async function hydrateCiConfigDefaults(): Promise<{
  config: CiRepoConfig;
  token: string;
  autoRefresh: boolean;
}> {
  const defaultCfg: CiRepoConfig = {
    owner: '',
    repo: '',
    branch: 'main',
    workflowId: null,
    accessToken: null,
  };
  if (typeof window === 'undefined') {
    return {
      config: defaultCfg,
      token: '',
      autoRefresh: true,
    };
  }

  let config: CiRepoConfig = { ...defaultCfg };
  let autoRefresh = true;

  try {
    const rawConfig = window.localStorage.getItem(CI_CONFIG_KEY);
    if (rawConfig) {
      const parsed = JSON.parse(rawConfig);
      if (parsed && typeof parsed === 'object') {
        config = {
          owner: typeof parsed.owner === 'string' ? parsed.owner : '',
          repo: typeof parsed.repo === 'string' ? parsed.repo : '',
          branch: typeof parsed.branch === 'string' ? parsed.branch : 'main',
          workflowId: parsed.workflowId ?? null,
          accessToken: null,
        };
      }
    }
    const rawFlag = window.localStorage.getItem(CI_AUTO_REFRESH_ON_PUSH_KEY);
    if (rawFlag === '0') {
      autoRefresh = false;
    } else if (rawFlag === '1') {
      autoRefresh = true;
    }
  } catch {
    /* ignore */
  }

  let token = '';
  const bridge = getBridge();
  if (
    isTauriMode() &&
    bridge &&
    bridge.github &&
    typeof bridge.github.hasAccessToken === 'function'
  ) {
    try {
      const hasResult = await bridge.github.hasAccessToken();
      if (hasResult && hasResult.ok && hasResult.data) {
        token = '::stored::';
      }
    } catch {
      /* ignore */
    }
  } else if (bridge && bridge.github && typeof bridge.github.hasAccessToken === 'function') {
    try {
      const hasResult = await bridge.github.hasAccessToken();
      if (hasResult && hasResult.ok && hasResult.data) {
        const storedToken = window.localStorage.getItem(CI_ACCESS_TOKEN_KEY);
        token = typeof storedToken === 'string' && storedToken.length > 0 ? storedToken : '';
      }
    } catch {
      /* ignore */
    }
  }

  if (!token && typeof window !== 'undefined') {
    try {
      const storedToken = window.localStorage.getItem(CI_ACCESS_TOKEN_KEY);
      if (typeof storedToken === 'string' && storedToken.length > 0) {
        token = storedToken;
      }
    } catch {
      /* ignore */
    }
  }

  return { config, token, autoRefresh };
}

export async function hydrateCiStatusDefaults(): Promise<{
  activeGitHubSection: GitHubSection;
}> {
  if (typeof window === 'undefined') {
    return { activeGitHubSection: 'overview' };
  }

  let activeGitHubSection: GitHubSection = 'overview';
  try {
    const storedSection = window.localStorage.getItem(ACTIVE_GITHUB_SECTION_KEY);
    if (
      storedSection === 'overview' ||
      storedSection === 'workflows' ||
      storedSection === 'jobs' ||
      storedSection === 'settings' ||
      storedSection === 'help'
    ) {
      activeGitHubSection = storedSection as GitHubSection;
    }
  } catch {
    /* ignore */
  }

  return { activeGitHubSection };
}
