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
import { contributorModulesToHeatmapColumns, applyModuleMapping } from '../adapters/chartDataAdapters';
import type { MappingRule } from '../types/module-mapping';

interface ContributorModuleHeatmapProps {
  data?: {
    author: string;
    authorEmail: string;
    modules: { module: string; count: number }[];
  }[];
  rules?: MappingRule[];
}

export const ContributorModuleHeatmap = React.memo(function ContributorModuleHeatmap({
  data,
  rules = [],
}: ContributorModuleHeatmapProps) {
  const { t, locale } = useTCopy();

  const customFillScale = useMemo(() => buildHeatmapFillScale(HEATMAP_DEFAULT_LEVEL_STYLES), []);

  const { columns, rowLabels } = useMemo(() => {
    if (!data) {
      return { columns: [], rowLabels: [] };
    }
    const mappedData = applyModuleMapping(data, rules);
    const result = contributorModulesToHeatmapColumns(mappedData);
    return result;
  }, [data, rules]);

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
      return `${count} ${word}`;
    },
    [t],
  );

  const colCount = columns.length;
  const rotateAngle = colCount > 8 ? 45 : 0;
  const maxLabelWidth = colCount > 15 ? 60 : colCount > 8 ? 80 : undefined;

  return (
    <HeatmapChart
      data={columns}
      locale={locale}
      rowLabels={rowLabels}
      margin={{ top: 46, right: 16, bottom: 0, left: 80 }}
      gap={2}
      binSize={36}
      layout="fluid"
      animate={true}
      fillScale={customFillScale}
    >
      <HeatmapCells cornerRadius={2} />
      <HeatmapXAxis
        rotateAngle={rotateAngle}
        maxLabelWidth={maxLabelWidth}
        labelMode="compact"
        top={18}
      />
      <HeatmapYAxis tickFilter="all" />
      <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
    </HeatmapChart>
  );
});
