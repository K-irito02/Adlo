use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadStatus {
    InProgress,
    Completed,
    Failed,
    Paused,
    Canceled,
}

impl DownloadStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::InProgress => "in_progress",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Paused => "paused",
            Self::Canceled => "canceled",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        match s {
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            "paused" => Self::Paused,
            "canceled" => Self::Canceled,
            _ => Self::InProgress,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRecord {
    pub id: String,
    pub url: String,
    pub file_name: String,
    pub file_path: String,
    pub total_bytes: Option<u64>,
    pub bytes_received: u64,
    pub mime_type: Option<String>,
    pub status: DownloadStatus,
    pub interrupt_reason: Option<String>,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub source_tab_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadSettings {
    pub mode: DownloadMode,
    pub default_path: String,
}

impl Default for DownloadSettings {
    fn default() -> Self {
        Self {
            mode: DownloadMode::Auto,
            default_path: super::download_manager::get_default_download_path()
                .to_string_lossy()
                .to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadMode {
    Auto,
    Ask,
}

impl DownloadMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Ask => "ask",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        match s {
            "ask" => Self::Ask,
            _ => Self::Auto,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub id: String,
    pub bytes_received: u64,
    pub speed: u64,
    pub estimated_end_time: Option<f64>,
}
