use std::path::Path;
use std::time::Duration;

use adl_errors::AppError;
use serde::{Deserialize, Serialize};

const DEFAULT_VERSION: u32 = 1;
const DEFAULT_NPM_REGISTRY: &str = "https://registry.npmjs.org";
const DEFAULT_PREFER_OFFLINE: bool = true;
const CONFIG_FILE_NAME: &str = "download-sources.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DownloadSourceConfig {
    pub version: u32,
    pub npm_registry: String,
    pub dsh_mirror: Option<String>,
    pub proxy: ProxyConfig,
    pub prefer_offline: bool,
}

impl Default for DownloadSourceConfig {
    fn default() -> Self {
        Self {
            version: DEFAULT_VERSION,
            npm_registry: DEFAULT_NPM_REGISTRY.to_string(),
            dsh_mirror: None,
            proxy: ProxyConfig::default(),
            prefer_offline: DEFAULT_PREFER_OFFLINE,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub mode: ProxyMode,
    pub http_proxy: Option<String>,
    pub https_proxy: Option<String>,
    pub no_proxy: Option<String>,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self { mode: ProxyMode::Auto, http_proxy: None, https_proxy: None, no_proxy: None }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProxyMode {
    Auto,
    Manual,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceStatus {
    pub reachable: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}

fn config_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("config").join(CONFIG_FILE_NAME)
}

pub fn load(data_dir: &Path) -> Result<DownloadSourceConfig, AppError> {
    let path = config_path(data_dir);
    if !path.exists() {
        return Ok(DownloadSourceConfig::default());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Io(format!("Failed to read config file {}: {e}", path.display())))?;
    let config: DownloadSourceConfig = serde_json::from_str(&content)
        .map_err(|e| AppError::Config(format!("Failed to parse config file: {e}")))?;
    Ok(config)
}

pub fn save(data_dir: &Path, config: &DownloadSourceConfig) -> Result<(), AppError> {
    let path = config_path(data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Io(format!("Failed to create config dir: {e}")))?;
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| AppError::Internal(format!("Failed to serialize config: {e}")))?;
    std::fs::write(&path, content)
        .map_err(|e| AppError::Io(format!("Failed to write config file: {e}")))?;
    Ok(())
}

pub fn resolve_registry(config: &DownloadSourceConfig) -> &str {
    match &config.dsh_mirror {
        Some(mirror) => mirror,
        None => &config.npm_registry,
    }
}

pub fn build_http_client(config: &DownloadSourceConfig) -> Result<reqwest::Client, AppError> {
    let mut builder = reqwest::Client::builder();

    match config.proxy.mode {
        ProxyMode::None => {
            builder = builder.no_proxy();
        },
        ProxyMode::Manual => {
            let http_proxy = config.proxy.http_proxy.clone();
            let https_proxy = config.proxy.https_proxy.clone();
            let no_proxy = config.proxy.no_proxy.clone();

            if no_proxy.is_some() {
                let proxy = reqwest::Proxy::custom(move |url| {
                    let host = url.host_str().unwrap_or("");
                    let skip = no_proxy
                        .as_ref()
                        .map(|np| np.split(',').any(|p| !p.is_empty() && host.contains(p.trim())))
                        .unwrap_or(false);
                    if skip {
                        None
                    } else if url.scheme() == "https" {
                        https_proxy.clone()
                    } else {
                        http_proxy.clone()
                    }
                });
                builder = builder.proxy(proxy);
            } else {
                if let Some(ref url) = http_proxy {
                    let proxy = reqwest::Proxy::http(url)
                        .map_err(|e| AppError::Config(format!("Invalid http_proxy: {e}")))?;
                    builder = builder.proxy(proxy);
                }
                if let Some(ref url) = https_proxy {
                    let proxy = reqwest::Proxy::https(url)
                        .map_err(|e| AppError::Config(format!("Invalid https_proxy: {e}")))?;
                    builder = builder.proxy(proxy);
                }
            }
        },
        ProxyMode::Auto => {
            // reqwest with system-proxy feature will use system proxy by default
        },
    }

    builder
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Internal(format!("Failed to build HTTP client: {e}")))
}

pub async fn test_source(url: &str, timeout: Duration) -> SourceStatus {
    let client = match reqwest::Client::builder().timeout(timeout).build() {
        Ok(c) => c,
        Err(e) => {
            return SourceStatus {
                reachable: false,
                latency_ms: None,
                error: Some(format!("Failed to build client: {e}")),
            };
        },
    };

    let start = std::time::Instant::now();
    match client.head(url).send().await {
        Ok(resp) => {
            let latency = start.elapsed().as_millis() as u64;
            let reachable = resp.status().is_success() || resp.status().is_redirection();
            SourceStatus {
                reachable,
                latency_ms: Some(latency),
                error: if reachable { None } else { Some(format!("HTTP {}", resp.status())) },
            }
        },
        Err(e) => SourceStatus { reachable: false, latency_ms: None, error: Some(e.to_string()) },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_has_expected_values() {
        let config = DownloadSourceConfig::default();
        assert_eq!(config.version, 1);
        assert_eq!(config.npm_registry, "https://registry.npmjs.org");
        assert!(config.dsh_mirror.is_none());
        assert!(config.prefer_offline);
        assert_eq!(config.proxy.mode, ProxyMode::Auto);
    }

    #[test]
    fn resolve_registry_returns_npm_when_no_mirror() {
        let config = DownloadSourceConfig::default();
        assert_eq!(resolve_registry(&config), "https://registry.npmjs.org");
    }

    #[test]
    fn resolve_registry_prefers_mirror() {
        let config = DownloadSourceConfig {
            dsh_mirror: Some("https://mirror.example.com".to_string()),
            ..Default::default()
        };
        assert_eq!(resolve_registry(&config), "https://mirror.example.com");
    }

    #[test]
    fn config_roundtrip_serde() {
        let config = DownloadSourceConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        let decoded: DownloadSourceConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config.npm_registry, decoded.npm_registry);
        assert_eq!(config.proxy.mode, decoded.proxy.mode);
    }

    #[test]
    fn config_serde_flavored_json() {
        let json = r#"{
            "version": 1,
            "npm_registry": "https://registry.npmjs.org",
            "dsh_mirror": "https://mirror.example.com",
            "proxy": {
                "mode": "manual",
                "http_proxy": "http://proxy:8080",
                "https_proxy": "http://proxy:8443",
                "no_proxy": "localhost,127.0.0.1"
            },
            "prefer_offline": false
        }"#;
        let config: DownloadSourceConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.version, 1);
        assert_eq!(config.dsh_mirror.as_deref(), Some("https://mirror.example.com"));
        assert_eq!(config.proxy.mode, ProxyMode::Manual);
        assert_eq!(config.proxy.http_proxy.as_deref(), Some("http://proxy:8080"));
        assert!(!config.prefer_offline);
    }

    #[test]
    fn default_proxy_mode_serializes_as_snake_case() {
        let config = DownloadSourceConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains(r#""mode":"auto"#));
    }

    #[test]
    fn save_and_load_roundtrip() {
        let tmp = std::env::temp_dir().join("adl_download_source_test");
        let _ = std::fs::remove_dir_all(&tmp);

        let config = DownloadSourceConfig {
            dsh_mirror: Some("https://mirror.test".to_string()),
            ..Default::default()
        };

        save(&tmp, &config).unwrap();
        let loaded = load(&tmp).unwrap();

        assert_eq!(config.version, loaded.version);
        assert_eq!(config.npm_registry, loaded.npm_registry);
        assert_eq!(config.dsh_mirror, loaded.dsh_mirror);
        assert_eq!(config.proxy.mode, loaded.proxy.mode);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn load_returns_default_when_missing() {
        let tmp = std::env::temp_dir().join("adl_download_source_missing");
        let _ = std::fs::remove_dir_all(&tmp);

        let loaded = load(&tmp).unwrap();
        assert_eq!(loaded.npm_registry, "https://registry.npmjs.org");
        assert!(loaded.dsh_mirror.is_none());

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
