/* eslint-disable react-refresh/only-export-components */
import React, { useCallback, useMemo, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { readJson, writeJson } from '@stores/shared';
import { curveNatural } from '@visx/curve';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Area } from '@/components/charts/area';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import {
  ChartBrushLayout,
  ChartBrush,
  BRUSH_SELECTION_PATTERN,
  type BrushLayoutRenderProps,
} from '@/components/charts/brush';
import { XAxis } from '@/components/charts/x-axis';
import type { ChartStatus } from '@/components/charts/chart-phase';
import {
  aggregateCodeEvolutionDays,
  dateLabelFormatterFor,
  periodEndInclusive,
  resolveGranularity,
  type Granularity,
} from '../adapters/chartDataAdapters';

interface CodeLineEvoProps {
  data?: { days: { date: string; additions: number; deletions: number }[] };
  visible: SeriesVisibility;
  status?: ChartStatus;
  loadingLabel?: string;
}

export interface SeriesVisibility {
  added: boolean;
  deleted: boolean;
  net: boolean;
}

export const CODE_LINE_EVO_VISIBLE_KEY = 'gitVisCodeLineEvoVisible';
export const DEFAULT_VISIBILITY: SeriesVisibility = { added: true, deleted: true, net: true };

const SERIES_COLORS: Record<keyof SeriesVisibility, string> = {
  added: 'var(--chart-line-primary)',
  deleted: 'var(--chart-line-secondary)',
  net: 'var(--chart-3)',
};

export function useCodeLineEvoVisibility() {
  const [visible, setVisible] = useState<SeriesVisibility>(() =>
    readJson<SeriesVisibility>(CODE_LINE_EVO_VISIBLE_KEY, DEFAULT_VISIBILITY),
  );

  const toggleSeries = useCallback((key: keyof SeriesVisibility) => {
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeJson(CODE_LINE_EVO_VISIBLE_KEY, next);
      return next;
    });
  }, []);

  return { visible, toggleSeries };
}

interface CodeLineEvoSeriesToggleProps {
  visible: SeriesVisibility;
  onToggle: (key: keyof SeriesVisibility) => void;
}

export const CodeLineEvoSeriesToggle = React.memo(function CodeLineEvoSeriesToggle({
  visible,
  onToggle,
}: CodeLineEvoSeriesToggleProps) {
  const { t } = useTCopy();
  return (
    <div
      className="adl-git-vis__series-toggle"
      role="group"
      aria-label={t.gitVisCodeLineEvoToggleLabel}
    >
      {(['added', 'deleted', 'net'] as const).map((key) => (
        <button
          key={key}
          type="button"
          className="adl-git-vis__series-toggle-btn"
          aria-pressed={visible[key]}
          onClick={() => onToggle(key)}
        >
          <span
            className="adl-git-vis__series-toggle-dot"
            style={{ background: SERIES_COLORS[key] }}
          />
          <span>
            {key === 'added'
              ? t.gitVisCodeLineEvoAddedShort
              : key === 'deleted'
                ? t.gitVisCodeLineEvoDeletedShort
                : t.gitVisCodeLineEvoNet}
          </span>
        </button>
      ))}
    </div>
  );
});

export const CodeLineEvo = React.memo(function CodeLineEvo({
  data,
  visible,
  status = 'ready',
  loadingLabel,
}: CodeLineEvoProps) {
  const days = useMemo(() => data?.days ?? [], [data]);

  const dayRows = useMemo(() => aggregateCodeEvolutionDays(days, 'day'), [days]);

  const fullRange = useMemo(() => {
    if (dayRows.length === 0) {
      return { start: new Date(), end: new Date() };
    }
    return {
      start: new Date(dayRows[0].date + 'T00:00:00Z'),
      end: new Date(dayRows[dayRows.length - 1].date + 'T00:00:00Z'),
    };
  }, [dayRows]);

  const stripGranularity = useMemo<Granularity>(() => {
    if (dayRows.length === 0) {
      return 'month';
    }
    return resolveGranularity(fullRange.start, fullRange.end);
  }, [fullRange, dayRows.length]);

  const stripData = useMemo(
    () => aggregateCodeEvolutionDays(days, stripGranularity),
    [days, stripGranularity],
  );

  // The brush track extends to the real last data day (not the last period
  // bucket, e.g. the final Monday) so the user can drag the brush into the
  // partial tail and zoom down to day granularity showing the true latest date.
  const stripTrackDomain = useMemo<[Date, Date] | undefined>(() => {
    if (stripData.length === 0) {
      return undefined;
    }
    return [new Date(stripData[0].date + 'T00:00:00Z'), fullRange.end];
  }, [stripData, fullRange.end]);

  if (status === 'loading') {
    // Mirror the ready chart's structure: added rises above the zero line
    // (positive), deleted falls below it (negative), and net spans the center
    // (it can be both positive and negative). All series sweep in sync
    // (same phase) so the skeleton lines appear together.
    const activeSeries = (['added', 'deleted', 'net'] as const).filter((key) => visible[key]);
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative', overflow: 'hidden' }}>
        <LineChart
          aspectRatio="unset"
          data={[]}
          xDataKey="date"
          status="loading"
          loadingLabel={loadingLabel}
          margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
          style={{ height: 280 }}
        >
          {activeSeries.map((key) => {
            if (key === 'net') {
              return (
                <Line
                  key={key}
                  curve={curveNatural}
                  dataKey="net"
                  fadeEdges={false}
                  loadingStyle="sweep"
                  loadingSweepPhaseOffset={0}
                  loadingSweepVerticalRange={[0.02, 0.98]}
                  showHighlight={false}
                  stroke="transparent"
                  strokeWidth={2}
                />
              );
            }
            // added rises from the center line, deleted falls below it.
            return (
              <Area
                key={key}
                baseline="zero"
                curve={curveNatural}
                dataKey={key === 'added' ? 'added' : 'deletedNeg'}
                fill="transparent"
                fillOpacity={0}
                loadingStroke="var(--chart-foreground)"
                loadingStrokeOpacity={0.5}
                loadingStyle="sweep"
                loadingSweepPhaseOffset={0}
                loadingSweepVerticalRange={key === 'added' ? [0.02, 0.5] : [0.5, 0.98]}
                showHighlight={false}
                stroke="transparent"
              />
            );
          })}
          <Grid horizontal highlightRowValues={[0]} />
        </LineChart>
      </div>
    );
  }

  if (dayRows.length === 0) {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative', overflow: 'hidden' }}>
        <LineChart
          data={[]}
          xDataKey="date"
          margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
          style={{ maxHeight: 280 }}
        >
          <Line dataKey="net" />
          <Grid highlightRowValues={[0]} />
          <ChartTooltip />
        </LineChart>
      </div>
    );
  }

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative', overflow: 'hidden' }}>
      <ChartBrushLayout
        data={stripData}
        xDataKey="date"
        enabled
        height={72}
        selectionEnd={fullRange.end}
        brushStrip={(layout) => (
          <LineChart
            data={stripData}
            xDataKey="date"
            xDomain={stripTrackDomain}
            animationDuration={0}
            status="ready"
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={{ aspectRatio: 'unset', height: '100%' }}
          >
            <Line dataKey="net" animate={false} showHighlight={false} />
            <ChartBrush
              initialSelection={layout.brushSelection ?? undefined}
              onSelectionChange={
                layout.onBrushSelectionChange as (domain: { start: Date; end: Date }) => void
              }
              selectionPattern={BRUSH_SELECTION_PATTERN}
            />
          </LineChart>
        )}
      >
        {(layout) => (
          <CodeLineEvoMain layout={layout} days={days} fullRange={fullRange} visible={visible} />
        )}
      </ChartBrushLayout>
    </div>
  );
});

interface CodeLineEvoMainProps {
  layout: BrushLayoutRenderProps;
  days: { date: string; additions: number; deletions: number }[];
  fullRange: { start: Date; end: Date };
  visible: SeriesVisibility;
}

/**
 * Main chart (zoomed view) extracted into its own component so the expensive
 * data filtering, aggregation, and x-domain clamping can be memoized via
 * `useMemo`. When this logic lived inline in the `ChartBrushLayout` render
 * prop, every render rebuilt `chartData` and `mainXDomain` as new array/object
 * references, which churned `xScale` → `resolveTooltipFromX` → the reanchor
 * `useEffect`, producing a visible jitter loop near the last data point
 * (especially under week/month granularity where the clamp always fires).
 */
const CodeLineEvoMain = React.memo(function CodeLineEvoMain({
  layout,
  days,
  fullRange,
  visible,
}: CodeLineEvoMainProps) {
  const { t } = useTCopy();
  const selStart = useMemo(
    () => layout.xDomain?.[0] ?? fullRange.start,
    [layout.xDomain, fullRange.start],
  );
  const selEnd = useMemo(
    () => layout.xDomain?.[1] ?? fullRange.end,
    [layout.xDomain, fullRange.end],
  );
  const granularity = resolveGranularity(selStart, selEnd);
  const dateLabelFormatter = useMemo(() => dateLabelFormatterFor(granularity), [granularity]);

  const { chartData, mainXDomain } = useMemo(() => {
    const periodEndMs = periodEndInclusive(selEnd, granularity).getTime();
    const inRangeDays = days.filter((d) => {
      const t = new Date(d.date + 'T00:00:00Z').getTime();
      // Keep the final partial period (e.g. the last week whose Monday is
      // the selection end) fully included so its data is not dropped.
      return t >= selStart.getTime() && t <= periodEndMs;
    });
    const aggregated = aggregateCodeEvolutionDays(inRangeDays, granularity);
    // Clamp the visible x-domain to the chart's own last data point so the
    // aggregated view (e.g. weekly, whose last bucket is the final Monday)
    // does not leave empty space on the right, while day granularity still
    // reaches the true latest data day.
    let domain = layout.xDomain;
    const lastDataPoint = aggregated.at(-1);
    if (domain && lastDataPoint) {
      const lastTime = new Date(lastDataPoint.date + 'T00:00:00Z').getTime();
      if (!Number.isNaN(lastTime) && domain[1].getTime() > lastTime) {
        domain = [domain[0], new Date(lastTime)];
      }
    }
    return { chartData: aggregated, mainXDomain: domain };
    // selStart/selEnd are derived from layout.xDomain; layout.xDomain is stable
    // (memoized inside ChartBrushLayout), so depending on it keeps this memo
    // aligned with brush selection changes without re-running on every render.
  }, [days, selStart, selEnd, granularity, layout.xDomain]);

  return (
    <LineChart
      data={chartData}
      xDataKey="date"
      animationDuration={400}
      xDomain={mainXDomain}
      // The main chart re-aggregates the selected range at its own
      // granularity (e.g. daily when the strip is weekly), so bar/slot
      // padding must use this chart's row count — not the strip's.
      xDomainSlotCount={chartData.length}
      // Snap y-domains on data/x-domain changes instead of tweening:
      // a tween renders new series values with the interpolated (still
      // small) domain, sending lines far off the plot top before the
      // tween settles, and re-triggers the animated series path every
      // frame (y-scale churn) which can exceed React's update depth.
      tweenYDomainOnXDomainChange={false}
      yDomainTween={false}
      dateLabelFormatter={dateLabelFormatter}
      margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
      style={{ maxHeight: 280 }}
    >
      {visible.added ? (
        <Area dataKey="added" baseline="zero" fill="var(--chart-line-primary)" fillOpacity={0.35} />
      ) : null}
      {visible.deleted ? (
        <Area
          dataKey="deletedNeg"
          baseline="zero"
          fill="var(--chart-line-secondary)"
          fillOpacity={0.35}
        />
      ) : null}
      {visible.net ? <Line dataKey="net" stroke="var(--chart-3)" strokeWidth={2} /> : null}
      <Grid highlightRowValues={[0]} />
      <XAxis />
      <ChartTooltip
        rows={(point) => [
          ...(visible.added
            ? [
                {
                  color: SERIES_COLORS.added,
                  label: t.gitVisCodeLineEvoAdded,
                  value: (point.added as number) ?? 0,
                },
              ]
            : []),
          ...(visible.deleted
            ? [
                {
                  color: SERIES_COLORS.deleted,
                  label: t.gitVisCodeLineEvoDeleted,
                  value: (point.deletedNeg as number) ?? 0,
                },
              ]
            : []),
          ...(visible.net
            ? [
                {
                  color: SERIES_COLORS.net,
                  label: t.gitVisCodeLineEvoNet,
                  value: (point.net as number) ?? 0,
                },
              ]
            : []),
        ]}
      />
    </LineChart>
  );
});
