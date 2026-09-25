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
  settingsTerminalHistoryBudgetUnitLabel: 'Size unit',
  settingsTerminalHistoryBudgetUnitMb: 'MB',
  settingsTerminalHistoryBudgetUnitGb: 'GB',

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

  // Shortcuts
  settingsShortcutsSearchLabel: 'Search shortcuts',
  settingsShortcutsSearch: 'Search shortcuts...',
  settingsShortcutsPressKeys: 'Press keys...',
  settingsShortcutsUnassigned: 'Unassigned',
  settingsShortcutsConflict: 'Shortcut Conflict',
  settingsShortcutsConflictDesc: 'Shortcut {keybind} is already used by: {titles}',
  settingsShortcutsResetOne: 'Reset this shortcut',
  settingsShortcutsResetAllShortcuts: 'Reset all shortcuts to defaults',
  settingsShortcutsResetAllTitle: 'Reset all shortcuts to defaults?',
  settingsShortcutsResetAllMessage:
    'All shortcuts will be restored to their defaults. This cannot be undone.',
  settingsShortcutsClear: 'Clear',
  settingsShortcutsGroupGeneral: 'General',
  settingsShortcutsGroupNavigation: 'Navigation',
  settingsShortcutsGroupView: 'View',
  settingsShortcutsGroupZoom: 'Zoom',
  settingsShortcutsGroupFile: 'File',

  // Toast
  settingsUpdated: 'Settings updated',
  settingsUpdateFailed: 'Failed to update settings',
  settingsResetComplete: 'Settings reset to defaults',
  settingsResetConfirmTitle: 'Reset all to defaults?',
  settingsResetConfirmMessage:
    'All settings will be restored to their defaults. This cannot be undone.',
  settingsResetGroupConfirmTitle: 'Reset {group} to defaults?',
  settingsResetGroupConfirmMessage:
    'Every setting in the {group} group will be restored to its default. This cannot be undone.',

  // Accessibility
  settingsToggleVisibility: 'Toggle visibility',
  settingsSearchLabel: 'Search settings',

  // Storage
  storageTitle: 'Storage',
  storageCorePathsTitle: 'Core data paths',
  storageModeLabel: 'Path mode',
  storageModeHint:
    'Decides how each kind of data is stored: with "Unified root", everything lives under one folder for easy migration; with "Per-category", each kind gets its own folder so you can manage larger types independently.',
  storageModeUnified: 'Unified root (default)',
  storageModePerCategory: 'Per-category',
  storageRootLabel: 'Data root',
  storageRootHint:
    'The top-level folder for your core data. Everything is stored here by default; to relocate, pick a new folder with "Choose folder" or type another path.',
  storagePickDir: 'Choose folder',
  storageManualInput: 'Enter manually',
  storageManualInputPlaceholder: 'Enter an absolute path…',
  storageApply: 'Apply',
  storageCancel: 'Cancel',
  storageRevert: 'Revert',
  storageDirtyHint: 'Data paths under the "{block}" block were modified and are not applied yet',
  storageUsed: '{size} used ({files} files)',
  storageNotCreated: 'Not created yet',
  storageForeignFiles: '{count} file(s) not created by this app will be kept',
  storageLocatorTitle: 'Data location index',
  storageLocatorHint:
    "This small file remembers which folders on your computer hold each kind of app data — the app reads it on every launch to find your data. Please don't delete, rename, or hand-edit it. If it is deleted by accident, the app will start with the default folders; your original data stays safely where it was, just out of sight here — point the paths back in the Storage settings to recover it.",
  storagePendingBanner: 'Migration scheduled for next launch',
  storagePendingFailedBanner: 'Last migration failed: {error} (old data is intact)',
  storageRetryMigration: 'Retry',
  storageCancelPending: 'Cancel pending migration',
  storageMigrateDialogTitle: 'Migrate data',
  storageMigrateDialogSummary:
    'Core data paths: {files} file(s) (~{size}) will be moved to the new location',
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
  // Intentional: straight quotes, not curly (task 3 convention); do NOT "fix" to “”.
  storageImmutableTitle: 'Not movable "managed by the OS or runtime"',
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
  storageDownloadMigrateLabel: 'Migrate files when path changes',
  storageDownloadMigrateHint:
    "When on, changing the default download folder moves every file and subfolder from the old path to the new one, and deletes the old folder only after everything has been moved successfully (exception: system-owned folders — e.g. the system drive's Downloads/Documents/Desktop, Windows, Program Files — only have files moved out; the folder itself is never deleted). If it fails midway: files already moved stay in the new path, the rest remain in the old path, and the setting is not switched — you can retry anytime and no file is ever lost. When off, only the path switches and no files are moved.",
  storageDownloadMigrateEnableTitle: 'Turn on auto-migration?',
  storageDownloadMigrateEnableConfirm:
    'With "Migrate files when path changes" on, every future change of the default download folder will move all files and subfolders from the old path to the new one. The old folder is deleted only after the move fully succeeds (exception: system-owned folders — e.g. the system drive\'s Downloads/Documents/Desktop, Windows, Program Files — only have files moved out; the folder itself is never deleted). If it fails midway: files already moved stay in the new path, the rest remain in the old path, and the setting is not switched — you can retry later and no file is ever lost or discarded. Turn it on now?',
  storageDownloadMigrateEnableConfirmBtn: 'Turn on',
  storageDownloadResetTitle: 'Reset the default download folder?',
  storageDownloadResetConfirmMigrateOn:
    "The default download folder will be reset to the system default. Auto-migration is currently on: every file under the old path will be moved to the system default folder first, and the old folder is deleted only after the move fully succeeds (exception: system-owned folders — e.g. the system drive's Downloads/Documents/Desktop, Windows, Program Files — only have files moved out; the folder itself is never deleted); if it fails midway: files already moved stay in the new path, the rest remain in the old path, the setting is not switched, and you can retry.",
  storageDownloadResetConfirmMigrateOff:
    'The default download folder will be reset to the system default. Auto-migration is currently off: only the path changes — files under the old path are neither moved nor deleted.',
  storageDownloadResetConfirmBtn: 'Reset',
  storageGroupResetTitle: 'Reset all Storage defaults?',
  storageGroupResetIntro: 'These 4 areas will be reset to their defaults:',
  storageGroupResetItemCore:
    'Core data paths: back to the "unified root" at the default location; a migration flow follows and takes effect after restarting the app (or on next launch).',
  storageGroupResetItemTree:
    'Workspace tree cache: turned back on with a 15-minute retention; cached content is kept; applies immediately.',
  storageGroupResetItemBudget:
    'Terminal history disk budget: back to {default}; applies immediately.',
  storageGroupResetItemDownloadMigrateOn:
    "Browser default download folder: back to the system default; files under the old path are moved over first, and the old folder is removed only after everything succeeds (exception: system-owned folders — e.g. the system drive's Downloads/Documents/Desktop, Windows, Program Files — only have files moved out; the folder itself is never deleted); the auto-migration switch is turned back off.",
  storageGroupResetItemDownloadMigrateOff:
    'Browser default download folder: back to the system default with only the path switched — no files moved; the auto-migration switch stays off.',
  storageDownloadMigrateFailed: 'Failed to migrate files: {error}',
  storageDownloadRefreshFailed:
    'Download settings saved, but the display failed to refresh — please reopen settings to verify',
  storagePickFailed: 'Failed to choose folder: {error}',
  storageStatusLoading: 'Loading storage status…',
  storageStatusLoadFailed:
    'Failed to load storage status: {error}. Please make sure the app backend is up to date and restarted.',
  storageNoCategories: 'No storage categories available. Please retry later',
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
  storageCategorySiteMetaDb: 'Website info cache',
  storageCategoryConfig: 'App configuration',
  storageCategoryClipboard: 'Clipboard assets',
  storageCategorySnapshot: 'Project snapshots',
  storageCategoryDsh: 'DSH versions & bundles',
  storageCategoryLogs: 'Logs',
  storageCategoryCredentialsFallback: 'Backup credential files',
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
  treeCacheStatsLabel: 'Cache stats',
  treeCacheWorkspaces: '{count} workspaces cached',
  treeCacheSize: 'Cache size {size}',
  treeCacheAge: 'Newest entry {time}',
  treeCacheClear: 'Clear cache',
  treeCacheClearConfirm: 'Clear all workspace tree caches? Trees will be rescanned on next open.',
  treeCacheEnabled: 'Enable tree cache',
  treeCacheEnabledHint:
    'When enabled, workspace file trees are cached to disk after the first scan. The next open shows the cached tree first and refreshes quietly in the background for a faster cold start. The cache rescans automatically when it expires or the tree changes significantly. When off, the cache is neither read nor written.',
  treeCacheDisableTitle: 'Turn off tree cache?',
  treeCacheDisableConfirm:
    'Turning off the tree cache clears all cached workspace file trees. Every workspace open will then need a full rescan, so the file tree will appear noticeably slower at first; the tree still works, only without cache acceleration. Turning it back on rebuilds the cache gradually as you use it. Turn it off now?',
  treeCacheDisableConfirmBtn: 'Turn off',
  treeCacheTtl: 'Cache TTL',
  treeCacheTtlMinutes: '{minutes} minutes',
  treeCacheTtlDay: '1 day',
  treeCacheTtlCustom: 'Custom…',
  treeCacheTtlUnitLabel: 'Time unit',
  treeCacheUnitSecond: 'sec',
  treeCacheUnitMinute: 'min',
  treeCacheUnitHour: 'hr',
  treeCacheUnitDay: 'day',

  // Command titles
  commandSessionNew: 'New Session',
  commandWorkspaceNew: 'New Workspace',
  commandWorkspaceOpen: 'Open Workspace',
  commandSettingsOpen: 'Open Settings',
} as const;
