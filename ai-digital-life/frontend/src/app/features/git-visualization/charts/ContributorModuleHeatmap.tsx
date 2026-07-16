import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
} from '@/components/charts/heatmap';
import { generateContributorModuleData, contributorNames } from '../data/gitVisMockData';

const MODULE_KEYS = [
  'gitVisModuleFrontend',
  'gitVisModuleBackend',
  'gitVisModuleDatabase',
  'gitVisModuleTesting',
  'gitVisModuleDocs',
] as const;

export const ContributorModuleHeatmap = React.memo(function ContributorModuleHeatmap() {
  const { t, locale } = useTCopy();
  const rawData = useMemo(() => generateContributorModuleData(), []);

  const data = useMemo(
    () =>
      rawData.map((col, i) => ({
        ...col,
        columnLabel: t[MODULE_KEYS[i] as keyof typeof t],
      })),
    [rawData, t]
  );

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
      return `${count} ${word}`;
    },
    [t]
  );

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <HeatmapChart
        data={data}
        locale={locale}
        rowLabels={contributorNames}
        margin={{ top: 28, right: 16, bottom: 0, left: 80 }}
        gap={2}
        binSize={36}
        animate={true}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis />
        <HeatmapYAxis />
        <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
      </HeatmapChart>
    </div>
  );
});
