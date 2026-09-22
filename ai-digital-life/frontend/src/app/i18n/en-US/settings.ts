export const settingsEn = {
  // General
  settingsTitle: 'Application Settings',
  settingsSearch: 'Search settings...',
  settingsResetToDefault: 'Reset to default',
  settingsResetAll: 'Reset all to defaults',
  settingsNoResults: 'No matching settings',

  // Group labels
  settingsGeneral: 'General',
  settingsWorkspace: 'Workspace',
  settingsTerminal: 'Terminal',
  settingsShortcuts: 'Shortcuts',
  settingsBrowser: 'Browser',
  settingsDsh: 'DSH',

  // Terminal settings
  settingsTerminalHistoryGroupDesc: 'Manage terminal history storage and display behavior',
  settingsTerminalHistoryBudget: 'Read-only history disk budget',
  settingsTerminalHistoryBudgetDesc:
    'This is a usage cap for read-only history, not reserved space. Nothing is deleted below the cap; above it, the oldest entries are evicted first, and the most recent 20 segments are always kept.',
  settingsTerminalHistoryBudgetCustom: 'Custom…',
  settingsTerminalHistoryBudgetFollowDisk: 'Follow free disk space',
  settingsTerminalHistoryBudgetFollowDiskDesc:
    'Estimates the cap from free space on the system drive, reserving 1GB for the system. The tighter the disk, the less history is kept.',
  settingsTerminalHistoryBudgetUsed: 'Using {used} of {limit}',

  // Common settings
  settingsLanguage: 'Language',
  settingsLanguageDesc: 'Display language of the app interface, applies immediately',
  settingsTheme: 'Theme',
  settingsThemeDesc: 'Light / Dark / System, affects the whole interface palette',
  settingsAutoApproval: 'Auto-approval level',
  settingsLogLevel: 'Log Level',
  settingsLogLevelDesc: 'Verbosity of application logs, raise temporarily when troubleshooting',
  settingsTerminalLogMode: 'Terminal Log Mode',
  settingsTerminalLogModeDesc:
    'How terminal session logs are written: overwrite, append, or multi-file',
  settingsDebugLogMode: 'Debug Log Mode',
  settingsDebugLogModeDesc: 'How debug logs are written: overwrite, append, or multi-file',
  settingsLogModeOverwrite: 'Overwrite',
  settingsLogModeAppend: 'Append',
  settingsLogModeMulti: 'Multi-file',
  settingsResetGroupToDefault: 'Reset {group} to defaults',

  // Font settings
  settingsFontUi: 'UI Font',
  settingsFontUiDesc:
    'Font for the app interface text; hover an option to preview live, click to confirm',
  settingsFontCode: 'Code Font',
  settingsFontCodeDesc:
    'Font for editor and diff code; hover an option to preview live, click to confirm',
  settingsFontTerminal: 'Terminal Font',
  settingsFontTerminalDesc:
    'Font for terminal text; hover an option to preview live, click to confirm',
  settingsFontPreview: 'Preview: The quick brown fox 1234567890',
  settingsFontDefault: 'Default',
  settingsFontSystemNote: 'Empty means the system default font',

  // Shortcuts
  settingsShortcutsTitle: 'Keyboard Shortcuts',
  settingsShortcutsSearch: 'Search shortcuts...',
  settingsShortcutsPressKeys: 'Press keys...',
  settingsShortcutsUnassigned: 'Unassigned',
  settingsShortcutsConflict: 'Shortcut Conflict',
  settingsShortcutsConflictDesc: 'Shortcut {keybind} is already used by: {titles}',
  settingsShortcutsResetOne: 'Reset this shortcut',
  settingsShortcutsClear: 'Clear',
  settingsShortcutsGroupGeneral: 'General',
  settingsShortcutsGroupSession: 'Session',
  settingsShortcutsGroupNavigation: 'Navigation',
  settingsShortcutsGroupModel: 'Model and Agent',
  settingsShortcutsGroupTerminal: 'Terminal',
  settingsShortcutsGroupPrompt: 'Prompt',

  // Toast
  settingsUpdated: 'Settings updated',
  settingsUpdateFailed: 'Failed to update settings',
  settingsResetComplete: 'Settings reset to defaults',
  settingsResetConfirmTitle: 'Reset all to defaults?',
  settingsResetConfirmMessage:
    'All settings will be restored to their defaults. This cannot be undone.',

  // Accessibility
  settingsToggleVisibility: 'Toggle visibility',
  settingsSearchLabel: 'Search settings',

  // Storage
  storageTitle: 'Storage',
  storageModeLabel: 'Path mode',
  storageModeUnified: 'Unified root (default)',
  storageModePerCategory: 'Per-category',
  storageRootLabel: 'Data root',
  storagePickDir: 'Choose folder',
  storageManualInput: 'Enter manually',
  storageManualInputPlaceholder: 'Enter an absolute path…',
  storageApply: 'Apply',
  storageCancel: 'Cancel',
  storageCategoryGroupCore: 'Core data',
  storageCategoryGroupAdvanced: 'Advanced',
  storageUsed: '{size} used ({files} files)',
  storageNotCreated: 'Not created yet',
  storageForeignFiles: '{count} file(s) not created by this app will be kept',
  storageLocatorTitle: 'Data location index',
  storageLocatorHint:
    'This file records where your data lives; do not delete it, or the app will fall back to the default folder',
  storagePendingBanner: 'Migration scheduled for next launch',
  storagePendingFailedBanner: 'Last migration failed: {error} (old data is intact)',
  storageRetryMigration: 'Retry',
  storageCancelPending: 'Cancel pending migration',
  storageMigrateDialogTitle: 'Migrate data',
  storageMigrateDialogSummary: 'Will move {files} file(s) (~{size}) to the new location',
  storageMigrateNow: 'Migrate now and restart',
  storageMigrateLater: 'Migrate on next launch',
  storageRetainSource: 'Keep old files after migration (do not delete)',
  storagePreflightErrors: 'Cannot migrate:',
  storagePreflightWarnings: 'Note:',
  storageReportTitle: 'Last migration report',
  storageReportOk: 'Migrated {files} file(s) ({size})',
  storageReportDirsRemoved: 'Removed {count} old folder(s)',
  storageReportDirsKept: 'Kept {count} old folder(s) (contain external files)',
  storageReportRetained: 'Old files kept as configured',
  storageReportFailed: 'Migration failed: {error}',
  storageReportSwitched:
    'Data has already moved to the new location; only old-folder cleanup is incomplete — do not re-run migration.',
  storageImmutableTitle: 'Not movable (managed by the OS or runtime)',
  storageImmutableKeyring:
    'Credentials are kept in the OS credential manager; the location is fixed by the system.',
  storageImmutableMachineId:
    'This file derives the credential encryption key; moving it would make saved credentials undecryptable.',
  storageImmutableLocalStorage:
    'Stored per-origin by the WebView; managed with the app, no separate path.',
  storageImmutableIndexedDb:
    'Avatar cache lives in the browser IndexedDB; managed with the app, no separate path.',
  storageImmutableWebview2:
    'Managed by the WebView2 runtime; changing it requires rebuilding the whole browser environment.',
  storageImmutableWorkspaceCache:
    'Belongs to a specific workspace and moves with it; not part of the app data folder.',
  storageImmutableKeyringName: 'OS credential manager',
  storageImmutableMachineIdName: 'Machine identity file',
  storageImmutableLocalStorageName: 'UI state storage',
  storageImmutableIndexedDbName: 'Avatar cache',
  storageImmutableWebview2Name: 'WebView2 runtime data',
  storageImmutableWorkspaceCacheName: 'Workspace-level cache',
  storageRestartRequired: 'Saved. Restart the app to complete the migration.',
  storageTerminalBudgetTitle: 'Terminal history disk budget',
  storageRestartUnavailableInBrowser:
    'The browser mode cannot restart the app; this change will apply on next launch.',
  storageBrowserDownloadTitle: 'Browser default download folder',
  storagePickFailed: 'Failed to choose folder: {error}',
  storageStatusLoading: 'Loading storage status…',
  storageStatusLoadFailed:
    'Failed to load storage status: {error}. Please make sure the app backend is up to date and restarted.',
  storageNoCategories: 'No storage categories available. Please retry later.',
  storagePickUnavailable:
    'Folder picker is not available in this environment. Please enter the path manually.',
  storageUnknownError: 'Unknown error',
  storageBridgeUnavailable: 'bridge unavailable',
  storageRetry: 'Retry',
  storageStatusTimeout:
    'Storage status timed out: the backend may be scanning a very large directory. Please retry; if it persists, check the size of your data directories.',

  // Storage categories
  storageCategoryDatabase: 'Main database',
  storageCategoryDownloadsDb: 'Download history DB',
  storageCategorySiteMetaDb: 'Site metadata cache',
  storageCategoryConfig: 'App configuration',
  storageCategoryClipboard: 'Clipboard assets',
  storageCategorySnapshot: 'Project snapshots',
  storageCategoryDsh: 'DSH versions & bundles',
  storageCategoryLogs: 'Logs',
  storageCategoryCredentialsFallback: 'Credential fallback files',
  storageCategoryDownloadsDefault: 'Default download folder',
  storageCategoryDatabaseDesc:
    "The app's core database, storing workspaces, sessions, tasks, approvals, patches and rollbacks, read-only terminal history, clipboard metadata, Git visualization cache, and more.",
  storageCategoryDatabaseRelated:
    'Relates to workspace navigation, the session panel, the terminal history area, clipboard history, and Git visualization.',
  storageCategoryDownloadsDbDesc:
    'Records of browser download tasks, including file name, source, time, and status.',
  storageCategoryDownloadsDbRelated:
    'Relates to the Downloads list and management in the built-in browser.',
  storageCategorySiteMetaDbDesc:
    'Cache of titles and icons (favicons) for visited sites, used to speed up tab display.',
  storageCategorySiteMetaDbRelated:
    'Relates to tab titles and icons, and history/bookmark display in the built-in browser.',
  storageCategoryTreeCache: 'Workspace tree cache',
  storageCategoryTreeCacheDesc:
    'On-disk SQLite cache of workspace file trees for millisecond cold-start rendering (derived data, safe to clear and rebuild).',
  storageCategoryTreeCacheRelated:
    'Relates to instant cold-start rendering and silent background calibration of workspace file trees.',
  storageCategoryConfigDesc:
    'App settings (language, theme, log mode, terminal budget, browser thresholds, DSH sources, etc.).',
  storageCategoryConfigRelated: 'Relates to persisting every setting in the settings panel.',
  storageCategoryClipboardDesc: 'Image and thumbnail files in clipboard history.',
  storageCategoryClipboardRelated:
    'Relates to image preview and re-insertion in the clipboard history panel.',
  storageCategorySnapshotDesc:
    'File snapshots taken before patches are applied, used for rollback and diff comparison.',
  storageCategorySnapshotRelated: 'Relates to patch preview, apply, rollback, and the diff viewer.',
  storageCategoryDshDesc: 'Downloaded versions and bundled artifacts of DeepSeek Harness.',
  storageCategoryDshRelated:
    'Relates to version management in the DSH settings group and running DSH.',
  storageCategoryLogsDesc: 'Terminal and debug log files used for troubleshooting.',
  storageCategoryLogsRelated:
    'Relates to debugging tools (log collector, copy debug logs) and the troubleshooting workflow.',
  storageCategoryCredentialsFallbackDesc:
    'Credentials stored as encrypted files, used only when the OS credential manager is unavailable.',
  storageCategoryCredentialsFallbackRelated:
    'Relates to features that need credentials (such as CI access tokens and API tokens); the primary credentials are not here (see the not-movable section).',
  storageCategoryDownloadsDefaultDesc:
    'The default folder for browser downloads (it holds user files, not app data).',
  storageCategoryDownloadsDefaultRelated:
    'Relates to the default destination of built-in browser downloads; never deleted automatically.',

  // Workspace tree cache (storage settings section)
  treeCacheTitle: 'Workspace tree cache',
  treeCacheWorkspaces: '{count} workspaces cached',
  treeCacheSize: 'Cache size {size}',
  treeCacheAge: 'Newest entry {time}',
  treeCacheClear: 'Clear cache',
  treeCacheClearConfirm: 'Clear all workspace tree caches? Trees will be rescanned on next open.',
  treeCacheEnabled: 'Enable tree cache',
  treeCacheTtl: 'Cache TTL',
  treeCacheTtlMinutes: '{minutes} minutes',
  treeCacheTtlDay: '1 day',

  // Command titles
  commandSessionNew: 'New Session',
  commandWorkspaceNew: 'New Workspace',
  commandWorkspaceOpen: 'Open Workspace',
  commandSettingsOpen: 'Open Settings',
} as const;
