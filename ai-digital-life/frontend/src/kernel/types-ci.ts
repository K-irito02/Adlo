// ════════════════════════════════════════════════════════
// CI / GitHub Actions Types
// ════════════════════════════════════════════════════════

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

export interface CiStepSummary {
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
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

export interface CiStatusSnapshot {
  repo: string;
  branch: string;
  latestRun: CiWorkflowRunSummary | null;
  jobs: CiJobSummary[];
  logs: string | null;
  capturedAtMs: number;
  error: string | null;
}
