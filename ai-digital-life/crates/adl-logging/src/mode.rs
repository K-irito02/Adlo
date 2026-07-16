use serde::{Deserialize, Serialize};

pub use adl_types::types::config::LogMode;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogTarget {
    Terminal,
    Debug,
}
