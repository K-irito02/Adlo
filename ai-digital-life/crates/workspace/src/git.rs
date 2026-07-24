mod git_branch;
mod git_helpers;
mod git_snapshot;
mod git_staging;
pub mod git_vis;

pub use git_branch::{create_git_branch, list_git_branches, switch_git_branch};
pub(crate) use git_helpers::{git_file_exists, git_show_file};
pub use git_snapshot::{
    capture_git_snapshot, capture_git_snapshot_async, git_has_local_changes, has_auto_stash,
    pop_auto_stash,
};
pub use git_staging::{discard_file_changes, stage_file, unstage_file};
