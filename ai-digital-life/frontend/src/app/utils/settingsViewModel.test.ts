import { describe, it, expect } from 'vitest';
import { buildSettingsItems, preferencePatchFromSettingChange } from './settingsViewModel';
import type { AppInfo } from '../../kernel/types';
import type { CopyDict } from '../i18n';

const mockAppInfo: AppInfo = {
  appName: 'AI Digital Life',
  version: '1.0.0',
  config: {
    language: 'zh-CN',
    themeMode: 'system',
    resolvedTheme: 'light',
    logLevel: 'info',
    terminalLogMode: 'overwrite',
    debugLogMode: 'overwrite',
    maxRecentWorkspaces: 10,
    modelPreferences: {
      providers: {
        deepseek: { enabled: true, priority: 1, modelId: 'deepseek-chat', enabledModels: null },
        minimax: { enabled: false, priority: 2, modelId: 'abab6', enabledModels: null },
      },
    },
    keybinds: {},
    fonts: {},
    maxConcurrentWorkspaces: 6,
    workspacePriorityIds: [],
    workspaceDeferredIds: [],
    workspaceNaturalOrder: [],
    browserInactiveTabSuspendMs: 3_600_000,
    terminalHistoryBudgetBytes: 1 << 30,
  },
  currentWorkspace: undefined,
  recentLogs: [],
};

const mockT = {
  settingsLanguage: '语言',
  settingsTheme: '主题',
  settingsLogLevel: '日志级别',
} as unknown as CopyDict;

describe('buildSettingsItems', () => {
  it('includes language and themeMode in general group', () => {
    const items = buildSettingsItems(mockT, mockAppInfo);
    const ids = items.map((i) => i.id);
    expect(ids).toContain('language');
    expect(ids).toContain('themeMode');
  });

  it('includes logLevel/terminalLogMode/debugLogMode in general group', () => {
    const items = buildSettingsItems(mockT, mockAppInfo);
    const ids = items.map((i) => i.id);
    expect(ids).toContain('logLevel');
    expect(ids).toContain('terminalLogMode');
    expect(ids).toContain('debugLogMode');
  });

  it('does not generate model:* items (moved to providers group)', () => {
    const items = buildSettingsItems(mockT, mockAppInfo);
    const modelItems = items.filter((i) => i.id.startsWith('model:'));
    expect(modelItems).toHaveLength(0);
  });

  it('language select has zh-CN and en-US options', () => {
    const items = buildSettingsItems(mockT, mockAppInfo);
    const langItem = items.find((i) => i.id === 'language');
    expect(langItem?.type).toBe('select');
    expect(langItem?.options?.map((o) => o.value)).toEqual(['zh-CN', 'en-US']);
  });

  it('does not include approvalMode or workspacePath items (moved to CustomAgentSettings / sidebar)', () => {
    const items = buildSettingsItems(mockT, mockAppInfo);
    const ids = items.map((i) => i.id);
    expect(ids).not.toContain('approvalMode');
    expect(ids).not.toContain('workspacePath');
  });

  it('returns empty array when appInfo is undefined', () => {
    const items = buildSettingsItems(mockT, undefined);
    expect(items).toEqual([]);
  });

  it('includes font:ui/font:code/font:terminal items when config.fonts is present', () => {
    const appInfoWithFonts: AppInfo = {
      ...mockAppInfo,
      config: {
        ...mockAppInfo.config,
        fonts: { uiFont: 'Inter', codeFont: 'JetBrains Mono', terminalFont: 'Cascadia Code' },
      },
    };
    const items = buildSettingsItems(mockT, appInfoWithFonts);
    const ids = items.map((i) => i.id);
    expect(ids).toContain('font:ui');
    expect(ids).toContain('font:code');
    expect(ids).toContain('font:terminal');

    const uiItem = items.find((i) => i.id === 'font:ui');
    expect(uiItem?.type).toBe('font');
    expect(uiItem?.value).toBe('Inter');
    expect(uiItem?.cssVar).toBe('--font-sans-custom');

    const codeItem = items.find((i) => i.id === 'font:code');
    expect(codeItem?.cssVar).toBe('--font-mono-custom');
  });

  it('font items have empty string value when config.fonts fields are undefined', () => {
    const items = buildSettingsItems(mockT, mockAppInfo);
    const uiItem = items.find((i) => i.id === 'font:ui');
    expect(uiItem).toBeDefined();
    expect(uiItem?.value).toBe('');
  });
});

describe('preferencePatchFromSettingChange', () => {
  it('converts language change to patch', () => {
    const patch = preferencePatchFromSettingChange('language', 'en-US');
    expect(patch?.language).toBe('en-US');
  });

  it('converts themeMode change to patch', () => {
    const patch = preferencePatchFromSettingChange('themeMode', 'dark');
    expect(patch?.themeMode).toBe('dark');
  });

  it('converts logLevel change to patch', () => {
    const patch = preferencePatchFromSettingChange('logLevel', 'debug');
    expect(patch?.logLevel).toBe('debug');
  });

  it('converts terminalLogMode change to patch', () => {
    const patch = preferencePatchFromSettingChange('terminalLogMode', 'append');
    expect(patch?.terminalLogMode).toBe('append');
  });

  it('converts debugLogMode change to patch', () => {
    const patch = preferencePatchFromSettingChange('debugLogMode', 'multi');
    expect(patch?.debugLogMode).toBe('multi');
  });

  it('returns undefined for unknown id', () => {
    const patch = preferencePatchFromSettingChange('unknown', 'value');
    expect(patch).toBeUndefined();
  });

  it('returns undefined for model:* ids (removed)', () => {
    const patch = preferencePatchFromSettingChange('model:deepseek:enabled', true);
    expect(patch).toBeUndefined();
  });

  it('converts font:ui change to fonts patch with only uiFont', () => {
    const patch = preferencePatchFromSettingChange('font:ui', 'Inter');
    expect(patch?.fonts).toEqual({ uiFont: 'Inter' });
  });

  it('converts font:code change to fonts patch with only codeFont', () => {
    const patch = preferencePatchFromSettingChange('font:code', 'Fira Code');
    expect(patch?.fonts).toEqual({ codeFont: 'Fira Code' });
  });

  it('converts font:terminal change to fonts patch with only terminalFont', () => {
    const patch = preferencePatchFromSettingChange('font:terminal', 'Cascadia Code');
    expect(patch?.fonts).toEqual({ terminalFont: 'Cascadia Code' });
  });
});
