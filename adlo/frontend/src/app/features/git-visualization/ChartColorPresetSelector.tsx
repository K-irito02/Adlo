import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { useResolvedTheme } from '@hooks/useResolvedTheme';
import { IconCheck } from '@app/icons';
import type { ChartColorPreset } from '@stores/slices/uiSliceTypes';

const PRESET_COLORS: Record<
  ChartColorPreset,
  { light: { darkest: string; lightest: string }; dark: { darkest: string; lightest: string } }
> = {
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
    light: { darkest: 'rgb(128, 199, 248)', lightest: 'rgb(23, 56, 62)' },
    dark: { darkest: 'rgb(128, 199, 248)', lightest: 'rgb(23, 56, 62)' },
  },
};

/* Two equal circles (r=7, centers 6px apart) form a Venn overlap.
   The right circle (cx=15) is the full dark circle.
   The left circle (cx=9) is truncated to a D-shape at the intersection
   boundary (x=12), shown as the light circle.
   A separator line at the cut edge creates a clean visual gap between
   the two halves, using the page background color (var(--bg)) to blend
   into the container. */
const ICON_SIZE = 18;
const LEFT_ARC = 'M 12 5.68 A 7 7 0 0 0 12 18.32 Z';
const SEPARATOR_LINE = 'M 12 5.68 L 12 18.32';

function PresetColorIcon({
  presetId,
  theme,
}: {
  presetId: ChartColorPreset;
  theme: 'light' | 'dark';
}) {
  const colors = PRESET_COLORS[presetId][theme];
  return (
    <svg
      className="shrink-0"
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <g transform="translate(-1.5, 0)">
        <circle
          cx="15"
          cy="12"
          r="7"
          fill={colors.darkest}
          stroke={colors.darkest}
          strokeWidth="1.2"
        />
        <path d={LEFT_ARC} fill={colors.lightest} stroke={colors.darkest} strokeWidth="1.2" />
        <path d={SEPARATOR_LINE} fill="none" stroke="var(--bg)" strokeWidth="2.5" />
      </g>
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
  const [confirmedPreset, setConfirmedPreset] = useState(chartColorPreset);
  const containerRef = useRef<HTMLDivElement>(null);
  const confirmedPresetRef = useRef(chartColorPreset);
  const hoverGuardRef = useRef(false);
  // Keep a ref to the latest chartColorPreset so the open-effect can read it
  // without triggering on every hover preview (which would overwrite the
  // confirmed anchor and break the checkmark / cancel behavior).
  const chartColorPresetRef = useRef(chartColorPreset);
  chartColorPresetRef.current = chartColorPreset;

  useEffect(() => {
    if (open) {
      setConfirmedPreset(chartColorPresetRef.current);
      confirmedPresetRef.current = chartColorPresetRef.current;
      hoverGuardRef.current = true;
      const id = requestAnimationFrame(() => {
        hoverGuardRef.current = false;
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setChartColorPreset(confirmedPresetRef.current);
        setOpen(false);
        containerRef.current
          .querySelector<HTMLButtonElement>('.adl-git-vis__preset-trigger')
          ?.focus();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setChartColorPreset(confirmedPresetRef.current);
        setOpen(false);
        containerRef.current
          ?.querySelector<HTMLButtonElement>('.adl-git-vis__preset-trigger')
          ?.focus();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, setChartColorPreset]);

  const handleItemEnter = useCallback(
    (id: ChartColorPreset) => {
      if (hoverGuardRef.current) {
        return;
      }
      setChartColorPreset(id);
    },
    [setChartColorPreset],
  );

  const handleMenuLeave = useCallback(() => {
    setChartColorPreset(confirmedPresetRef.current);
  }, [setChartColorPreset]);

  const handleSelect = useCallback(
    (id: ChartColorPreset) => {
      setChartColorPreset(id);
      setConfirmedPreset(id);
      confirmedPresetRef.current = id;
      setOpen(false);
    },
    [setChartColorPreset, setConfirmedPreset, setOpen],
  );

  return (
    <div className="adl-git-vis__preset-dropdown" ref={containerRef}>
      <button
        className="adl-git-vis__preset-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.gitVisPresetColorTooltip}
        title={t.gitVisPresetColorTooltip}
        aria-expanded={open}
      >
        <PresetColorIcon presetId={chartColorPreset} theme={resolvedTheme} />
      </button>
      {open && (
        <div className="adl-git-vis__preset-menu" role="menu" onMouseLeave={handleMenuLeave}>
          {[
            {
              id: 'bklit-default' as ChartColorPreset,
              labelKey: 'gitVisPresetBklitDefault' as const,
            },
            { id: 'cool-ocean' as ChartColorPreset, labelKey: 'gitVisPresetCoolOcean' as const },
            { id: 'warm-sunset' as ChartColorPreset, labelKey: 'gitVisPresetWarmSunset' as const },
            {
              id: 'high-contrast' as ChartColorPreset,
              labelKey: 'gitVisPresetHighContrast' as const,
            },
          ].map((preset) => (
            <button
              key={preset.id}
              className="adl-git-vis__preset-item"
              role="menuitem"
              onClick={() => handleSelect(preset.id)}
              onMouseEnter={() => handleItemEnter(preset.id)}
              onFocus={() => handleItemEnter(preset.id)}
            >
              <PresetColorIcon presetId={preset.id} theme={resolvedTheme} />
              <span className="adl-git-vis__preset-item-label">{t[preset.labelKey]}</span>
              {confirmedPreset === preset.id && <IconCheck size={16} decorative />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
