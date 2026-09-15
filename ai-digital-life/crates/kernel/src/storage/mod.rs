pub mod category;
pub mod locator;
pub mod paths;

pub use category::StorageCategory;
pub use locator::{
    APP_CONFIG_SUBDIR, KeptDir, LOCATOR_FILE, LOCATOR_VERSION, MigrationReport, PendingMigration,
    StorageLocator, StorageMode, StorageSelection, load_locator, load_locator_from, locator_dir,
    locator_path, save_locator, save_locator_to,
};
pub use paths::{StorageDefaults, StoragePaths, StorageService, resolve_log_dir};

pub mod whitelist;

pub mod migration;

pub use migration::{
    ForeignScan, MigrationProgress, PreflightIssue, PreflightReport, Severity, WalkLimits,
    apply_pending, cleanup_category, copy_category, dir_usage_limited, plan_categories, preflight,
    run, scan_foreign, verify_category, walk_files,
};

pub use whitelist::{category_roots, is_own_dir, owns_file};
