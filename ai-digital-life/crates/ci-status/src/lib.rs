use adl_errors::AppError;
use adl_kernel::{
    CiJobSummary, CiRepoConfig, CiStatusSnapshot, CiStepSummary, CiWorkflowRunSummary,
};
use serde::Deserialize;
use std::time::Duration;

const GITHUB_API_BASE: &str = "https://api.github.com";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Deserialize, Debug)]
struct GitHubWorkflowRun {
    id: u64,
    name: String,
    status: String,
    conclusion: Option<String>,
    head_sha: String,
    head_branch: String,
    html_url: String,
    run_started_at: Option<String>,
    updated_at: Option<String>,
    event: Option<String>,
    actor: Option<GitHubActor>,
}

#[derive(Deserialize, Debug)]
struct GitHubActor {
    login: String,
}

#[derive(Deserialize, Debug)]
struct GitHubRunsResponse {
    workflow_runs: Vec<GitHubWorkflowRun>,
}

#[derive(Deserialize, Debug)]
struct GitHubJob {
    id: u64,
    run_id: u64,
    name: String,
    status: String,
    conclusion: Option<String>,
    started_at: Option<String>,
    completed_at: Option<String>,
    html_url: Option<String>,
    steps: Option<Vec<GitHubStep>>,
}

#[derive(Deserialize, Debug)]
struct GitHubStep {
    name: String,
    status: String,
    conclusion: Option<String>,
    started_at: Option<String>,
    completed_at: Option<String>,
}

#[derive(Deserialize, Debug)]
struct GitHubJobsResponse {
    jobs: Vec<GitHubJob>,
}

pub struct CiStatusClient {
    http: reqwest::Client,
}

impl Default for CiStatusClient {
    fn default() -> Self {
        Self::new()
    }
}

impl CiStatusClient {
    pub fn new() -> Self {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::ACCEPT,
            reqwest::header::HeaderValue::from_static("application/vnd.github+json"),
        );
        headers.insert(
            "X-GitHub-Api-Version",
            reqwest::header::HeaderValue::from_static("2022-11-28"),
        );
        headers.insert(
            reqwest::header::USER_AGENT,
            reqwest::header::HeaderValue::from_static("ai-digital-life-ci-client"),
        );

        let http = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self { http }
    }

    fn build_auth_header(&self, token: &Option<String>) -> Option<reqwest::header::HeaderValue> {
        token.as_ref().filter(|t| !t.is_empty()).and_then(|t| {
            let value = format!("Bearer {t}");
            reqwest::header::HeaderValue::from_str(&value).ok()
        })
    }

    pub async fn fetch_status(&self, config: &CiRepoConfig) -> Result<CiStatusSnapshot, AppError> {
        let run = self.fetch_latest_run(config).await?;
        let run_id = run.run_id;
        let jobs = self.fetch_jobs(config, run_id).await?;
        let logs = self.fetch_run_logs(config, run_id).await.ok();

        Ok(CiStatusSnapshot {
            repo: format!("{}/{}", config.owner, config.repo),
            branch: config.branch.clone(),
            latest_run: Some(run),
            jobs,
            logs,
            captured_at_ms: adl_kernel::now_ms(),
            error: None,
        })
    }

    async fn fetch_latest_run(
        &self,
        config: &CiRepoConfig,
    ) -> Result<CiWorkflowRunSummary, AppError> {
        let url = format!(
            "{GITHUB_API_BASE}/repos/{owner}/{repo}/actions/runs",
            owner = config.owner,
            repo = config.repo
        );

        let mut query_params =
            vec![("branch", config.branch.as_str()), ("per_page", "5"), ("page", "1")];
        if let Some(workflow_id) = &config.workflow_id {
            query_params.push(("workflow_id", workflow_id.as_str()));
        }

        let mut req = self.http.get(&url).query(&query_params);

        if let Some(auth) = self.build_auth_header(&config.access_token) {
            req = req.header(reqwest::header::AUTHORIZATION, auth);
        }

        let response =
            req.send().await.map_err(|e| AppError::Network(format!("fetch runs failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_else(|_| "<no body>".to_string());
            return Err(AppError::Network(format!("GitHub API returned {status}: {body}")));
        }

        let parsed: GitHubRunsResponse = response
            .json()
            .await
            .map_err(|e| AppError::Config(format!("parse runs failed: {e}")))?;

        let run = parsed.workflow_runs.into_iter().next().ok_or_else(|| {
            AppError::NotFound(format!("no workflow runs on branch {}", config.branch))
        })?;

        Ok(CiWorkflowRunSummary {
            run_id: run.id,
            name: run.name,
            status: run.status,
            conclusion: run.conclusion,
            head_sha: run.head_sha,
            head_branch: run.head_branch,
            html_url: run.html_url,
            run_started_at: run.run_started_at,
            updated_at: run.updated_at,
            actor: run.actor.map(|a| a.login),
            event: run.event,
        })
    }

    async fn fetch_jobs(
        &self,
        config: &CiRepoConfig,
        run_id: u64,
    ) -> Result<Vec<CiJobSummary>, AppError> {
        let url = format!(
            "{GITHUB_API_BASE}/repos/{owner}/{repo}/actions/runs/{run_id}/jobs",
            owner = config.owner,
            repo = config.repo
        );

        let mut req = self.http.get(&url).query(&[("per_page", "100")]);
        if let Some(auth) = self.build_auth_header(&config.access_token) {
            req = req.header(reqwest::header::AUTHORIZATION, auth);
        }

        let response =
            req.send().await.map_err(|e| AppError::Network(format!("fetch jobs failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_else(|_| "<no body>".to_string());
            return Err(AppError::Network(format!("GitHub API returned {status}: {body}")));
        }

        let parsed: GitHubJobsResponse = response
            .json()
            .await
            .map_err(|e| AppError::Config(format!("parse jobs failed: {e}")))?;

        Ok(parsed
            .jobs
            .into_iter()
            .map(|job| CiJobSummary {
                job_id: job.id,
                run_id: job.run_id,
                name: job.name,
                status: job.status,
                conclusion: job.conclusion,
                started_at: job.started_at,
                completed_at: job.completed_at,
                html_url: job.html_url,
                step_results: job
                    .steps
                    .unwrap_or_default()
                    .into_iter()
                    .map(|step| CiStepSummary {
                        name: step.name,
                        status: step.status,
                        conclusion: step.conclusion,
                        started_at: step.started_at,
                        completed_at: step.completed_at,
                    })
                    .collect(),
            })
            .collect())
    }

    async fn fetch_run_logs(&self, config: &CiRepoConfig, run_id: u64) -> Result<String, AppError> {
        let url = format!(
            "{GITHUB_API_BASE}/repos/{owner}/{repo}/actions/runs/{run_id}/logs",
            owner = config.owner,
            repo = config.repo
        );

        let mut req = self.http.get(&url);
        if let Some(auth) = self.build_auth_header(&config.access_token) {
            req = req.header(reqwest::header::AUTHORIZATION, auth);
        }

        let response =
            req.send().await.map_err(|e| AppError::Network(format!("fetch logs failed: {e}")))?;

        let status = response.status();
        let content = response.text().await.unwrap_or_else(|_| "<failed to read body>".to_string());

        if !status.is_success() {
            return Err(AppError::Network(format!("logs API returned {status}: {content}")));
        }

        if content.trim().is_empty() {
            return Ok("(empty)".to_string());
        }

        // Logs endpoint returns a redirect to a signed S3 URL with a zip.
        // We follow redirects, but the content is binary. So we try to
        // decompress it. For simplicity, just indicate availability.
        // "PK" is the zip file magic number (zip/jar/xlsx/etc.)
        let preview = if content.as_bytes().starts_with(b"PK") || content.len() > 20_000 {
            format!("({} bytes - view the full log at GitHub)", content.len())
        } else {
            content
        };
        Ok(preview)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_client_is_created() {
        let _client = CiStatusClient::new();
    }

    #[test]
    fn build_auth_header_without_token_is_none() {
        let client = CiStatusClient::new();
        let header = client.build_auth_header(&None);
        assert!(header.is_none());
    }

    #[test]
    fn build_auth_header_with_empty_token_is_none() {
        let client = CiStatusClient::new();
        let header = client.build_auth_header(&Some(String::new()));
        assert!(header.is_none());
    }

    #[test]
    fn build_auth_header_with_token_present() {
        let client = CiStatusClient::new();
        let header = client.build_auth_header(&Some("ghp_abc".to_string()));
        assert!(header.is_some());
    }
}
