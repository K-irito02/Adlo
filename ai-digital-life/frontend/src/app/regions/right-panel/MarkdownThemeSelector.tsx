import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { useResolvedTheme } from '@hooks/useResolvedTheme';
import { IconCheck, IconMarkdownTheme } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { DARK_MARKDOWN_THEMES, LIGHT_MARKDOWN_THEMES } from '@features/preview/markdownTheme';
import type {
  DarkMarkdownTheme,
  LightMarkdownTheme,
  MarkdownTheme,
} from '@stores/slices/uiSliceTypes';

/**
 * 各 markdown 主题的示意色（描绘外部 GitHub 官方主题本身，非应用 chrome，
 * 故用主题真实色而非 `var(--…)`；同 `ChartColorPresetSelector` 的 PRESET_COLORS 先例）。
 * accent 取各主题代码关键字色（`.markdown-body .pl-k`，官方主题间最稳定的肉眼
 * 区分点，亮色对尤其如此：light `#cf222e` 红 vs light-colorblind `#bc4c00` 橙，
 * 其余排版逐像素一致，见事项 4 根因）。
 */
const THEME_SWATCH: Record<MarkdownTheme, { bg: string; fg: string; accent: string }> = {
  light: { bg: '#ffffff', fg: '#1f2328', accent: '#cf222e' },
  'light-colorblind': { bg: '#ffffff', fg: '#1f2328', accent: '#bc4c00' },
  dark: { bg: '#0d1117', fg: '#f0f6fc', accent: '#ff7b72' },
  'dark-dimmed': { bg: '#212830', fg: '#adbac7', accent: '#f47067' },
  'dark-high-contrast': { bg: '#0a0c10', fg: '#f0f3f6', accent: '#ff9492' },
  'dark-colorblind': { bg: '#0d1117', fg: '#f0f6fc', accent: '#f0883e' },
};

type MdThemeLabelKey =
  | 'markdownThemeLight'
  | 'markdownThemeLightColorblind'
  | 'markdownThemeDark'
  | 'markdownThemeDarkDimmed'
  | 'markdownThemeDarkHighContrast'
  | 'markdownThemeDarkColorblind';

const THEME_LABEL_KEY: Record<MarkdownTheme, MdThemeLabelKey> = {
  light: 'markdownThemeLight',
  'light-colorblind': 'markdownThemeLightColorblind',
  dark: 'markdownThemeDark',
  'dark-dimmed': 'markdownThemeDarkDimmed',
  'dark-high-contrast': 'markdownThemeDarkHighContrast',
  'dark-colorblind': 'markdownThemeDarkColorblind',
};

function MarkdownThemeSwatch({ theme }: { theme: MarkdownTheme }) {
  const colors = THEME_SWATCH[theme];
  return (
    <svg className="shrink-0" width={18} height={18} viewBox="0 0 18 18" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="16"
        height="16"
        rx="4"
        fill={colors.bg}
        stroke={colors.fg}
        strokeOpacity="0.35"
      />
      <rect x="4" y="4.5" width="10" height="2" rx="1" fill={colors.fg} opacity="0.85" />
      <rect x="4" y="8" width="7" height="2" rx="1" fill={colors.fg} opacity="0.5" />
      <circle cx="13" cy="12.5" r="2" fill={colors.accent} />
    </svg>
  );
}

/**
 * Markdown 主题切换（文件/变更两面板顶部工具栏共用）。
 * 交互与 `ChartColorPresetSelector` 一致：打开时锚定已确认值，悬停即时预览正文、
 * 离开/外部点击/Esc 恢复已确认值，点击确认并持久化（选中项右侧打勾）。
 * 只列当前应用主题对应组（亮暗不混用），翻转应用主题即自动换组。
 */
export const MarkdownThemeSelector = React.memo(function MarkdownThemeSelector() {
  const { t } = useTCopy();
  const appTheme = useResolvedTheme();
  const { lightMarkdownTheme, darkMarkdownTheme, setLightMarkdownTheme, setDarkMarkdownTheme } =
    useAppStore(
      useShallow((s) => ({
        lightMarkdownTheme: s.lightMarkdownTheme,
        darkMarkdownTheme: s.darkMarkdownTheme,
        setLightMarkdownTheme: s.setLightMarkdownTheme,
        setDarkMarkdownTheme: s.setDarkMarkdownTheme,
      })),
    );

  const options: readonly MarkdownTheme[] =
    appTheme === 'light' ? LIGHT_MARKDOWN_THEMES : DARK_MARKDOWN_THEMES;
  const current: MarkdownTheme = appTheme === 'light' ? lightMarkdownTheme : darkMarkdownTheme;
  // 菜单只列本组主题，id 与组类型一致，分支内转换安全。
  const applyTheme = useCallback(
    (id: MarkdownTheme) => {
      if (appTheme === 'light') {
        setLightMarkdownTheme(id as LightMarkdownTheme);
      } else {
        setDarkMarkdownTheme(id as DarkMarkdownTheme);
      }
    },
    [appTheme, setLightMarkdownTheme, setDarkMarkdownTheme],
  );

  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<MarkdownTheme>(current);
  const containerRef = useRef<HTMLDivElement>(null);
  const confirmedRef = useRef(confirmed);
  const hoverGuardRef = useRef(false);
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    if (open) {
      setConfirmed(currentRef.current);
      confirmedRef.current = currentRef.current;
      hoverGuardRef.current = true;
      const id = requestAnimationFrame(() => {
        hoverGuardRef.current = false;
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // 应用主题翻转（亮组↔暗组）时，已确认锚点跟随换组，避免恢复到另一组的旧值。
  // 注意：只跟随 appTheme，不跟随 current——hover 预览会改 current，跟随它会把
  // 锚点前移到悬停项，导致离开菜单无法恢复（hover 守卫 + 恢复测试覆盖此回归）。
  const prevAppThemeRef = useRef(appTheme);
  useEffect(() => {
    if (prevAppThemeRef.current !== appTheme) {
      prevAppThemeRef.current = appTheme;
      setConfirmed(currentRef.current);
      confirmedRef.current = currentRef.current;
    }
  }, [appTheme]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        applyTheme(confirmedRef.current);
        setOpen(false);
        containerRef.current
          .querySelector<HTMLButtonElement>('.adl-tool-context__iconbtn')
          ?.focus();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        applyTheme(confirmedRef.current);
        setOpen(false);
        containerRef.current
          ?.querySelector<HTMLButtonElement>('.adl-tool-context__iconbtn')
          ?.focus();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, applyTheme]);

  const handleItemEnter = useCallback(
    (id: MarkdownTheme) => {
      if (hoverGuardRef.current) {
        return;
      }
      applyTheme(id);
    },
    [applyTheme],
  );

  const handleMenuLeave = useCallback(() => {
    applyTheme(confirmedRef.current);
  }, [applyTheme]);

  const handleSelect = useCallback(
    (id: MarkdownTheme) => {
      applyTheme(id);
      setConfirmed(id);
      confirmedRef.current = id;
      setOpen(false);
    },
    [applyTheme],
  );

  return (
    <div className="adl-git-vis__preset-dropdown" ref={containerRef}>
      <TooltipSimple content={t.markdownThemeTooltip} placement="top">
        <button
          type="button"
          className={`adl-tool-context__iconbtn${open ? ' is-open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-label={t.markdownThemeTooltip as string}
          aria-expanded={open}
        >
          <IconMarkdownTheme size={14} decorative />
        </button>
      </TooltipSimple>
      {open && (
        <div className="adl-git-vis__preset-menu" role="menu" onMouseLeave={handleMenuLeave}>
          {options.map((id) => (
            <button
              key={id}
              type="button"
              className="adl-git-vis__preset-item"
              role="menuitemradio"
              aria-checked={confirmed === id}
              onClick={() => handleSelect(id)}
              onMouseEnter={() => handleItemEnter(id)}
              onFocus={() => handleItemEnter(id)}
            >
              <MarkdownThemeSwatch theme={id} />
              <span className="adl-git-vis__preset-item-label">
                {t[THEME_LABEL_KEY[id]] as string}
              </span>
              {confirmed === id && <IconCheck size={16} decorative />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
