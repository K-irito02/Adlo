export const settingsZh = {
  // 通用
  settingsTitle: '应用设置',
  settingsSearch: '搜索设置...',
  settingsResetToDefault: '恢复默认',
  settingsResetAll: '恢复全部默认',
  settingsNoResults: '无匹配设置项',

  // 分组标签
  settingsGeneral: '通用',
  settingsWorkspace: '工作区',
  settingsTerminal: '终端',
  settingsShortcuts: '快捷键',
  settingsBrowser: '浏览器',
  settingsDsh: 'DSH',

  // 通用设置项
  settingsLanguage: '语言',
  settingsLanguageDesc: '应用界面的显示语言，切换后立即生效',
  settingsTheme: '主题',
  settingsThemeDesc: '浅色 / 深色 / 跟随系统，影响全部界面的配色',
  settingsAutoApproval: '自动审批级别',
  settingsLogLevel: '日志级别',
  settingsLogLevelDesc: '应用日志的详细程度，排查问题时可临时调高',
  settingsTerminalLogMode: '终端日志模式',
  settingsTerminalLogModeDesc: '终端会话日志文件的写入方式：覆盖、追加或多文件',
  settingsDebugLogMode: '调试日志模式',
  settingsDebugLogModeDesc: '调试日志文件的写入方式：覆盖、追加或多文件',
  settingsLogModeOverwrite: '覆盖',
  settingsLogModeAppend: '追加',
  settingsLogModeMulti: '多文件',
  settingsResetGroupToDefault: '恢复 {group} 全部默认',

  // 字体设置
  settingsFontUi: '界面字体',
  settingsFontUiDesc: '应用界面文字的字体，悬停选项可实时预览，点击后确认生效',
  settingsFontCode: '代码字体',
  settingsFontCodeDesc: '编辑器与差异查看器代码的字体，悬停选项可实时预览，点击后确认生效',
  settingsFontTerminal: '终端字体',
  settingsFontTerminalDesc: '终端会话文字的字体，悬停选项可实时预览，点击后确认生效',
  settingsFontPreview: '预览：The quick brown fox 1234567890',
  settingsFontDefault: '默认',

  // 快捷键
  settingsShortcutsSearchLabel: '搜索快捷键',
  settingsShortcutsSearchHintLabel: '搜索快捷键功能说明',
  settingsShortcutsSearchHint:
    '# 搜索快捷键这样用\n直接打字就能找：按功能的中文名（比如"新建工作空间"）、按键原文（比如 mod+n）、界面上显示的样子（比如 Ctrl+N），甚至单个字母（比如 n）都行。\n点输入框右边的键盘图标，可以直接在键盘上按出组合键，自动填进来帮你找；如果只按了 Ctrl、Shift 这种单键，会显示已按下的部分并继续等你按完，不用重来。\n按 Esc 取消按键输入，回到之前的搜索词。',
  settingsShortcutsSearchCapturing: '按下快捷键以搜索…',
  settingsShortcutsSearchByKeypress: '用按键搜索',
  settingsShortcutsPressKeys: '按下快捷键...',
  settingsShortcutsUnassigned: '未设置',
  settingsShortcutsConflict: '快捷键冲突',
  settingsShortcutsConflictDesc: '快捷键 {keybind} 已被以下命令占用：{titles}',
  settingsShortcutsResetOneFor: '重置 {name}',
  settingsShortcutsClear: '清除',
  settingsShortcutsGroupGeneral: '通用',
  settingsShortcutsGroupNavigation: '导航',
  settingsShortcutsGroupView: '视图',
  settingsShortcutsGroupZoom: '缩放',
  settingsShortcutsGroupFile: '文件',

  // Toast
  settingsUpdated: '设置已更新',
  settingsUpdateFailed: '设置更新失败',
  settingsResetComplete: '已恢复默认设置',
  settingsResetConfirmTitle: '恢复全部默认？',
  settingsResetGroupConfirmTitle: '恢复 {group} 全部默认？',
  settingsResetGroupConfirmMessage: '{group} 分组下的全部设置项将恢复为默认值，此操作不可撤销。',
  settingsResetAllConfirmMessage: '所有设置将恢复为默认值，此操作不可撤销。',
  settingsResetAllScopePreferences: '通用、工作区与快捷键',
  settingsResetAllProgress: '正在恢复：{group}',
  settingsResetAllFailedSummary: '已恢复：{done}；失败：{group}（{reason}）',
  settingsResetAllFailedSummaryNoDone: '失败：{group}（{reason}）',
  settingsResetAllSkippedNote: '未执行：{groups}',
  settingsResetAllDoneAll: '已恢复全部默认设置',
  settingsSessionOverrideTakesEffectOnRestart:
    '该设置已保存，但本次启动正被命令行参数覆盖，下次启动生效',
  settingsBackendOfflineBadge: '未连接后端',

  // 无障碍
  settingsToggleVisibility: '切换可见性',
  settingsSearchLabel: '搜索设置',
  settingsSearchHistory: '搜索历史',
  settingsSearchHistoryClear: '清空',
  settingsSearchHistoryRemoveLabel: '删除 {name}',
  settingsSearchHistoryRemoveTitle: '删除记录',

  // 存储
  storageTitle: '存储',
  storageCorePathsTitle: '核心数据路径',
  storageModeLabel: '路径模式',
  storageModeHint:
    '决定各类数据如何存放：选择「统一根目录」，所有数据都放在同一个文件夹下，方便整体迁移；选择「每类完全独立」，则各类数据各占一个文件夹，便于单独管理较占空间的类型。',
  storageModeUnified: '统一根目录（默认）',
  storageModePerCategory: '每类完全独立',
  storageRootLabel: '数据根目录',
  storageRootHint:
    '各项核心数据的总存放位置。所有数据默认都会保存在这个文件夹下；若要换地方，可用行尾的「选择目录」重新选一个，或直接填一个新的路径。',
  storagePickDir: '选择目录',
  storageManualInput: '手动输入',
  storageManualInputPlaceholder: '输入绝对路径…',
  storageApply: '应用',
  storageCancel: '取消',
  storageRevert: '撤回',
  storageDirtyHint: '「{block}」块中有数据路径被修改，尚未应用',
  storageUsed: '已用 {size}（{files} 个文件）',
  storageNotCreated: '尚未创建',
  storageForeignFiles: '检测到 {count} 个不属于本应用的文件，将保留',
  storageLocatorTitle: '数据位置索引',
  storageLocatorHint:
    '这个小文件记着你的各类数据实际放在电脑的哪个文件夹，应用每次启动都靠它找到数据。请不要删除、改名或手动修改它；如果不小心删掉了，应用会用默认目录启动，原来的数据还好好地留在原位置，只是在这里看不见——重新在「存储」设置里把路径指回去即可恢复。',
  storagePendingTaskTitle: '待迁移任务',
  storagePendingBanner: '已安排下次启动迁移',
  storagePendingFailedBanner: '上次迁移失败：{error}（旧数据完好）',
  storageRetryMigration: '重试',
  storageCancelPending: '取消待迁移',
  storageMigrateDialogTitle: '迁移数据',
  storageMigrateDialogSummary: '核心数据路径：将迁移 {files} 个文件（约 {size}）到新位置',
  storageMigrateNow: '立即迁移并重启',
  storageMigrateLater: '下次启动时迁移',
  storageRetainSource: '迁移后保留旧路径数据（不删除）',
  storagePreflightErrors: '无法迁移：',
  storagePreflightWarnings: '注意：',
  storageReportTitle: '上次迁移报告',
  storageReportOk: '已迁移 {files} 个文件（{size}）',
  storageReportDirsRemoved: '已删除旧目录 {count} 个',
  storageReportDirsKept: '保留旧目录 {count} 个（含外部文件）',
  storageReportRetained: '已按设置保留旧数据',
  storageReportFailed: '迁移失败：{error}',
  storageReportSwitched: '数据已迁移到新位置，仅清理旧目录未完成，无需再次迁移。',
  // 有意：括号用「」而非（）（任务 3 约定），勿"修复"为全角括号。
  storageImmutableTitle: '不可移动「由系统或运行时管理」',
  storageImmutableKeyring: '凭据由操作系统凭据管理器安全保管，位置由系统决定，无需也无法自定义。',
  storageImmutableMachineId:
    '该文件用于派生凭据加密密钥；若移动，已保存的凭据将无法解密，因此不可移动。',
  storageImmutableLocalStorage: '由 WebView 按站点隔离存储，随应用整体管理，无独立路径。',
  storageImmutableIndexedDb: '头像缓存保存在浏览器的内置数据库里，随应用一起管理，没有独立路径。',
  storageImmutableWebview2: '由 WebView2 运行时自管，修改需重建整个浏览器环境。',
  storageImmutableWorkspaceCache: '属于具体工作区，随工作区目录移动，不属于应用数据目录。',
  storageImmutableKeyringName: '凭据管理器',
  storageImmutableMachineIdName: '机器身份文件',
  storageImmutableLocalStorageName: '界面状态存储',
  storageImmutableIndexedDbName: '头像缓存',
  storageImmutableWebview2Name: 'WebView2 运行时数据',
  storageImmutableWorkspaceCacheName: '工作区级缓存',
  storageRestartRequired: '已保存。请重启应用以完成迁移。',
  storageRestartUnavailableInBrowser: '浏览器模式无法重启应用，此变更将在下次启动时生效。',
  storageBrowserDownloadTitle: '浏览器下载路径',
  storageDownloadMigrateLabel: '更改路径时自动迁移文件',
  storageDownloadMigrateHint:
    '开启后，修改默认下载路径会把旧路径下的全部文件和文件夹一并搬到新路径，全部搬完后才删除旧路径目录（例外：系统自带目录——如系统盘的下载/文档/桌面、Windows、Program Files 等——只搬文件，从不删除目录本身）。若中途失败：已搬走的文件会留在新路径，其余仍在旧路径，设置不会切换，可随时重试，不会丢失任何文件。关闭时只切换路径，不搬运任何文件。',
  storageDownloadMigrateEnableTitle: '开启自动迁移？',
  storageDownloadMigrateEnableConfirm:
    '开启「更改路径时自动迁移文件」后，以后每次修改默认下载路径，旧路径下的全部文件和文件夹都会被搬到新路径；只有全部搬运成功，才会删除旧路径目录（例外：系统自带目录——如系统盘的下载/文档/桌面、Windows、Program Files 等——只搬文件，从不删除目录本身）。若中途失败：已搬走的文件在新路径、其余仍在旧路径，设置不会切换，可稍后重试；不会丢失或丢弃任何文件。确定要开启吗？',
  storageDownloadMigrateEnableConfirmBtn: '确认开启',
  storageDownloadResetTitle: '恢复默认下载路径？',
  storageDownloadResetConfirmMigrateOn:
    '将把默认下载路径恢复为系统默认。当前已开启自动迁移：旧路径下的全部文件会先搬到系统默认路径，全部成功后删除旧路径目录（例外：系统自带目录——如系统盘的下载/文档/桌面、Windows、Program Files 等——只搬文件，从不删除目录本身）；若中途失败：已搬走的文件在新路径、其余仍在旧路径，设置不切换，可重试。',
  storageDownloadResetConfirmMigrateOff:
    '将把默认下载路径恢复为系统默认。当前未开启自动迁移：只切换路径，旧路径中的文件不会被搬运，也不会被删除。',
  // 路径已是系统默认、仅迁移开关非默认：确认框不提路径恢复（已是默认，事项 10）。
  storageDownloadResetConfirmSwitchOnly:
    '下载路径已是系统默认，无需变更。当前已开启自动迁移：本次仅将开关恢复为关闭，不涉及文件搬运。',
  storageDownloadResetConfirmBtn: '恢复默认',
  storageGroupResetTitle: '恢复「存储」全部默认？',
  // 不写死数量：清单按开框时快照逐块过滤——已默认的块整项不出现（事项 10）。
  storageGroupResetIntro: '以下设置将一起恢复为默认值：',
  // 所有块均已是默认值时不开对话框，直接提示（事项 10 空态）。
  storageGroupResetAllDefault: '存储设置均已为默认值，无需恢复。',
  storageGroupResetItemCore:
    '核心数据路径：回到「统一根目录」+ 默认位置；随后走迁移流程，需重启应用（或下次启动）后生效。',
  // 树缓存按开框快照细分三种真实待恢复文案：全部 / 仅重新开启 / 仅恢复保留时长。
  storageGroupResetItemTree:
    '工作区树缓存：重新开启，保留时长恢复 15 分钟，已缓存内容保留；立即生效。',
  storageGroupResetItemTreeReenable: '工作区树缓存：重新开启，已缓存内容保留；立即生效。',
  storageGroupResetItemTreeTtl: '工作区树缓存：保留时长恢复 15 分钟，已缓存内容保留；立即生效。',
  storageGroupResetItemDownloadMigrateOn:
    '浏览器默认下载路径：恢复为系统默认；旧路径文件先搬过去，全部成功后才删除旧目录（例外：系统自带目录——如系统盘的下载/文档/桌面、Windows、Program Files 等——只搬文件，从不删除目录本身）；自动迁移开关恢复为关闭。',
  storageGroupResetItemDownloadMigrateOff:
    '浏览器默认下载路径：恢复为系统默认，只切换路径、不搬文件；自动迁移开关保持关闭。',
  // 路径已是系统默认、仅迁移开关非默认：不提路径恢复（已是默认，事项 10）。
  storageGroupResetItemDownloadSwitchOnly:
    '浏览器默认下载路径已是系统默认：本次仅将自动迁移开关恢复为关闭，不涉及文件搬运。',
  // 核心已默认时对话框只留一个确认键（不出现迁移时机两键）。
  storageGroupResetConfirm: '确认恢复默认',
  // 预检英文原文（Rust storage/migration.rs）的前端本地化映射，匹配规则见 preflightCopy.ts。
  storagePreflightIssueWithCategory: '［{category}］{message}',
  storagePreflightIdentical: '新位置与当前使用的位置相同，无需迁移。',
  storagePreflightInside:
    '新位置与当前数据位置互相包含（一个在另一个里面），无法迁移，请换一个位置。',
  storagePreflightCreateDir: '无法创建新位置的文件夹，请检查路径是否有效、是否有权限。',
  storagePreflightNotWritable: '新位置不可写入（可能没有权限），请换一个位置。',
  storagePreflightDiskSpace: '目标位置磁盘空间不足（约需 {need}，可用 {free}），请清理后重试。',
  browserGroupResetTitle: '恢复「浏览器」全部默认？',
  // 文案中的 15 分钟/自动保存与 DEFAULT_BROWSER_SUSPEND_MS / DEFAULT_DOWNLOAD_MODE
  // 同源，改产品默认时同步此处（L-8）。
  browserGroupResetMessage:
    '挂起时长（恢复 15 分钟）、下载模式（恢复自动保存）、默认下载路径（恢复系统默认并关闭自动迁移）将一起恢复为默认值。',
  browserGroupResetMigrateOnNote:
    '当前已开启「更改路径时自动迁移文件」：恢复路径时旧路径下的全部文件会先搬到系统默认路径，全部成功后删除旧路径目录（例外：系统自带目录——如系统盘的下载/文档/桌面、Windows、Program Files 等——只搬文件，从不删除目录本身）；若中途失败：已搬走的文件在新路径、其余仍在旧路径，设置不切换，可重试。',
  storageDownloadMigrateFailed: '迁移文件失败：{error}',
  storageDownloadRefreshFailed: '下载设置已保存，但刷新显示失败，请重新打开设置页确认',
  storagePickFailed: '选择目录失败：{error}',
  storageStatusLoading: '正在读取存储状态…',
  storageStatusLoadFailed: '无法读取存储状态：{error}。请确认应用后端已更新并重启应用。',
  storageNoCategories: '暂无存储分类信息，请稍后重试',
  storagePickUnavailable: '当前环境不支持目录选择，请手动输入路径。',
  storageUnknownError: '未知错误',
  storageBridgeUnavailable: '存储桥不可用',
  storageRetry: '重试',
  storageStatusTimeout:
    '读取存储状态超时：后端可能正在扫描超大目录。请重试；若持续出现，请检查各数据目录的大小。',

  // 存储分类
  storageCategoryDatabase: '主业务库',
  storageCategoryDownloadsDb: '下载历史库',
  storageCategorySiteMetaDb: '网页信息缓存库',
  storageCategoryConfig: '应用配置',
  storageCategoryClipboard: '剪贴板资源',
  storageCategorySnapshot: '项目快照',
  storageCategoryDsh: 'DSH 版本与包',
  storageCategoryLogs: '日志',
  storageCategoryCredentialsFallback: '备用凭据文件',
  storageCategoryDownloadsDefault: '默认下载目标',
  storageCategoryDatabaseDesc:
    '应用的核心数据库，保存工作区、会话、任务、审批、补丁与回滚、剪贴板元数据、Git 可视化缓存等。',
  storageCategoryDatabaseRelated: '与工作区导航、会话面板、剪贴板历史、Git 可视化等有关。',
  storageCategoryDownloadsDbDesc: '浏览器下载任务的记录，包含文件名、来源、时间和状态。',
  storageCategoryDownloadsDbRelated: '与内置浏览器的「下载」列表与管理有关。',
  storageCategorySiteMetaDbDesc: '保存访问过网站的标题与图标，让浏览器标签页打开更流畅。',
  storageCategorySiteMetaDbRelated: '与内置浏览器标签页的标题与图标、历史与书签显示有关。',
  storageCategoryTreeCache: '工作区树缓存',
  storageCategoryTreeCacheDesc:
    '保存到磁盘的工作区文件树缓存，用于启动时快速显示目录树（可随时清除，清除后下次访问自动重建）。',
  storageCategoryTreeCacheRelated: '与工作区文件树的冷启动秒级渲染与后台静默校准有关。',
  storageCategoryConfigDesc: '应用设置（语言、主题、日志模式、浏览器阈值、DSH 源等）。',
  storageCategoryConfigRelated: '与设置面板全部设置项的持久化有关。',
  storageCategoryClipboardDesc: '剪贴板历史中的图片与缩略图文件。',
  storageCategoryClipboardRelated: '与剪贴板历史面板的图片预览与回填有关。',
  storageCategorySnapshotDesc: '补丁应用前的文件快照，用于回滚与差异比对。',
  storageCategorySnapshotRelated: '与补丁预览、应用、回滚以及差异查看器有关。',
  storageCategoryDshDesc: 'DeepSeek Harness 的已下载版本与打包产物。',
  storageCategoryDshRelated: '与 DSH 设置组的版本管理以及运行 DSH 有关。',
  storageCategoryLogsDesc: '终端日志与调试日志文件，用于问题排查。',
  storageCategoryLogsRelated: '与调试工具（日志收起器、复制调试日志）及问题排查流程有关。',
  storageCategoryCredentialsFallbackDesc:
    '仅在操作系统凭据管理器不可用时，以加密文件形式保存的凭据。',
  storageCategoryCredentialsFallbackRelated:
    '与需要凭据的功能（如 CI 访问令牌、API Token）有关；主凭据不在此（见不可移动区）。',
  storageCategoryDownloadsDefaultDesc:
    '浏览器下载文件的默认保存目录（存的是用户文件，不是应用数据）。',
  storageCategoryDownloadsDefaultRelated: '与内置浏览器下载行为的默认落点有关；永不自动删除。',

  // 工作区树缓存（设置存储组区段）
  treeCacheTitle: '工作区树缓存',
  treeCacheStatsLabel: '缓存统计',
  treeCacheWorkspaces: '已缓存 {count} 个工作区',
  treeCacheSize: '缓存大小 {size}',
  treeCacheAge: '最近缓存 {time}',
  treeCacheClear: '清除缓存',
  treeCacheClearConfirm: '确定清除全部工作区树缓存？下次打开工作区时将重新扫描重建。',
  treeCacheEnabled: '启用树缓存',
  treeCacheEnabledHint:
    '开启后，工作区文件树会在首次扫描后缓存到磁盘；下次打开先显示缓存内容、再后台静默校准，冷启动更快。超过有效期或树变化较大时会自动重新扫描。关闭后将不再读写该缓存。',
  treeCacheDisableTitle: '关闭树缓存？',
  treeCacheDisableConfirm:
    '关闭树缓存会清除已缓存的全部工作区文件树。之后每次打开工作区都需要完整扫描重建，首次显示文件树会明显变慢；文件树功能仍可正常使用，只是失去缓存加速。重新开启后会随使用逐步重建缓存。确定关闭吗？',
  treeCacheDisableConfirmBtn: '确认关闭',
  treeCacheTtl: '缓存有效期',
  treeCacheTtlMinutes: '{minutes} 分钟',
  treeCacheTtlDay: '1 天',
  treeCacheTtlCustom: '自定义…',
  treeCacheTtlUnitLabel: '时间单位',
  treeCacheUnitSecond: '秒',
  treeCacheUnitMinute: '分',
  treeCacheUnitHour: '时',
  treeCacheUnitDay: '天',

  // 命令标题
  commandSessionNew: '新建会话',
  commandWorkspaceNew: '新建工作区',
  commandWorkspaceOpen: '打开工作区',
  commandSettingsOpen: '打开设置',

  // 打开方式
  settingsOpenMethod: '打开方式',
  settingsLinkOpenMethod: '网址链接',
  settingsLinkOpenMethodDesc:
    '点击网址链接时的打开位置（Markdown 预览与智能体站点拦截链接统一生效）',
  settingsLinkOpenMiddle: '中心',
  settingsLinkOpenPanel: '右侧浏览器面板',
  settingsLinkOpenExternal: '外部浏览器',
  settingsFileOpenMethod: '文件',
  settingsFileOpenMethodDesc: '点击文件链接（如 Markdown 预览中的文件索引）时的打开方式',
  settingsFileOpenPanel: '右侧文件面板',
  settingsFileOpenExternal: '系统默认应用',
  settingsAgentIntercept: '智能体站点链接拦截',
  settingsAgentInterceptDesc:
    '启用后，白名单内智能体网站正文中的网址链接、本地文件链接将按本项目设置打开；关闭则保持网站自身行为',
  settingsAgentDesktopOnlyHint: '——仅桌面模式可用（浏览器模式不支持）',
  settingsAgentWhitelist: '智能体网址白名单',
  settingsAgentWhitelistDesc:
    '点击“添加”新增站点；在卡片中填写别称（选填）与站点网址（必填）。站点网址会被归一为 origin 并整站匹配，例如 http://127.0.0.1:3080。',
  settingsAgentAllowAdd: '添加',
  settingsAgentAllowTitle: '添加智能体站点',
  settingsAgentAllowAlias: '别称（选填）',
  settingsAgentAllowAliasPlaceholder: '例如：工作台',
  settingsAgentAllowOrigin: '站点网址（必填）',
  settingsAgentAllowOriginPlaceholder: '例如：https://my-agent.example.com',
  settingsAgentAllowOriginRequired: '请填写站点网址',
  settingsAgentAllowOriginInvalid: '站点网址无法识别，请输入 http/https 开头的站点地址',
  settingsAgentAllowRemove: '移除',
  settingsAgentAllowEmpty: '暂无白名单站点，点击“添加”新增。',
} as const;
