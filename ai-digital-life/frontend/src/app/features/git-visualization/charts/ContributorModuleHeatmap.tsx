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
    return result;
  }, [data]);

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
      return `${count} ${word}`;
    },
    [t],
  );

  const colCount = columns.length;
  const rotateAngle = colCount > 8 ? 45 : 0;

  const { labelTop, marginTop } = useMemo(() => {
    if (colCount <= 8) {
      return { labelTop: 0, marginTop: 28 };
    }
    const maxLabelLen = columns.reduce((max, col) => {
      const len = (col.columnLabel ?? '').length;
      return len > max ? len : max;
    }, 0);
    const maxTextWidth = maxLabelLen * 7.5;
    const upwardExtent = Math.ceil(maxTextWidth * 0.707);
    const top = upwardExtent + 4;
    const margin = top + 20;
    return { labelTop: top, marginTop: margin };
  }, [columns, colCount]);

  return (
    <HeatmapChart
      data={columns}
      locale={locale}
      rowLabels={rowLabels}
      margin={{ top: marginTop, right: 16, bottom: 0, left: 80 }}
      gap={2}
      binSize={36}
      layout="fluid"
      animate={true}
      fillScale={customFillScale}
    >
      <HeatmapCells cornerRadius={2} />
      <HeatmapXAxis
        rotateAngle={rotateAngle}
        top={labelTop}
      />
      <HeatmapYAxis tickFilter="all" />
      <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
    </HeatmapChart>
  );
});
