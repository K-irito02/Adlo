import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { determinePhases, fetchChartData } from '@stores/actions/gitVisActions';
import { defaultTimeRange } from '@stores/slices/gitVisSlice';
import { getBridge } from '@stores/slices/githubSliceHelpers';
import { HeatmapCardGroup } from './HeatmapCardGroup';
import { CodeLineEvo } from './charts/CodeLineEvo';
import { CommitTimeline } from './charts/CommitTimeline';
import { FileSunburst } from './charts/FileSunburst';
import { BranchGraph } from './charts/BranchGraph';
import { ChartColorPresetSelector } from './ChartColorPresetSelector';
import { WorkspaceTabBar } from './WorkspaceTabBar';
import { useGitVisRefresh } from './hooks/useGitVisRefresh';
import { useChartData } from './hooks/useChartData';
import { RefreshButton } from './RefreshButton';
import { TimeRangeSelector } from './TimeRangeSelector';
import { CHART_IDS } from './chartIds';

interface TimeRangeAwareCardProps {
  title: string;
  desc: string;
  children: React.ReactNode;
  timeRange: ReturnType<typeof useChartData>;
  onRefresh: () => Promise<void>;
  refreshLabel: string;
}

function TimeRangeAwareCard({
  title,
  desc,
  children,
  timeRange,
  onRefresh,
  refreshLabel,
}: TimeRangeAwareCardProps) {
  return (
    <div className="adl-git-vis__card">
      <div className="adl-git-vis__card-header">
        <RefreshButton onRefresh={onRefresh} label={refreshLabel} />
        <h3 className="adl-git-vis__card-title">{title}</h3>
        {timeRange.hasTimeRange && timeRange.timeRange ? (
          <TimeRangeSelector value={timeRange.timeRange} onChange={timeRange.setTimeRange} />
        ) : null}
      </div>
      {timeRange.error && <div className="adl-git-vis__error">{timeRange.error}</div>}
      {timeRange.loading ? <div className="adl-git-vis__skeleton" /> : children}
      <p className="adl-git-vis__card-desc">{desc}</p>
    </div>
  );
}

const SCROLLBAR_DEBOUNCE_MS = 400;

export const GitVisualizationView = React.memo(function GitVisualizationView() {
  const { t } = useTCopy();
  const chartColorPreset = useAppStore(useShallow((s) => s.chartColorPreset));
  const activeWorkspaceTab = useAppStore((s) => s.activeWorkspaceTab);
  const recentWorkspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const appInfo = useAppStore((s) => s.appInfo);
  const setGitVisData = useAppStore((s) => s.setGitVisData);
  const setGitVisError = useAppStore((s) => s.setGitVisError);
  const setGitVisLoadedPhases = useAppStore((s) => s.setGitVisLoadedPhases);

  const activeWs = useMemo(
    () => recentWorkspaces.find((w) => w.id === activeWorkspaceTab),
    [recentWorkspaces, activeWorkspaceTab],
  );
  const rootPath = activeWs?.rootPath || '';

  const { refreshWorkspace, refreshChart } = useGitVisRefresh(activeWorkspaceTab, rootPath);

  const heatmapData = useChartData(CHART_IDS.HEATMAP);
  const branchGraphData = useChartData(CHART_IDS.BRANCH_GRAPH);
  const codeLineEvoData = useChartData(CHART_IDS.CODE_LINE_EVO);
  const commitTimelineData = useChartData(CHART_IDS.COMMIT_TIMELINE);
  const fileSunburstData = useChartData(CHART_IDS.FILE_SUNBURST);

  // Cascade load across all workspaces based on priority phases — runs once
  const cascadeStarted = useRef(false);
  useEffect(() => {
    if (cascadeStarted.current) {
      return;
    }
    const config = appInfo?.config;
    if (!config || recentWorkspaces.length === 0) {
      return;
    }
    cascadeStarted.current = true;

    const phases = determinePhases(
      config.workspacePriorityIds ?? [],
      config.workspaceDeferredIds ?? [],
      config.workspaceNaturalOrder ?? [],
      recentWorkspaces.map((w) => ({ id: w.id, rootPath: w.rootPath })),
    );

    setGitVisLoadedPhases(
      Object.fromEntries([
        ...phases.high.map((w) => [w.id, 'high' as const]),
        ...phases.medium.map((w) => [w.id, 'medium' as const]),
        ...phases.low.map((w) => [w.id, 'low' as const]),
      ]),
    );

    const bridge = getBridge();
    if (!bridge) {
      return;
    }

    const allChartIds = Object.values(CHART_IDS);
    const tr = defaultTimeRange();

    const loadPhase = async (workspaces: { id: string; rootPath: string }[]) => {
      for (const ws of workspaces) {
        for (const chartId of allChartIds) {
          fetchChartData(bridge, ws.id, ws.rootPath, chartId, tr.since, tr.until)
            .then((data) => setGitVisData(ws.id, chartId, data))
            .catch((e) => setGitVisError(ws.id, chartId, String(e)));
        }
      }
    };

    loadPhase(phases.high);

    const hasRIC = typeof requestIdleCallback !== 'undefined';
    const id: number = hasRIC
      ? (requestIdleCallback(() => {
          loadPhase(phases.medium).then(() => loadPhase(phases.low));
        }) as unknown as number)
      : window.setTimeout(() => {
          loadPhase(phases.medium).then(() => loadPhase(phases.low));
        }, 1000);

    return () => {
      if (hasRIC) {
        cancelIdleCallback(id);
      } else {
        window.clearTimeout(id);
      }
    };
  }, [recentWorkspaces, appInfo]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <HeatmapCardGroup
        onRefresh={handleRefreshHeatmap}
        commitStats={
          heatmapData.data as
            | {
                dailyCommits: { date: string; count: number }[];
                hourlyDistribution: { day: number; hour: number; count: number }[];
                contributorActivity: {
                  author: string;
                  authorEmail: string;
                  totalCommits: number;
                  periods: { period: string; count: number }[];
                }[];
                commitTimeline: { date: string; cumulative: number }[];
              }
            | undefined
        }
        contributorModules={
          heatmapData.data as
            | {
                matrix: {
                  author: string;
                  authorEmail: string;
                  modules: { module: string; count: number }[];
                }[];
              }
            | undefined
        }
        timeRange={heatmapData.timeRange}
        onTimeRangeChange={heatmapData.setTimeRange}
      />
      <TimeRangeAwareCard
        title={t.gitVisBranchGraph}
        desc={t.gitVisBranchGraphDesc}
        onRefresh={handleRefreshBranchGraph}
        refreshLabel={t.gitVisRefreshChart}
        timeRange={branchGraphData}
      >
        {branchGraphData.loading ? null : (
          <BranchGraph
            data={
              branchGraphData.data as
                | {
                    nodes: {
                      hash: string;
                      shortHash: string;
                      parentHashes: string[];
                      branch: string;
                      date: string;
                      message: string;
                      author: string;
                      authorEmail: string;
                      tag?: string;
                    }[];
                    edges: { from: string; to: string }[];
                    branches: string[];
                  }
                | undefined
            }
          />
        )}
      </TimeRangeAwareCard>
      <TimeRangeAwareCard
        title={t.gitVisCodeLineEvo}
        desc={t.gitVisCodeLineEvoDesc}
        onRefresh={handleRefreshCodeLineEvo}
        refreshLabel={t.gitVisRefreshChart}
        timeRange={codeLineEvoData}
      >
        {codeLineEvoData.loading ? null : (
          <CodeLineEvo
            data={
              codeLineEvoData.data as
                | { weeks: { weekStart: string; additions: number; deletions: number }[] }
                | undefined
            }
          />
        )}
      </TimeRangeAwareCard>
      <TimeRangeAwareCard
        title={t.gitVisCommitTimeline}
        desc={t.gitVisCommitTimelineDesc}
        onRefresh={handleRefreshCommitTimeline}
        refreshLabel={t.gitVisRefreshChart}
        timeRange={commitTimelineData}
      >
        {commitTimelineData.loading ? null : (
          <CommitTimeline
            data={commitTimelineData.data as { commitTimeline: { date: string; cumulative: number }[] } | undefined}
          />
        )}
      </TimeRangeAwareCard>
      <TimeRangeAwareCard
        title={t.gitVisFileSunburst}
        desc={t.gitVisFileSunburstDesc}
        onRefresh={handleRefreshFileSunburst}
        refreshLabel={t.gitVisRefreshChart}
        timeRange={fileSunburstData}
      >
        {fileSunburstData.loading ? null : <FileSunburst data={fileSunburstData.data} />}
      </TimeRangeAwareCard>
    </div>
  );
});
