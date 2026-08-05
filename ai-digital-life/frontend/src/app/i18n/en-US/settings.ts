export const settingsEn = {
  // General
  settingsTitle: 'Application Settings',
  settingsSearch: 'Search settings...',
  settingsResetToDefault: 'Reset to default',
  settingsResetAll: 'Reset all to defaults',
  settingsNoResults: 'No matching settings',

  // Group labels
  settingsGeneral: 'General',
  settingsAgent: 'Agent',
  settingsWorkspace: 'Workspace',
  settingsShortcuts: 'Shortcuts',
  settingsMcp: 'MCP Servers',
  settingsModels: 'Models',
  settingsCommands: 'Custom Commands',
  settingsPermissions: 'Permission Rules',
  settingsReferences: 'References',
  settingsLsp: 'Language Server',

  // Settings section descriptions
  settingsModelsDesc: 'Configure model providers, credentials and enabled models',
  settingsReferencesDesc: 'Manage reference materials and documentation',
  settingsAgentDesc: 'Configure custom agent behaviors and presets',

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
