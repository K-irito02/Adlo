import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildSettingsItems, preferencePatchFromSettingChange } from './settingsViewModel';
import type { AppInfo } from '../../kernel/types';
import type { CopyDict } from '../i18n';

const envState = vi.hoisted(() => ({ tauri: false }));

vi.mock('@shared/env', () => ({ isTauriShell: () => envState.tauri }));

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
    linkOpenMethod: 'panel',
    fileOpenMethod: 'panel',
    agentLinkIntercept: false,
    agentSiteWhitelist: [],
  },
  currentWorkspace: undefined,
  recentLogs: [],
};

const mockT = {
  settingsLanguage: '语言',
  settingsTheme: '主题',
  settingsLogLevel: '日志级别',
  settingsAgentInterceptDesc: 'settingsAgentInterceptDesc',
  settingsAgentWhitelistDesc: 'settingsAgentWhitelistDesc',
  settingsAgentDesktopOnlyHint: 'settingsAgentDesktopOnlyHint',
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

  it('language select has system (follow OS), zh-CN and en-US options', () => {
    const items = buildSettingsItems(mockT, mockAppInfo);
    const langItem = items.find((i) => i.id === 'language');
    expect(langItem?.type).toBe('select');
    expect(langItem?.options?.map((o) => o.value)).toEqual(['system', 'zh-CN', 'en-US']);
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

  it('hides the agent whitelist while link interception is off', () => {
    const items = buildSettingsItems(mockT, mockAppInfo);
    expect(items.find((i) => i.id === 'openMethod:agentSiteWhitelist')).toBeUndefined();
  });

  it('includes the four openMethod group items with correct types and values', () => {
    const openAppInfo: AppInfo = {
      ...mockAppInfo,
      config: { ...mockAppInfo.config, agentLinkIntercept: true },
    };
    const items = buildSettingsItems(mockT, openAppInfo);

    const link = items.find((i) => i.id === 'linkOpenMethod');
    expect(link?.groupId).toBe('openMethod');
    expect(link?.type).toBe('select');
    expect(link?.value).toBe('panel');
    expect(link?.options?.map((o) => o.value)).toEqual(['middle', 'panel', 'external']);

    const file = items.find((i) => i.id === 'fileOpenMethod');
    expect(file?.groupId).toBe('openMethod');
    expect(file?.type).toBe('select');
    expect(file?.value).toBe('panel');
    expect(file?.options?.map((o) => o.value)).toEqual(['panel', 'external']);

    const intercept = items.find((i) => i.id === 'agentLinkIntercept');
    expect(intercept?.groupId).toBe('openMethod');
    expect(intercept?.type).toBe('toggle');
    expect(intercept?.value).toBe(true);

    const whitelist = items.find((i) => i.id === 'openMethod:agentSiteWhitelist');
    expect(whitelist?.groupId).toBe('openMethod');
    expect(whitelist?.type).toBe('allowlist');
    expect(whitelist?.value).toEqual([]);
  });

  it('exposes agentSiteWhitelist entries for the allowlist control', () => {
    const appInfo: AppInfo = {
      ...mockAppInfo,
      config: {
        ...mockAppInfo.config,
        agentLinkIntercept: true,
        agentSiteWhitelist: [
          { alias: '工作台', origin: 'http://127.0.0.1:3080' },
          { origin: 'https://my-agent.example.com' },
        ],
      },
    };
    const whitelist = buildSettingsItems(mockT, appInfo).find(
      (i) => i.id === 'openMethod:agentSiteWhitelist',
    );
    expect(whitelist?.value).toEqual([
      { alias: '工作台', origin: 'http://127.0.0.1:3080' },
      { origin: 'https://my-agent.example.com' },
    ]);
  });
});

describe('buildSettingsItems agent-link availability', () => {
  afterEach(() => {
    envState.tauri = false;
  });

  it('hides the whitelist while interception is off and keeps the toggle disabled in browser mode', () => {
    envState.tauri = false;
    const items = buildSettingsItems(mockT, mockAppInfo);
    const intercept = items.find((i) => i.id === 'agentLinkIntercept');
    expect(intercept?.disabled).toBe(true);
    expect(intercept?.description).toContain('settingsAgentDesktopOnlyHint');
    expect(items.find((i) => i.id === 'openMethod:agentSiteWhitelist')).toBeUndefined();
  });

  it('leaves URL/file open-method items enabled in browser mode', () => {
    envState.tauri = false;
    const items = buildSettingsItems(mockT, mockAppInfo);
    expect(items.find((i) => i.id === 'linkOpenMethod')?.disabled).toBeUndefined();
    expect(items.find((i) => i.id === 'fileOpenMethod')?.disabled).toBeUndefined();
  });

  it('enables agent intercept + whitelist and omits the hint in Tauri', () => {
    envState.tauri = true;
    const openAppInfo: AppInfo = {
      ...mockAppInfo,
      config: { ...mockAppInfo.config, agentLinkIntercept: true },
    };
    const items = buildSettingsItems(mockT, openAppInfo);
    const intercept = items.find((i) => i.id === 'agentLinkIntercept');
    const whitelist = items.find((i) => i.id === 'openMethod:agentSiteWhitelist');
    expect(intercept?.disabled).toBe(false);
    expect(whitelist?.disabled).toBe(false);
    expect(intercept?.description).not.toContain('settingsAgentDesktopOnlyHint');
    expect(whitelist?.description).not.toContain('settingsAgentDesktopOnlyHint');
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

  it('rejects invalid logLevel values before they reach the backend', () => {
    // 纵深守卫（Phase 4 R10）：非法值本地拦截，主防线仍是 Rust 400。
    expect(preferencePatchFromSettingChange('logLevel', 'verbose')).toBeUndefined();
    expect(preferencePatchFromSettingChange('logLevel', 'INFO')).toBeUndefined();
  });

  it('rejects invalid themeMode and log modes before they reach the backend', () => {
    // Closing L-7：与 logLevel 同语义，非法一律返回 undefined。
    expect(preferencePatchFromSettingChange('themeMode', 'blue')).toBeUndefined();
    expect(preferencePatchFromSettingChange('terminalLogMode', 'rotate')).toBeUndefined();
    expect(preferencePatchFromSettingChange('debugLogMode', 'MULTI')).toBeUndefined();
    expect(preferencePatchFromSettingChange('themeMode', 'dark')?.themeMode).toBe('dark');
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

  it('converts linkOpenMethod change to patch and rejects invalid values', () => {
    expect(preferencePatchFromSettingChange('linkOpenMethod', 'middle')).toEqual({
      linkOpenMethod: 'middle',
    });
    expect(preferencePatchFromSettingChange('linkOpenMethod', 'external')).toEqual({
      linkOpenMethod: 'external',
    });
    expect(preferencePatchFromSettingChange('linkOpenMethod', 'nope')).toBeUndefined();
  });

  it('converts fileOpenMethod change to patch and rejects invalid values', () => {
    expect(preferencePatchFromSettingChange('fileOpenMethod', 'external')).toEqual({
      fileOpenMethod: 'external',
    });
    expect(preferencePatchFromSettingChange('fileOpenMethod', 'middle')).toBeUndefined();
  });

  it('converts agentLinkIntercept change to patch', () => {
    expect(preferencePatchFromSettingChange('agentLinkIntercept', true)).toEqual({
      agentLinkIntercept: true,
    });
    expect(preferencePatchFromSettingChange('agentLinkIntercept', false)).toEqual({
      agentLinkIntercept: false,
    });
  });

  it('normalizes agentSiteWhitelist entries and drops invalid origins', () => {
    expect(
      preferencePatchFromSettingChange('openMethod:agentSiteWhitelist', [
        { alias: ' 工作台 ', origin: 'http://127.0.0.1:3080/chat/1' },
        { origin: 'https://my-agent.example.com/foo' },
        { alias: '', origin: 'http://127.0.0.1:3080' },
        { alias: '坏', origin: 'not-a-url' },
      ]),
    ).toEqual({
      agentSiteWhitelist: [
        { alias: '工作台', origin: 'http://127.0.0.1:3080' },
        { origin: 'https://my-agent.example.com' },
      ],
    });
    // 非数组脏值直接拒绝（undefined），禁止落盘空数组清空用户白名单。
    expect(preferencePatchFromSettingChange('openMethod:agentSiteWhitelist', 'nope')).toBeUndefined();
    // 空数组是合法清空意图，仍返回空 patch。
    expect(preferencePatchFromSettingChange('openMethod:agentSiteWhitelist', [])).toEqual({
      agentSiteWhitelist: [],
    });
  });
});
