//! Environment source preferences (`env-sources.json`, Task 11).
//!
//! Per-dependency source preference + user-supplied custom path, persisted at
//! `<data_dir>/env-sources.json` (same load/save shape as
//! `download-source`'s `config/download-sources.json`: missing file →
//! defaults, `#[serde(default)]` everywhere, all modes `Auto`).

use std::path::Path;

use adl_errors::AppError;
use serde::{Deserialize, Serialize};

use super::SourceMode;

/// Storage file name under the data root.
pub const ENV_SOURCES_FILE: &str = "env-sources.json";

/// Per-dependency source preference: which side counts + explicit override path.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct DepSource {
    pub mode: SourceMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_path: Option<String>,
}

/// Whole-file config: one [`DepSource`] per well-known dependency.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct EnvSourcesConfig {
    pub node: DepSource,
    pub git: DepSource,
    pub bash: DepSource,
    pub webview2: DepSource,
    pub adlserver: DepSource,
    pub netprobe: DepSource,
}

fn config_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join(ENV_SOURCES_FILE)
}

/// Load the config; a missing file means all-`Auto` defaults (same as
/// `download-source`: never an error for first-run).
pub fn load(data_dir: &Path) -> Result<EnvSourcesConfig, AppError> {
    let path = config_path(data_dir);
    if !path.exists() {
        return Ok(EnvSourcesConfig::default());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Io(format!("Failed to read {}: {e}", path.display())))?;
    // 单个坏文件不得让整个 env 端点不可用：解析失败降级为默认配置并留痕。
    match serde_json::from_str(&content) {
        Ok(mut config) => {
            normalize_hostless(&mut config, &path);
            Ok(config)
        },
        Err(e) => {
            tracing::warn!(
                path = %path.display(),
                error = %e,
                "env sources config is invalid; falling back to defaults"
            );
            Ok(EnvSourcesConfig::default())
        },
    }
}

/// Deps with no hosted install root: a persisted `host` mode can only resolve
/// to `none`, so it is reset to `auto` on load (with a warning naming the dep).
fn normalize_hostless(config: &mut EnvSourcesConfig, path: &Path) {
    let slots = [
        ("bash", &mut config.bash),
        ("webview2", &mut config.webview2),
        ("adlserver", &mut config.adlserver),
        ("netprobe", &mut config.netprobe),
    ];
    for (dep, slot) in slots {
        if slot.mode == SourceMode::Host {
            slot.mode = SourceMode::Auto;
            tracing::warn!(
                dep,
                path = %path.display(),
                "env sources: host mode has no hosted source; reset to auto"
            );
        }
    }
}

/// Serializes writes within the process so two saves cannot race on the same
/// temp file (each save also uses a unique temp name).
static SAVE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Persist the config atomically (pretty JSON, parent dirs created on demand).
///
/// Writes a unique `<data_dir>/env-sources.<nonce>.tmp`, flushes/syncs it, then renames it
/// over the target. `std::fs::rename` maps to `MoveFileEx(...REPLACE_EXISTING)`
/// on Windows, so an existing target is replaced atomically; if that ever
/// fails, fall back to copy+remove so a valid file still lands.
pub fn save(data_dir: &Path, config: &EnvSourcesConfig) -> Result<(), AppError> {
    let _guard = SAVE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = config_path(data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Io(format!("Failed to create config dir: {e}")))?;
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| AppError::Internal(format!("Failed to serialize env sources: {e}")))?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let tmp = path.with_file_name(format!("{ENV_SOURCES_FILE}.{nonce}.tmp"));
    {
        use std::io::Write;
        let mut file = std::fs::File::create(&tmp)
            .map_err(|e| AppError::Io(format!("Failed to create {}: {e}", tmp.display())))?;
        file.write_all(content.as_bytes())
            .and_then(|()| file.flush())
            .and_then(|()| file.sync_all())
            .map_err(|e| AppError::Io(format!("Failed to write {}: {e}", tmp.display())))?;
    }
    if let Err(e) = std::fs::rename(&tmp, &path) {
        tracing::warn!(
            from = %tmp.display(),
            to = %path.display(),
            error = %e,
            "env sources config rename failed; falling back to copy"
        );
        std::fs::copy(&tmp, &path)
            .map_err(|e| AppError::Io(format!("Failed to write {}: {e}", path.display())))?;
        let _ = std::fs::remove_file(&tmp);
    }
    Ok(())
}

/// Mutable access to one dependency slot; unknown `dep` is `InvalidInput`.
fn slot_mut<'a>(
    config: &'a mut EnvSourcesConfig,
    dep: &str,
) -> Result<&'a mut DepSource, AppError> {
    match dep {
        "node" => Ok(&mut config.node),
        "git" => Ok(&mut config.git),
        "bash" => Ok(&mut config.bash),
        "webview2" => Ok(&mut config.webview2),
        "adlserver" => Ok(&mut config.adlserver),
        "netprobe" => Ok(&mut config.netprobe),
        _ => Err(AppError::InvalidInput(format!("unknown env dependency: {dep}"))),
    }
}

/// Validate `dep` (must be one of [`ENV_DEPS`]) and apply the already-parsed
/// `mode` to the config. Pure function: handler wiring + `save` stay out, so
/// this is unit-testable without a `ServerState`. Mode parsing lives in the
/// server handler layer (`handlers::env::parse_mode`).
pub fn apply_select(
    dep: &str,
    mode: SourceMode,
    config: &mut EnvSourcesConfig,
) -> Result<(), AppError> {
    slot_mut(config, dep)?.mode = mode;
    Ok(())
}

/// Set (or clear, with `None`) the custom-path override for `dep`.
/// Unknown `dep` is `InvalidInput`; support-gating lives in
/// [`custom_path_supported`] (validated by the handler before calling here).
pub fn set_custom_path(
    config: &mut EnvSourcesConfig,
    dep: &str,
    path: Option<String>,
) -> Result<(), AppError> {
    slot_mut(config, dep)?.custom_path = path;
    Ok(())
}

/// Validate `dep` for `set-custom-path` and return whether it supports a
/// custom path at all (`node`/`git`/`bash` only — `webview2` is
/// registry-only, `adlserver` ships next to the binary, `netprobe` has no
/// path concept). Unknown deps and unsupported deps are both `InvalidInput`.
pub fn custom_path_supported(dep: &str) -> Result<bool, AppError> {
    match dep {
        "node" | "git" | "bash" => Ok(true),
        "webview2" | "adlserver" | "netprobe" => Ok(false),
        _ => Err(AppError::InvalidInput(format!("unknown env dependency: {dep}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::{apply_select, custom_path_supported, load, save};
    use crate::SourceMode;

    #[test]
    fn select_rejects_unknown_dep() {
        let mut cfg = super::EnvSourcesConfig::default();
        assert!(apply_select("bogus", SourceMode::Auto, &mut cfg).is_err());
        // 失败写入不得污染已有配置。
        assert_eq!(cfg.node.mode, SourceMode::Auto);
    }

    #[test]
    fn select_applies_mode_per_dep() {
        let mut cfg = super::EnvSourcesConfig::default();
        apply_select("node", SourceMode::Host, &mut cfg).unwrap();
        apply_select("git", SourceMode::System, &mut cfg).unwrap();
        assert_eq!(cfg.node.mode, SourceMode::Host);
        assert_eq!(cfg.git.mode, SourceMode::System);
        assert_eq!(cfg.bash.mode, SourceMode::Auto);
    }

    #[test]
    fn custom_path_support_matrix() {
        assert!(custom_path_supported("node").unwrap());
        assert!(custom_path_supported("git").unwrap());
        assert!(custom_path_supported("bash").unwrap());
        assert!(!custom_path_supported("webview2").unwrap());
        assert!(!custom_path_supported("adlserver").unwrap());
        assert!(!custom_path_supported("netprobe").unwrap());
        assert!(custom_path_supported("bogus").is_err());
    }

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "adl_env_cfg_{tag}_{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ))
    }

    #[test]
    fn load_missing_file_gives_all_auto_and_roundtrips() {
        let tmp = temp_dir("roundtrip");
        let cfg = load(&tmp).unwrap();
        assert_eq!(cfg.node.mode, SourceMode::Auto);
        assert!(cfg.node.custom_path.is_none());
        let mut updated = cfg;
        apply_select("node", SourceMode::Host, &mut updated).unwrap();
        save(&tmp, &updated).unwrap();
        let reloaded = load(&tmp).unwrap();
        assert_eq!(reloaded.node.mode, SourceMode::Host);
        assert!(
            !tmp.join(format!("{}.tmp", super::ENV_SOURCES_FILE)).exists(),
            "atomic save must not leave a .tmp residue"
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 持久化的 `host` 对无托管来源的依赖无效：加载时归一为 `auto`，
    /// 拥有托管来源的 node/git 保持原值。
    #[test]
    fn load_normalizes_host_mode_for_deps_without_hosted_source() {
        let tmp = temp_dir("normalize_host");
        std::fs::create_dir_all(&tmp).unwrap();
        let path = tmp.join(super::ENV_SOURCES_FILE);
        std::fs::write(
            &path,
            r#"{
                "node": { "mode": "host" },
                "git": { "mode": "host" },
                "bash": { "mode": "host" },
                "webview2": { "mode": "host" },
                "adlserver": { "mode": "host" },
                "netprobe": { "mode": "host" }
            }"#,
        )
        .unwrap();
        let cfg = load(&tmp).expect("load");
        assert_eq!(cfg.node.mode, SourceMode::Host);
        assert_eq!(cfg.git.mode, SourceMode::Host);
        assert_eq!(cfg.bash.mode, SourceMode::Auto);
        assert_eq!(cfg.webview2.mode, SourceMode::Auto);
        assert_eq!(cfg.adlserver.mode, SourceMode::Auto);
        assert_eq!(cfg.netprobe.mode, SourceMode::Auto);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn corrupt_config_falls_back_to_defaults() {
        let tmp = temp_dir("corrupt");
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join(super::ENV_SOURCES_FILE), "{not valid json").unwrap();
        let cfg = load(&tmp).expect("corrupt file must not error");
        assert_eq!(cfg, super::EnvSourcesConfig::default());
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
