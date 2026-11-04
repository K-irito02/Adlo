import type { CiStatusSnapshot, CiJobSummary } from '../../src/kernel/index';

interface CiWorkflowRunRaw {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  head_branch: string;
  html_url: string;
  run_started_at: string | null;
  updated_at: string | null;
  event: string | null;
  actor: { login: string } | null;
}

interface CiJobsResponse {
  total_count: number;
  jobs: Array<{
    id: number;
    run_id: number;
    name: string;
    status: string;
    conclusion: string | null;
    started_at: string | null;
    completed_at: string | null;
    html_url: string | null;
    steps?: Array<{
      name: string;
      status: string;
      conclusion: string | null;
      started_at: string | null;
      completed_at: string | null;
    }>;
  }>;
}

function buildEmptySnapshot(
  owner: string,
  repo: string,
  branch: string,
  error: string | null,
): CiStatusSnapshot {
  return {
    repo: `${owner}/${repo}`,
    branch,
    latestRun: null,
    jobs: [],
    logs: null,
    capturedAtMs: Date.now(),
    error,
  };
}

export async function fetchCiStatus(
  owner: string,
  repo: string,
  branch: string,
  token: string,
): Promise<CiStatusSnapshot> {
  const apiBase = 'https://api.github.com';
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'adlo-dev-server',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const runsUrl = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1&page=1`;
    const runsResponse = await fetch(runsUrl, { headers });
    if (!runsResponse.ok) {
      return buildEmptySnapshot(owner, repo, branch, `GitHub API ${runsResponse.status}`);
    }
    const runsData = (await runsResponse.json()) as {
      total_count: number;
      workflow_runs: CiWorkflowRunRaw[];
    };
    const run = runsData.workflow_runs?.[0];
    if (!run) {
      return buildEmptySnapshot(owner, repo, branch, null);
    }

    let jobs: CiJobSummary[] = [];
    try {
      const jobsUrl = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${run.id}/jobs?per_page=100`;
      const jobsResponse = await fetch(jobsUrl, { headers });
      if (jobsResponse.ok) {
        const jobsData = (await jobsResponse.json()) as CiJobsResponse;
        jobs = jobsData.jobs.map((job) => ({
          jobId: job.id,
          runId: job.run_id,
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          startedAt: job.started_at,
          completedAt: job.completed_at,
          htmlUrl: job.html_url,
          stepResults:
            job.steps?.map((step) => ({
              name: step.name,
              status: step.status,
              conclusion: step.conclusion,
              startedAt: step.started_at,
              completedAt: step.completed_at,
            })) ?? [],
        }));
      }
    } catch {
      // ignore jobs fetch errors
    }

    return {
      repo: `${owner}/${repo}`,
      branch,
      latestRun: {
        runId: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        headSha: run.head_sha,
        headBranch: run.head_branch,
        htmlUrl: run.html_url,
        runStartedAt: run.run_started_at,
        updatedAt: run.updated_at,
        actor: run.actor?.login ?? null,
        event: run.event,
      },
      jobs,
      logs: null,
      capturedAtMs: Date.now(),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildEmptySnapshot(owner, repo, branch, message);
  }
}
