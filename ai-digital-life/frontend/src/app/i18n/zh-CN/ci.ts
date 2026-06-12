/**
 * CI 面板翻译 - 中文
 */
export const ciZh = {
  // ========== 面板标题 ==========
  ciPanelTitle: 'Quality Gates',

  // ========== 配置区 ==========
  ciOwnerPlaceholder: '例如：用户名',
  ciRepoPlaceholder: '例如：仓库名',
  ciBranchPlaceholder: '默认：main',
  ciTokenPlaceholder: '可选 · 提升限流 / 支持私有仓库',
  ciQueryButton: '查询',
  ciOwnerLabel: '仓库所有者',
  ciRepoLabel: '仓库名',
  ciBranchLabel: '分支',
  ciTokenLabel: '访问令牌',
  ciTokenOptional: '可选',
  ciShowToken: '显示',
  ciHideToken: '隐藏',

  // ========== 元数据标签 ==========
  ciTriggeredBy: '触发者',
  ciEvent: '事件',
  ciSha: 'SHA',
  ciStartedAt: '开始',
  // ========== Jobs ==========
  ciJobsTitle: 'Jobs',
  ciNoWorkflowRuns: '暂无 Workflow Runs',
  ciNoWorkflowRunsHint: '在 {branch} 分支上没有找到最近的运行记录',

  // ========== 空状态 ==========
  ciConfigToQuery: '配置仓库以查询 Quality Gates',
  ciConfigToQueryHint: '输入 Owner/Repo/Branch 后点击"查询"',

  // ========== Tab ==========
  ciTabStatus: '状态',
  ciTabHelp: '帮助',

  // ========== 方案A Tooltip（基础） ==========
  ciTooltipQuickStart: '快速开始',
  ciTooltipAutoRefresh: '自动刷新说明',
  ciTooltipManualRefresh: '手动刷新',

  ciTooltipQuickStartContent: '输入 Owner/Repo/Branch → 点击"查询" → 查看状态',
  ciTooltipAutoRefreshContent: '在终端执行 git push 成功后自动刷新（默认开启）',
  ciTooltipManualRefreshContent: '点击右上角刷新按钮',
  ciTooltipStatusLegend: '状态图例',
  ciTooltipStatusSuccess: '通过',
  ciTooltipStatusFailure: '失败',
  ciTooltipStatusInProgress: '运行中',
  ciTooltipStatusSkipped: '跳过',

  // ========== 帮助Tab - 基础使用 ==========
  ciHelpBasicTitle: '基础使用',
  ciHelpHowToConfig: '如何配置',
  ciHelpHowToConfigContent:
    '输入 Owner（仓库所有者）、Repo（仓库名）、Branch（分支名，默认为 main），点击"查询"按钮获取 CI 状态。',
  ciHelpStatusColors: '状态颜色',
  ciHelpStatusColorsContent:
    '🟢 绿色 = 通过（success）\n🔴 红色 = 失败（failure）\n🟡 黄色 = 运行中（in_progress）\n⬜ 灰色 = 跳过（skipped）',
  ciHelpViewLogs: '如何查看日志',
  ciHelpViewLogsContent:
    '点击 Job 左侧的箭头展开 Step 列表，查看每个步骤的详细结果。点击"在 GitHub 查看"可跳转到 GitHub Actions 页面获取完整信息。',

  // ========== 帮助Tab - 进阶概念 ==========
  ciHelpConceptsTitle: '进阶概念',
  ciHelpConceptWorkflow: 'Workflow',
  ciHelpConceptWorkflowDef:
    'GitHub Actions 的顶层工作流程，定义在 .github/workflows/*.yml 文件中。',
  ciHelpConceptWorkflowAnalogy: '可以想象成流水线的"总图纸"，规定了从原材料到成品要经历哪些工段。',
  ciHelpConceptJob: 'Job',
  ciHelpConceptJobDef: 'Workflow 中的独立执行单元，可以并行或串行执行。',
  ciHelpConceptJobAnalogy: '总图纸上的"工段"，每个工段可以同时进行，也可以按顺序依次执行。',
  ciHelpConceptStep: 'Step',
  ciHelpConceptStepDef: 'Job 中的具体操作步骤，可以是 Shell 命令或另一个 Action。',
  ciHelpConceptStepAnalogy: '工段里的"具体动作"，比如"打磨"、"喷漆"、"质检"。',
  ciHelpConceptRun: 'Run',
  ciHelpConceptRunDef: 'Workflow 的一次完整执行实例。',
  ciHelpConceptRunAnalogy: '流水线的一次"实际运转"，每次 push 都可能触发一次新的运转。',
  ciHelpConceptConclusion: 'Conclusion（结论）',
  ciHelpConceptConclusionDef: 'Job 或 Step 的最终结果：success/failure/skipped/cancelled。',
  ciHelpConceptConclusionAnalogy: '工序完成后的"验收结果"，告诉你是合格、返工还是跳过。',
  ciHelpConceptStatus: 'Status（状态）',
  ciHelpConceptStatusDef:
    '实时状态：queued（排队中）/ in_progress（进行中）/ completed（已完成）。',
  ciHelpConceptStatusAnalogy: '流水线当前的"运行状态"，显示是启动中、运转中还是已停止。',

  // ========== 帮助Tab - 故障排查 ==========
  ciHelpTroubleshootingTitle: '故障排查',
  ciHelpTroubleNoRuns: '显示"暂无 Workflow Runs"',
  ciHelpTroubleNoRunsCause: '仓库没有配置 GitHub Actions，或当前分支没有触发过 Workflow。',
  ciHelpTroubleNoRunsSolution:
    '检查仓库中是否存在 .github/workflows/ 目录及 workflow 配置文件，或尝试在对应分支执行一次 push。',
  ciHelpTroubleRateLimit: '显示"Rate limit exceeded"',
  ciHelpTroubleRateLimitCause:
    'GitHub API 对未认证请求有限制，无 token 的公开仓库限制为每小时 60 次请求。',
  ciHelpTroubleRateLimitSolution:
    '等待一小时后重试，或配置 GitHub Personal Access Token 以提高请求限额。',
  ciHelpTroubleNoAutoRefresh: '状态未自动刷新',
  ciHelpTroubleNoAutoRefreshCause: '终端未检测到 git push 操作，或自动刷新功能被关闭。',
  ciHelpTroubleNoAutoRefreshSolution:
    '检查终端是否有 git push 的输出确认信息，或手动点击刷新按钮。',
  ciHelpTroubleIncompleteInfo: '信息显示不完整',
  ciHelpTroubleIncompleteInfoCause:
    '公开仓库通过 GitHub API 获取的信息有限，部分敏感信息会被隐藏。',
  ciHelpTroubleIncompleteInfoSolution: '配置 GitHub Personal Access Token 可以获取更完整的信息。',

  // ========== 帮助Tab - GitHub Token ==========
  ciHelpTokenTitle: 'GitHub Token 配置',
  ciHelpTokenWhyNeed: '为什么需要 Token？',
  ciHelpTokenWhyNeedContent:
    '无 Token：Rate Limit 60次/小时，仅能查询公开仓库\n有 Token：Rate Limit 5000次/小时，可查询私有仓库',
  ciHelpTokenScopes: '所需权限',
  ciHelpTokenScopePublic: 'public_repo — 仅查询公开仓库（推荐）',
  ciHelpTokenScopePrivate: 'repo — 查询私有仓库（需要完整权限）',
  ciHelpTokenSteps: '创建步骤',
  ciHelpTokenStep1: '访问 https://github.com/settings/tokens',
  ciHelpTokenStep2: '点击 "Generate new token" → 选择 "Fine-grained tokens"',
  ciHelpTokenStep3: '设置 Token 名称和过期时间',
  ciHelpTokenStep4: '在 "Repository access" 选择需要访问的仓库',
  ciHelpTokenStep5: '在 "Permissions" 中添加 "Actions" 权限设为 Read-only',
  ciHelpTokenStep6: '点击 "Generate token" 并保存',
  ciHelpTokenSecurity: '安全说明',
  ciHelpTokenSecurityContent:
    '✅ Token 仅保存在本地（不上传服务器）\n✅ 桌面模式使用系统钥匙串安全存储\n❌ 不要将 Token 提交到代码仓库',
  ciHelpTokenOldMethod: '经典令牌（兼容模式）',
  ciHelpTokenOldMethodContent:
    '如果需要更广泛的兼容性，可使用经典令牌：\n在 "Select scopes" 中勾选：\n• public_repo（公开仓库）\n• read:user（用户信息）',

  // ========== 错误 ==========
  ciErrorTitle: '错误',
  ciErrorPleaseConfigFirst: '请先配置仓库 owner 和 repo',

  // ========== 目录分类标签 ==========
  ciWorkspaceCategory: '工作区目录',
  ciUserFolderCategory: '非工作区目录',

  // ========== 子条目名称 ==========
  ciOverview: '概览',
  ciWorkflows: '工作流',
  ciJobs: '任务',
  ciLogs: '日志',

  // ========== 通用 ==========
  ciClose: '关闭',
  ciOpen: '展开',
  ciSettingsDialogTitle: '配置仓库信息',
  ciSettingsCancel: '取消',
  ciSettingsSave: '保存并查询',
  ciSelectWorkspace: '请选择一个工作区查看 CI 状态',
  ciRefresh: '刷新',
  ciSettings: '设置',
  ciDeleteDir: '删除目录',
  ciDeleteConfig: '删除CI配置',
  ciDeleteData: '删除数据',
  ciDeleteConfigAndData: '删除CI配置及数据',
  ciDeleteNestedConfig: '删除CI配置[嵌套]',
  ciDeleteNestedData: '删除数据[嵌套]',
  ciDeleteNestedAll: '删除CI配置及数据[嵌套]',
  ciDeleteDirHint: '删除此目录及其所有嵌套子目录，同时删除所有CI配置及数据。',
  ciDeleteNestedConfigHint: '递归删除此目录及其所有嵌套子目录的CI配置。',
  ciDeleteNestedDataHint: '删除此目录及其所有嵌套子目录的CI数据。',
  ciDeleteNestedAllHint: '递归删除此目录及其所有嵌套子目录的CI配置及数据。',
  ciUnpin: '取消置顶',
  ciPin: '置顶',
  ciRemoveFromView: '从此区域移除不显示',
  ciRemoveFromViewHint:
    '将此工作区从工作区目录分类中移除，嵌套的子目录也将一并移除。不会删除任何数据，可在左侧边栏中恢复显示。',
  ciDeleteAllNewDirs: '删除全部新建目录',
  ciDeleteAllNewDirsHint:
    '删除所有通过"新建目录"创建的目录节点及其CI配置和数据。工作区目录不受影响。',
  ciDeleteAllConfigs: '删除全部CI配置',
  ciDeleteAllConfigsHint:
    '清空所有工作区和文件夹绑定的GitHub仓库配置（owner/repo/branch/token）。保留目录结构和CI运行数据。',
  ciDeleteAllData: '删除全部数据',
  ciDeleteAllDataHint: '清空当前面板显示的所有CI运行状态（快照/作业列表/错误信息）。保留配置信息。',
  ciDeleteAllConfigsAndData: '删除全部CI配置及数据',
  ciDeleteAllConfigsAndDataHint:
    '同时清空所有工作区和文件夹的GitHub配置以及所有CI运行数据。保留目录结构。',
  ciRestoreAll: '恢复还原',
  ciRestoreAllHint:
    '清空所有内容——删除所有新建目录、所有CI配置及数据，恢复到仅显示工作区目录顶级目录的初始状态。',
  ciNoWorkflowData: '暂无 Workflow 数据',
  ciNoJobData: '暂无 Job 数据',
  ciLoading: '加载中...',
  ciViewLog: '查看日志',
  ciSearchLog: '搜索日志…',
  ciPrevMatch: '上一个匹配',
  ciNextMatch: '下一个匹配',
  ciCollapseBlank: '折叠空白',
  ciViewOnGitHub: '在 GitHub 查看',
  ciLoadingLog: '加载日志中…',
  ciNoLogData: '暂无日志数据',
  ciViewFullLogOnGitHub: '在 GitHub 查看完整日志',
  ciBlankLines: '{count} 行空白 — 点击展开',
  ciStepsCount: '{count} 个 Step',
  ciFetchLogFailed: '获取日志失败',
} as const;
