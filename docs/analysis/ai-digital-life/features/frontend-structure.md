# 前端应用结构

## 目录树

```
frontend/src/app/
├── commands/               # 命令注册系统
│   ├── commandRegistry.ts
│   ├── commandRegistry.test.ts
│   ├── defaultCommands.ts
│   └── useCommandRegistry.ts
├── components/             # 通用组件（跨功能域复用）
│   ├── __tests__/
│   ├── agent/              # Agent 相关组件
│   │   ├── ExecutionSummary.tsx
│   │   ├── PlanCard.tsx
│   │   └── StepBlock.tsx
│   ├── approval/           # 审批相关
│   │   ├── ApprovalCard.tsx
│   │   └── AuditPanel.tsx
│   ├── conversation/       # 对话上下文
│   │   ├── CompactionIndicator.tsx
│   │   ├── ContextBuilderPopover.tsx
│   │   ├── ContextSummaryBar.tsx
│   │   ├── ReferencePopover.tsx
│   │   ├── RevertButton.tsx
│   │   ├── RunSummaryBlock.tsx
│   │   ├── SlashCommandPopover.tsx
│   │   ├── SnapshotList.tsx
│   │   └── TokenUsage.tsx
│   ├── models/             # 模型选择
│   │   ├── CustomProviderDialog.tsx
│   │   ├── ModelPicker.tsx
│   │   └── ProviderManager.tsx
│   ├── session/            # 会话
│   │   └── DurableStatusIndicator.tsx
│   ├── settings/           # 设置面板
│   │   ├── FontControl.tsx / FontControl.test.tsx
│   │   ├── KeybindControl.tsx / KeybindSettings.tsx
│   │   ├── SettingsControls.tsx
│   │   ├── SettingsHeader.tsx
│   │   ├── SettingsNav.tsx
│   │   └── SettingsPanel.tsx
│   ├── terminal/           # 终端
│   │   ├── CommandOutputBlock.tsx
│   │   └── XtermTerminal.tsx
│   ├── workspace/          # 工作区
│   │   ├── CheckpointTimeline.tsx
│   │   ├── ConflictBanner.tsx
│   │   ├── GitSummary.tsx
│   │   ├── IndexStatus.tsx
│   │   ├── RepoMapView.tsx
│   │   └── ValidationSummaryBar.tsx
│   ├── ActionButton.tsx
│   ├── AgentSelector.tsx
│   ├── BrowserAudioIndicator.tsx
│   ├── BrowserFavicon.tsx
│   ├── Composer.tsx        # 对话输入框
│   ├── ConfirmDialog.tsx
│   ├── ContextBuilder.tsx
│   ├── ContextMenu.tsx
│   ├── CreateWorkspaceModal.tsx
│   ├── EnvironmentControls.tsx
│   ├── ErrorBoundary.tsx
│   ├── Icon.tsx
│   ├── LazyComponents.tsx
│   ├── MainContent.tsx
│   ├── MessageBubble.tsx   # 消息气泡
│   ├── MessageStream.tsx   # 消息流
│   ├── NavigatorResizeHandle.tsx
│   ├── NewSessionDialog.tsx
│   ├── OrbitalLoader.tsx
│   ├── PlanModeBanner.tsx
│   ├── PromptInput.tsx     # Prompt 输入
│   ├── PromptModal.tsx
│   ├── QuickActions.tsx
│   ├── RenameDialog.tsx
│   ├── RenameInput.tsx
│   ├── SessionManagement.tsx
│   ├── SubagentIndicator.tsx
│   ├── Toast.tsx
│   ├── Tooltip.tsx
│   ├── WelcomeState.tsx
│   └── WorkspaceSplitButton.tsx
├── features/               # 26 个功能域（详见下表）
├── hooks/                  # 通用 Hook
│   ├── useAppActions.ts
│   ├── useAppStartup.ts
│   ├── useDragDropWorkspace.ts
│   ├── useEditorReveal.ts
│   ├── useFileContextMenu.tsx
│   ├── useFloatingMenu.ts
│   ├── useKeyCapture.ts
│   ├── useKeyboardShortcuts.ts
│   ├── useNavigatorResize.ts
│   ├── usePatchReview.ts
│   ├── usePatchReviewWithEditor.ts
│   ├── useResolvedTheme.ts
│   ├── useTaskCenterPolling.ts
│   ├── useThemeSync.ts
│   └── useTooltip.ts
├── i18n/                   # 国际化（详见下表）
├── icons/                  # SVG 图标
│   ├── actions.tsx
│   ├── badges.tsx
│   ├── core.tsx
│   ├── file.tsx
│   ├── helper.tsx
│   ├── index.ts
│   └── status.tsx
├── regions/                # 布局区域（详见下表）
├── stores/                 # Zustand 状态管理
│   ├── actions/            # 14 个 Action 模块
│   ├── slices/             # 24 个状态切片
│   ├── StoreState.ts
│   ├── slicedStore.ts
│   ├── cacheHelpers.ts
│   └── ...
├── App.tsx                 # 根组件
└── loadingPerformance.test.ts
```

## 26 个功能域 (features/)

| 功能域 | 目录 | 简要说明 |
|--------|------|----------|
| 浏览器 | `features/browser/` | 内置浏览器面板：标签管理、导航、书签树、iframe 栈、WebView 生命周期、搜索、缩放、历史 |
| 浏览器树 | `features/browser-tree/` | 浏览器树形目录：分类/标签/书签的多层级目录组件 |
| 终端 | `features/terminal/` | 终端面板：标签页、Shell 选择器、空状态、右键菜单、拖放 |
| 差异查看器 | `features/diff-viewer/` | 差异查看器：DiffViewer、SideBySideDiffViewer、InlineDiffViewer |
| 编辑器 | `features/editor/` | CodeMirror 编辑器：CodeEditor、CodeMirror 扩展（折叠/滚动/语言/Lint/主题） |
| 对话 | `features/conversation/` | 对话消息块（MessageBlocks） |
| 文件树 | `features/file-tree/` | 文件树组件（TreeNodeRow、CustomScrollArea、虚拟化） |
| 工作区文件树 | `features/workspace-file-tree/` | 工作区文件树（MultiWorkspaceFileTree、WorkspaceFileTreeEntry） |
| 工作区变更树 | `features/workspace-changes-tree/` | 工作区变更树（MultiWorkspaceChangesTree、WorkspaceChangesEntry） |
| 工作区终端 | `features/workspace-terminal/` | 工作区终端（MultiWorkspaceTerminal、WorkspaceTerminalEntry） |
| 工作区浏览器 | `features/workspace-browser/` | 工作区浏览器（MultiWorkspaceBrowser） |
| 多工作区 | `features/multi-workspace/` | 多工作区容器（MultiWorkspaceContainer） |
| GitHub 树 | `features/github-tree/` | GitHub 仓库树（GitHubTree、GitHubTreeEntry） |
| 大纲 | `features/outline/` | 大纲树（OutlineTree、OutlineModel） |
| 预览 | `features/preview/` | 文件预览（MarkdownPreview、PDFPreview、DocxPreview） |
| 补丁审查 | `features/patch-review/` | 补丁审查（PatchFileCard、PatchHunkCard、PatchReviewSummary） |
| MCP | `features/mcp/` | MCP 管理（McpServerConfig、McpServerList、McpSettings、McpStatusBadge） |
| LSP 面板 | `features/lsp-panel/` | LSP 面板（LspDiagnostics、LspSettings、LspSymbols） |
| Provider 管理 | `features/provider-manager/` | 提供商管理（ProviderConfig、ProviderList、ProviderSettings） |
| 权限设置 | `features/permission-settings/` | 权限规则编辑（PermissionRulesetEditor、PermissionRulesetList、PermissionSettings） |
| 插件管理 | `features/plugin-manager/` | 插件管理（PluginList、PluginSettings） |
| 自定义 Agent | `features/custom-agent/` | 自定义 Agent（CustomAgentManager、CustomAgentSettings） |
| 引用管理 | `features/reference-manager/` | 引用管理（ReferenceList、ReferenceSettings） |
| 会话 Fork | `features/session-fork/` | 会话 Fork（ForkButton） |
| 网络搜索 | `features/web-search/` | 网络搜索面板（WebSearchPanel） |
| 命令编辑 | `features/command-editor/` | 命令编辑（CommandEditor、CommandList、CommandSettings） |
| 通用树 | `features/tree/` | 通用树骨架（MultiTreeEntryShell、treeEntryMenus） |

## 布局区域 (regions/)

### 布局结构

```
App.tsx
├── TitleBar                # 自定义标题栏（含 titleBarMenus）
├── LeftSidebar             # 左侧边栏
│   ├── ConversationPanel   # 会话列表
│   ├── SessionList         # 会话行
│   ├── WorkspaceList       # 工作区列表
│   ├── SidebarContextMenu  # 侧边栏右键菜单
│   └── ResizeHandle        # 拖拽调整宽度
├── CenterPane              # 中央窗格
│   ├── WelcomeState        # 欢迎页（无会话时）
│   ├── ApprovalInlineCard  # 审批内联卡片
│   └── ComposerFooter      # 输入框底部
├── RightPanel              # 右侧面板（编辑区/变更区）
│   ├── EditorSurfaceShell  # 编辑区外壳
│   ├── FileNavigatorShell  # 文件导航外壳
│   ├── ChangesTreePanel    # 变更树面板
│   ├── DiffEditorSection   # 差异编辑区
│   ├── PatchReviewSection  # 补丁审查区
│   ├── Panel 切换（ToolSwitcher）
│   └── 子面板：ChangesPanel / FilesPanel / BrowserPanel / ...
└── StatusBar               # 底部状态栏
    ├── StatusBarGitInfo    # Git 分支/变更数
    └── StatusBarEditorInfo # 编辑信息（行列号等）
```

### 右侧面板 (right-panel/) 详情

```
right-panel/
├── ChangesPanel/           # 变更面板工具
│   └── utils.ts
├── editor-support/         # 编辑器支持
│   ├── agentDecorations.ts
│   ├── cmWrapColumn.ts
│   ├── stickyContext.ts / stickyContextView.tsx
├── hooks/                  # 右侧面板 Hook
│   ├── useAgentDecorations.ts
│   ├── useAuditPanelProps.ts
│   ├── useBrowserPanelProps.ts
│   ├── useCIPanelProps.ts
│   ├── useChangesPanelProps.ts
│   ├── useCommunicationPanelProps.ts
│   ├── useEditorOptions.ts
│   ├── useEditorStateCache.ts
│   ├── useFileContextMenuItems.tsx
│   ├── useFileCreation.ts
│   ├── useFileHistory.ts
│   ├── useFilesPanelProps.ts
│   ├── useModelPanelProps.ts
│   ├── useRightPanelLayout.ts
│   ├── useRightPanelViewProps.ts
│   ├── useSearchPanel.ts
│   ├── useSettingsPanelProps.ts
│   ├── useStickyContext.ts
│   ├── useTerminalPanelProps.ts
│   └── useWrapColumn.ts
├── panels/                 # 子面板实现
│   ├── ChangesPanel/       # 变更面板（含分支/过滤/排序/对话框）
│   ├── communicate/        # 通讯面板（GitHub CI/Email/Feishu/QQ/微信/帮助）
│   ├── BrowserPanel.tsx
│   ├── ChangesPanel.tsx / ChangesEmptyState.tsx
│   ├── ChangesToolbar.tsx / ChangesTopToolbar.tsx
│   ├── ChangesNavigatorToolbar.tsx
│   ├── ChangesConfirmDialogs.tsx
│   ├── ChangesTreePanel.tsx
│   ├── CommunicationPanel.tsx
│   ├── DiffEditorSection.tsx
│   ├── FilesPanel.tsx
│   └── PatchReviewSection.tsx
├── DiffToolbar.tsx
├── EditorSurfaceShell.tsx
├── FileContextMenu.tsx
├── FileCreationBar.tsx
├── FileHistoryNav.tsx
├── FileNavigatorShell.tsx
├── FileNavigatorToolbar.tsx
├── FileNavigatorTree.tsx
├── FilePreviewRenderers.tsx
├── ToolSwitcher.tsx
├── rightPanelLayout.ts
└── types.ts
```

## 国际化 (i18n/)

### 结构

```
i18n/
├── en-US/                  # 英文
│   ├── agent.ts
│   ├── approval.ts
│   ├── browser.ts
│   ├── changes.ts
│   ├── ci.ts
│   ├── commands.ts
│   ├── common.ts
│   ├── communicate.ts
│   ├── conversation.ts
│   ├── customAgent.ts
│   ├── durable.ts
│   ├── file.ts
│   ├── index.ts
│   ├── lsp.ts
│   ├── mcp.ts
│   ├── menu.ts
│   ├── models.ts
│   ├── permission.ts
│   ├── plugin.ts
│   ├── provider.ts
│   ├── reference.ts
│   ├── sessionFork.ts
│   ├── settings.ts
│   ├── terminal.ts
│   ├── webSearch.ts
│   └── workspace.ts
├── zh-CN/                  # 中文（同上 26 个领域文件）
├── TCopyContext.tsx
├── copyToClipboard.ts
├── format.ts
├── formatT.ts
├── getAppCopy.ts
├── index.ts
├── types.ts
└── useTCopy.ts
```

### 26 个翻译域

| 域 | 说明 |
|----|------|
| agent | Agent 相关文案 |
| approval | 审批流程文案 |
| browser | 浏览器面板文案 |
| changes | 变更面板文案 |
| ci | CI 状态文案 |
| commands | 命令面板文案 |
| common | 通用文案 |
| communicate | 通讯面板文案 |
| conversation | 对话文案 |
| customAgent | 自定义 Agent 文案 |
| durable | 持久会话文案 |
| file | 文件操作文案 |
| lsp | LSP 面板文案 |
| mcp | MCP 管理文案 |
| menu | 菜单文案 |
| models | 模型选择文案 |
| permission | 权限设置文案 |
| plugin | 插件管理文案 |
| provider | Provider 管理文案 |
| reference | 引用管理文案 |
| sessionFork | 会话 Fork 文案 |
| settings | 设置面板文案 |
| terminal | 终端文案 |
| webSearch | 网络搜索文案 |
| workspace | 工作区文案 |

## 命令系统 (commands/)

| 文件 | 说明 |
|------|------|
| `commandRegistry.ts` | 命令注册表：`CommandRegistry` 类，管理命令的注册/注销/执行 |
| `defaultCommands.ts` | 默认命令集：预注册的快捷键命令 |
| `useCommandRegistry.ts` | React Hook：在组件树中访问命令注册表 |
| `commandRegistry.test.ts` | 命令注册表单元测试 |

## 根级组件参考

| 组件 | 路径 | 说明 |
|------|------|------|
| App.tsx | `app/App.tsx` | 应用根组件，组合四大布局区域 |
| Composer | `app/components/Composer.tsx` | 对话输入框，支持多行输入/发送 |
| MessageBubble | `app/components/MessageBubble.tsx` | 消息气泡，展示单条对话消息 |
| MessageStream | `app/components/MessageStream.tsx` | 消息流，流式渲染对话消息列表 |
| PromptInput | `app/components/PromptInput.tsx` | Prompt 输入控件 |
| AgentSelector | `app/components/AgentSelector.tsx` | Agent 选择下拉 |
| PlanModeBanner | `app/components/PlanModeBanner.tsx` | Plan 模式横幅提示 |
| SubagentIndicator | `app/components/SubagentIndicator.tsx` | 子代理活动指示器 |
| ContextBuilder | `app/components/ContextBuilder.tsx` | 上下文构建器 |
| SessionManagement | `app/components/SessionManagement.tsx` | 会话管理（新建/切换/删除） |
| MainContent | `app/components/MainContent.tsx` | 主内容区容器 |
| WelcomeState | `app/components/WelcomeState.tsx` | 无会话时的欢迎页 |
| Icon | `app/components/Icon.tsx` | 通用图标组件 |
| Toast | `app/components/Toast.tsx` | Toast 通知 |
| Tooltip | `app/components/Tooltip.tsx` | 工具提示 |
| ContextMenu | `app/components/ContextMenu.tsx` | 右键菜单 |
| ConfirmDialog | `app/components/ConfirmDialog.tsx` | 确认弹窗 |
| ErrorBoundary | `app/components/ErrorBoundary.tsx` | 错误边界 |
| LazyComponents | `app/components/LazyComponents.tsx` | 懒加载组件注册 |
| OrbitalLoader | `app/components/OrbitalLoader.tsx` | 加载动画 |
