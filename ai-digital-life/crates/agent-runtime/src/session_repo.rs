// Re-export from adl-kernel — trait defined there so both storage (impl) and
// agent-runtime (consumer) depend only on kernel types.
pub use adl_kernel::types::session::{SessionQuery, SessionRepository};
