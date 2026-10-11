import { describe, it, expect } from 'vitest';
import { isLogMode, resolveBrowserDebugLogMode } from '../debugLogMode';

describe('resolveBrowserDebugLogMode', () => {
  it('prefers the CLI/env override over the user setting', () => {
    expect(resolveBrowserDebugLogMode('append', 'multi')).toBe('append');
  });

  it('falls back to the user setting when no override is set', () => {
    expect(resolveBrowserDebugLogMode(undefined, 'multi')).toBe('multi');
  });

  it('defaults to overwrite when neither is set', () => {
    expect(resolveBrowserDebugLogMode(undefined, undefined)).toBe('overwrite');
  });

  it('ignores invalid values on both channels', () => {
    expect(resolveBrowserDebugLogMode('rotate', 'nope')).toBe('overwrite');
    // 非法的 env 值不阻断合法的设置值。
    expect(resolveBrowserDebugLogMode('rotate', 'append')).toBe('append');
  });

  it('isLogMode only accepts the three valid modes', () => {
    expect(isLogMode('overwrite')).toBe(true);
    expect(isLogMode('append')).toBe(true);
    expect(isLogMode('multi')).toBe(true);
    expect(isLogMode('')).toBe(false);
    expect(isLogMode(undefined)).toBe(false);
    expect(isLogMode('Overwrite')).toBe(false);
  });
});
