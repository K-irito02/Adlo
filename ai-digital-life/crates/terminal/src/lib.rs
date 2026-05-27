//! Governed command execution with bounded output capture.
//!
//! This crate re-exports from the `adl-command` and `adl-pty` sub-crates.

pub use adl_command::{build_request, classify_profile, run_command, run_approved_command, truncate_output, validation_command};

pub mod pty {
    pub use adl_pty::{PtyConfig, PtySession, PtyStatus};
}

pub mod session_manager {
    pub use adl_pty::{PtyEventEmitter, PtySessionHandle, PtySessionInfo, SessionManager};
}

pub mod shell_resolver {
    pub use adl_pty::{is_shell_available, ShellKind, ShellNotFound, ShellResolution, ShellResolver};
}
