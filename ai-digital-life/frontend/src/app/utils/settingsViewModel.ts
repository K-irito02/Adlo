import type { AppPreferencePatch, LogMode, ThemeMode } from '../../shared/ipc-types.generated';
import type { AppInfo, SettingItem } from '../../kernel/types';
import type { CopyDict } from '../i18n';

export function buildSettingsItems(t: CopyDict, appInfo?: AppInfo): SettingItem[] {
  if (!appInfo) {
    return [];
  }
  const config = appInfo.config;
  const items: SettingItem[] = [];

  items.push({
    id: 'language',
    groupId: 'general',
    label: t.settingsLanguage,
    description: t.language,
    type: 'select',
    value: config.language,
    options: [
      { value: 'zh-CN', label: t.languageChinese },
      { value: 'en-US', label: 'English' },
    ],
  });

  items.push({
    id: 'themeMode',
    groupId: 'general',
    label: t.settingsTheme,
    description: t.theme,
    type: 'select',
    value: config.themeMode,
    options: [
      { value: 'system', label: t.themeSystem },
      { value: 'light', label: t.themeLight },
      { value: 'dark', label: t.themeDark },
    ],
  });

  const logModeOptions = [
    { value: 'overwrite', label: t.settingsLogModeOverwrite },
    { value: 'append', label: t.settingsLogModeAppend },
    { value: 'multi', label: t.settingsLogModeMulti },
  ];

  items.push({
    id: 'logLevel',
    groupId: 'general',
    label: t.settingsLogLevel,
    description: t.settingsLogLevelDesc,
    type: 'select',
    value: config.logLevel,
    options: [
      { value: 'error', label: 'Error' },
      { value: 'warn', label: 'Warn' },
      { value: 'info', label: 'Info' },
      { value: 'debug', label: 'Debug' },
      { value: 'trace', label: 'Trace' },
    ],
  });

  items.push({
    id: 'terminalLogMode',
    groupId: 'general',
    label: t.settingsTerminalLogMode,
    type: 'select',
    value: config.terminalLogMode,
    options: logModeOptions,
  });

  items.push({
    id: 'debugLogMode',
    groupId: 'general',
    label: t.settingsDebugLogMode,
    type: 'select',
    value: config.debugLogMode,
    options: logModeOptions,
  });

  if (config.fonts) {
    items.push({
      id: 'font:ui',
      groupId: 'general',
      label: t.settingsFontUi,
      type: 'font',
      value: config.fonts.uiFont ?? '',
      cssVar: '--font-sans-custom',
    });
    items.push({
      id: 'font:code',
      groupId: 'general',
      label: t.settingsFontCode,
      type: 'font',
      value: config.fonts.codeFont ?? '',
      cssVar: '--font-mono-custom',
    });
    items.push({
      id: 'font:terminal',
      groupId: 'general',
      label: t.settingsFontTerminal,
      type: 'font',
      value: config.fonts.terminalFont ?? '',
      cssVar: '--font-mono-custom',
    });
  }

  return items;
}

export function preferencePatchFromSettingChange(
  id: string,
  value: string | boolean | number
): AppPreferencePatch | undefined {
  if (id === 'language') {
    return { language: value as string };
  }
  if (id === 'themeMode') {
    return { themeMode: value as ThemeMode };
  }
  if (id === 'logLevel') {
    return { logLevel: value as string };
  }
  if (id === 'terminalLogMode') {
    return { terminalLogMode: value as LogMode };
  }
  if (id === 'debugLogMode') {
    return { debugLogMode: value as LogMode };
  }
  if (id === 'font:ui') {
    return { fonts: { uiFont: value as string } };
  }
  if (id === 'font:code') {
    return { fonts: { codeFont: value as string } };
  }
  if (id === 'font:terminal') {
    return { fonts: { terminalFont: value as string } };
  }
  if (id === 'maxConcurrentWorkspaces') {
    return { maxConcurrentWorkspaces: value as number };
  }
  if (id === 'workspacePriorityIds') {
    return { workspacePriorityIds: value as unknown as string[] };
  }
  if (id === 'workspaceDeferredIds') {
    return { workspaceDeferredIds: value as unknown as string[] };
  }
  return undefined;
}
