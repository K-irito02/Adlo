import React, { Component, useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
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
import { visibleGitWorkspaces } from './gitVisualizationWorkspaces';
import { useGitVisRefresh } from './hooks/useGitVisRefresh';
import { useChartData } from './hooks/useChartData';
import { useYearBounds } from './hooks/useYearBounds';
import { hasGitVisWorkspaceData, isGitVisWorkspaceLoading } from './gitVisCache';
import { RefreshButton } from './RefreshButton';
import { TimeRangeSelector } from './TimeRangeSelector';
import { HintCardTrigger } from '../../components/HintCard';
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
  /**
   * True when a workspace is selected. When false the chart body renders the
   * "no workspace" hint, so a raw fetch error banner above it is suppressed.
   */
  hasWorkspace: boolean;
  /**
   * True when the selected workspace is a git repo. When false the chart body
   * renders the "not a git repo" hint, so a raw fetch error banner (e.g. a
   * backend `git log --all failed`) is suppressed instead of duplicating the hint.
   */
  isGitRepo: boolean;
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
  hasWorkspace,
  isGitRepo,
}: TimeRangeAwareCardProps) {
  const { t } = useTCopy();
  // Show the workspace-level fetch error only while a workspace IS selected and
  // IS a git repo: when there is no workspace or the snapshot says "not a git
  // repo", the chart body already renders the matching static hint and a raw
  // backend error banner above it would duplicate / contradict that message.
  const showError = Boolean(timeRange.error && hasWorkspace && isGitRepo);
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
      {showError && (
        <div className="adl-git-vis__error">
          {formatT(t, 'gitVisWorkspaceError', { message: timeRange.error ?? '' })}
        </div>
      )}
      {children}
      {desc ? <p className="adl-git-vis__card-desc">{desc}</p> : null}
    </div>
  );
});

const SCROLLBAR_DEBOUNCE_MS = 400;
/** Defers the active-workspace auto-refresh so a tab/breadcrumb burst settles first. */
const WORKSPACE_REFRESH_DEBOUNCE_MS = 100;

export const GitVisualizationView = React.memo(function GitVisualizationView() {
  const { t } = useTCopy();
  const chartColorPreset = useAppStore(useShallow((s) => s.chartColorPreset));
  const activeWorkspaceTab = useAppStore((s) => s.activeWorkspaceTab);
  const recentWorkspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const gitWorkspaces = useMemo(() => visibleGitWorkspaces(recentWorkspaces), [recentWorkspaces]);
  const appInfo = useAppStore((s) => s.appInfo);
  const setGitVisLoadedPhases = useAppStore((s) => s.setGitVisLoadedPhases);
  const loadGitSnapshot = useAppStore((s) => s.loadGitSnapshot);
  const setActiveWorkspaceTab = useAppStore((s) => s.setActiveWorkspaceTab);

  const activeWs = useMemo(
    () => gitWorkspaces.find((w) => w.id === activeWorkspaceTab),
    [gitWorkspaces, activeWorkspaceTab],
  );
  const rootPath = activeWs?.rootPath || '';

  // Subscribe to only the active workspace's snapshot slot (not the whole map):
  // an unrelated workspace's stage/unstage/branch change must not re-render the
  // entire visualization. Zustand re-runs only when this slot's reference changes.
  const activeWsGitSnapshot = useAppStore((s) => s.gitSnapshots[s.activeWorkspaceTab]);
  // True once the workspace's cached charts are known stale (commit / branch
  // change); the auto-refresh guard then re-fetches even with a full cache.
  const gitVisStaleForActiveWs = useAppStore((s) => !!s.gitVisStale?.[s.activeWorkspaceTab]);
  // Snapshot load bookkeeping lives on the changes-tree keys (loadGitSnapshot /
  // refreshGitSnapshot use workspaceChangesTreeLoading/Errors); a missing slot
  // with no loader in flight means we should trigger a lazy load ourselves.
  const snapshotLoading = useAppStore((s) => !!s.workspaceChangesTreeLoading[s.activeWorkspaceTab]);
  const snapshotError = useAppStore((s) => s.workspaceChangesTreeErrors[s.activeWorkspaceTab]);

  // Check if current workspace is a Git repository
  // gitSnapshots[activeWorkspaceTab] is initially undefined until bootstrap() loads
  // the Git status asynchronously. During this loading window, we show a loading
  // state rather than incorrectly displaying "not a Git repository".
  const gitSnapshotForActiveWs = activeWsGitSnapshot;
  const isGitSnapshotLoaded = gitSnapshotForActiveWs !== undefined;
  const isGitRepo = gitSnapshotForActiveWs?.isRepo ?? false;
  const hasWorkspace = Boolean(activeWs);
  // The active workspace's snapshot failed to load and we have nothing cached:
  // without this flag the charts would spin on a permanent skeleton. Surface a
  // recoverable error instead of an endless loading state.
  const snapshotFailed = Boolean(hasWorkspace && snapshotError && !isGitSnapshotLoaded);
  // The persisted active tab id does not match any known workspace yet (default
  // 'workspace-1' on first run, or the workspace was removed). The auto-select
  // effect below fixes the tab right after commit; until then render a neutral
  // loading region instead of flashing the "请选择一个 Git 工作区" empty-state.
  const workspaceTabUnresolved = gitWorkspaces.length > 0 && !activeWs;

  // Auto-select the current app workspace, falling back to the first available
  // one, so the charts can load without requiring a manual tab click.
  useEffect(() => {
    if (gitWorkspaces.length === 0) {
      return;
    }
    const matches = gitWorkspaces.some((w) => w.id === activeWorkspaceTab);
    if (matches) {
      return;
    }
    const current =
      gitWorkspaces.find((w) => w.id === appInfo?.currentWorkspace?.id) ?? gitWorkspaces[0];
    if (current && current.id !== activeWorkspaceTab) {
      setActiveWorkspaceTab(current.id);
    }
  }, [gitWorkspaces, activeWorkspaceTab, appInfo?.currentWorkspace?.id, setActiveWorkspaceTab]);

  // Lazy-load the active workspace's git snapshot when it is missing. bootstrap()
  // only preloads visible workspaces; a tab whose snapshot never loaded (hidden /
  // removed-from-sidebar / previously failed) must not render a permanent loading
  // skeleton. loadGitSnapshot is itself a lazy loader (hasData/isLoading guard),
  // so this effect only fires while there is genuinely nothing cached and no
  // request in flight. A failed load is NOT retried here (snapshotFailed renders
  // a recoverable error with its own retry action) to avoid a hot retry loop.
  useEffect(() => {
    if (!activeWs || !rootPath) {
      return;
    }
    if (isGitSnapshotLoaded || snapshotLoading || snapshotFailed) {
      return;
    }
    void loadGitSnapshot(activeWorkspaceTab, rootPath);
  }, [
    activeWs,
    rootPath,
    activeWorkspaceTab,
    isGitSnapshotLoaded,
    snapshotLoading,
    snapshotFailed,
    loadGitSnapshot,
  ]);

  const { refreshWorkspace, refreshChart } = useGitVisRefresh(activeWorkspaceTab, rootPath);

  const { yearBounds } = useYearBounds(rootPath);

  // Helper to resolve chart status based on workspace and git repo state
  // When git snapshot is still loading (isGitSnapshotLoaded === false), we show
  // loading state to avoid briefly flashing "not a Git repository" messages.
  const resolveChartStatus = useCallback(
    (loading: boolean): 'loading' | 'ready' =>
      !hasWorkspace || !isGitRepo
        ? isGitSnapshotLoaded
          ? 'ready'
          : 'loading'
        : loading
          ? 'loading'
          : 'ready',
    [hasWorkspace, isGitRepo, isGitSnapshotLoaded],
  );

  const heatmapData = useChartData(CHART_IDS.HEATMAP);
  const contributorModulesData = useChartData(CHART_IDS.CONTRIBUTOR_MODULES);
  const branchGraphData = useChartData(CHART_IDS.BRANCH_GRAPH);
  const codeLineEvoData = useChartData(CHART_IDS.CODE_LINE_EVO);
  const commitTimelineData = useChartData(CHART_IDS.COMMIT_TIMELINE);
  const fileHotspotsData = useChartData(CHART_IDS.FILE_HOTSPOTS);

  const codeLineEvoVis = useCodeLineEvoVisibility();

  // Cascade load priority phases — data loads on first view via loadActiveWorkspace
  useEffect(() => {
    if (!appInfo?.config || gitWorkspaces.length === 0) {
      return;
    }
    const phases = determinePhases(
      appInfo.config.workspacePriorityIds ?? [],
      appInfo.config.workspaceDeferredIds ?? [],
      appInfo.config.workspaceNaturalOrder ?? [],
      gitWorkspaces.map((w) => ({ id: w.id, rootPath: w.rootPath })),
    );
    setGitVisLoadedPhases(
      Object.fromEntries([
        ...phases.high.map((w) => [w.id, 'high' as const]),
        ...phases.medium.map((w) => [w.id, 'medium' as const]),
        ...phases.low.map((w) => [w.id, 'low' as const]),
      ]),
    );
  }, [gitWorkspaces, appInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load active workspace data — uses ref to avoid stale time range closure.
  // Session cache guard: skip the automatic workspace refresh once this
  // workspace's chart slot is fully cached AND not marked stale (a commit or
  // branch change marks it stale so the view re-fetches). While stale the fetch
  // is forced even if a per-chart refresh is in flight — otherwise a narrow race
  // would leave the other charts stale. The in-flight guard only dedupes the
  // non-stale auto-refresh when the effect remounts within the debounce window.
  // Manual RefreshButtons still force a fetch; a workspace with missing charts
  // (first visit or a partially failed load) still auto-loads.
  const refreshWorkspaceRef = useRef(refreshWorkspace);
  refreshWorkspaceRef.current = refreshWorkspace;
  useEffect(() => {
    if (!rootPath) {
      return;
    }
    const timer = setTimeout(() => {
      const state = useAppStore.getState();
      const stale = !!state.gitVisStale?.[activeWorkspaceTab];
      if (!stale) {
        if (hasGitVisWorkspaceData(state.gitVisData, activeWorkspaceTab)) {
          // A full cache whose last round had failing charts still serves old
          // data behind an error banner; re-entering the view retries rather
          // than silently reusing it.
          const errors = state.gitVisErrors?.[activeWorkspaceTab];
          if (!errors || !Object.values(errors).some(Boolean)) {
            return;
          }
        }
        if (isGitVisWorkspaceLoading(state.gitVisLoading, activeWorkspaceTab)) {
          return;
        }
      }
      void refreshWorkspaceRef.current();
    }, WORKSPACE_REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // Re-run when the workspace head/branch changes too: a second commit that
    // lands while a stale-triggered refresh is already in flight re-marks
    // gitVisStale (which is already true, so the flag alone would not notify),
    // and the effect must re-arm to retry with the newest head.
  }, [
    rootPath,
    activeWorkspaceTab,
    gitVisStaleForActiveWs,
    activeWsGitSnapshot?.head,
    activeWsGitSnapshot?.branch,
  ]);

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
        {workspaceTabUnresolved ? (
          <div className="adl-git-vis__not-repo-hint">
            <p className="adl-git-vis__not-repo-hint-text">{t.gitVisLoadingChart}</p>
          </div>
        ) : snapshotFailed ? (
          <div className="adl-git-vis__card adl-git-vis__snapshot-error">
            <div className="adl-git-vis__error">
              {formatT(t, 'gitVisWorkspaceError', { message: snapshotError ?? '' })}
            </div>
            <div className="adl-git-vis__snapshot-error-retry">
              <button
                type="button"
                className="adl-git-vis__refresh-btn adl-git-vis__refresh-btn--lg"
                onClick={() => {
                  void loadGitSnapshot(activeWorkspaceTab, rootPath);
                }}
              >
                {t.gitVisRetry}
              </button>
            </div>
          </div>
        ) : (
          <>
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
              commitStatsStatus={resolveChartStatus(heatmapData.loading)}
              contributorModules={
                (contributorModulesData.data as RawContributorModules | undefined)?.matrix
              }
              contributorModuleAllPaths={
                (contributorModulesData.data as RawContributorModules | undefined)?.allPaths
              }
              contributorModuleStatus={resolveChartStatus(contributorModulesData.loading)}
              yearBounds={yearBounds}
              isGitRepo={isGitRepo}
              hasWorkspace={hasWorkspace}
              isGitSnapshotLoaded={isGitSnapshotLoaded}
            />
            <TimeRangeAwareCard
              title={t.gitVisBranchGraph}
              desc={t.gitVisBranchGraphDesc}
              onRefresh={handleRefreshBranchGraph}
              refreshLabel={t.gitVisRefreshChart}
              timeRange={branchGraphData}
              yearBounds={yearBounds}
              hasWorkspace={hasWorkspace}
              isGitRepo={isGitRepo}
              titleExtra={
                <HintCardTrigger content={<BranchGraphHelpCard />}>
                  <button
                    type="button"
                    className="adl-icon-button adl-icon-button--info"
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
                status={resolveChartStatus(branchGraphData.loading)}
                loadingLabel={t.gitVisLoadingChart}
                isGitRepo={isGitRepo}
                hasWorkspace={hasWorkspace}
                isGitSnapshotLoaded={isGitSnapshotLoaded}
              />
            </TimeRangeAwareCard>
            <TimeRangeAwareCard
              title={t.gitVisCodeLineEvo}
              desc={t.gitVisCodeLineEvoDesc}
              onRefresh={handleRefreshCodeLineEvo}
              refreshLabel={t.gitVisRefreshChart}
              timeRange={codeLineEvoData}
              yearBounds={yearBounds}
              hasWorkspace={hasWorkspace}
              isGitRepo={isGitRepo}
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
                status={resolveChartStatus(codeLineEvoData.loading)}
                loadingLabel={t.gitVisLoadingChart}
                isGitRepo={isGitRepo}
                hasWorkspace={hasWorkspace}
                isGitSnapshotLoaded={isGitSnapshotLoaded}
              />
            </TimeRangeAwareCard>
            <TimeRangeAwareCard
              title={t.gitVisCommitTimeline}
              desc={t.gitVisCommitTimelineDesc}
              onRefresh={handleRefreshCommitTimeline}
              refreshLabel={t.gitVisRefreshChart}
              timeRange={commitTimelineData}
              yearBounds={yearBounds}
              hasWorkspace={hasWorkspace}
              isGitRepo={isGitRepo}
            >
              <CommitTimeline
                data={{
                  days:
                    (commitTimelineData.data as GitVisCommitStats | undefined)?.commitTimeline ??
                    [],
                }}
                status={resolveChartStatus(commitTimelineData.loading)}
                loadingLabel={t.gitVisLoadingChart}
                isGitRepo={isGitRepo}
                hasWorkspace={hasWorkspace}
                isGitSnapshotLoaded={isGitSnapshotLoaded}
              />
            </TimeRangeAwareCard>
            <TimeRangeAwareCard
              title={t.gitVisFileHotspotsTitle}
              onRefresh={handleRefreshFileHotspots}
              refreshLabel={t.gitVisRefreshChart}
              timeRange={fileHotspotsData}
              yearBounds={yearBounds}
              hasWorkspace={hasWorkspace}
              isGitRepo={isGitRepo}
            >
              <FileHotspotsView
                data={fileHotspotsData.data as GitVisFileHotspots | undefined}
                scrollContainerRef={containerRef}
                status={resolveChartStatus(fileHotspotsData.loading)}
                loadingLabel={t.gitVisLoadingChart}
                isGitRepo={isGitRepo}
                hasWorkspace={hasWorkspace}
                isGitSnapshotLoaded={isGitSnapshotLoaded}
              />
            </TimeRangeAwareCard>
          </>
        )}
      </div>
    </VisErrorBoundary>
  );
});
