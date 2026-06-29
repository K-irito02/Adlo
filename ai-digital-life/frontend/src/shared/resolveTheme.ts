import { resolveThemeMode, type ThemeMode } from '../design-system/theme';

export function resolveCurrentTheme(themeMode: ThemeMode): 'light' | 'dark' {
  if (themeMode !== 'system') {
    return themeMode;
  }
  const prefersDark =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false);
  return resolveThemeMode(themeMode, prefersDark);
}
