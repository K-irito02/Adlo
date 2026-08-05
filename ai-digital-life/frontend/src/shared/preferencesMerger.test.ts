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
    providers: {
      deepseek: { enabled: true, priority: 1, modelId: 'deepseek-chat', enabledModels: [] },
    },
  },
  keybinds: {},
  fonts: {},
  maxConcurrentWorkspaces: 6,
  workspacePriorityIds: [],
  workspaceDeferredIds: [],
  workspaceNaturalOrder: [],
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

  it('merges enabledModels from patch onto existing provider', () => {
    const patch = {
      modelPreferences: { deepseek: { enabledModels: ['deepseek-reasoner'] } },
    } as AppPreferencePatch;
    const result = applyPreferencePatch(baseConfig, patch);
    expect(result.modelPreferences.providers.deepseek.enabledModels).toEqual(['deepseek-reasoner']);
  });

  it('clears enabledModels when patch provides empty array', () => {
    const baseWithModels: ConfigSnapshot = {
      ...baseConfig,
      modelPreferences: {
        providers: {
          deepseek: {
            enabled: true,
            priority: 1,
            modelId: 'deepseek-chat',
            enabledModels: ['deepseek-chat'],
          },
        },
      },
    };
    const patch = {
      modelPreferences: { deepseek: { enabledModels: [] } },
    } as AppPreferencePatch;
    const result = applyPreferencePatch(baseWithModels, patch);
    expect(result.modelPreferences.providers.deepseek.enabledModels).toEqual([]);
  });

  it('creates a new provider entry with defaults when patching a non-seeded provider', () => {
    const patch = {
      modelPreferences: { openai: { enabledModels: ['gpt-4o'] } },
    } as AppPreferencePatch;
    const result = applyPreferencePatch(baseConfig, patch);
    const openai = result.modelPreferences.providers.openai;
    expect(openai).toBeDefined();
    expect(openai.enabled).toBe(true);
    expect(openai.priority).toBe(10);
    expect(openai.modelId).toBe('openai');
    expect(openai.enabledModels).toEqual(['gpt-4o']);
  });

  it('leaves enabledModels untouched when patch omits it', () => {
    const baseWithModels: ConfigSnapshot = {
      ...baseConfig,
      modelPreferences: {
        providers: {
          deepseek: {
            enabled: true,
            priority: 1,
            modelId: 'deepseek-chat',
            enabledModels: ['deepseek-chat'],
          },
        },
      },
    };
    const patch: AppPreferencePatch = {
      modelPreferences: { deepseek: { priority: 2 } },
    };
    const result = applyPreferencePatch(baseWithModels, patch);
    expect(result.modelPreferences.providers.deepseek.enabledModels).toEqual(['deepseek-chat']);
  });
});
