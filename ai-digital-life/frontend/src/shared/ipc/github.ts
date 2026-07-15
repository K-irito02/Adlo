import type { IpcResult } from '@ai-digital-life/kernel';

export type { IpcResult };

/**
 * GitHub/CI 集成桥接能力
 * 用于: 获取 GitHub Actions/CI 运行状态、配置访问令牌、获取作业日志
 * Tauri 命令: ci_* 系列
 * 浏览器模式: 前端本地模拟 (localStorage 存 token)
 */
export interface GitHubBridge {
  /**
   * 获取指定仓库的 CI 运行状态 (需 token)
   * @param config 仓库配置 (owner/repo/branch/workflowId/accessToken)
   * @returns CI 状态快照 (最新运行、作业、错误等)
   * @command ci_get_status
   * @see tauri-bridge.ts → ci.getStatus / github.getStatus
   * @see mock-bridge.ts → ci.getStatus / github.getStatus
   * @see preview-bridge/index.ts → ci.getStatus / github.getStatus
   */
  getStatus: (config: CiRepoConfig) => Promise<IpcResult<CiStatusSnapshot>>;
  /**
   * 获取指定仓库的 CI 运行状态 (无需 token, 公开仓库)
   * @param owner 仓库组织/用户名
   * @param repo 仓库名
   * @param branch 分支名
   * @returns CI 状态快照
   * @command ci_get_status_without_token
   * @see tauri-bridge.ts → ci.getStatusWithoutToken / github.getStatusWithoutToken
   * @see mock-bridge.ts → ci.getStatusWithoutToken / github.getStatusWithoutToken
   * @see preview-bridge/index.ts → ci.getStatusWithoutToken / github.getStatusWithoutToken
   */
  getStatusWithoutToken: (
    owner: string,
    repo: string,
    branch: string
  ) => Promise<IpcResult<CiStatusSnapshot>>;
  /**
   * 保存 GitHub/CI 访问令牌
   * @param token GitHub personal access token
   * @returns 是否成功保存
   * @command ci_set_access_token
   * @see tauri-bridge.ts → ci.setAccessToken / github.setAccessToken
   * @see mock-bridge.ts → ci.setAccessToken / github.setAccessToken
   * @see preview-bridge/index.ts → ci.setAccessToken / github.setAccessToken
   */
  setAccessToken: (token: string) => Promise<IpcResult<boolean>>;
  /**
   * 清除已保存的 GitHub/CI 访问令牌
   * @returns 是否成功清除
   * @command ci_clear_access_token
   * @see tauri-bridge.ts → ci.clearAccessToken / github.clearAccessToken
   * @see mock-bridge.ts → ci.clearAccessToken / github.clearAccessToken
   * @see preview-bridge/index.ts → ci.clearAccessToken / github.clearAccessToken
   */
  clearAccessToken: () => Promise<IpcResult<boolean>>;
  /**
   * 检查是否已配置 GitHub/CI 访问令牌
   * @returns 是否存在有效令牌
   * @command ci_has_access_token
   * @see tauri-bridge.ts → ci.hasAccessToken / github.hasAccessToken
   * @see mock-bridge.ts → ci.hasAccessToken / github.hasAccessToken
   * @see preview-bridge/index.ts → ci.hasAccessToken / github.hasAccessToken
   */
  hasAccessToken: () => Promise<IpcResult<boolean>>;
  /**
   * 获取 CI 运行的作业日志
   * @param config 仓库配置
   * @param runId CI 运行 ID
   * @returns 各作业的日志内容 (key: jobId, value: 日志文本)
   * @command ci_get_job_logs
   * @see tauri-bridge.ts → ci.getJobLogs / github.getJobLogs
   * @see mock-bridge.ts → ci.getJobLogs / github.getJobLogs
   * @see preview-bridge/index.ts → ci.getJobLogs / github.getJobLogs
   */
  getJobLogs: (config: CiRepoConfig, runId: number) => Promise<IpcResult<Record<number, string>>>;
}

export interface CiRepoConfig {
  owner: string;
  repo: string;
  branch: string;
  workflowId?: string | null;
  accessToken?: string | null;
}

export interface CiWorkflowRunSummary {
  runId: number;
  name: string;
  status: string;
  conclusion: string | null;
  headSha: string;
  headBranch: string;
  htmlUrl: string;
  runStartedAt: string | null;
  updatedAt: string | null;
  actor: string | null;
  event: string | null;
}

export interface CiJobSummary {
  jobId: number;
  runId: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  htmlUrl: string | null;
  stepResults: CiStepSummary[];
}

export interface CiStepSummary {
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CiStatusSnapshot {
  repo: string;
  branch: string;
  latestRun: CiWorkflowRunSummary | null;
  jobs: CiJobSummary[];
  logs: string | null;
  capturedAtMs: number;
  error: string | null;
}
