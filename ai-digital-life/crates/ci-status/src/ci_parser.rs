use adl_errors::AppError;
use adl_kernel::{CiJobSummary, CiStepSummary, CiWorkflowRunSummary};
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Cursor;
use tracing::warn;

pub(crate) const MAX_LOG_SIZE_PER_JOB: usize = 5 * 1024 * 1024; // 5MB per job

// ── GitHub API response types ──────────────────────────────────────────────────

#[derive(Deserialize, Debug)]
pub(crate) struct GitHubWorkflowRun {
    pub(crate) id: u64,
    pub(crate) name: String,
    pub(crate) status: String,
    pub(crate) conclusion: Option<String>,
    pub(crate) head_sha: String,
    pub(crate) head_branch: String,
    pub(crate) html_url: String,
    pub(crate) run_started_at: Option<String>,
    pub(crate) updated_at: Option<String>,
    pub(crate) event: Option<String>,
    pub(crate) actor: Option<GitHubActor>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct GitHubActor {
    pub(crate) login: String,
}

#[derive(Deserialize, Debug)]
pub(crate) struct GitHubRunsResponse {
    pub(crate) workflow_runs: Vec<GitHubWorkflowRun>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct GitHubJob {
    pub(crate) id: u64,
    pub(crate) run_id: u64,
    pub(crate) name: String,
    pub(crate) status: String,
    pub(crate) conclusion: Option<String>,
    pub(crate) started_at: Option<String>,
    pub(crate) completed_at: Option<String>,
    pub(crate) html_url: Option<String>,
    pub(crate) steps: Option<Vec<GitHubStep>>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct GitHubStep {
    pub(crate) name: String,
    pub(crate) status: String,
    pub(crate) conclusion: Option<String>,
    pub(crate) started_at: Option<String>,
    pub(crate) completed_at: Option<String>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct GitHubJobsResponse {
    pub(crate) jobs: Vec<GitHubJob>,
}

// ── Conversion functions ───────────────────────────────────────────────────────

pub(crate) fn convert_workflow_run(run: GitHubWorkflowRun) -> CiWorkflowRunSummary {
    CiWorkflowRunSummary {
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
    }
}

pub(crate) fn convert_job(job: GitHubJob) -> CiJobSummary {
    CiJobSummary {
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
    }
}

// ── ZIP log extraction ─────────────────────────────────────────────────────────

/// Decompress a GitHub Actions log ZIP and return job_id → log_text.
/// `content` is the raw ZIP bytes, `run_id` is used to strip the ZIP path prefix,
/// and `jobs` provides the job_name → job_id mapping.
pub(crate) fn extract_logs_from_zip(
    content: &[u8],
    run_id: u64,
    jobs: &[CiJobSummary],
) -> Result<HashMap<u64, String>, AppError> {
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
        let step_num = step_file.split('_').next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);

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

    // Map job_name → job_id
    let name_to_id: HashMap<&str, u64> = jobs.iter().map(|j| (j.name.as_str(), j.job_id)).collect();

    let mut result: HashMap<u64, String> = HashMap::new();
    for (job_name, log_text) in &merged {
        if let Some(&job_id) = name_to_id.get(job_name.as_str()) {
            result.insert(job_id, log_text.clone());
        } else {
            // Unmatched job — try case-insensitive fallback
            let lower = job_name.to_lowercase();
            let matched_id = jobs.iter().find(|j| j.name.to_lowercase() == lower).map(|j| j.job_id);
            if let Some(job_id) = matched_id {
                result.insert(job_id, log_text.clone());
            } else {
                warn!("no matching CiJobSummary for ZIP directory: {job_name}");
            }
        }
    }

    Ok(result)
}
