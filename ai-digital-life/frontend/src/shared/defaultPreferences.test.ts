import { describe, it, expect } from 'vitest';
import {
  getDefaultPreferences,
  getDefaultForSetting,
  DEFAULT_BROWSER_SUSPEND_MS,
  DEFAULT_KEYBINDS,
  DEFAULT_FONTS,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME_MODE,
  DEFAULT_LOG_LEVEL,
  DEFAULT_TERMINAL_LOG_MODE,
  DEFAULT_DEBUG_LOG_MODE,
} from './defaultPreferences';

describe('defaultPreferences', () => {
  it('returns full patch with all defaults', () => {
    const defaults = getDefaultPreferences();
    expect(defaults.language).toBe('zh-CN');
    expect(defaults.themeMode).toBe('system');
    expect(defaults.logLevel).toBe('info');
    expect(defaults.terminalLogMode).toBe('overwrite');
    expect(defaults.debugLogMode).toBe('overwrite');
  });

  it('omits modelPreferences from default patch', () => {
    const defaults = getDefaultPreferences();
    expect(defaults).not.toHaveProperty('modelPreferences');
  });

  it('returns fonts with empty strings (not null) for all font fields', () => {
    const defaults = getDefaultPreferences();
    expect(defaults.fonts).toEqual({
      uiFont: '',
      codeFont: '',
      terminalFont: '',
    });
    expect(defaults.fonts?.uiFont).toBe('');
    expect(defaults.fonts?.codeFont).toBe('');
    expect(defaults.fonts?.terminalFont).toBe('');
  });

  it('DEFAULT_FONTS uses empty strings, not null', () => {
    expect(DEFAULT_FONTS.uiFont).toBe('');
    expect(DEFAULT_FONTS.codeFont).toBe('');
    expect(DEFAULT_FONTS.terminalFont).toBe('');
  });

  it('getDefaultForSetting returns correct value per id', () => {
    expect(getDefaultForSetting('language')).toBe(DEFAULT_LANGUAGE);
    expect(getDefaultForSetting('themeMode')).toBe(DEFAULT_THEME_MODE);
    expect(getDefaultForSetting('logLevel')).toBe(DEFAULT_LOG_LEVEL);
    expect(getDefaultForSetting('terminalLogMode')).toBe(DEFAULT_TERMINAL_LOG_MODE);
    expect(getDefaultForSetting('debugLogMode')).toBe(DEFAULT_DEBUG_LOG_MODE);
  });

  it('getDefaultForSetting returns the suspend default for browserInactiveTabSuspendMs', () => {
    // 与 getDefaultPreferences() 的挂起字段同源；缺分支会回 undefined（F5）。
    expect(getDefaultForSetting('browserInactiveTabSuspendMs')).toBe(DEFAULT_BROWSER_SUSPEND_MS);
  });

  it('getDefaultForSetting returns empty string for font settings', () => {
    expect(getDefaultForSetting('font:ui')).toBe('');
    expect(getDefaultForSetting('font:code')).toBe('');
    expect(getDefaultForSetting('font:terminal')).toBe('');
  });

  it('getDefaultForSetting returns undefined for unknown id', () => {
    expect(getDefaultForSetting('unknown')).toBeUndefined();
    expect(getDefaultForSetting('modelPreferences.deepseek.modelId')).toBeUndefined();
  });

  it('DEFAULT_KEYBINDS includes settings.open', () => {
    expect(DEFAULT_KEYBINDS['settings.open']).toBeDefined();
  });

  it('DEFAULT_KEYBINDS includes expected command defaults', () => {
    expect(DEFAULT_KEYBINDS['workspace.new']).toBe('mod+n');
    expect(DEFAULT_KEYBINDS['workspace.open']).toBe('mod+o');
    expect(DEFAULT_KEYBINDS['settings.open']).toBe('mod+shift+comma');
  });

  it('getDefaultPreferences returns fresh copies (no shared mutation)', () => {
    const first = getDefaultPreferences();
    if (first.keybinds) {
      first.keybinds['workspace.open'] = 'mutated';
    }
    if (first.fonts) {
      first.fonts.uiFont = 'mutated';
    }
    const second = getDefaultPreferences();
    expect(second.keybinds?.['workspace.open']).toBe('mod+o');
    expect(second.fonts?.uiFont).toBe('');
  });
});

import { DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES } from './defaultPreferences';

describe('terminal history budget default', () => {
  it('默认预算为 1 GiB', () => {
    expect(DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES).toBe(1 << 30);
  });

  it('可作为设置项取到默认值', () => {
    expect(getDefaultForSetting('terminalHistoryBudgetBytes')).toBe(1 << 30);
  });
});

it('exposes 14 customizable commands with stable defaults', () => {
  expect(DEFAULT_KEYBINDS['view.terminal']).toBe('mod+shift+`');
  expect(DEFAULT_KEYBINDS['zoom.in']).toBe('mod+shift+plus');
  expect(DEFAULT_KEYBINDS['zoom.out']).toBe('mod+-');
  expect(DEFAULT_KEYBINDS['zoom.reset']).toBe('mod+0');
  expect(DEFAULT_KEYBINDS['file.copy-relative']).toBe('mod+shift+c');
  expect(DEFAULT_KEYBINDS['file.copy-full']).toBe('mod+alt+c');
  expect(DEFAULT_KEYBINDS['file.toggle-word-wrap']).toBe('alt+z');
  expect(DEFAULT_KEYBINDS['file.toggle-line-numbers']).toBeUndefined();
});
