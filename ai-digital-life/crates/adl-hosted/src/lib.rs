pub mod adopt;
pub mod atomic_swap;
pub mod lock;
pub mod proc_host;
pub mod progress;

pub use adopt::adopt_bundle;
pub mod hosted_versions;

pub use atomic_swap::swap_into_place;
pub use hosted_versions::HostedVersions;
pub use lock::InstallLock;
pub use proc_host::{HostedProcess, pick_free_port, spawn_with_marker};
pub use progress::{ProgressPhase, ProgressSnapshot, ProgressTask};
