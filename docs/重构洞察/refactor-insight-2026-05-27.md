# 重构洞察报告 – ai-digital-life
**生成日期**：2026-05-27

## 1. 架构与设计

### 1.1 双 Store 架构：Legacy ui-store 与 slicedStore 割裂（核心架构债务）

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| [ui-store.ts:1-817](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/ui-store.ts) — `useUiStore` 全局 | Legacy `useUiStore`（817 行）仍被 **27 个文件直接引用**，与 Zustand 切片合并后的 `useAppStore` 形成双 Store 割裂架构。该 Store 无选择器分层、无 `useShallow` 使用，**任何字段变更都会导致 27 个消费者全部重渲染**。 | 制定分批迁移路线图：第一阶段迁移面板布局状态（`leftCollapsed`/`rightCollapsed`、面板宽度）→ `uiSlice`；第二阶段迁移终端 UI 状态（`terminalTabs`、`terminalActiveTabId` 等）→ `terminalSlice`；第三阶段迁移菜单/设置/浏览器状态；最终移除 `ui-store.ts`。 | 🔴高 |
| [terminalSlice.ts:188-196](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/terminalSlice.ts#L188-L196) vs [ui-store.ts:322-337](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/ui-store.ts#L322-L337) — 终端状态双写冲突 | `terminalSlice` 和 `ui-store` 各自维护 `terminalTabs`、`terminalActiveTabId`、`defaultTerminalProfile`、`terminalNavigatorWidth`、`navigatorCollapsedByTool`，且都通过各自 `scheduleWrite` 写入**同一个 localStorage key**（如 `adl-terminal-tabs`），存在数据竞争和状态不一致风险。 | 短期：明确 `terminalSlice` 为唯一真源，`ui-store` 中的终端字段标记 `@deprecated` 并改为从 `useAppStore` 订阅同步。长期：`ui-store` 中终端状态完全移除。 | 🔴高 |

### 1.2 CSS 巨型文件与组织问题

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| [files-panel.css:1-2486](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/styles/regions/rightpanel/files-panel.css) — 项目最大 CSS 文件 | **2486 行** CSS，混合了文件树样式（~600 行）、搜索面板样式（~300 行）、大纲样式（~200 行）、文件 badge 颜色定义（~120 行 30+ 硬编码 hex）、树节点交互、重命名输入、拖放指示器等多项职责。30+ 处硬编码 hex 颜色未使用设计 Token。 | 按功能域拆分：`file-tree.css`（树节点）、`search-panel.css`（搜索）、`outline-panel.css`（大纲）、`file-badges.css`（badge 颜色语义化 Token）。硬编码颜色迁移到 `tokens.css`。 | 🔴高 |
| [components.css:1-1938](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/styles/components.css) — 通用组件样式巨型文件 | **1938 行**，涵盖 Tooltip、Modal、Button、Dropdown、ContextMenu、Checkbox、Badge、Input 等十余个组件的样式，无模块边界。 | 按组件拆分为 `tooltip.css`、`modal.css`、`contextmenu.css`、`button.css` 等独立文件，通过 `@import` 在入口聚合。 | 🔴高 |
| [leftbar.css:1-1117](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/styles/regions/leftbar.css) — 左侧边栏样式 | 1117 行，涵盖工作区列表、会话列表、对话面板、尺寸调整手柄、右键菜单等区域样式。 | 拆分为 `workspace-list.css`、`session-list.css`、`conversation-panel.css`，与 JSX 组件一一对应。 | 🟡中 |
| [editor-surface.css:922](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/styles/regions/rightpanel/editor-surface.css) — 编辑器表面样式 | 922 行，CodeMirror 覆盖 + 文件 tab 栏 + 编辑器工具条。 | 拆分为 `cm-overrides.css` 和 `editor-tabs.css`。 | 🟡中 |

### 1.3 代码重复

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| [ChangesPanel.tsx:382-387](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx#L382-L387)、[FileNavigatorShell.tsx:214-219](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/right-panel/FileNavigatorShell.tsx#L214-L219)、[copy.ts:1092-1098](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/copy.ts#L1092-L1098) — `copyToClipboard` 3 处独立实现 | 三个文件各自定义 `navigator.clipboard.writeText` 封装，`ChangesPanel` 和 `FileNavigatorShell` 使用 `useCallback` 包裹，`copy.ts` 是导出版本。功能完全相同，维护成本 3x。 | 统一使用 `copy.ts` 的导出版本，删除组件内的 `useCallback` 复制。 | 🔴高 |
| [ChangesPanel.tsx:420-539](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx#L420-L539) vs [FileNavigatorShell.tsx:221-324](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/right-panel/FileNavigatorShell.tsx#L221-L324) — 右键菜单构建逻辑 ~200 行重复 | `getContextMenuItems` 在两个文件中包含高度相似的"Reveal in Explorer"、"Copy Path"、"Cut/Copy/Paste"、"Rename"、"Delete"等菜单项构建逻辑。 | 提取共享 hook `useFileContextMenu`，两处改为调用同一 hook，参数化差异项。 | 🔴高 |
| [workspace_sidebar.rs:49-52](file:///e:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands/workspace_sidebar.rs#L49-L52)、[:73-78](file:///e:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands/workspace_sidebar.rs#L73-L78)、[:88-90](file:///e:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands/workspace_sidebar.rs#L88-L90)、[:97-100](file:///e:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands/workspace_sidebar.rs#L97-L100)、[:124-127](file:///e:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands/workspace_sidebar.rs#L124-L127)、[:284-287](file:///e:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands/workspace_sidebar.rs#L284-L287) — 6 处相同 4 字段 clone 模式 | `id`/`path`/`root_path`/`name` 四字段 clone 在 `workspace_sidebar.rs` 中重复 6 次，用于构造 `RecentWorkspaceEntry` 或类似 DTO。 | 实现 `impl From<&WorkspaceMeta> for RecentWorkspaceEntry`，替换所有 clone 模式为 `.into()`。 | 🟡中 |
| [search.rs:9-101](file:///e:/Programs/Obsidian/notes/ai-digital-life/crates/workspace/src/search.rs#L9-L101) — `search_text` 与 `search_text_async` ~50% 逻辑重复 | 同步版和异步版包含相同的：空查询检查、文件遍历、逐行 `contains` 匹配、结果截断（200 条）。异步版额外有取消通道检查。同步版委托给 `search_text_in_files`，异步版完全内联但未复用该函数。 | 将 `search_text_in_files` 改为接受可选 `CancellationToken`，`search_text_async` 改为调用同一内部实现。消除约 50 行重复。 | 🟡中 |

### 1.4 切片与 Action 职责边界

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| [workspaceActions.ts:317-423](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/actions/workspaceActions.ts#L317-L423) — Git/变更/搜索操作混杂在 workspaceActions 中 | `loadGitSnapshot`、`refreshGitSnapshot`、`expandWorkspaceChangesInFileNav`、`collapseAllWorkspaceChanges`、`expandAllWorkspaceChanges`、`searchFiles` 共 5 个函数语义上属于 git/changes/search 领域，不应在 workspace actions 中。文件现已 425 行（超出 200 行阈值 112%）。 | Git 快照/变更展开操作迁移到 `gitActions.ts`；`searchFiles` 迁移到独立的 `searchActions.ts`。 | 🟡中 |
| [generalActions.ts:183-233](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/actions/generalActions.ts#L183-L233) — 混杂 task/command/bootstrap 逻辑 | `decideApproval`（任务审批）、`restoreCheckpoint`（任务恢复）属于任务领域；`runCommand` 属于命令领域。放在 `generalActions` 下破坏了领域内聚性。 | `decideApproval`/`restoreCheckpoint` 迁移到 `taskActions.ts`；`runCommand` 迁移到 `commandActions.ts`。 | 🟡中 |
| [terminalSlice.ts:1-358](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/terminalSlice.ts) — 切片文件 358 行严重超标 | 超过 200 行基准 79%。包含内联 localStorage 辅助函数（`readJson`/`writeJson`/`readNumber`/`writeNumber`，占 L45-L83）、批量写入调度器（`scheduleWrite`/`scheduleFlush`，占 L123-L157）、`normalizeTerminalTabs` 无操作死代码（L99-L101 直接 `return tabs`）。 | 提取 localStorage 工具到 `app/stores/localStorageUtils.ts`；提取写入调度器为 `createStorageScheduler` 工厂函数；删除 `normalizeTerminalTabs` 死代码。 | 🟡中 |

### 1.5 其他架构问题

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| [kernel/types.rs:1-1286](file:///e:/Programs/Obsidian/notes/ai-digital-life/crates/kernel/src/types.rs) — 巨型类型转储 | 1286 行巨型文件，包含 70+ 结构体/枚举体，覆盖配置、工作区、会话、Agent、命令、检索、模型等全部领域类型。`#[serde(rename_all = "camelCase")]` 出现 40+ 次。虽不影响编译性能（纯数据类型），但认知负担极高。 | 按领域拆分为 `types/config.rs`、`types/workspace.rs`、`types/conversation.rs`、`types/agent.rs`、`types/command.rs`，在 `lib.rs` 中 `pub mod` 重导出保持向后兼容。 | 🟡中 |
| [terminal/Cargo.toml:L8-L12](file:///e:/Programs/Obsidian/notes/ai-digital-life/crates/terminal/Cargo.toml#L8-L12) — `adl-terminal` 耦合 `tauri` 框架 | 终端核心 crate 依赖 `tauri`，但 PTY 管理、session 管理、Shell 解析是纯领域逻辑，不应耦合桌面框架。这破坏了分层架构，使得终端 crate 无法在非 Tauri 环境复用或独立测试。 | 将 Tauri 集成代码（事件发射、命令注册）提取到 `src-tauri/src/terminal/` 或独立 `adl-terminal-tauri` crate，`adl-terminal` 仅保留纯 PTY/Shell 逻辑。 | 🟡中 |
| [types.rs:30-120](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/right-panel/types.ts#L30-L120) — `RightPanelViewProps` 巨型接口 | 120+ 属性传递给 7 个 tool panel（Files、Changes、Browser、Terminal、Audit、Models、Settings），每个 panel 仅使用其中 2~10 个。任意 panel 相关状态变化导致所有 panel 的 props 引用更新，触发不必要的协调。 | 按 tool 类型拆分为独立接口（`FilesPanelProps`、`ChangesPanelProps` 等），各 panel 仅声明自身需要的 props。 | 🟡中 |
| [gitSlice.ts:8-10](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/gitSlice.ts#L8-L10) — 未使用的类型导入 | `WorkspaceGitBranchCreateInput` 和 `WorkspaceGitBranchSwitchInput` 在 `gitSlice.ts` 中导入但未被该 slice 的接口使用（实际使用在 `gitActions.ts` 中），增加不必要的模块耦合。 | 移除 `gitSlice.ts` 中的未使用导入，必要时通过 re-export 间接提供。 | 🟢低 |
| [workspaceSlice.ts:19](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/workspaceSlice.ts#L19) — `workspaceTree` @deprecated 字段仍在使用 | 标记为 `@deprecated`，但 setter 和 `refreshWorkspaceTree` action 中仍在写入。需确认是否还有消费者依赖此字段。 | 搜索所有 `workspaceTree` 引用，确认无消费者后移除该字段和对应 setter。 | 🟢低 |
| [workspaceSlice.ts:29-31](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/workspaceSlice.ts#L29-L31) — 字段归属不当 | `indexingStatus` 和 `repoMap` 语义上属于诊断/检索领域，却放在 `workspaceSlice` 中。 | 移入 `diagnosticSlice`。 | 🟢低 |
| [ui-store.ts:317](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/ui-store.ts#L317) vs [uiSlice.ts:10](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/uiSlice.ts#L10) — `activeTool` vs `activeRightTool` 命名不一致 | `ui-store.ts` 中为 `activeTool`，`uiSlice.ts` 中为 `activeRightTool`，指向同一概念但命名不同，降低代码可读性。 | 统一命名为 `activeRightTool`（与 `activeLeftTool` 保持一致命名模式）。 | 🟢低 |

## 2. 性能优化

### 2.1 渲染性能

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| [ui-store.ts:1-817](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/ui-store.ts) — 27 个消费者无选择器/无记忆化 | Legacy `useUiStore` 的 27 个消费者全部使用 `useUiStore((state) => state.xxx)` 直接订阅模式，无 `useShallow` 包裹，无选择器分层。`ui-store` 中**任何字段变更**都会导致 27 个组件全部重渲染（浅比较检查）。 | 短期：为高频访问字段提供 `useShallow` 选择器。长期：迁移到 slicedStore 并利用现有 `selectors.ts` 基础设施。 | 🔴高 |
| 全局 React.memo 缺失 | 项目 89 个导出组件中仅 **2 个**（`ActiveToolPanel`、`MultiWorkspaceContainer`）使用 `React.memo`（占比 2.2%）。`DiffViewer`、`CodeEditor`（编辑器挂载成本高）、`PatchFileCard`、`PatchHunkCard`（列表中重复渲染）、`OutlineTree`、`FileTree` 等组件频繁无意义重渲染。 | 为编辑器和列表渲染组件添加 `React.memo` 包裹：`DiffViewer`、`CodeEditor`、`PatchFileCard`、`PatchHunkCard`、`OutlineTree`、`FileTree`、`FileTreeItem`。 | 🔴高 |
| [patchActions.ts:87-107](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/actions/patchActions.ts#L87-L107) — `acceptAllHunks`/`rejectAllHunks` 顺序 N 次重渲染 | 在 `for` 循环内逐 hunk 调用 `setHunkDecision`，每个 hunk 触发一次 `set()` 和一次 React 重渲染。对于 50 个 hunk 的补丁集，产生 50 次级联重渲染。 | 改为批量收集所有 hunk decision 变更到数组，最后一次性 `set()`。 | 🟡中 |
| [editorActions.ts:75-100](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/actions/editorActions.ts#L75-L100) — `openFileGeneric` 两步 set() 触发双重重渲染 | 文件不在缓存时：先 `set()` "打开中"状态（L75-L82），读取文件后再 `set()` 完整状态（L86-L100），导致两次级联重渲染。 | 合并为单次 `set()`：读取文件后在回调中一次性更新所有相关字段。 | 🟡中 |
| [gitActions.ts:84-116](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/actions/gitActions.ts#L84-L116) — `switchGitBranch` 与 `createGitBranch` 尾部 5 项并行刷新重复 | 两个函数尾部有完全相同的 `Promise.allSettled([...5 items])` + 条件 `openFile` 逻辑（L84-L90 vs L110-L116），每次触发 5 个并行异步刷新，每个内部又有独立 `set()`。 | 提取 `async function refreshAfterBranchChange(get: GetFn)` 共享函数。 | 🟡中 |
| [ChangesPanel.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx) — 20 处内联 style 对象 | 项目中 20 处内联 style 对象（如 `style={{ "--rightpanel-width": ... }`），每次渲染创建新引用，虽大部分变化频率低，但在高频交互路径（如 `ChangesPanel`、`FilesPanel`）中增加重渲染开销。 | 高频路径的内联 style 用 `useMemo` 包裹；CSS 变量类的内联 style 改为 className + CSS。 | 🟡中 |
| [ApprovalCard.tsx:52](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/components/approval/ApprovalCard.tsx#L52)、[ExecutionSummary.tsx:62](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/components/agent/ExecutionSummary.tsx#L62) — 使用数组索引作为 React key | `impact.map((item, idx) => <li key={idx}>)` 和 `commandsExecuted.map((c, i) => <li key={i}>)` 使用数组索引作为 key，列表项增删时可能导致渲染异常。 | 使用稳定唯一标识（如 `item.id`、`item.label` 等业务 ID）。 | 🟢低 |

### 2.2 资源加载与 Bundle 体积

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| [cmLanguages.ts:1-20](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/editor/cmLanguages.ts#L1-L20) — 10 个 CodeMirror 语言包全量静态导入 | javascript(50KB)、python(30KB)、rust(25KB)、sql(45KB)、markdown(60KB)、html(30KB)、css(15KB)、json(5KB)、xml(15KB)、yaml(10KB) 全部在模块顶层静态 `import`，合计 ~285KB min+gz 打入 `vendor-codemirror` chunk。用户通常仅使用 1-2 种语言。 | 改为动态 `import()`：`getLanguageExtension` 根据 `languageId` 按需懒加载对应语言包，配合内存 cache 避免重复加载。所有调用方需适配 async。 | 🔴高 |
| [MarkdownPreview.tsx:15](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/preview/MarkdownPreview.tsx#L15) — `highlight.js` 全量引入 | `import hljs from "highlight.js"` 导入全部 190+ 语言，~150KB+ min+gz。实际只需 TS/JS/Python/Rust/SQL/JSON 等约 10 种常用语言。 | 使用 `highlight.js/lib/common`（~40KB，35 种常用语言），或 `lib/core` + 手动注册所需语言。 | 🔴高 |
| [copy.ts:1-1107](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/copy.ts) — i18n 翻译全量首屏加载 | 全部 ~400 条翻译 key（包含 zh-CN 和 en-US）在首屏加载，实际大部分翻译不在首屏使用。文件末尾的 `copyToClipboard` 辅助函数与 i18n 职责无关。 | 按模块拆分为 `locales/zh-CN/shell.ts`、`locales/zh-CN/files.ts` 等；`copyToClipboard` 移到 `utils/clipboard.ts`。利用 Vite tree-shaking 按需加载。 | 🟡中 |

### 2.3 Store 性能

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| [selectors.ts:262-265](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/selectors.ts#L262-L265) — `useCurrentFileTab` O(n) find + useShallow 双重开销 | 每次渲染遍历 `openTabs` 数组（`.find()`），再用 `useShallow` 比较结果。标签少（<20）时影响小，但随着打开标签增长，成本线性增加。 | 在 `editorSlice` 中维护 `openTabsByPath: Record<string, FileTabState>`，支持 O(1) 查找，选择器改为 `s.openTabsByPath[s.selectedFilePath]`。 | 🟡中 |
| [ChangesPanel.tsx:92-93](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx#L92-L93) — Record 类型未用 useShallow | `workspaceChangesTreeLoading`（`Record<string, boolean>`）未包裹 `useShallow`，任意工作区对应值变化都触发当前面板重渲染。 | 包裹 `useShallow`。 | 🟡中 |
| [terminalSlice.ts:116-166](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/terminalSlice.ts#L116-L166) — 模块顶层同步 localStorage 读 | 模块文件顶层 `localStorage.removeItem()`（L116-L122）和 slice 初始化时 3 次同步 `localStorage.getItem()`（L154-L166）在主线程启动关键路径上阻塞。 | 顶层 `removeItem` 延迟到 `requestIdleCallback`；初始值改为惰性读取：首次访问时才从 localStorage 加载并内存缓存。 | 🟡中 |

### 2.4 Rust 性能

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| [tree.rs:14-19](file:///e:/Programs/Obsidian/notes/ai-digital-life/crates/workspace/src/tree.rs#L14-L19) — `IGNORED_DIRS` 线性扫描 | 18 个忽略目录名使用 `iter().any()` 线性扫描，每次目录遍历的每个条目都执行 O(18) 检查。当前条目数下开销可接受，但若增加到 30+ 项，应优化。 | 构建时转换为 `HashSet<&'static str>` 或使用 `phf` 编译期完美哈希。 | 🟢低 |
| [tree.rs:86](file:///e:/Programs/Obsidian/notes/ai-digital-life/crates/workspace/src/tree.rs#L86) — `list_tree_inner` 静默吞掉递归错误 | `unwrap_or_else(|| vec![])` 在子目录读取失败时静默返回空列表，丢失错误信息，调试困难。 | 改用 `unwrap_or_else(|e| { tracing::warn!("Failed to read subdir: {e}"); vec![] })` 至少记录 warning。 | 🟢低 |

## 3. 其他发现

### 3.1 代码质量问题

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| [ChangesPanel.tsx:727,743](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx#L727-L743)、[ChangesTreePanel.tsx:162](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesTreePanel.tsx#L162)、[editorAdapters.ts:221](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/editor/editorAdapters.ts#L221) — 4 处 `as any` 类型断言 | 生产代码中仍有 4 处 `as any`，破坏了类型安全。 | 修复对应类型定义或使用泛型约束替代断言。 | 🟡中 |
| [terminalSlice.ts:99-101](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/terminalSlice.ts#L99-L101) — `normalizeTerminalTabs` 无操作死代码 | 函数体直接 `return tabs`，无任何逻辑，已退化为恒等函数。 | 删除该函数及其所有调用点。 | 🟢低 |

### 3.2 重复类型事件构造（Rust）

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| [agent.rs:47-127](file:///e:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands/agent.rs#L47-L127)、[task.rs:158-284](file:///e:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands/task.rs#L158-L284)、[patch.rs:98-199](file:///e:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands/patch.rs#L98-L199) — `digital-life://run-activity` 事件构造 6 处内联重复 | 3 个文件中 6 处内联 `serde_json::json!({...})` 手动构造相同结构的事件，都需要跟踪 `v`、`runId`、`seq`、`ts`、`type` 字段。`agent.rs` 已有 `make_activity_emitter` 工厂函数但未暴露为 pub。 | 将 `make_activity_emitter` 提升为 `crates/events` 中的公共 API，`task.rs` 和 `patch.rs` 改为使用该公共工厂。 | 🟢低 |

### 3.3 正面实践（值得保留与推广）

| 位置 | 实践 | 评估 |
|------|------|------|
| `slices/` 目录 + `actions/` 目录 | Zustand 切片合并模式，11 个独立切片 + 8 个 action 模块，职责清晰 | ✅ 优秀 |
| `selectors.ts` | 10 个选择器分组，对象/数组类型使用 `useShallow`，原始类型直接返回 | ✅ 优秀 |
| Rust OnceLock Regex 缓存 | 51 个 `Regex::new()` 全部通过 `OnceLock` 缓存，无遗漏 | ✅ 优秀 |
| `spawn_blocking` 异步 I/O | 所有阻塞 I/O 正确包裹在 `tokio::task::spawn_blocking` 中 | ✅ 优秀 |
| Tauri 命令错误处理 | `ipc()`/`ipc_try()` 统一包装器模式，16 个命令文件一致使用 | ✅ 优秀 |
| `change-engine` 测试覆盖率 | 500 行中 238 行测试，7 个测试用例覆盖核心路径 | ✅ 优秀 |
| TODO/FIXME/HACK 注释 | 全项目 **0 处**，代码干净规范 | ✅ 优秀 |
| `#[allow(dead_code)]` | 全项目 **0 个** | ✅ 优秀 |

---

> 由自动化重构洞察生成于 2026-05-27 00:50:07
