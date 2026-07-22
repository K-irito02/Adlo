import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { useResolvedTheme } from '@hooks/useResolvedTheme';
import type { ChartColorPreset } from '@stores/slices/uiSliceTypes';

const PRESET_COLORS: Record<ChartColorPreset, { light: { darkest: string; lightest: string }; dark: { darkest: string; lightest: string } }> = {
  'bklit-default': {
    light: { darkest: 'oklch(0.3 0.12 260)', lightest: 'oklch(0.82 0.05 260)' },
    dark: { darkest: 'oklch(0.7 0.1 260)', lightest: 'oklch(0.3 0.06 260)' },
  },
  'cool-ocean': {
    light: { darkest: 'oklch(0.28 0.11 220)', lightest: 'oklch(0.82 0.05 220)' },
    dark: { darkest: 'oklch(0.7 0.09 220)', lightest: 'oklch(0.3 0.06 220)' },
  },
  'warm-sunset': {
    light: { darkest: 'oklch(0.3 0.12 50)', lightest: 'oklch(0.82 0.05 60)' },
    dark: { darkest: 'oklch(0.7 0.1 50)', lightest: 'oklch(0.32 0.06 60)' },
  },
  'high-contrast': {
    light: { darkest: 'oklch(0.25 0.14 260)', lightest: 'oklch(0.78 0.06 240)' },
    dark: { darkest: 'oklch(0.72 0.14 260)', lightest: 'oklch(0.28 0.05 240)' },
  },
};

const ICON_SIZE = 18;

function PresetColorIcon({ presetId, theme }: { presetId: ChartColorPreset; theme: 'light' | 'dark' }) {
  const colors = PRESET_COLORS[presetId][theme];
  return (
    <svg
      className="shrink-0"
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="9" cy="12" r="7" fill={colors.lightest} stroke={colors.darkest} strokeWidth="1.2" />
      <circle cx="15" cy="12" r="7" fill={colors.lightest} stroke={colors.darkest} strokeWidth="1.2" />
      <path d="M 12 5.68 A 7 7 0 0 1 12 18.32 A 7 7 0 0 1 12 5.68" fill={colors.darkest} />
    </svg>
  );
}

export const ChartColorPresetSelector = React.memo(function ChartColorPresetSelector() {
  const { t } = useTCopy();
  const resolvedTheme = useResolvedTheme();
  const { chartColorPreset, setChartColorPreset } = useAppStore(
    useShallow((s) => ({
      chartColorPreset: s.chartColorPreset,
      setChartColorPreset: s.setChartColorPreset,
    })),
  );
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { return; }
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const handleSelect = useCallback(
    (id: ChartColorPreset) => {
      setChartColorPreset(id);
      setOpen(false);
    },
    [setChartColorPreset],
  );

  return (
    <div className="adl-git-vis__preset-dropdown" ref={containerRef}>
      <button
        className="adl-git-vis__preset-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Chart color preset"
        aria-expanded={open}
      >
        <PresetColorIcon presetId={chartColorPreset} theme={resolvedTheme} />
      </button>
      {open && (
        <div className="adl-git-vis__preset-menu" role="menu">
          {([
            { id: 'bklit-default' as ChartColorPreset, labelKey: 'gitVisPresetBklitDefault' as const },
            { id: 'cool-ocean' as ChartColorPreset, labelKey: 'gitVisPresetCoolOcean' as const },
            { id: 'warm-sunset' as ChartColorPreset, labelKey: 'gitVisPresetWarmSunset' as const },
            { id: 'high-contrast' as ChartColorPreset, labelKey: 'gitVisPresetHighContrast' as const },
          ]).map((preset) => (
            <button
              key={preset.id}
              className="adl-git-vis__preset-item"
              role="menuitem"
              onClick={() => handleSelect(preset.id)}
            >
              <PresetColorIcon presetId={preset.id} theme={resolvedTheme} />
              <span className="adl-git-vis__preset-item-label">{t[preset.labelKey]}</span>
              {chartColorPreset === preset.id && (
                <svg className="adl-git-vis__preset-check" viewBox="0 0 24 24" width="16" height="16" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
