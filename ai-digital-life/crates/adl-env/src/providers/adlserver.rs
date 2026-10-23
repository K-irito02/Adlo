//! `adlserver` provider: bundled-binary existence detection (Task 10).
//!
//! `adl-server` ships beside the app binary and exposes no `--version`
//! command, so detection is existence-only (`version` is always `None`).

use std::path::Path;

use serde::{Deserialize, Serialize};

/// File name of the bundled server binary on this platform.
pub const SERVER_BIN: &str = if cfg!(windows) { "adl-server.exe" } else { "adl-server" };

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

/// Detect the bundled `adl-server` next to the running executable:
/// `exe_dir/adl-server(.exe)` exists → available. Nothing is executed.
pub fn detect(exe_dir: &Path) -> Detection {
    let bin = exe_dir.join(SERVER_BIN);
    if bin.is_file() {
        Detection { available: true, version: None, path: Some(bin.to_string_lossy().into_owned()) }
    } else {
        Detection::unavailable()
    }
}
