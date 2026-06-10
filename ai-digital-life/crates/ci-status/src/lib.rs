use adl_errors::AppError;
use adl_kernel::{
    CiJobSummary, CiRepoConfig, CiStatusSnapshot, CiStepSummary, CiWorkflowRunSummary,
};
use lru::LruCache;
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Cursor;
use std::num::NonZeroUsize;
use std::time::Duration;
use tracing::warn;

const GITHUB_API_BASE: &str = "https://api.github.com";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_LOG_SIZE_PER_JOB: usize = 5 * 1024 * 1024; // 5MB per job

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

/// In-memory cache for extracted log data.
/// key: run_id, value: map of job_id → log_text
/// Uses `lru::LruCache` for O(1) get/insert with automatic LRU eviction.
struct CiLogCache {
    inner: LruCache<u64, HashMap<u64, String>>,
}

impl CiLogCache {
    fn new(max_entries: usize) -> Self {
        let cap = NonZeroUsize::new(max_entries.max(1)).unwrap_or(NonZeroUsize::MIN);
        Self { inner: LruCache::new(cap) }
    }

    fn get(&mut self, run_id: &u64) -> Option<&HashMap<u64, String>> {
        self.inner.get(run_id)
    }

    fn insert(&mut self, run_id: u64, logs: HashMap<u64, String>) {
        self.inner.put(run_id, logs);
    }
}

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
            reqwest::header::HeaderValue::from_static("ai-digital-life-ci-client"),
        );

        let http = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self { http, log_cache: tokio::sync::Mutex::new(CiLogCache::new(10)) }
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

        Ok(CiStatusSnapshot {
            repo: format!("{}/{}", config.owner, config.repo),
            branch: config.branch.clone(),
            latest_run: Some(run),
            jobs,
            logs: None,
            captured_at_ms: adl_kernel::now_ms(),
            error: None,
        })
    }

    /// Fetch job logs for a given run. Returns a map of job_id → log text.
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

        if content.is_empty() || content.len() < 4 {
            return Ok(HashMap::new());
        }

        // Verify ZIP header
        if !content.starts_with(b"PK\x03\x04") {
            let preview = String::from_utf8_lossy(&content[..content.len().min(200)]).to_string();
            warn!("logs response is not a ZIP (starts with {:?})", preview);
            return Ok(HashMap::new());
        }

        // Decompress ZIP in memory
        let cursor = Cursor::new(content.to_vec());
        let mut archive =
            zip::ZipArchive::new(cursor).map_err(|e| AppError::Config(format!("zip open: {e}")))?;

        // Extract by job_name directory
        let mut by_job_name: HashMap<String, Vec<(u32, String)>> = HashMap::new();

        let run_id_prefix = format!("{run_id}/");
        for i in 0..archive.len() {
            let mut file =
                archive.by_index(i).map_err(|e| AppError::Config(format!("zip entry {i}: {e}")))?;

            let full_path = file.name().to_string();

            // Strip run_id prefix to get job_name/step_filename
            let relative = if let Some(rest) = full_path.strip_prefix(&run_id_prefix) {
                rest
            } else {
                // Some ZIPs don't have run_id prefix; try without
                &full_path
            };

            // Split "job_name/step_number_step_name.txt"
            let Some(slash_pos) = relative.find('/') else {
                continue;
            };
            let job_name = relative[..slash_pos].to_string();
            let step_file = relative[slash_pos + 1..].to_string();

            // Extract step number from filename (e.g., "1_Set up job.txt" → 1)
            let step_num =
                step_file.split('_').next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);

            let mut text = String::new();
            if let Err(e) = std::io::Read::read_to_string(&mut file, &mut text) {
                warn!("skip unreadable entry {full_path}: {e}");
                continue;
            }

            by_job_name.entry(job_name).or_default().push((step_num, text));
        }

        // Sort steps by step number within each job and concatenate
        let mut merged: HashMap<String, String> = HashMap::new();
        for (name, mut steps) in by_job_name {
            steps.sort_by_key(|(num, _)| *num);
            let mut combined = String::new();
            let mut total_len = 0usize;
            for (_, text) in &steps {
                let remaining = MAX_LOG_SIZE_PER_JOB.saturating_sub(total_len);
                if remaining == 0 {
                    break;
                }
                let chunk = if text.len() > remaining {
                    // Take from end (keep latest logs)
                    &text[text.len() - remaining..]
                } else {
                    text.as_str()
                };
                combined.push_str(chunk);
                total_len += chunk.len();
            }
            merged.insert(name, combined);
        }

        // Fetch jobs to map job_name → job_id
        let jobs: Vec<CiJobSummary> = self.fetch_jobs(config, run_id).await.unwrap_or_default();

        let mut result: HashMap<u64, String> = HashMap::new();
        let name_to_id: HashMap<&str, u64> =
            jobs.iter().map(|j| (j.name.as_str(), j.job_id)).collect();

        for (job_name, log_text) in &merged {
            if let Some(&job_id) = name_to_id.get(job_name.as_str()) {
                result.insert(job_id, log_text.clone());
            } else {
                // Unmatched job — try case-insensitive fallback
                let lower = job_name.to_lowercase();
                let matched_id =
                    jobs.iter().find(|j| j.name.to_lowercase() == lower).map(|j| j.job_id);
                if let Some(job_id) = matched_id {
                    result.insert(job_id, log_text.clone());
                } else {
                    warn!("no matching CiJobSummary for ZIP directory: {job_name}");
                }
            }
        }

        Ok(result)
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
