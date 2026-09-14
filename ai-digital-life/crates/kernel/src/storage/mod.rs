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

pub use whitelist::{category_roots, is_own_dir, owns_file};
