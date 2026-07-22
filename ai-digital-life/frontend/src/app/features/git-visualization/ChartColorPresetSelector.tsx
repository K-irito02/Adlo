import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { useResolvedTheme } from '@hooks/useResolvedTheme';
import type { ChartColorPreset } from '@stores/slices/uiSliceTypes';

const PRESET_COLORS: Record<ChartColorPreset, { light: { darkest: string; lightest: string }; dark: { darkest: string; lightest: string } }> = {
  'bklit-default': {
    light: { darkest: 'oklch(0.5 0.1 260)', lightest: 'oklch(0.97 0.01 260)' },
    dark: { darkest: 'oklch(0.68 0.09 260)', lightest: 'oklch(0.22 0.02 260)' },
  },
  'cool-ocean': {
    light: { darkest: 'oklch(0.48 0.09 220)', lightest: 'oklch(0.97 0.01 220)' },
    dark: { darkest: 'oklch(0.68 0.08 220)', lightest: 'oklch(0.22 0.02 220)' },
  },
  'warm-sunset': {
    light: { darkest: 'oklch(0.5 0.1 50)', lightest: 'oklch(0.97 0.01 60)' },
    dark: { darkest: 'oklch(0.68 0.09 50)', lightest: 'oklch(0.24 0.02 60)' },
  },
  'high-contrast': {
    light: { darkest: 'oklch(0.42 0.14 260)', lightest: 'oklch(0.95 0.005 0)' },
    dark: { darkest: 'oklch(0.7 0.13 260)', lightest: 'oklch(0.18 0.01 0)' },
  },
};

const ICON_SIZE = 18;

function PresetColorIcon({ presetId, theme }: { presetId: ChartColorPreset; theme: 'light' | 'dark' }) {
  const colors = PRESET_COLORS[presetId][theme];
  return (
    <span className="inline-block shrink-0" style={{ width: ICON_SIZE, height: ICON_SIZE, position: 'relative' }}>
      <span
        className="absolute rounded-full"
        style={{
          width: '100%', height: '100%',
          background: colors.lightest,
          inset: 0,
          zIndex: 1,
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          width: '65%', height: '65%',
          background: colors.darkest,
          bottom: 0, right: 0,
          zIndex: 2,
        }}
      />
    </span>
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
                <svg className="adl-git-vis__preset-check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
