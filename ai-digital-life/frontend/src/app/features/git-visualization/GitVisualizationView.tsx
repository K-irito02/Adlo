import React, { Component, useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { determinePhases } from '@stores/actions/gitVisActions';
import { HeatmapCardGroup } from './HeatmapCardGroup';
import {
  CodeLineEvo,
  CodeLineEvoSeriesToggle,
  useCodeLineEvoVisibility,
} from './charts/CodeLineEvo';
import { CommitTimeline } from './charts/CommitTimeline';
import { FileHotspotsView } from './charts/FileHotspotsView';
import { BranchGraph } from './charts/BranchGraph';
import { BranchGraphHelpCard } from './charts/BranchGraphHelpCard';
import { ChartColorPresetSelector } from './ChartColorPresetSelector';
import { WorkspaceTabBar } from './WorkspaceTabBar';
import { useGitVisRefresh } from './hooks/useGitVisRefresh';
import { useChartData } from './hooks/useChartData';
import { useYearBounds } from './hooks/useYearBounds';
import { RefreshButton } from './RefreshButton';
import { TimeRangeSelector } from './TimeRangeSelector';
import { HintCardTrigger } from '../../components/HintCardTrigger';
import { IconCircleHelp } from '../../icons/status';
import { CHART_IDS } from './chartIds';
import type { GitVisCommitStats } from '@shared/ipc';
import type { GitVisFileHotspots } from '@shared/ipc/workspace';
import type { RawContributorModules } from './adapters/chartDataAdapters';

class VisErrorBoundary extends Component<
  { children: React.ReactNode; onRetry: () => void; errorMsg: string; retryLabel: string },
  { hasError: boolean; errorInfo: string }
> {
  constructor(props: VisErrorBoundary['props']) {
    super(props);
    this.state = { hasError: false, errorInfo: '' };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ADL-VIS-ERROR]', error.message, error.stack, info.componentStack);
    this.setState({ errorInfo: error.message });
  }
  handleRetry = () => {
    this.setState({ hasError: false, errorInfo: '' });
    this.props.onRetry();
  };
  render() {
    if (this.state.hasError) {
      return (
        <div className="adl-git-vis__error-boundary">
          <p>{this.props.errorMsg}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {this.state.errorInfo}
          </p>
          <button onClick={this.handleRetry}>{this.props.retryLabel}</button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface TimeRangeAwareCardProps {
  title: string;
  desc?: string;
  children: React.ReactNode;
  timeRange: ReturnType<typeof useChartData>;
  onRefresh: () => Promise<void>;
  refreshLabel: string;
  yearBounds?: { min: number; max: number } | null;
  headerExtra?: React.ReactNode;
  /** Rendered immediately after the card title (e.g. a help trigger). */
  titleExtra?: React.ReactNode;
}

const TimeRangeAwareCard = React.memo(function TimeRangeAwareCard({
  title,
  desc,
  children,
  timeRange,
  onRefresh,
  refreshLabel,
  yearBounds,
  headerExtra,
  titleExtra,
}: TimeRangeAwareCardProps) {
  return (
    <div className="adl-git-vis__card">
      <div className="adl-git-vis__card-header">
        <RefreshButton onRefresh={onRefresh} label={refreshLabel} />
        <h3 className="adl-git-vis__card-title">{title}</h3>
        {titleExtra}
        {timeRange.hasTimeRange && timeRange.timeRange ? (
          <TimeRangeSelector
            value={timeRange.timeRange}
            onChange={(range) => {
              timeRange.setTimeRange(range);
              return onRefresh();
            }}
            yearBounds={yearBounds}
          />
        ) : null}
        {headerExtra}
      </div>
      {timeRange.error && <div className="adl-git-vis__error">{timeRange.error}</div>}
      {children}
      {desc ? <p className="adl-git-vis__card-desc">{desc}</p> : null}
    </div>
  );
});

const SCROLLBAR_DEBOUNCE_MS = 400;

export const GitVisualizationView = React.memo(function GitVisualizationView() {
  const { t } = useTCopy();
  const chartColorPreset = useAppStore(useShallow((s) => s.chartColorPreset));
  const activeWorkspaceTab = useAppStore((s) => s.activeWorkspaceTab);
  const recentWorkspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const appInfo = useAppStore((s) => s.appInfo);
  const setGitVisLoadedPhases = useAppStore((s) => s.setGitVisLoadedPhases);

  const activeWs = useMemo(
    () => recentWorkspaces.find((w) => w.id === activeWorkspaceTab),
    [recentWorkspaces, activeWorkspaceTab],
  );
  const rootPath = activeWs?.rootPath || '';

  // The persisted active tab id may not match any workspace (e.g. the default
  // 'workspace-1' on first run). Auto-select the current app workspace, falling
  // back to the first available one, so the charts can load without requiring a
  // manual tab click.
  const setActiveWorkspaceTab = useAppStore((s) => s.setActiveWorkspaceTab);
  useEffect(() => {
    if (recentWorkspaces.length === 0) {
      return;
    }
    const matches = recentWorkspaces.some((w) => w.id === activeWorkspaceTab);
    if (matches) {
      return;
    }
    const current =
      recentWorkspaces.find((w) => w.id === appInfo?.currentWorkspace?.id) ?? recentWorkspaces[0];
    if (current && current.id !== activeWorkspaceTab) {
      setActiveWorkspaceTab(current.id);
    }
  }, [recentWorkspaces, activeWorkspaceTab, appInfo?.currentWorkspace?.id, setActiveWorkspaceTab]);

  const { refreshWorkspace, refreshChart } = useGitVisRefresh(activeWorkspaceTab, rootPath);

  const { yearBounds } = useYearBounds(rootPath);

  const heatmapData = useChartData(CHART_IDS.HEATMAP);
  const contributorModulesData = useChartData(CHART_IDS.CONTRIBUTOR_MODULES);
  const branchGraphData = useChartData(CHART_IDS.BRANCH_GRAPH);
  const codeLineEvoData = useChartData(CHART_IDS.CODE_LINE_EVO);
  const commitTimelineData = useChartData(CHART_IDS.COMMIT_TIMELINE);
  const fileHotspotsData = useChartData(CHART_IDS.FILE_HOTSPOTS);

  const codeLineEvoVis = useCodeLineEvoVisibility();

  // Cascade load priority phases — data loads on first view via loadActiveWorkspace
  useEffect(() => {
    if (!appInfo?.config || recentWorkspaces.length === 0) {
      return;
    }
    const phases = determinePhases(
      appInfo.config.workspacePriorityIds ?? [],
      appInfo.config.workspaceDeferredIds ?? [],
      appInfo.config.workspaceNaturalOrder ?? [],
      recentWorkspaces.map((w) => ({ id: w.id, rootPath: w.rootPath })),
    );
    setGitVisLoadedPhases(
      Object.fromEntries([
        ...phases.high.map((w) => [w.id, 'high' as const]),
        ...phases.medium.map((w) => [w.id, 'medium' as const]),
        ...phases.low.map((w) => [w.id, 'low' as const]),
      ]),
    );
  }, [recentWorkspaces, appInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load active workspace data — uses ref to avoid stale time range closure
  const refreshWorkspaceRef = useRef(refreshWorkspace);
  refreshWorkspaceRef.current = refreshWorkspace;
  useEffect(() => {
    if (!rootPath) {
      return;
    }
    const timer = setTimeout(() => void refreshWorkspaceRef.current(), 100);
    return () => clearTimeout(timer);
  }, [rootPath]);

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
  const handleRefreshFileHotspots = useCallback(
    () => refreshChart(CHART_IDS.FILE_HOTSPOTS),
    [refreshChart],
  );
  const handleRefreshHeatmap = useCallback(() => refreshChart(CHART_IDS.HEATMAP), [refreshChart]);
  const handleRefreshContributorModules = useCallback(
    () => refreshChart(CHART_IDS.CONTRIBUTOR_MODULES),
    [refreshChart],
  );

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

    const chartSelector =
      '.adl-git-vis__chart, .adl-branch-graph__body, .adl-file-hotspots-ranking__scroll';
    const initialCharts = container.querySelectorAll(chartSelector);
    initialCharts.forEach(connectChart);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            if (node.matches(chartSelector)) {
              connectChart(node);
            }
            node.querySelectorAll(chartSelector).forEach(connectChart);
          }
        }
        for (const node of mutation.removedNodes) {
          if (node instanceof Element) {
            if (node.matches(chartSelector)) {
              disconnectChart(node);
            }
            node.querySelectorAll(chartSelector).forEach(disconnectChart);
          }
        }
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      const allCharts = container.querySelectorAll(chartSelector);
      allCharts.forEach(disconnectChart);
      scrollTimers.forEach((t) => clearTimeout(t));
      edgeRaf.forEach((id) => cancelAnimationFrame(id));
      scrollTimers.clear();
      edgeRaf.clear();
    };
  }, []);

  return (
    <VisErrorBoundary
      onRetry={refreshWorkspace}
      errorMsg={t.gitVisError}
      retryLabel={t.gitVisRetry}
    >
      <div
        ref={containerRef}
        className="adl-git-vis__container"
        data-chart-preset={chartColorPreset}
      >
        <WorkspaceTabBar rightExtra={rightExtra} />
        <HeatmapCardGroup
          onRefresh={handleRefreshHeatmap}
          onRefreshContributorModules={handleRefreshContributorModules}
          commitStats={
            heatmapData.data as
              | {
                  dailyCommits: { date: string; count: number }[];
                  hourlyDistribution: { day: number; hour: number; count: number }[];
                  contributorActivity: {
                    author: string;
                    authorEmail: string;
                    totalCommits: number;
                    periods: { period: string; month: number; count: number }[];
                  }[];
                  commitTimeline: { date: string; count: number; cumulative: number }[];
                }
              | undefined
          }
          commitStatsStatus={heatmapData.loading ? 'loading' : 'ready'}
          contributorModules={
            (contributorModulesData.data as RawContributorModules | undefined)?.matrix
          }
          contributorModuleAllPaths={
            (contributorModulesData.data as RawContributorModules | undefined)?.allPaths
          }
          contributorModuleStatus={contributorModulesData.loading ? 'loading' : 'ready'}
          yearBounds={yearBounds}
        />
        <TimeRangeAwareCard
          title={t.gitVisBranchGraph}
          desc={t.gitVisBranchGraphDesc}
          onRefresh={handleRefreshBranchGraph}
          refreshLabel={t.gitVisRefreshChart}
          timeRange={branchGraphData}
          yearBounds={yearBounds}
          titleExtra={
            <HintCardTrigger content={<BranchGraphHelpCard />}>
              <button
                type="button"
                className="adl-icon-button adl-icon-button--info adl-branch-graph__help-trigger"
                tabIndex={-1}
                aria-label={t.gitVisBranchGraphHelpAria}
              >
                <IconCircleHelp size={16} />
              </button>
            </HintCardTrigger>
          }
        >
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
            status={branchGraphData.loading ? 'loading' : 'ready'}
            loadingLabel={t.gitVisLoadingChart}
          />
        </TimeRangeAwareCard>
        <TimeRangeAwareCard
          title={t.gitVisCodeLineEvo}
          desc={t.gitVisCodeLineEvoDesc}
          onRefresh={handleRefreshCodeLineEvo}
          refreshLabel={t.gitVisRefreshChart}
          timeRange={codeLineEvoData}
          yearBounds={yearBounds}
          headerExtra={
            <CodeLineEvoSeriesToggle
              visible={codeLineEvoVis.visible}
              onToggle={codeLineEvoVis.toggleSeries}
            />
          }
        >
          <CodeLineEvo
            data={
              codeLineEvoData.data as
                | { days: { date: string; additions: number; deletions: number }[] }
                | undefined
            }
            visible={codeLineEvoVis.visible}
            status={codeLineEvoData.loading ? 'loading' : 'ready'}
            loadingLabel={t.gitVisLoadingChart}
          />
        </TimeRangeAwareCard>
        <TimeRangeAwareCard
          title={t.gitVisCommitTimeline}
          desc={t.gitVisCommitTimelineDesc}
          onRefresh={handleRefreshCommitTimeline}
          refreshLabel={t.gitVisRefreshChart}
          timeRange={commitTimelineData}
          yearBounds={yearBounds}
        >
          <CommitTimeline
            data={{
              days:
                (commitTimelineData.data as GitVisCommitStats | undefined)?.commitTimeline ?? [],
            }}
            status={commitTimelineData.loading ? 'loading' : 'ready'}
            loadingLabel={t.gitVisLoadingChart}
          />
        </TimeRangeAwareCard>
        <TimeRangeAwareCard
          title={t.gitVisFileHotspotsTitle}
          onRefresh={handleRefreshFileHotspots}
          refreshLabel={t.gitVisRefreshChart}
          timeRange={fileHotspotsData}
          yearBounds={yearBounds}
        >
          <FileHotspotsView
            data={fileHotspotsData.data as GitVisFileHotspots | undefined}
            scrollContainerRef={containerRef}
            status={fileHotspotsData.loading ? 'loading' : 'ready'}
            loadingLabel={t.gitVisLoadingChart}
          />
        </TimeRangeAwareCard>
      </div>
    </VisErrorBoundary>
  );
});
