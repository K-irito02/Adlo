use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AcpConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub port: Option<u16>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HttpApiConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub cors_origins: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeModeConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_max_concurrency")]
    pub max_concurrency: u32,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default = "default_max_output_bytes")]
    pub max_output_bytes: usize,
}

impl Default for CodeModeConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            max_concurrency: default_max_concurrency(),
            timeout_ms: default_timeout_ms(),
            max_output_bytes: default_max_output_bytes(),
        }
    }
}

fn default_max_concurrency() -> u32 {
    8
}
fn default_timeout_ms() -> u64 {
    30_000
}
fn default_max_output_bytes() -> usize {
    1_048_576
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acp_config_default_disabled() {
        let config = AcpConfig::default();
        assert!(!config.enabled);
    }

    #[test]
    fn http_api_config_default_disabled() {
        let config = HttpApiConfig::default();
        assert!(!config.enabled);
    }

    #[test]
    fn codemode_config_defaults() {
        let config = CodeModeConfig::default();
        assert!(!config.enabled);
        assert_eq!(config.max_concurrency, 8);
        assert_eq!(config.timeout_ms, 30_000);
        assert_eq!(config.max_output_bytes, 1_048_576);
    }
}
