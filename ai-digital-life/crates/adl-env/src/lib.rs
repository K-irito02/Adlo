//! Environment dependency source model (`adl-env` skeleton, Task 7).
//!
//! Low-level crate: source preference model + pure [`resolve()`] function with
//! the same priority semantics as `dsh-version::resolve_effective_source`
//! (read-only reference, do not modify there):
//! auto prefers host over system, forced modes never silently downgrade.
//! Providers (`node`/`git`/`bash`/`webview2`/`adlserver`/`netprobe`) and
//! server routes arrive in Tasks 8-11.

use serde::{Deserialize, Serialize};

/// Hosted-install providers (`node` now; `git`/`bash`/… arrive in Tasks 9-10).
pub mod providers;

/// Source preferences (`env-sources.json`, Task 11).
pub mod config;

/// Baseline version pins (`env-baseline.json` resource, Task 11).
pub mod baseline;

/// Well-known environment dependency keys, in canonical order.
pub const ENV_DEPS: [&str; 6] = ["node", "git", "bash", "webview2", "adlserver", "netprobe"];

/// User source preference per dependency.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SourceMode {
    /// Host first, then system, then none.
    #[default]
    Auto,
    /// Only the system installation counts; missing means none.
    System,
    /// Only the hosted copy counts; missing means none.
    Host,
}

/// Actually effective source after availability is considered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum EffectiveSource {
    System,
    Host,
    #[default]
    None,
}

/// How a system-side item was found (spec §4.1 `origin`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Origin {
    /// Found via `PATH` lookup.
    #[default]
    Path,
    /// Found via OS registry / package metadata.
    Registry,
    /// Shipped with the installer.
    Bundled,
    /// User-supplied explicit path (`mode: system + origin: manual`).
    Manual,
}

/// Unified per-dependency status shape (spec §4.1, camelCase wire keys).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyState {
    pub mode: SourceMode,
    pub effective: EffectiveSource,
    pub origin: Origin,
    pub installed_version: Option<String>,
    pub baseline_version: String,
    pub meets_baseline: bool,
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_path: Option<String>,
}

/// Outcome of [`resolve()`]: which source actually serves the dependency.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Resolved {
    pub effective: EffectiveSource,
}

/// Outcome of removing a hosted install: `selected` is the version still
/// selected afterwards (`None` when the removal left no installed versions).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallOutcome {
    pub removed: String,
    pub selected: Option<String>,
}

/// Resolve the effective source from user preference and availability.
///
/// Priority mirrors `dsh-version::resolve_effective_source`:
/// - `Auto`: host (when installed) > system (when available) > none.
/// - Forced `System`/`Host`: missing means [`EffectiveSource::None`]
///   (no silent downgrade; the frontend prompts to install instead).
pub fn resolve(mode: SourceMode, sys_available: bool, host_version: Option<String>) -> Resolved {
    let has_host = host_version.as_deref().is_some_and(|v| !v.is_empty());
    let effective = match mode {
        SourceMode::System => {
            if sys_available {
                EffectiveSource::System
            } else {
                EffectiveSource::None
            }
        },
        SourceMode::Host => {
            if has_host {
                EffectiveSource::Host
            } else {
                EffectiveSource::None
            }
        },
        SourceMode::Auto => {
            if has_host {
                EffectiveSource::Host
            } else if sys_available {
                EffectiveSource::System
            } else {
                EffectiveSource::None
            }
        },
    };
    Resolved { effective }
}

#[cfg(test)]
mod tests {
    use super::{EffectiveSource, SourceMode, resolve};

    #[test]
    fn resolve_matrix() {
        use SourceMode::*;
        // auto: host 优先于 system；都没有 → none
        assert_eq!(resolve(Auto, true, Some("22.14.0".into())).effective, EffectiveSource::Host);
        assert_eq!(resolve(Auto, true, None).effective, EffectiveSource::System);
        assert_eq!(resolve(Auto, false, None).effective, EffectiveSource::None);
        // system/host 强制：缺失 → none（不静默降级，前端据此提示安装）
        assert_eq!(resolve(System, false, Some("22.14.0".into())).effective, EffectiveSource::None);
        assert_eq!(resolve(Host, true, None).effective, EffectiveSource::None);
    }
}
