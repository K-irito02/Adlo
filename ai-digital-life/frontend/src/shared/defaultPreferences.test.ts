import { describe, it, expect } from 'vitest';
import {
  getDefaultPreferences,
  getDefaultForSetting,
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
    expect(DEFAULT_KEYBINDS['session.new']).toBe('mod+shift+n');
    expect(DEFAULT_KEYBINDS['workspace.new']).toBe('mod+n');
    expect(DEFAULT_KEYBINDS['workspace.open']).toBe('mod+o');
    expect(DEFAULT_KEYBINDS['settings.open']).toBe('mod+shift+comma');
  });

  it('getDefaultPreferences returns fresh copies (no shared mutation)', () => {
    const first = getDefaultPreferences();
    if (first.keybinds) {
      first.keybinds['session.new'] = 'mutated';
    }
    if (first.fonts) {
      first.fonts.uiFont = 'mutated';
    }
    const second = getDefaultPreferences();
    expect(second.keybinds?.['session.new']).toBe('mod+shift+n');
    expect(second.fonts?.uiFont).toBe('');
  });
});
