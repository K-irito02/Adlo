import type {
  AgentSiteAllowEntry,
  AppPreferencePatch,
  LogLevel,
  ThemeMode,
} from '../../shared/ipc-types.generated';
import { isLogMode } from './debugLogMode';
import type { AppInfo, SettingItem } from '../../kernel/types';
import type { CopyDict } from '../i18n';
import { normalizeAgentSiteEntries } from '@shared/originWhitelist';
import { isTauriShell } from '@shared/env';

const LOG_LEVELS: readonly string[] = ['error', 'warn', 'info', 'debug', 'trace'];

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && LOG_LEVELS.includes(value);
}

const THEME_MODES: readonly string[] = ['light', 'dark', 'system'];

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && THEME_MODES.includes(value);
}

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
    description: t.settingsLanguageDesc,
    type: 'select',
    value: config.language,
    options: [
      // 'system' = 跟随系统语言（默认；产品决策 2026-09-27），选定具体语言后成为个人默认基线。
      { value: 'system', label: t.languageSystem },
      { value: 'zh-CN', label: t.languageChinese },
      { value: 'en-US', label: 'English' },
    ],
  });

  items.push({
    id: 'themeMode',
    groupId: 'general',
    label: t.settingsTheme,
    description: t.settingsThemeDesc,
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
    description: t.settingsTerminalLogModeDesc,
    type: 'select',
    value: config.terminalLogMode,
    options: logModeOptions,
  });

  items.push({
    id: 'debugLogMode',
    groupId: 'general',
    label: t.settingsDebugLogMode,
    description: t.settingsDebugLogModeDesc,
    type: 'select',
    value: config.debugLogMode,
    options: logModeOptions,
  });

  items.push({
    id: 'linkOpenMethod',
    groupId: 'openMethod',
    label: t.settingsLinkOpenMethod,
    description: t.settingsLinkOpenMethodDesc,
    type: 'select',
    value: config.linkOpenMethod,
    options: [
      { value: 'middle', label: t.settingsLinkOpenMiddle },
      { value: 'panel', label: t.settingsLinkOpenPanel },
      { value: 'external', label: t.settingsLinkOpenExternal },
    ],
  });

  items.push({
    id: 'fileOpenMethod',
    groupId: 'openMethod',
    label: t.settingsFileOpenMethod,
    description: t.settingsFileOpenMethodDesc,
    type: 'select',
    value: config.fileOpenMethod,
    options: [
      { value: 'panel', label: t.settingsFileOpenPanel },
      { value: 'external', label: t.settingsFileOpenExternal },
    ],
  });

  // Agent 链接拦截依赖 Tauri WebView 注入，浏览器模式无法实现（Task 10）。
  const agentInterceptAvailable = isTauriShell();
  const agentDesktopOnlyHint = agentInterceptAvailable ? '' : ` ${t.settingsAgentDesktopOnlyHint}`;

  items.push({
    id: 'agentLinkIntercept',
    groupId: 'openMethod',
    label: t.settingsAgentIntercept,
    description: `${t.settingsAgentInterceptDesc}${agentDesktopOnlyHint}`,
    type: 'toggle',
    value: config.agentLinkIntercept,
    disabled: !agentInterceptAvailable,
  });

  // 拦截关闭时隐藏白名单：不仅避免误配，也让拦截行与白名单行自然无需分隔线。
  if (config.agentLinkIntercept) {
    items.push({
      id: 'openMethod:agentSiteWhitelist',
      groupId: 'openMethod',
      label: t.settingsAgentWhitelist,
      description: `${t.settingsAgentWhitelistDesc}${agentDesktopOnlyHint}`,
      type: 'allowlist',
      value: config.agentSiteWhitelist,
      disabled: !agentInterceptAvailable,
    });
  }

  if (config.fonts) {
    items.push({
      id: 'font:ui',
      groupId: 'general',
      label: t.settingsFontUi,
      description: t.settingsFontUiDesc,
      type: 'font',
      value: config.fonts.uiFont ?? '',
      cssVar: '--font-sans-custom',
    });
    items.push({
      id: 'font:code',
      groupId: 'general',
      label: t.settingsFontCode,
      description: t.settingsFontCodeDesc,
      type: 'font',
      value: config.fonts.codeFont ?? '',
      cssVar: '--font-mono-custom',
    });
    items.push({
      id: 'font:terminal',
      groupId: 'general',
      label: t.settingsFontTerminal,
      description: t.settingsFontTerminalDesc,
      type: 'font',
      value: config.fonts.terminalFont ?? '',
      cssVar: '--font-mono-custom',
    });
  }

  return items;
}

export function preferencePatchFromSettingChange(
  id: string,
  value: string | boolean | number | AgentSiteAllowEntry[],
): AppPreferencePatch | undefined {
  if (id === 'language') {
    return { language: value as string };
  }
  if (id === 'themeMode') {
    return isThemeMode(value) ? { themeMode: value } : undefined;
  }
  if (id === 'logLevel') {
    // 纵深守卫（Phase 4 R10）：UI select 已约束取值，运行时误传（如外部直调）
    // 在此拦截；主防线仍是 Rust serde 校验（非法值 HTTP 400）。
    return isLogLevel(value) ? { logLevel: value } : undefined;
  }
  if (id === 'terminalLogMode') {
    return isLogMode(value) ? { terminalLogMode: value } : undefined;
  }
  if (id === 'debugLogMode') {
    return isLogMode(value) ? { debugLogMode: value } : undefined;
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
  if (id === 'linkOpenMethod') {
    return value === 'middle' || value === 'panel' || value === 'external'
      ? { linkOpenMethod: value }
      : undefined;
  }
  if (id === 'fileOpenMethod') {
    return value === 'panel' || value === 'external' ? { fileOpenMethod: value } : undefined;
  }
  if (id === 'agentLinkIntercept') {
    return { agentLinkIntercept: value === true };
  }
  if (id === 'openMethod:agentSiteWhitelist') {
    return { agentSiteWhitelist: normalizeAgentSiteEntries(value) };
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
