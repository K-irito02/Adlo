import { useMemo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useResolvedTheme } from '@hooks/useResolvedTheme';
import type {
  DarkMarkdownTheme,
  LightMarkdownTheme,
  MarkdownTheme,
} from '@stores/slices/uiSliceTypes';
// 变量驱动单一样式表（事项 8 方案 A）：
// 由 frontend/scripts/generate-md-theme-vars.mjs 从 github-markdown-css@5.9.0 生成，
// 结构取 light.css（实证 6 文件结构一致），颜色逐槽映射为 --md-*，6 主题各给一组值。
// 切换 = 容器 data-md-theme 属性翻转（纯变量重算，原子同步，零取数零闪烁）。
// starry 高亮的 pl-* 类由本文件的 github `.markdown-body .pl-*` 规则着色，不再需要
// starry 主题 CSS（已删除 vendor）。
import markdownThemeCss from '@root/styles/vendor/markdown-theme-vars.css?inline';

export const LIGHT_MARKDOWN_THEMES: readonly LightMarkdownTheme[] = ['light', 'light-colorblind'];

export const DARK_MARKDOWN_THEMES: readonly DarkMarkdownTheme[] = [
  'dark',
  'dark-dimmed',
  'dark-high-contrast',
  'dark-colorblind',
];

/** 亮暗不混用：应用主题决定只取对应组的持久化值，翻转应用主题即自动换组。 */
export function resolveMarkdownTheme(
  appTheme: 'light' | 'dark',
  light: LightMarkdownTheme,
  dark: DarkMarkdownTheme,
): MarkdownTheme {
  return appTheme === 'light' ? light : dark;
}

/** 当前生效的 markdown 主题（应用主题 × 对应组持久化值），文件/变更两面板共用。 */
export function useResolvedMarkdownTheme(): MarkdownTheme {
  const appTheme = useResolvedTheme();
  // R1-F6：原始值用两个稳定订阅（useShallow 只对对象/数组选择器有意义），在外层按组取值。
  const light = useAppStore((s) => s.lightMarkdownTheme);
  const dark = useAppStore((s) => s.darkMarkdownTheme);
  return resolveMarkdownTheme(appTheme, light, dark);
}

/**
 * 向文档注入单一样式表（幂等：以 DOM 存在性判断，避免外部移除后失步）。
 * 注入后一切换肤都只改容器 data-md-theme，本函数无需再调用。
 */
export function ensureMarkdownThemeCss(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.head.querySelector('style[data-adl-md-style="theme"]')) {
    return;
  }
  const el = document.createElement('style');
  el.dataset.adlMdStyle = 'theme';
  el.textContent = markdownThemeCss;
  document.head.appendChild(el);
}

/** 选择器菜单用：当前应用主题下可选的主题列表（只列本组）。 */
export function useMarkdownThemeOptions(): readonly MarkdownTheme[] {
  const appTheme = useResolvedTheme();
  return useMemo(
    () => (appTheme === 'light' ? LIGHT_MARKDOWN_THEMES : DARK_MARKDOWN_THEMES),
    [appTheme],
  );
}
