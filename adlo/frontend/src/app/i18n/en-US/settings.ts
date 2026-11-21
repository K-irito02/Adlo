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
  settingsShortcutsSearchHintLabel: 'How shortcut search works',
  settingsShortcutsSearchHint:
    '# How to search shortcuts\nJust type: a feature name (e.g. "New Workspace"), the raw key text (e.g. mod+n), what you see on screen (e.g. Ctrl+N), or even a single letter (e.g. n).\nClick the keyboard icon on the right of the box to press a combo directly — it fills itself in; holding only Ctrl or Shift shows what you have pressed so far and keeps waiting, no need to restart.\nPress Esc to cancel key input and go back to your previous search.',
  settingsShortcutsSearchCapturing: 'Press keys to search…',
  settingsShortcutsSearchByKeypress: 'Search by keypress',
  settingsShortcutsPressKeys: 'Press keys...',
  settingsShortcutsUnassigned: 'Unassigned',
  settingsShortcutsConflict: 'Shortcut Conflict',
  settingsShortcutsConflictDesc: 'Shortcut {keybind} is already used by: {titles}',
  settingsShortcutsResetOneFor: 'Reset {name}',
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
  settingsResetGroupConfirmTitle: 'Reset {group} to defaults?',
  settingsResetGroupConfirmMessage:
    'Every setting in the {group} group will be restored to its default. This cannot be undone.',
  settingsResetAllConfirmMessage:
    'All settings will be restored to defaults. This cannot be undone.',
  settingsResetAllScopePreferences: 'General, workspace and shortcuts',
  settingsResetAllProgress: 'Resetting: {group}',
  settingsResetAllFailedSummary: 'Reset: {done}; failed: {group} ({reason})',
  settingsResetAllFailedSummaryNoDone: 'Failed: {group} ({reason})',
  settingsResetAllSkippedNote: 'Not executed: {groups}',
  settingsResetAllDoneAll: 'All default settings restored',
  settingsSessionOverrideTakesEffectOnRestart:
    'Saved, but a command-line flag overrides it for this session; takes effect on next launch',
  settingsBackendOfflineBadge: 'Backend unreachable',

  // Accessibility
  settingsToggleVisibility: 'Toggle visibility',
  settingsRefreshAria: 'Refresh: {target}',
  settingsSearchLabel: 'Search settings',
  settingsSearchHistory: 'Search history',
  settingsSearchHistoryClear: 'Clear',
  settingsSearchHistoryRemoveLabel: 'Remove {name}',
  settingsSearchHistoryRemoveTitle: 'Remove entry',

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
  storagePendingTaskTitle: 'Pending migration task',
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
  storageToolPathsTitle: 'External tool paths',
  storageToolPathsHint:
    'Read-only index of the real paths currently used by DSH / OpenCode CLI and environment tools. Edit them in their own groups (Environment / DSH / OpenCode CLI); nothing is migrated here.',
  storageToolPathsGoTo: 'Manage',
  storageToolPathsUnknown: 'Unknown (not detected yet)',
  storageToolPathsNoVersion: 'No version in use',
  storageRestartRequired: 'Saved. Restart the app to complete the migration.',
  storageRestartUnavailableInBrowser:
    'The browser mode cannot restart the app; this change will apply on next launch.',
  storageBrowserDownloadTitle: 'Browser download folder',
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
  // Path already the system default, only the migrate switch is non-default: no path-reset claim (item 10).
  storageDownloadResetConfirmSwitchOnly:
    'The download folder is already the system default, so nothing changes there. Auto-migration is currently on: this only turns the switch back off — no files are moved.',
  storageDownloadResetConfirmBtn: 'Reset',
  storageGroupResetTitle: 'Reset all Storage defaults?',
  // No hardcoded count: each item is filtered by the open-time snapshot — already-default blocks are hidden entirely (item 10).
  storageGroupResetIntro: 'The following settings will be reset to their defaults:',
  // All blocks already default → toast instead of opening an empty dialog (item 10 empty state).
  storageGroupResetAllDefault: 'Storage settings are already at their defaults; nothing to reset.',
  storageGroupResetItemCore:
    'Core data paths: back to the "unified root" at the default location; a migration flow follows and takes effect after restarting the app (or on next launch).',
  // Tree cache has three truthful variants by open-time snapshot: full / re-enable only / retention only.
  storageGroupResetItemTree:
    'Workspace tree cache: turned back on with a 15-minute retention; cached content is kept; applies immediately.',
  storageGroupResetItemTreeReenable:
    'Workspace tree cache: turned back on; cached content is kept; applies immediately.',
  storageGroupResetItemTreeTtl:
    'Workspace tree cache: retention back to 15 minutes; cached content is kept; applies immediately.',
  storageGroupResetItemDownloadMigrateOn:
    "Browser default download folder: back to the system default; files under the old path are moved over first, and the old folder is removed only after everything succeeds (exception: system-owned folders — e.g. the system drive's Downloads/Documents/Desktop, Windows, Program Files — only have files moved out; the folder itself is never deleted); the auto-migration switch is turned back off.",
  storageGroupResetItemDownloadMigrateOff:
    'Browser default download folder: back to the system default with only the path switched — no files moved; the auto-migration switch stays off.',
  // Path already the system default, only the migrate switch is non-default: no path-reset claim (item 10).
  storageGroupResetItemDownloadSwitchOnly:
    'The browser default download folder is already the system default: this only turns the auto-migration switch back off — no files are moved.',
  // Single confirm button when core paths are already default (no migrate later/now pair).
  storageGroupResetConfirm: 'Reset to Defaults',
  // Localized mappings of English preflight messages (Rust storage/migration.rs); rules in preflightCopy.ts.
  storagePreflightIssueWithCategory: '[{category}] {message}',
  storagePreflightIdentical:
    'The new location is the same as the current one — nothing to migrate.',
  storagePreflightInside:
    'The new location is nested inside the current one (or vice versa). Choose a different location.',
  storagePreflightCreateDir:
    'Cannot create the folder at the new location. Check that the path is valid and you have permission.',
  storagePreflightNotWritable:
    'The new location is not writable (possibly no permission). Choose a different location.',
  storagePreflightDiskSpace:
    'Not enough disk space at the target location (need ~{need}, {free} free). Free up space and try again.',
  browserGroupResetTitle: 'Reset all Browser defaults?',
  browserGroupResetMessage:
    'Suspend duration (back to 15 minutes), download mode (back to auto-save), and the default download folder (back to the system default with auto-migration turned off) will all be reset to their defaults.',
  browserGroupResetMigrateOnNote:
    '"Migrate files when path changes" is currently on: when the folder is reset, files under the old path are moved to the system default folder first, and the old folder is removed only after everything succeeds (exception: system-owned folders — e.g. the system drive\'s Downloads/Documents/Desktop, Windows, Program Files — only have files moved out; the folder itself is never deleted); if it fails midway: files already moved stay in the new path, the rest remain in the old path, the setting is not switched, and you can retry.',
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
  storageCategoryHarnesses: 'Harness version directories',
  storageCategoryLogs: 'Logs',
  storageCategoryCredentialsFallback: 'Backup credential files',
  storageCategoryDownloadsDefault: 'Default download folder',
  storageCategoryDatabaseDesc:
    "The app's core database, storing workspaces, sessions, tasks, approvals, patches and rollbacks, clipboard metadata, Git visualization cache, and more.",
  storageCategoryDatabaseRelated:
    'Relates to workspace navigation, the session panel, clipboard history, and Git visualization.',
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
    'App settings (language, theme, log mode, browser thresholds, DSH sources, etc.).',
  storageCategoryConfigRelated: 'Relates to persisting every setting in the settings panel.',
  storageCategoryClipboardDesc: 'Image and thumbnail files in clipboard history.',
  storageCategoryClipboardRelated:
    'Relates to image preview and re-insertion in the clipboard history panel.',
  storageCategorySnapshotDesc:
    'File snapshots taken before patches are applied, used for rollback and diff comparison.',
  storageCategorySnapshotRelated: 'Relates to patch preview, apply, rollback, and the diff viewer.',
  storageCategoryHarnessesDesc:
    'Downloaded version directories for DSH and OpenCode (one subdirectory per harness).',
  storageCategoryHarnessesRelated:
    'Relates to version management in the DSH / OpenCode settings groups and terminal availability.',
  storageCategoryLogsDesc:
    "Terminal and debug log files used for troubleshooting. Dev builds write to the worktree's .adl-logs; release builds use this directory.",
  storageCategoryLogsRelated:
    'Relates to debugging tools (log collector, console export API) and the troubleshooting workflow.',
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

  // Open method
  settingsOpenMethod: 'Open Method',
  settingsLinkOpenMethod: 'URL link',
  settingsLinkOpenMethodDesc:
    'Where URL links open (applies to Markdown preview and intercepted agent-site links)',
  settingsLinkOpenMiddle: 'Center',
  settingsLinkOpenPanel: 'Right browser panel',
  settingsLinkOpenExternal: 'External browser',
  settingsFileOpenMethod: 'File',
  settingsFileOpenMethodDesc: 'How file links open (e.g. file index links in Markdown preview)',
  settingsFileOpenPanel: 'Right file panel',
  settingsFileOpenExternal: 'System default app',
  settingsAgentIntercept: 'Intercept agent-site links',
  settingsAgentInterceptDesc:
    'When enabled, URL and local-file links in whitelisted agent sites open via this app\u2019s settings; when off, the site\u2019s own behavior is kept',
  settingsAgentDesktopOnlyHint: '\u2014 Desktop mode only (not available in browser mode)',
  settingsAgentWhitelist: 'Agent site allowlist',
  settingsAgentWhitelistDesc:
    'Use Add to add a site; enter an alias (optional) and the site URL (required). Site URLs are normalized to an origin and matched for the whole site, e.g. http://127.0.0.1:3080.',
  settingsAgentAllowAdd: 'Add',
  settingsAgentAllowTitle: 'Add agent site',
  settingsAgentAllowAlias: 'Alias (optional)',
  settingsAgentAllowAliasPlaceholder: 'e.g. Work agent',
  settingsAgentAllowOrigin: 'Site URL (required)',
  settingsAgentAllowOriginPlaceholder: 'e.g. https://my-agent.example.com',
  settingsAgentAllowOriginRequired: 'Enter a site URL',
  settingsAgentAllowOriginInvalid: 'Unrecognized site URL; enter an http/https site address',
  settingsAgentAllowRemove: 'Remove',
  settingsAgentAllowRemoveTitle: 'Remove',
  settingsAgentAllowEmpty: 'No allowlisted sites yet, click Add to add',
  settingsAgentAllowManage: 'Manage allowlist',
  settingsAgentRules: 'Interception rules',
  settingsAgentRulesDesc:
    'Global rules and site overrides. When enabled, whitelisted agent sites try these rules before links open in the app',
  settingsAgentRulesSiteReset: 'Restore site defaults',
  settingsAgentRulesSiteResetConfirm: 'Restore site defaults: {site}',
  settingsAgentRulesBuiltinFileLike: 'Local file attribute',
  settingsAgentRulesAdd: 'Add rule',
  settingsAgentRulesName: 'Rule name',
  settingsAgentRulesSelector: 'Match selector',
  settingsAgentRulesAttributes: 'Attributes',
  settingsAgentRulesAttributesHint: 'Separate with commas, e.g. title, data-file-path, aria-label',
  settingsAgentRulesPreset: 'Match mode',
  settingsAgentRulesPresetFileLike: 'Local file',
  settingsAgentRulesPresetRegex: 'Custom regex',
  settingsAgentRulesRegex: 'Value regex',
  settingsAgentRulesRegexFlags: 'Regex flags',
  settingsAgentRulesAction: 'Action',
  settingsAgentRulesActionFile: 'Open file',
  settingsAgentRulesActionUrl: 'Open URL',
  settingsAgentRulesActionFileOnly: 'Local-file mode always opens a file',
  settingsAgentRulesEnabled: 'Rule enabled',
  settingsAgentRulesSave: 'Save',
  settingsAgentRulesCancel: 'Cancel',
  settingsAgentRulesEmptyGlobal: 'No global rules',
  settingsAgentRulesEmptySite: 'No site rules',
  settingsAgentRulesRuleError: 'Invalid regular expression',
  settingsAgentRulesOtherRuleInvalid: 'Another rule has an invalid regex — fix it before saving',
  settingsAgentRulesSummary: '{rules} global · {sites} site overrides',
  settingsAgentRulesEdit: 'Edit rules',
  settingsAgentRulesCollapse: 'Collapse rules',
  settingsAgentRulesGlobalTab: 'Global rules',
  settingsAgentRulesSiteTab: 'Site overrides',
  settingsAgentRulesSiteRules: 'Site rules',
  settingsAgentRulesGlobalEnabled: 'Globally enabled rules',
  settingsAgentRulesDeleteSelected: 'Delete selected rule',
  settingsAgentRulesNoSites: 'No allowlisted sites yet',
  settingsAgentRulesNoSitesHint:
    'Add a site under "Agent site allowlist" first, then come back to configure its overrides.',
  settingsAgentRulesResetConfirmTitle: 'Restore interception rule defaults?',
  settingsAgentRulesResetConfirmMessage:
    'Restores the default global rules and removes every site override. This cannot be undone.',
  settingsAgentRulesHelpShow: 'How it works',
  settingsAgentRulesHelpGlobalTitle: 'How global rules work',
  settingsAgentRulesHelpGlobalIntro:
    'Global rules apply to every site in "{whitelist}". When you click a link or button, Adlo checks the element attributes in list order and then follows the rule action (open file or open URL).',
  settingsAgentRulesHelpGlobalStep1:
    'Make sure "{intercept}" is on, then add the target site under "{whitelist}" below it.',
  settingsAgentRulesHelpGlobalStep2:
    'Write the clickable element selector under "{selector}", then list the path attributes under "{attributes}" (for example title, data-file-path).',
  settingsAgentRulesHelpGlobalStep3:
    'Under "{preset}", choose "{fileLike}" or "{regex}". After saving, verify with a real click; when it fails, check the attribute value shape first.',
  settingsAgentRulesHelpSiteTitle: 'How site overrides work',
  settingsAgentRulesHelpSiteIntro:
    'A site override only affects the selected site in "{whitelist}": you can disable some global rules and add rules that exist only for this site. Site rules take precedence over global rules.',
  settingsAgentRulesHelpSiteStep1:
    'Add the target site under "{whitelist}", then select it under "{siteTab}".',
  settingsAgentRulesHelpSiteStep2:
    'Turn off the rules you do not need under "{globalEnabled}"; add site rules for extra behavior.',
  settingsAgentRulesHelpSiteStep3:
    'Verify on that site only. A site rule with the same id replaces the global rule.',
  settingsAgentRulesHelpFileLike:
    'Local file: accepts file://, drive paths (C:\\ or C:/) and UNC paths only. A site-relative path is not a local file.',
  settingsAgentRulesHelpRegex:
    'Custom regex: matches the raw attribute value with JS RegExp. For "Open URL", relative values are resolved against the page and only http(s) is accepted.',
  settingsAgentRulesHelpNote:
    'Rules are evaluated top to bottom and the first match wins. If a click does nothing, check "{intercept}" and "{whitelist}" first, then the attribute name and value.',
  settingsAgentRulesCopyPrompt: 'Copy agent prompt',
  settingsAgentRulesPromptNoSite: '(not selected)',
  settingsAgentRulesPromptNoAlias: '(no alias)',
  settingsAgentRulesPromptTestTarget:
    'the test page provided by the user (ask the user for its URL)',
  settingsAgentRulesCopyPromptShort: 'Copy prompt',
  settingsAgentRulesCopied: 'Copied',
  settingsAgentRulesCopyFailed: 'Copy failed. Please try again.',
  settingsAgentRulesCopyFailedShort: 'Copy failed',
  settingsAgentRulesExternalChanged:
    'The configuration changed externally. Saving will overwrite that change.',
  settingsAgentRulesPromptGlobal: `You are the maintainer assistant for Adlo's "Agent site link interception rules". Inspect the real behavior first, then edit the configuration by the rules below and confirm it took effect.

UI: Adlo -> Settings -> Open with -> Intercept agent-site links (master toggle) / Agent site allowlist / Interception rules.

## Goal
1. Use your product's built-in browser, browser automation skill, or equivalent to open and inspect: {testTarget}
2. Click through and record: local file paths, local audio/video, file:// links, relative paths, http(s) links, mailto:, regex rule hits and misses.
3. Find elements that do not open as expected and decide why: missing rule, selector mismatch, wrong attribute name, invalid regex, or wrong action.
4. Change only Adlo's interception rule configuration. After saving, confirm the app reloaded the config and verify again.

## Configuration file
- Location: {configPath} (installs may use <install-dir-name>-data next to the app; the data root shown in Settings → Storage is authoritative)
- If the default path does not exist: ask the user for the data directory shown in Adlo "Settings -> Storage", then append config/config.json. Do not edit a guessed file.
- Only change these top-level fields: agent_link_intercept, agent_site_whitelist, agent_site_rules, agent_site_overrides. Keep every other field untouched.
- agent_link_intercept must be true for the rules to run; agent_site_whitelist entries use a full origin (scheme + host + port, no path).
- To restore the product defaults, remove agent_site_rules and agent_site_overrides; an empty array means "no rules", not "defaults".
- Top-level fields use snake_case; rule objects use camelCase: matchSelector, pathPreset, valueRegex, regexFlags, disabledRuleIds, siteRules.
- Back up to config.json.bak-<timestamp> before writing; write a temp file and replace atomically; keep UTF-8.
- Never write secrets, tokens, or personal data unrelated to interception rules.

## Current configuration snapshot
{configJson}

## Rule semantics
- pathPreset=fileLike: the attribute value must be file://, a drive path (C:\\ or C:/), or a UNC path (\\\\server\\share). A site-relative /assets/x is not a local file.
- pathPreset=regex: valueRegex is matched against the raw attribute value with JS RegExp; regexFlags such as i are supported.
- action=file: follow the "File open method"; action=url: resolve relative values against the page and accept http(s) only.
- Site rules take precedence over global rules; a site rule with the same id replaces the global rule; disabledRuleIds only disables global rules.
- Rules are evaluated in array order and the first match wins; enabled=false skips a rule.

## Deliverable
- List the scenarios you checked and the result (pass / fail / reason).
- Show the before/after JSON fragments (rule-related fields only).
- State that the config was saved and the app reloaded it. If you cannot access the file or drive a browser, say so explicitly; never fake success.`,
  settingsAgentRulesPromptSite: `You are the maintainer assistant for Adlo's "Agent site link interception rules". Inspect the real behavior first, then edit the configuration by the rules below and confirm it took effect.

UI: Adlo -> Settings -> Open with -> Intercept agent-site links (master toggle) / Agent site allowlist / Interception rules.

## Target site
Only handle the site override whose origin is {site} ({alias}); confirm it is listed in agent_site_whitelist and only change its entry in agent_site_overrides.

## Goal
1. Use your product's built-in browser, browser automation skill, or equivalent to open and inspect: {testTarget}
2. Click through and record: local file paths, local audio/video, file:// links, relative paths, http(s) links, mailto:, regex rule hits and misses.
3. Find elements that do not open as expected and decide why: missing rule, selector mismatch, wrong attribute name, invalid regex, or wrong action.
4. Change only this site's override configuration. After saving, confirm the app reloaded the config and verify again.

## Configuration file
- Location: {configPath} (installs may use <install-dir-name>-data next to the app; the data root shown in Settings → Storage is authoritative)
- If the default path does not exist: ask the user for the data directory shown in Adlo "Settings -> Storage", then append config/config.json. Do not edit a guessed file.
- Only change these top-level fields: agent_link_intercept, agent_site_whitelist, agent_site_rules, agent_site_overrides. Keep every other field untouched.
- agent_link_intercept must be true for the rules to run; agent_site_whitelist entries use a full origin (scheme + host + port, no path).
- To restore the product defaults, remove agent_site_rules and agent_site_overrides; an empty array means "no rules", not "defaults".
- Top-level fields use snake_case; rule objects use camelCase: matchSelector, pathPreset, valueRegex, regexFlags, disabledRuleIds, siteRules.
- Back up to config.json.bak-<timestamp> before writing; write a temp file and replace atomically; keep UTF-8.
- Never write secrets, tokens, or personal data unrelated to interception rules.

## Current configuration snapshot
{configJson}

## Rule semantics
- pathPreset=fileLike: the attribute value must be file://, a drive path (C:\\ or C:/), or a UNC path (\\\\server\\share). A site-relative /assets/x is not a local file.
- pathPreset=regex: valueRegex is matched against the raw attribute value with JS RegExp; regexFlags such as i are supported.
- action=file: follow the "File open method"; action=url: resolve relative values against the page and accept http(s) only.
- Site rules take precedence over global rules; a site rule with the same id replaces the global rule; disabledRuleIds only disables global rules.
- Rules are evaluated in array order and the first match wins; enabled=false skips a rule.

## Deliverable
- List the scenarios you checked and the result (pass / fail / reason).
- Show the before/after JSON fragments (rule-related fields only).
- State that the config was saved and the app reloaded it. If you cannot access the file or drive a browser, say so explicitly; never fake success.`,
} as const;
