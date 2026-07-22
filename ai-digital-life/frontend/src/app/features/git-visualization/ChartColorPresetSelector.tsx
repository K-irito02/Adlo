import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import type { ChartColorPreset } from '@stores/slices/uiSliceTypes';

const PRESETS: { id: ChartColorPreset; labelKey: 'gitVisPresetBklitDefault' | 'gitVisPresetCoolOcean' | 'gitVisPresetWarmSunset' | 'gitVisPresetHighContrast' }[] = [
  { id: 'bklit-default', labelKey: 'gitVisPresetBklitDefault' },
  { id: 'cool-ocean', labelKey: 'gitVisPresetCoolOcean' },
  { id: 'warm-sunset', labelKey: 'gitVisPresetWarmSunset' },
  { id: 'high-contrast', labelKey: 'gitVisPresetHighContrast' },
];

export const ChartColorPresetSelector = React.memo(function ChartColorPresetSelector() {
  const { t } = useTCopy();
  const { chartColorPreset, setChartColorPreset } = useAppStore(
    useShallow((s) => ({
      chartColorPreset: s.chartColorPreset,
      setChartColorPreset: s.setChartColorPreset,
    })),
  );

  return (
    <select
      className="adl-git-vis__preset-select"
      value={chartColorPreset}
      onChange={(e) => setChartColorPreset(e.target.value as ChartColorPreset)}
      aria-label="Chart color preset"
    >
      {PRESETS.map((preset) => (
        <option key={preset.id} value={preset.id}>
          {t[preset.labelKey]}
        </option>
      ))}
    </select>
  );
});
