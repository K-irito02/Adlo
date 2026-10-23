pub mod adopt;
pub mod atomic_swap;
pub mod proc_host;

pub use adopt::adopt_bundle;
pub mod hosted_versions;

pub use atomic_swap::swap_into_place;
pub use hosted_versions::HostedVersions;
pub use proc_host::{HostedProcess, pick_free_port, spawn_with_marker};
