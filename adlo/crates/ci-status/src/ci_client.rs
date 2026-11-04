use crate::ci_cache::CiLogCache;
use crate::ci_parser;
use adl_errors::AppError;
use adl_types::{CiJobSummary, CiRepoConfig, CiStatusSnapshot, CiWorkflowRunSummary};
use std::collections::HashMap;
use std::time::Duration;

const GITHUB_API_BASE: &str = "https://api.github.com";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

pub struct CiStatusClient {
    http: reqwest::Client,
    log_cache: tokio::sync::Mutex<CiLogCache>,
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
            reqwest::header::HeaderValue::from_static("adlo-ci-client"),
        );

        let http = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self { http, log_cache: tokio::sync::Mutex::new(CiLogCache::new(10)) }
    }

    pub(crate) fn build_auth_header(
        &self,
        token: &Option<String>,
    ) -> Option<reqwest::header::HeaderValue> {
        token.as_ref().filter(|t| !t.is_empty()).and_then(|t| {
            let value = format!("Bearer {t}");
            reqwest::header::HeaderValue::from_str(&value).ok()
        })
    }

    pub async fn fetch_status(&self, config: &CiRepoConfig) -> Result<CiStatusSnapshot, AppError> {
        let run = self.fetch_latest_run(config).await?;
        let run_id = run.run_id;
        let jobs = self.fetch_jobs(config, run_id).await?;

        Ok(CiStatusSnapshot {
            repo: format!("{}/{}", config.owner, config.repo),
            branch: config.branch.clone(),
            latest_run: Some(run),
            jobs,
            logs: None,
            captured_at_ms: adl_types::now_ms(),
            error: None,
        })
    }

    /// Fetch job logs for a given run. Returns a map of job_id → log_text.
    /// Results are cached in-memory keyed by run_id.
    pub async fn fetch_job_logs(
        &self,
        config: &CiRepoConfig,
        run_id: u64,
    ) -> Result<HashMap<u64, String>, AppError> {
        // Check cache first
        {
            let mut cache = self.log_cache.lock().await;
            if let Some(cached) = cache.get(&run_id) {
                return Ok(cached.clone());
            }
        }

        // Fetch and extract
        let raw_logs = self.fetch_and_extract_logs(config, run_id).await?;

        // Cache the result
        {
            let mut cache = self.log_cache.lock().await;
            cache.insert(run_id, raw_logs.clone());
        }

        Ok(raw_logs)
    }

    /// Download the ZIP from GitHub, decompress it, and return job_id → log_text.
    async fn fetch_and_extract_logs(
        &self,
        config: &CiRepoConfig,
        run_id: u64,
    ) -> Result<HashMap<u64, String>, AppError> {
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
        if !status.is_success() {
            return Err(AppError::Network(format!("logs API returned {status}")));
        }

        let content = response
            .bytes()
            .await
            .map_err(|e| AppError::Network(format!("read log body failed: {e}")))?;

        // Fetch jobs to map job_name → job_id
        let jobs: Vec<CiJobSummary> = match self.fetch_jobs(config, run_id).await {
            Ok(j) => j,
            Err(e) => {
                tracing::warn!(run_id = %run_id, error = %e, "fetch_jobs failed, returning empty list");
                Vec::new()
            },
        };

        ci_parser::extract_logs_from_zip(&content, run_id, &jobs)
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

        let parsed: ci_parser::GitHubRunsResponse = response
            .json()
            .await
            .map_err(|e| AppError::Config(format!("parse runs failed: {e}")))?;

        let run = parsed.workflow_runs.into_iter().next().ok_or_else(|| {
            AppError::NotFound(format!("no workflow runs on branch {}", config.branch))
        })?;

        Ok(ci_parser::convert_workflow_run(run))
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

        let parsed: ci_parser::GitHubJobsResponse = response
            .json()
            .await
            .map_err(|e| AppError::Config(format!("parse jobs failed: {e}")))?;

        Ok(parsed.jobs.into_iter().map(ci_parser::convert_job).collect())
    }
}
