import { resolveThemeMode, systemPrefersDark, type ThemeMode } from '../design-system/theme';

/**
 * 根据 themeMode 解析当前实际主题。
 *
 * Rust 后端在 System 模式下硬编码为 Light（无法访问 OS prefers-color-scheme），
 * 前端通过此函数修正。
 */
export function resolveCurrentTheme(themeMode: ThemeMode): 'light' | 'dark' {
  return resolveThemeMode(themeMode, systemPrefersDark());
}
