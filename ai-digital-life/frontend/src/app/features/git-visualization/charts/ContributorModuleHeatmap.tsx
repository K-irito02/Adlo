import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
  buildHeatmapFillScale,
  HEATMAP_DEFAULT_LEVEL_STYLES,
} from '@/components/charts/heatmap';
import { contributorModulesToHeatmapColumns } from '../adapters/chartDataAdapters';

const MODULE_KEYS = [
  'gitVisModuleFrontend',
  'gitVisModuleBackend',
  'gitVisModuleDatabase',
  'gitVisModuleTesting',
  'gitVisModuleDocs',
] as const;

interface ContributorModuleHeatmapProps {
  data?: {
    author: string;
    authorEmail: string;
    modules: { module: string; count: number }[];
  }[];
}

export const ContributorModuleHeatmap = React.memo(function ContributorModuleHeatmap({
  data,
}: ContributorModuleHeatmapProps) {
  const { t, locale } = useTCopy();

  const customFillScale = useMemo(() => buildHeatmapFillScale(HEATMAP_DEFAULT_LEVEL_STYLES), []);

  const { columns, rowLabels } = useMemo(() => {
    if (!data) {
      return { columns: [], rowLabels: [] };
    }
    const result = contributorModulesToHeatmapColumns(data);
    return {
      columns: result.columns.map((col, i) => ({
        ...col,
        columnLabel: t[MODULE_KEYS[i] as keyof typeof t] || col.columnLabel,
      })),
      rowLabels: result.rowLabels,
    };
  }, [data, t]);

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
      return `${count} ${word}`;
    },
    [t],
  );

  return (
    <HeatmapChart
      data={columns}
      locale={locale}
      rowLabels={rowLabels}
      margin={{ top: 28, right: 16, bottom: 0, left: 80 }}
      gap={2}
      binSize={36}
      animate={true}
      fillScale={customFillScale}
    >
      <HeatmapCells cornerRadius={2} />
      <HeatmapXAxis />
      <HeatmapYAxis tickFilter="all" />
      <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
    </HeatmapChart>
  );
});
