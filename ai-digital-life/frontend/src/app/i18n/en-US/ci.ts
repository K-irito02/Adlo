/**
 * CI Panel Translations - English
 */
export const ciEn = {
  // ========== Panel Title ==========
  ciPanelTitle: 'Quality Gates',

  // ========== Config Area ==========
  ciOwnerPlaceholder: 'e.g. your-username',
  ciRepoPlaceholder: 'e.g. my-repo',
  ciBranchPlaceholder: 'default: main',
  ciTokenPlaceholder: 'optional · higher rate limit / private repos',
  ciQueryButton: 'Query',
  ciOwnerLabel: 'Owner',
  ciRepoLabel: 'Repo',
  ciBranchLabel: 'Branch',
  ciTokenLabel: 'Token',
  ciTokenOptional: 'optional',
  ciShowToken: 'Show',
  ciHideToken: 'Hide',

  // ========== Metadata Labels ==========
  ciTriggeredBy: 'Triggered by',
  ciEvent: 'Event',
  ciSha: 'SHA',
  ciStartedAt: 'Started',
  // ========== Jobs ==========
  ciJobsTitle: 'Jobs',
  ciNoWorkflowRuns: 'No Workflow Runs',
  ciNoWorkflowRunsHint: 'No recent runs found on branch {branch}',

  // ========== Empty State ==========
  ciConfigToQuery: 'Configure repo to query Quality Gates',
  ciConfigToQueryHint: 'Enter Owner/Repo/Branch and click "Query"',

  // ========== Tab ==========
  ciTabStatus: 'Status',
  ciTabHelp: 'Help',

  // ========== Method A Tooltip (Basic) ==========
  ciTooltipQuickStart: 'Quick Start',
  ciTooltipAutoRefresh: 'Auto-refresh',
  ciTooltipManualRefresh: 'Manual Refresh',

  ciTooltipQuickStartContent: 'Enter Owner/Repo/Branch → Click "Query" → View Status',
  ciTooltipAutoRefreshContent: 'Auto-refreshes after git push in terminal (enabled by default)',
  ciTooltipManualRefreshContent: 'Click the refresh button in the header',
  ciTooltipStatusLegend: 'Status Legend',
  ciTooltipStatusSuccess: 'Passed',
  ciTooltipStatusFailure: 'Failed',
  ciTooltipStatusInProgress: 'Running',
  ciTooltipStatusSkipped: 'Skipped',

  // ========== Help Tab - Basic Usage ==========
  ciHelpBasicTitle: 'Basic Usage',
  ciHelpHowToConfig: 'How to Configure',
  ciHelpHowToConfigContent:
    'Enter Owner (repository owner), Repo (repository name), Branch (branch name, defaults to main), then click the "Query" button to fetch CI status.',
  ciHelpBasicAutoRefresh: 'Auto-Refresh Mechanism',
  ciHelpBasicAutoRefreshContent:
    'The panel enables auto-refresh by default: after a successful git push in the terminal, the system automatically detects the change and re-fetches CI status. No manual action is required, ensuring you always see the latest results. If auto-refresh does not trigger, click the refresh button in the toolbar to manually update.',
  ciHelpMultiWorkspace: 'Multi-Workspace Management',
  ciHelpMultiWorkspaceContent:
    'The panel supports monitoring CI status for multiple workspaces simultaneously. Each workspace can configure its own Owner/Repo/Branch/Token independently, and you can switch between them via the navigator sidebar. You can also create custom grouping folders to organize related workspaces, and pin frequently used workspaces to the top of the list.',
  ciHelpStatusColors: 'Status Colors',
  ciHelpStatusColorsContent:
    '🟢 Green = Passed (success)\n🔴 Red = Failed (failure)\n🟡 Yellow = Running (in_progress)\n⬜ Gray = Skipped (skipped)',
  // ========== Help Tab - Config Steps ==========
  ciHelpConfigStepsLabel: 'Steps:',
  ciHelpConfigStep1:
    'Select a configured workspace in the navigator sidebar, or click the settings button to configure a new repository.',
  ciHelpConfigStep2: 'Fill in Owner, Repo, and Branch in the dialog.',
  ciHelpConfigStep3:
    'Optional: enter a GitHub Token to increase API rate limits or access private repositories.',
  ciHelpConfigStep4: 'Click "Save & Query" to fetch CI status.',

  // ========== Help Tab - Status Colors ==========
  ciHelpColorGreen: 'Green — Passed (success)',
  ciHelpColorRed: 'Red — Failed (failure)',
  ciHelpColorYellow: 'Yellow — Running (in_progress / queued)',
  ciHelpColorGray: 'Gray — Skipped / Cancelled (skipped / cancelled)',

  // ========== Help Tab - Log Features ==========
  ciHelpLogFeatureAnsi:
    'The log viewer supports ANSI color rendering for clear log level differentiation.',
  ciHelpLogFeatureSearch:
    'Use the search box to quickly locate keywords, with jump-to-next and jump-to-previous navigation.',
  ciHelpLogFeatureCollapse:
    'The "Collapse blank lines" button merges consecutive blank lines to reduce visual noise.',
  ciHelpLogFeatureGithub:
    'After loading, click "View on GitHub" to see the full log on GitHub Actions.',

  // ========== Help Tab - Concept Labels ==========
  ciHelpConceptWorkflowLabel: 'Workflow',
  ciHelpConceptJobLabel: 'Job',
  ciHelpConceptStepLabel: 'Step',
  ciHelpConceptRunLabel: 'Run',

  // ========== Help Tab - Troubleshooting Labels ==========
  ciHelpTroubleCauseLabel: 'Possible cause:',
  ciHelpTroubleSolutionLabel: 'Solution:',

  ciHelpViewLogs: 'How to View Logs',
  ciHelpViewLogsContent:
    'Click the arrow on the left of a Job to expand the Step list and view detailed results for each step. Click "View on GitHub" to jump to the GitHub Actions page for complete information.',

  // ========== Help Tab - Advanced Concepts ==========
  ciHelpConceptsTitle: 'Advanced Concepts',
  ciHelpConceptWorkflow: 'Workflow',
  ciHelpConceptWorkflowDef:
    'The top-level workflow in GitHub Actions, defined in .github/workflows/*.yml files.',
  ciHelpConceptWorkflowAnalogy:
    'Think of it as the "master blueprint" of an assembly line, defining which stages run from start to finish.',
  ciHelpConceptJob: 'Job',
  ciHelpConceptJobDef:
    'An independent execution unit within a Workflow, can run in parallel or sequentially.',
  ciHelpConceptJobAnalogy:
    'A "work section" on the blueprint — sections can run simultaneously or in sequence.',
  ciHelpConceptStep: 'Step',
  ciHelpConceptStepDef: 'An individual operation within a Job (Shell command or another Action).',
  ciHelpConceptStepAnalogy:
    'A "specific action" within a work section, like "polishing", "painting", or "inspecting".',
  ciHelpConceptRun: 'Run',
  ciHelpConceptRunDef: 'A single execution instance of a Workflow.',
  ciHelpConceptRunAnalogy:
    'One "actual run" of the assembly line, triggered by each push to the repository.',
  ciHelpConceptConclusion: 'Conclusion',
  ciHelpConceptConclusionDef:
    'The final result of a Job or Step: success/failure/skipped/cancelled.',
  ciHelpConceptConclusionAnalogy:
    'The "acceptance result" after a stage completes — tells you if it passed, needs rework, or was skipped.',
  ciHelpConceptStatus: 'Status',
  ciHelpConceptStatusDef: 'Real-time state: queued / in_progress / completed.',
  ciHelpConceptStatusAnalogy:
    'The "current operation state" of the assembly line — showing if it\'s starting, running, or stopped.',

  // ========== Help Tab - Troubleshooting ==========
  ciHelpTroubleshootingTitle: 'Troubleshooting',
  ciHelpTroubleNoRuns: '"No Workflow Runs" displayed',
  ciHelpTroubleNoRunsCause:
    'The repository has no GitHub Actions configured, or the current branch has never triggered a Workflow.',
  ciHelpTroubleNoRunsSolution:
    'Check if .github/workflows/ directory and workflow config files exist in the repository, or try pushing to the relevant branch.',
  ciHelpTroubleRateLimit: '"Rate limit exceeded" displayed',
  ciHelpTroubleRateLimitCause:
    'GitHub API limits unauthenticated requests — public repos without a token are limited to 60 requests per hour.',
  ciHelpTroubleRateLimitSolution:
    'Wait an hour and retry, or configure a GitHub Personal Access Token to increase the limit.',
  ciHelpTroubleNoAutoRefresh: 'Status not auto-refreshing',
  ciHelpTroubleNoAutoRefreshCause:
    'Terminal did not detect the git push operation, or auto-refresh is disabled.',
  ciHelpTroubleNoAutoRefreshSolution:
    'Check if the terminal shows confirmation output for git push, or click the refresh button manually.',
  ciHelpTroubleIncompleteInfo: 'Information displayed is incomplete',
  ciHelpTroubleIncompleteInfoCause:
    'Public repos have limited information visibility through GitHub API — some sensitive details are hidden.',
  ciHelpTroubleIncompleteInfoSolution:
    'Configure a GitHub Personal Access Token to get more complete information.',

  // ========== Help Tab - GitHub Token ==========
  ciHelpTokenTitle: 'GitHub Token Setup',
  ciHelpTokenWhyNeed: 'Why Do You Need a Token?',
  ciHelpTokenWhyNeedContent:
    'Without Token: 60 req/hour rate limit, public repos only\nWith Token: 5,000 req/hour rate limit, access private repos',
  ciHelpTokenScopes: 'Required Permissions',
  ciHelpTokenScopePublic: 'public_repo — Public repos only (recommended)',
  ciHelpTokenScopePrivate: 'repo — Private repos (full access required)',
  ciHelpTokenSteps: 'Creation Steps',
  ciHelpTokenStep1: 'Visit https://github.com/settings/tokens',
  ciHelpTokenStep2: 'Click "Generate new token" → Select "Fine-grained tokens"',
  ciHelpTokenStep3: 'Set token name and expiration',
  ciHelpTokenStep4: 'In "Repository access", select repos to access',
  ciHelpTokenStep5: 'In "Permissions", add "Actions" set to Read-only',
  ciHelpTokenStep6: 'Click "Generate token" and save',
  ciHelpTokenSecurity: 'Security Notice',
  ciHelpTokenSecurityContent:
    '✅ Token stored locally only (never uploaded)\n✅ Desktop mode uses system keychain\n❌ Never commit Token to code repository',
  ciHelpTokenOldMethod: 'Classic Token (Compatibility)',
  ciHelpTokenOldMethodContent:
    'For broader compatibility, use classic token:\nIn "Select scopes", check:\n• public_repo (public repos)\n• read:user (user profile)',

  // ========== Help Tab - Panel Layout ==========
  ciHelpLayoutTitle: 'Panel Layout',
  ciHelpLayoutOverview:
    "The CI panel is divided into three main areas: the navigator sidebar on the left, the primary content area in the center, and the toolbar at the top. This section introduces each area's purpose and usage.",
  ciHelpLayoutNavigator: 'Navigator Sidebar',
  ciHelpLayoutNavigatorDesc:
    'Displays configured workspaces and custom directory trees. Each item expands to reveal four sub-pages: Overview, Workflows, Jobs, and Logs. Supports creating directories, pinning, renaming, and deleting. The sidebar width can be adjusted by dragging the resize handle.',
  ciHelpLayoutPrimary: 'Primary Content Area',
  ciHelpLayoutPrimaryDesc:
    'Shows detailed CI information for the selected workspace, including the overview panel (run summary, commit info, status overview), workflow list, job list with step details, and a log viewer (supports ANSI colors, search, and blank line collapsing).',
  ciHelpLayoutToolbar: 'Toolbar Buttons',
  ciHelpLayoutToolbarDesc:
    'The toolbar provides: expand/collapse all directories, toggle tree/list view mode, create new directory, batch delete menu (delete directories/configs/data/restore all), refresh all, and help buttons.',

  // ========== Error ==========
  ciErrorTitle: 'Error',
  ciErrorPleaseConfigFirst: 'Please configure owner and repo first',

  // ========== Category Labels ==========
  ciWorkspaceCategory: 'Workspace Directory',
  ciUserFolderCategory: 'User Folders',

  // ========== Sub-entry Names ==========
  ciOverview: 'Overview',
  ciWorkflows: 'Workflows',
  ciJobs: 'Jobs',
  ciLogs: 'Logs',

  // ========== Common ==========
  ciClose: 'Close',
  ciOpen: 'Open',
  ciSettingsDialogTitle: 'Configure CI',
  ciSettingsCancel: 'Cancel',
  ciSettingsSave: 'Save & Query',
  ciSelectWorkspace: 'Please select a workspace to view CI status',
  ciRefresh: 'Refresh',
  ciSettings: 'Settings',
  ciDeleteDir: 'Delete directory',
  ciDeleteConfig: 'Delete CI config',
  ciDeleteData: 'Delete data',
  ciDeleteConfigAndData: 'Delete CI config and data',
  ciDeleteNestedConfig: 'Delete CI config [nested]',
  ciDeleteNestedData: 'Delete data [nested]',
  ciDeleteNestedAll: 'Delete CI config and data [nested]',
  ciDeleteDirHint:
    'Delete this directory and all nested subdirectories, along with all CI config and data.',
  ciDeleteNestedConfigHint:
    'Recursively delete CI config for this directory and all nested subdirectories.',
  ciDeleteNestedDataHint: 'Delete CI data for this directory and all nested subdirectories.',
  ciDeleteNestedAllHint:
    'Recursively delete CI config and data for this directory and all nested subdirectories.',
  ciUnpin: 'Unpin',
  ciPin: 'Pin',
  ciRemoveFromView: 'Remove from this view',
  ciRemoveFromViewHint:
    'Remove this workspace from the workspace directory category. Nested subdirectories will also be removed. No data will be deleted, and it can be restored in the left sidebar.',
  ciDeleteAllNewDirs: 'Delete all new directories',
  ciDeleteAllNewDirsHint:
    'Delete all directory nodes created via "New Directory" and their CI config and data. Workspace directories are not affected.',
  ciDeleteAllConfigs: 'Delete all CI configs',
  ciDeleteAllConfigsHint:
    'Clear all GitHub repository configs (owner/repo/branch/token) bound to workspaces and folders. Directory structure and CI run data are preserved.',
  ciDeleteAllData: 'Delete all data',
  ciDeleteAllDataHint:
    'Clear all CI run states (snapshots/job lists/errors) displayed in the current panel. Config info is preserved.',
  ciDeleteAllConfigsAndData: 'Delete all CI configs and data',
  ciDeleteAllConfigsAndDataHint:
    'Clear all GitHub configs and CI run data simultaneously. Directory structure is preserved.',
  ciRestoreAll: 'Restore all',
  ciRestoreAllHint:
    'Clear everything — delete all new directories, all CI configs and data. Returns to the initial state showing only workspace top-level directories.',
  ciNoWorkflowData: 'No workflow data',
  ciNoJobData: 'No job data',
  ciLoading: 'Loading…',
  ciViewLog: 'View log',
  ciSearchLog: 'Search logs…',
  ciPrevMatch: 'Previous match',
  ciNextMatch: 'Next match',
  ciCollapseBlank: 'Collapse blank lines',
  ciViewOnGitHub: 'View on GitHub',
  ciLoadingLog: 'Loading log…',
  ciSelectJob: 'Select Job',
  ciNoLogData: 'No log data',
  ciViewFullLogOnGitHub: 'View full log on GitHub',
  ciBlankLines: '{count} blank lines — click to expand',
  ciStepsCount: '{count} steps',
  ciFetchLogFailed: 'Failed to fetch log',
} as const;
