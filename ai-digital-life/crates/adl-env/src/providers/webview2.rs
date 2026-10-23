//! `webview2` provider: registry-based system detection (Task 10).
//!
//! Detection keys per Microsoft "Deploying the Evergreen WebView2 Runtime":
//! the product version (`pv`) lives under `EdgeUpdate\Clients\{GUID}`, not
//! `EdgeUpdate\ClientState\{GUID}`. Machine-wide probes cover both the
//! 64-bit (`WOW6432Node`) and 32-bit registry views; the per-user probe has
//! no `WOW6432Node` (per Microsoft docs).
//!
//! Zero new dependencies: `reg query` output is parsed with string ops (no
//! `windows-registry` crate). `adl-env` stays low-level and never imports
//! `wry` — the WebView2 version reported here is registry-only; `wry` (used
//! inside `tauri-runtime-wry-patched`) performs its own runtime check at
//! WebView creation time.

use adl_errors::AppError;
use serde::{Deserialize, Serialize};

/// WebView2 Evergreen `EdgeUpdate\Clients` product GUID holding `pv`.
pub const WEBVIEW2_CLIENT_GUID: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
/// Machine code for [`install`]: the installer owns WebView2, not us.
/// The frontend maps this code to i18n copy (download link + explanation).
pub const MANAGED_BY_INSTALLER: &str = "webview2-managed-by-installer";

const HKLM_MACHINE_64: &str = r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
const HKLM_MACHINE_32: &str =
    r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
const HKCU_USER: &str =
    r"HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

/// 64-bit machine-wide key first, then 32-bit Windows machine-wide key.
pub(crate) fn hklm_machine_keys() -> [&'static str; 2] {
    [HKLM_MACHINE_64, HKLM_MACHINE_32]
}

/// Per-user key (no `WOW6432Node` per Microsoft docs).
pub(crate) fn hkcu_key() -> &'static str {
    HKCU_USER
}

/// System-side detection outcome (same shape as `node`/`git`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Detection {
    pub available: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

impl Detection {
    fn unavailable() -> Self {
        Self { available: false, version: None, path: None }
    }
}

/// Parse `reg query ... /v pv` output: find the `REG_SZ` line and take its
/// last token. WebView2 ships 4-part versions (`140.0.3485.94`) that are not
/// strict semver, so validity is "≥3 dot-separated numeric components"
/// rather than `semver::Version`. `None` on any mismatch.
pub fn parse_pv(out: &str) -> Option<String> {
    let line = out.lines().find(|l| l.contains("REG_SZ"))?;
    let token = line.split_whitespace().last()?;
    if is_dotted_version(token) { Some(token.to_string()) } else { None }
}

fn is_dotted_version(token: &str) -> bool {
    let parts: Vec<&str> = token.split('.').collect();
    parts.len() >= 3 && parts.iter().all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

/// Highest of the HKLM/HKCU versions wins; invalid entries count as absent.
pub fn pick_highest(hklm: Option<&str>, hkcu: Option<&str>) -> Option<String> {
    let mut best: Option<&str> = None;
    for cand in [hklm, hkcu].into_iter().flatten() {
        if !is_dotted_version(cand) {
            continue;
        }
        let higher = match best {
            None => true,
            Some(cur) => cmp_dotted(cand, cur) == std::cmp::Ordering::Greater,
        };
        if higher {
            best = Some(cand);
        }
    }
    best.map(str::to_string)
}

fn cmp_dotted(a: &str, b: &str) -> std::cmp::Ordering {
    let pa: Vec<u64> = a.split('.').filter_map(|p| p.parse().ok()).collect();
    let pb: Vec<u64> = b.split('.').filter_map(|p| p.parse().ok()).collect();
    pa.cmp(&pb)
}

fn reg_pv(hive_key: &str) -> Option<String> {
    let out =
        std::process::Command::new("reg").args(["query", hive_key, "/v", "pv"]).output().ok()?;
    if !out.status.success() {
        return None;
    }
    parse_pv(&String::from_utf8_lossy(&out.stdout))
}

/// Detect system WebView2: query `pv` under both HKLM machine keys then the
/// HKCU per-user key, highest version wins. Any failure (missing `reg`,
/// absent key, unparsable value — including non-Windows) yields
/// `unavailable`, never an error. `path` stays `None`: the registry records
/// a version, not a path.
pub fn detect() -> Detection {
    let keys = hklm_machine_keys();
    let v64 = reg_pv(keys[0]);
    let v32 = reg_pv(keys[1]);
    let hkcu = reg_pv(hkcu_key());
    let machine_best = pick_highest(v64.as_deref(), v32.as_deref());
    match pick_highest(machine_best.as_deref(), hkcu.as_deref()) {
        Some(version) => Detection { available: true, version: Some(version), path: None },
        None => Detection::unavailable(),
    }
}

/// WebView2 is installed by the app installer / Evergreen updater, never by
/// us — always return the machine-code引导 error so the frontend routes the
/// user to the installer flow instead of attempting a hosted install.
pub fn install() -> Result<(), AppError> {
    Err(AppError::InvalidInput(MANAGED_BY_INSTALLER.to_string()))
}
