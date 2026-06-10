use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct CiRepoConfig {
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub workflow_id: Option<String>,
    pub access_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct CiWorkflowRunSummary {
    pub run_id: u64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub head_sha: String,
    pub head_branch: String,
    pub html_url: String,
    pub run_started_at: Option<String>,
    pub updated_at: Option<String>,
    pub actor: Option<String>,
    pub event: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct CiJobSummary {
    pub job_id: u64,
    pub run_id: u64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub html_url: Option<String>,
    pub step_results: Vec<CiStepSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct CiStepSummary {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

pub type CiJobLogMap = std::collections::HashMap<u64, String>;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct CiStatusSnapshot {
    pub repo: String,
    pub branch: String,
    pub latest_run: Option<CiWorkflowRunSummary>,
    pub jobs: Vec<CiJobSummary>,
    pub logs: Option<String>,
    pub captured_at_ms: i64,
    pub error: Option<String>,
}
