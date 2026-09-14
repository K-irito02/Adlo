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
  settingsDsh: 'DeepSeek Harness',

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
  settingsTheme: 'Theme',
  settingsThemeSystem: 'System',
  settingsThemeLight: 'Light',
  settingsThemeDark: 'Dark',
  settingsAutoApproval: 'Auto-approval level',
  settingsLogLevel: 'Log Level',
  settingsLogLevelDesc: 'Verbosity of application logs',
  settingsTerminalLogMode: 'Terminal Log Mode',
  settingsDebugLogMode: 'Debug Log Mode',
  settingsLogModeOverwrite: 'Overwrite',
  settingsLogModeAppend: 'Append',
  settingsLogModeMulti: 'Multi-file',

  // Font settings
  settingsFontUi: 'UI Font',
  settingsFontCode: 'Code Font',
  settingsFontTerminal: 'Terminal Font',
  settingsFontPreview: 'Preview: The quick brown fox 1234567890',

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

  // Accessibility
  settingsToggleVisibility: 'Toggle visibility',
  settingsSearchLabel: 'Search settings',

  // Command titles
  commandSessionNew: 'New Session',
  commandWorkspaceNew: 'New Workspace',
  commandWorkspaceOpen: 'Open Workspace',
  commandSettingsOpen: 'Open Settings',
} as const;
