export const CHART_IDS = {
  BRANCH_GRAPH: 'branch-graph',
  CODE_LINE_EVO: 'code-line-evolution',
  COMMIT_TIMELINE: 'commit-timeline',
  FILE_HOTSPOTS: 'file-hotspots',
  HEATMAP: 'heatmap',
  CONTRIBUTOR_MODULES: 'contributor-modules',
} as const;

/**
 * Every chart the workspace refresh (`refreshWorkspace`) fetches together.
 * Used to decide whether a workspace's cached `gitVisData` slot is complete
 * enough to skip an automatic re-fetch.
 */
export const GIT_VIS_CHART_IDS = [
  CHART_IDS.BRANCH_GRAPH,
  CHART_IDS.CODE_LINE_EVO,
  CHART_IDS.COMMIT_TIMELINE,
  CHART_IDS.FILE_HOTSPOTS,
  CHART_IDS.HEATMAP,
  CHART_IDS.CONTRIBUTOR_MODULES,
] as const;
