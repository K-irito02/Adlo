import { describe, it, expect } from 'vitest';
import { applyPreferencePatch } from './preferencesMerger';
import type { AppPreferencePatch, ConfigSnapshot } from './ipc-types.generated';

const baseConfig: ConfigSnapshot = {
  language: 'zh-CN',
  themeMode: 'system',
  resolvedTheme: 'light',
  logLevel: 'info',
  terminalLogMode: 'overwrite',
  debugLogMode: 'overwrite',
  maxRecentWorkspaces: 10,
  modelPreferences: {
    providers: { deepseek: { enabled: true, priority: 1, modelId: 'deepseek-chat' } },
  },
  keybinds: {},
  fonts: {},
  maxConcurrentWorkspaces: 6,
  workspacePriorityIds: [],
  workspaceDeferredIds: [],
};

describe('applyPreferencePatch', () => {
  it('applies logLevel patch', () => {
    const patch: AppPreferencePatch = { logLevel: 'debug' };
    const result = applyPreferencePatch(baseConfig, patch);
    expect(result.logLevel).toBe('debug');
  });

  it('applies terminalLogMode patch', () => {
    const patch: AppPreferencePatch = { terminalLogMode: 'append' };
    const result = applyPreferencePatch(baseConfig, patch);
    expect(result.terminalLogMode).toBe('append');
  });

  it('applies debugLogMode patch', () => {
    const patch: AppPreferencePatch = { debugLogMode: 'multi' };
    const result = applyPreferencePatch(baseConfig, patch);
    expect(result.debugLogMode).toBe('multi');
  });

  it('preserves existing fields when patching logLevel only', () => {
    const patch: AppPreferencePatch = { logLevel: 'warn' };
    const result = applyPreferencePatch(baseConfig, patch);
    expect(result.language).toBe('zh-CN');
    expect(result.terminalLogMode).toBe('overwrite');
  });

  it('applies keybinds patch', () => {
    const patch: AppPreferencePatch = { keybinds: { 'command.openSettings': 'mod+comma' } };
    const result = applyPreferencePatch(baseConfig, patch);
    expect(result.keybinds['command.openSettings']).toBe('mod+comma');
  });

  it('applies fonts patch partially without overwriting unspecified fields', () => {
    const baseWithFonts: ConfigSnapshot = {
      ...baseConfig,
      fonts: { uiFont: 'OriginalUI', codeFont: 'OriginalCode' },
    };
    const patch: AppPreferencePatch = { fonts: { uiFont: 'Inter' } };
    const result = applyPreferencePatch(baseWithFonts, patch);
    expect(result.fonts.uiFont).toBe('Inter');
    expect(result.fonts.codeFont).toBe('OriginalCode');
    expect(result.fonts.terminalFont).toBeUndefined();
  });

  it('preserves existing keybinds when patching fonts only', () => {
    const baseWithKeybinds: ConfigSnapshot = {
      ...baseConfig,
      keybinds: { 'command.save': 'mod+s' },
    };
    const patch: AppPreferencePatch = { fonts: { uiFont: 'Inter' } };
    const result = applyPreferencePatch(baseWithKeybinds, patch);
    expect(result.keybinds['command.save']).toBe('mod+s');
  });
});
