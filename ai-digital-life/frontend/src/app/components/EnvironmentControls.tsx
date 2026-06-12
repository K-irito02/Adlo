import React, { useState, useCallback, useRef, useEffect } from 'react';
import { renderIcon, type IconName } from '../../design-system/icons';
import { TooltipSimple } from './Tooltip';
import { useTCopy } from '../i18n/useTCopy';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ThemeMode = 'light' | 'dark' | 'system';

export interface EnvironmentControlsProps {
  currentLanguage: string;
  currentTheme: ThemeMode;
  onChangeLanguage: (lang: string) => void;
  onChangeTheme: (theme: ThemeMode) => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const THEME_OPTIONS: readonly { value: ThemeMode; icon: IconName; label: string }[] = [
  { value: 'light', icon: 'sun', label: 'Light' },
  { value: 'dark', icon: 'moon', label: 'Dark' },
  { value: 'system', icon: 'monitor', label: 'System' },
] as const;

/** Resolve the icon for the current theme mode. */
function resolveThemeIcon(mode: ThemeMode): IconName {
  return THEME_OPTIONS.find((opt) => opt.value === mode)?.icon ?? 'monitor';
}

/** Cycle to the next theme in the order: light -> dark -> system -> light. */
function cycleTheme(current: ThemeMode): ThemeMode {
  const order: ThemeMode[] = ['light', 'dark', 'system'];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

interface DropdownProps {
  open: boolean;
  onClose: () => void;
  align?: 'left' | 'right';
  children: React.ReactNode;
}

/**
 * Small dropdown panel used by both language and theme selectors.
 * Renders in a portal-like fixed position relative to its trigger.
 */
function Dropdown({
  open,
  onClose,
  align = 'left',
  children,
}: DropdownProps): React.ReactElement | null {
  const ref = useRef<HTMLDivElement>(null);

  /* Close on click outside. */
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  /* Close on Escape key. */
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={`sidebar-env-dropdown${align === 'right' ? ' sidebar-env-dropdown--right' : ''}`}
      role="menu"
      aria-label="Options"
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

/**
 * Region 7 - Bottom fixed area of the left sidebar.
 *
 * Contains environment controls that stay pinned at the bottom and do not
 * scroll with the session management content above:
 *   1. Language selector (globe icon + current language code)
 *   2. Theme toggler (cycles through sun / moon / monitor icons)
 */
export function EnvironmentControls({
  currentLanguage,
  currentTheme,
  onChangeLanguage,
  onChangeTheme,
}: EnvironmentControlsProps): React.ReactElement {
  const { t, formatT } = useTCopy();

  const LANGUAGE_OPTIONS: readonly { code: string; label: string }[] = [
    { code: 'zh-CN', label: t.languageChinese },
    { code: 'en-US', label: t.languageEnglish },
  ] as const;

  function resolveLanguageLabel(code: string): string {
    return LANGUAGE_OPTIONS.find((opt) => opt.code === code)?.label ?? code;
  }

  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  const handleToggleLang = useCallback(() => {
    setLangDropdownOpen((prev) => !prev);
  }, []);

  const handleCloseLang = useCallback(() => {
    setLangDropdownOpen(false);
  }, []);

  const handleSelectLang = useCallback(
    (code: string) => {
      onChangeLanguage(code);
      setLangDropdownOpen(false);
    },
    [onChangeLanguage]
  );

  const handleCycleTheme = useCallback(() => {
    onChangeTheme(cycleTheme(currentTheme));
  }, [currentTheme, onChangeTheme]);

  return (
    <div className="sidebar-env-controls" role="region" aria-label="Environment controls">
      {/* ---- Language selector ---- */}
      <div className="sidebar-env-controls__item">
        <button
          type="button"
          className={`sidebar-env-btn${langDropdownOpen ? ' sidebar-env-btn--open' : ''}`}
          onClick={handleToggleLang}
          aria-haspopup="listbox"
          aria-expanded={langDropdownOpen}
          aria-label="Change language"
        >
          <span
            className="sidebar-env-btn__icon"
            dangerouslySetInnerHTML={{
              __html: renderIcon('globe', { size: 'sm', decorative: true }).value,
            }}
          />
          <span className="sidebar-env-btn__label">{resolveLanguageLabel(currentLanguage)}</span>
        </button>

        <Dropdown open={langDropdownOpen} onClose={handleCloseLang} align="left">
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              key={opt.code}
              type="button"
              className={`sidebar-env-dropdown__item${opt.code === currentLanguage ? ' sidebar-env-dropdown__item--active' : ''}`}
              role="option"
              aria-selected={opt.code === currentLanguage}
              onClick={() => handleSelectLang(opt.code)}
            >
              {opt.label}
            </button>
          ))}
        </Dropdown>
      </div>

      {/* ---- Theme toggler ---- */}
      <div className="sidebar-env-controls__item">
        <TooltipSimple
          content={formatT(t, 'themeTooltip', { theme: currentTheme })}
          placement="right"
        >
          <button
            type="button"
            className="sidebar-env-btn"
            onClick={handleCycleTheme}
            aria-label={formatT(t, 'themeButtonAria', { theme: currentTheme })}
          >
            <span
              className="sidebar-env-btn__icon"
              dangerouslySetInnerHTML={{
                __html: renderIcon(resolveThemeIcon(currentTheme), { size: 'sm', decorative: true })
                  .value,
              }}
            />
          </button>
        </TooltipSimple>
      </div>
    </div>
  );
}

export default EnvironmentControls;
