import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { HeatmapCardGroup } from './HeatmapCardGroup';
import { CodeLineEvo } from './charts/CodeLineEvo';
import { CommitTimeline } from './charts/CommitTimeline';
import { FileSunburst } from './charts/FileSunburst';
import { BranchGraph } from './charts/BranchGraph';
import { ChartColorPresetSelector } from './ChartColorPresetSelector';
import { WorkspaceTabBar } from './WorkspaceTabBar';
import { useGitVisRefresh } from './hooks/useGitVisRefresh';
import { RefreshButton } from './RefreshButton';

/** 图表标识符常量 — 用于 refreshChart(chartId) 的 chartId 参数 */
export const CHART_IDS = {
  BRANCH_GRAPH: 'branch-graph',
  CODE_LINE_EVO: 'code-line-evolution',
  COMMIT_TIMELINE: 'commit-timeline',
  FILE_SUNBURST: 'file-sunburst',
  HEATMAP: 'heatmap',
} as const;

type ChartCardProps = {
  title: string;
  desc: string;
  children: React.ReactNode;
} & (
  | { onRefresh: () => Promise<void>; refreshLabel: string }
  | { onRefresh?: undefined; refreshLabel?: undefined }
);

function ChartCard({ title, desc, onRefresh, refreshLabel, children }: ChartCardProps) {
  return (
    <div className="adl-git-vis__card">
      <div className="adl-git-vis__card-header">
        {onRefresh && <RefreshButton onRefresh={onRefresh} label={refreshLabel!} />}
        <h3 className="adl-git-vis__card-title">{title}</h3>
      </div>
      {children}
      <p className="adl-git-vis__card-desc">{desc}</p>
    </div>
  );
}

const SCROLLBAR_DEBOUNCE_MS = 400;

export const GitVisualizationView = React.memo(function GitVisualizationView() {
  const { t } = useTCopy();
  const chartColorPreset = useAppStore(useShallow((s) => s.chartColorPreset));
  const activeWorkspaceTab = useAppStore((s) => s.activeWorkspaceTab);
  const { refreshWorkspace, refreshChart } = useGitVisRefresh(activeWorkspaceTab);

  const handleRefreshBranchGraph = useCallback(
    () => refreshChart(CHART_IDS.BRANCH_GRAPH),
    [refreshChart],
  );
  const handleRefreshCodeLineEvo = useCallback(
    () => refreshChart(CHART_IDS.CODE_LINE_EVO),
    [refreshChart],
  );
  const handleRefreshCommitTimeline = useCallback(
    () => refreshChart(CHART_IDS.COMMIT_TIMELINE),
    [refreshChart],
  );
  const handleRefreshFileSunburst = useCallback(
    () => refreshChart(CHART_IDS.FILE_SUNBURST),
    [refreshChart],
  );
  const handleRefreshHeatmap = useCallback(() => refreshChart(CHART_IDS.HEATMAP), [refreshChart]);

  const rightExtra = useMemo(
    () => (
      <>
        <RefreshButton
          onRefresh={refreshWorkspace}
          label={t.gitVisRefreshWorkspace}
          className="adl-git-vis__refresh-btn--lg"
        />
        <ChartColorPresetSelector />
      </>
    ),
    [refreshWorkspace, t.gitVisRefreshWorkspace],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scrollTimers = new Map<Element, ReturnType<typeof setTimeout>>();
    const edgeRaf = new Map<Element, number>();

    const handleScroll = (e: Event) => {
      const el = e.currentTarget as HTMLElement;
      el.setAttribute('data-scrolling', '');
      const existing = scrollTimers.get(el);
      if (existing) {
        clearTimeout(existing);
      }
      scrollTimers.set(
        el,
        setTimeout(() => {
          el.removeAttribute('data-scrolling');
          scrollTimers.delete(el);
        }, SCROLLBAR_DEBOUNCE_MS),
      );
    };

    const handleMouseMove = (e: Event) => {
      const el = e.currentTarget as HTMLElement;
      if (edgeRaf.has(el)) {
        return;
      }
      const id = requestAnimationFrame(() => {
        edgeRaf.delete(el);
        const rect = el.getBoundingClientRect();
        const me = e as MouseEvent;
        const x = me.clientX - rect.left;
        const y = me.clientY - rect.top;
        const nearRight = rect.width - x < 16;
        const nearBottom = rect.height - y < 16;
        el.toggleAttribute('data-scrollbar-near', nearRight || nearBottom);
      });
      edgeRaf.set(el, id);
    };

    const handleMouseLeave = (e: Event) => {
      const el = e.currentTarget as HTMLElement;
      const id = edgeRaf.get(el);
      if (id !== undefined) {
        cancelAnimationFrame(id);
        edgeRaf.delete(el);
      }
      el.removeAttribute('data-scrollbar-near');
    };

    const connectChart = (chart: Element) => {
      chart.addEventListener('scroll', handleScroll, { passive: true });
      chart.addEventListener('mousemove', handleMouseMove, { passive: true });
      chart.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    };

    const disconnectChart = (chart: Element) => {
      chart.removeEventListener('scroll', handleScroll);
      chart.removeEventListener('mousemove', handleMouseMove);
      chart.removeEventListener('mouseleave', handleMouseLeave);
      const timer = scrollTimers.get(chart);
      if (timer) {
        clearTimeout(timer);
        scrollTimers.delete(chart);
      }
      const raf = edgeRaf.get(chart);
      if (raf !== undefined) {
        cancelAnimationFrame(raf);
        edgeRaf.delete(chart);
      }
    };

    const initialCharts = container.querySelectorAll('.adl-git-vis__chart');
    initialCharts.forEach(connectChart);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            if (node.matches('.adl-git-vis__chart')) {
              connectChart(node);
            }
            node.querySelectorAll('.adl-git-vis__chart').forEach(connectChart);
          }
        }
        for (const node of mutation.removedNodes) {
          if (node instanceof Element) {
            if (node.matches('.adl-git-vis__chart')) {
              disconnectChart(node);
            }
            node.querySelectorAll('.adl-git-vis__chart').forEach(disconnectChart);
          }
        }
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      const allCharts = container.querySelectorAll('.adl-git-vis__chart');
      allCharts.forEach(disconnectChart);
      scrollTimers.forEach((t) => clearTimeout(t));
      edgeRaf.forEach((id) => cancelAnimationFrame(id));
      scrollTimers.clear();
      edgeRaf.clear();
    };
  }, []);

  return (
    <div ref={containerRef} className="adl-git-vis__container" data-chart-preset={chartColorPreset}>
      <WorkspaceTabBar rightExtra={rightExtra} />
      <HeatmapCardGroup onRefresh={handleRefreshHeatmap} />
      <ChartCard
        title={t.gitVisBranchGraph}
        desc={t.gitVisBranchGraphDesc}
        onRefresh={handleRefreshBranchGraph}
        refreshLabel={t.gitVisRefreshChart}
      >
        <BranchGraph />
      </ChartCard>
      <ChartCard
        title={t.gitVisCodeLineEvo}
        desc={t.gitVisCodeLineEvoDesc}
        onRefresh={handleRefreshCodeLineEvo}
        refreshLabel={t.gitVisRefreshChart}
      >
        <CodeLineEvo />
      </ChartCard>
      <ChartCard
        title={t.gitVisCommitTimeline}
        desc={t.gitVisCommitTimelineDesc}
        onRefresh={handleRefreshCommitTimeline}
        refreshLabel={t.gitVisRefreshChart}
      >
        <CommitTimeline />
      </ChartCard>
      <ChartCard
        title={t.gitVisFileSunburst}
        desc={t.gitVisFileSunburstDesc}
        onRefresh={handleRefreshFileSunburst}
        refreshLabel={t.gitVisRefreshChart}
      >
        <FileSunburst />
      </ChartCard>
      <p className="adl-git-vis__note">{t.gitVisMockDataNote}</p>
    </div>
  );
});
