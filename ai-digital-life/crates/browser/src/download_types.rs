use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
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
            mode: DownloadMode::Ask,
            default_path: super::download_manager::get_default_download_path()
                .to_string_lossy()
                .to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgressPayload {
    pub id: String,
    pub bytes_received: u64,
    pub total_bytes: Option<u64>,
    pub speed: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadCancelPayload {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadPausePayload {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadResumePayload {
    pub id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_status_serializes_as_snake_case() {
        let s = serde_json::to_string(&DownloadStatus::InProgress).unwrap();
        assert_eq!(s, "\"in_progress\"");
    }

    #[test]
    fn download_mode_serializes_as_snake_case() {
        let s = serde_json::to_string(&DownloadMode::Auto).unwrap();
        assert_eq!(s, "\"auto\"");
        let s2 = serde_json::to_string(&DownloadMode::Ask).unwrap();
        assert_eq!(s2, "\"ask\"");
    }

    #[test]
    fn download_mode_deserializes_from_snake_case() {
        let mode: DownloadMode = serde_json::from_str("\"auto\"").unwrap();
        assert_eq!(mode, DownloadMode::Auto);
        let mode: DownloadMode = serde_json::from_str("\"ask\"").unwrap();
        assert_eq!(mode, DownloadMode::Ask);
    }
}
