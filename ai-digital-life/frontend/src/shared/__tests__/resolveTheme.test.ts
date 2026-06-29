import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resolveCurrentTheme } from '../resolveTheme';

describe('resolveCurrentTheme', () => {
  let matchMediaSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    matchMediaSpy = vi.spyOn(window, 'matchMedia');
  });

  afterEach(() => {
    matchMediaSpy.mockRestore();
  });

  it('returns "dark" when themeMode is "dark" regardless of system preference', () => {
    matchMediaSpy.mockReturnValue({ matches: false } as MediaQueryList);
    expect(resolveCurrentTheme('dark')).toBe('dark');

    matchMediaSpy.mockReturnValue({ matches: true } as MediaQueryList);
    expect(resolveCurrentTheme('dark')).toBe('dark');
  });

  it('returns "light" when themeMode is "light" regardless of system preference', () => {
    matchMediaSpy.mockReturnValue({ matches: true } as MediaQueryList);
    expect(resolveCurrentTheme('light')).toBe('light');

    matchMediaSpy.mockReturnValue({ matches: false } as MediaQueryList);
    expect(resolveCurrentTheme('light')).toBe('light');
  });

  it('returns "dark" when themeMode is "system" and system prefers dark', () => {
    matchMediaSpy.mockReturnValue({ matches: true } as MediaQueryList);
    expect(resolveCurrentTheme('system')).toBe('dark');
  });

  it('returns "light" when themeMode is "system" and system prefers light', () => {
    matchMediaSpy.mockReturnValue({ matches: false } as MediaQueryList);
    expect(resolveCurrentTheme('system')).toBe('light');
  });

  it('returns "light" when themeMode is "system" and matchMedia is unavailable', () => {
    matchMediaSpy.mockReturnValue(undefined as unknown as MediaQueryList);
    expect(resolveCurrentTheme('system')).toBe('light');
  });
});
