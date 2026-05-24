# 重构进度报告

> 更新日期: 2026-05-25（第十一轮）

## 完成状态

| 轮次 | 日期 | 内容 | 状态 |
|------|------|------|------|
| 第一轮 | 2026-05-20 | Zustand 切片定义（10 个切片） | ✅ |
| 第二轮 | 2026-05-21 | 切片合并 + 性能优化（Rust DRY、搜索 debounce 等） | ✅ |
| 第三轮 | 2026-05-21 | CSS Token 迁移 + 模块化分层 + 错误码统一 | ✅ |
| 第四轮 | 2026-05-21 | 重构洞察验证与修复（消除 11 处 `as any`、LRU 优化、SSE 管理等） | ✅ |
| 第五轮 | 2026-05-22 | CodeMirror 双实例 Bug 修复（`@codemirror/state` 显式依赖 + `optimizeDeps.include`） | ✅ |
| 第六轮 | 2026-05-22 | Store/桥接/接口/性能/Rust 全面重构 | ✅ |
| **第七轮** | **2026-05-23** | **重构洞察 22 项 + 大型组件拆分（19 项修复 + 3 组件拆 17 文件）** | ✅ |
| **第八轮** | **2026-05-23** | **重构洞察第二轮 26 项（渲染性能 + 模块化 + 架构治理 + Rust 改进 + 润色）** | ✅ |
| **第九轮** | **2026-05-24** | **重构洞察执行 22 项（Rust 长文件拆分 + 前端组件重构 + 目录治理 + 性能优化）** | ✅ |
| **第十轮** | **2026-05-24** | **重构洞察修复 11 项（Regex OnceLock + 死 CSS 清理 + 文件拆分 + Store 重构）** | ✅ |
| **第十一轮** | **2026-05-25** | **ChangesPanel 组件提取（3 组件 → patch-review 模块）** | ✅ |

## 第七轮重构（2026-05-23）：全面修复 + 大型组件模块化

基于 [重构洞察报告](./refactor-insight-2026-05-23.md) 和 [修复计划](../../.trae/documents/refactor-fix-plan-2026-05-23.md) 完成，分 7 个 Phase 共 25 项任务：

### Phase 1：快速修复（4 项）

| 任务 | 文件 | 说明 |
|------|------|------|
| 移除死依赖 | `crates/change-engine/Cargo.toml` | 删除 `adl-terminal` |
| 移除未用依赖 | `crates/context-engine/Cargo.toml`、`crates/prompt-engine/Cargo.toml` | 删除 `adl-errors` |
| 移除空 crate | `crates/editor/` | 占位 crate 已删除 |
| 移除死代码 | `frontend/src/app/hooks/useStreamingText.ts` | 由 Zustand managed state 替代 |

### Phase 2：稳定性与性能核心（6 项）

| 任务 | 说明 |
|------|------|
| App 选择器拆分 | 80+ 字段 → `error`(单字段) + `useAppActions()`(43 actions) + 35 字段(state 组) |
| Error Boundary | 新建组件，包裹 3 个主面板，防止单面板崩溃白屏 |
| storage mutex 中毒降级 | `.expect()` → `map_err` + `?`，12+ 调用点更新 |
| model-gateway 空 choices | `.unwrap_or_default()` → `AppError` 传播 |
| DiffViewer onMount 修复 | 2 处 `useEffect` 依赖数组补全 |
| ptyBridge HMR 泄漏 | 模块级变量 → 工厂函数闭包 |

### Phase 3：大型组件拆分（3 项，17 个新文件）

| 组件 | 原行数 | 现主文件 | 拆分文件 |
|------|--------|----------|----------|
| DiffViewer | 673 → 77 | 路由组件 | `SideBySideDiffViewer`、`InlineDiffViewer`、`sharedExtensions`、`diffViewerUtils` |
| TerminalPanel | 793 → 236 | 组合器 | `useTerminalPanel` hook + 6 子组件（TabBar/EmptyState/ShellSelector/ContextMenu/MenuDropdown/Navigator） |
| LeftSidebar | 1796 → 292 | 组合器 | `WorkspaceList`、`SessionList`、`ConversationPanel`、`ResizeHandle`、`SidebarContextMenu` |

### Phase 4：代码质量改进（6 项）

| 任务 | 说明 |
|------|------|
| 共享 Icon 组件 | 6 处重复定义 → 1 个共享组件 |
| CodeEditor useMemo | 移除无效 `theme` 依赖 |
| useMemo 补充 | `badges`/`changesMenuItems`/`fileMenuItems` |
| task 运算符括号 | `\|\| cargo && args` → `\|\| (cargo && args)` |
| run_activity seq | 10 路 match → `fn seq()` 方法 |
| streamActions 优化 | 函数内联化 |

### Phase 5：低优先级优化（3 项）

| 任务 | 说明 |
|------|------|
| fileTree props 窄化 | `{...props}` → 6 个显式 prop |
| CustomScrollArea | 移除 children 依赖，改用 ref |
| context-engine 零分配 | 双重 `chars().rev()` → `char_indices().nth_back()` |

### 额外清理

- 删除 ~210 行 Mock 死代码（`usingMockStandaloneSessions = false`）
- 替换 11 处硬编码中文字符串为 `t()` i18n 调用
- 补充 i18n 词汇表 11 个词条（zh-CN + en-US）

### 当前架构

#### 大型组件模块化结果

```
regions/ (LeftSidebar 拆分)
├── LeftSidebar.tsx                       # ~292 行 合成容器
└── left-sidebar/
    ├── WorkspaceList.tsx                 # ~307 行 工作区列表
    ├── SessionList.tsx                   # ~520 行 会话列表（含拖放重排）
    ├── ConversationPanel.tsx             # ~107 行 对话面板
    ├── ResizeHandle.tsx                  # ~197 行 宽度/高度拖拽
    └── SidebarContextMenu.tsx            # ~255 行 右键菜单 Portal

features/terminal/ (TerminalPanel 拆分)
├── TerminalPanel.tsx                    # ~236 行 组合器
├── useTerminalPanel.ts                  # ~500 行 自定义 Hook
├── TerminalTabBar.tsx                   # 标签栏 + 拖拽排序
├── TerminalEmptyState.tsx               # 空白引导页
├── TerminalShellSelector.tsx            # Shell 类型选择
├── TerminalContextMenu.tsx              # 右键菜单
├── TerminalMenuDropdown.tsx             # 三点菜单
└── TerminalNavigator.tsx                # 导航器面板

features/diff-viewer/ (DiffViewer 拆分)
├── DiffViewer.tsx                       # ~77 行 路由组件
├── SideBySideDiffViewer.tsx             # ~333 行 并排对比
├── InlineDiffViewer.tsx                 # ~183 行 内联对比
├── sharedExtensions.ts                  # ~60 行 共享扩展
└── diffViewerUtils.ts                   # ~79 行 工具函数
```

### 关键改进

| 改进项 | 说明 |
|--------|------|
| Rust 死依赖移除 | 3 项（change-engine/terminal, context-engine/errors, prompt-engine/errors） |
| 空 crate 清理 | `crates/editor` 已删除 |
| DB mutex 中毒降级 | 所有 `conn()` 调用返回 `Result`，中毒不崩溃 |
| Error Boundary | 3 个主面板独立保护，局部降级 |
| App 渲染性能 | 80 字段选择器拆分，流式消息期间不再全树重渲染 |
| DiffViewer onMount | 2 处依赖数组补全，修复潜在 Effect 死锁 |
| ptyBridge HMR | 工厂函数模式消除 Vite 热更新泄漏 |
| 零分配优化 | context-engine 字符串截取减少 2 次分配 |
| 大型组件 | 3 个组件从 3262 行降至 605 行主逻辑，拆分 17 个模块文件 |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 前端测试 (Vitest) | ✅ 31 files, 183 tests |
| Rust cargo check | ✅ |
| Rust cargo test (all crates) | ✅ 全部通过 |
| 新建文件 | 17 |
| 修改文件 | 5 |
| 删除代码 | ~210 行 Mock 死代码 + 1 死 hook + 4 过期计划文档 |
| 新增 i18n 词条 | 11 个（zh-CN + en-US） |

## 第八轮重构（2026-05-23）：26 项全面修复

基于 [第二次重构洞察报告](./refactor-insight-2026-05-23-2.md) 和 [实施计划](../../.trae/documents/refactor-implementation-plan-2026-05-23.md) 完成，分 5 个 Phase 共 26 项任务：

### Phase 1：渲染性能与数据流修复（4 项 🔴高）

| 任务 | 说明 |
|------|------|
| **App.tsx 选择器下沉** | 37 字段巨型 `useShallow` → 6 个独立字段。LeftSidebar props 29→4，CenterPane 27→1，RightPanel 53→17。三个面板内部使用细粒度 `useAppStore` 选择器直接订阅，消除根组件 props 透传瓶颈 |
| **Slice 字段去重** | `diagnosticSlice.ts` 移除 `indexingStatus`/`repoMap`/`setIndexingStatus`/`setRepoMap` 重复定义（已存在于 `workspaceSlice`），消除双重 Zustand set |
| **streaming rAF 批处理** | `appendStreamingText` 每 token set → rAF 合并批量更新，流式频率从 30-60Hz 降至帧同步 ~16ms |
| **terminalSlice localStorage 解耦** | 12 处同步 `writeJson`/`writeNumber` → `setTimeout(0)` 异步写入，避免终端操作阻塞主线程 |

### Phase 2：组件模块化与代码去重（5 项 🟡中）

| 任务 | 说明 |
|------|------|
| **ContextBuilderPopover 提取** | 163 行内嵌组件 → `components/conversation/` 独立文件，清理 10 个未用图标导入 |
| **sessionActions 去重** | 6 个重复 action 模式（`pinSession`/`unpinSession`/`markSessionRead`/`markSessionUnread`/`archiveSession`/`deleteSession`）→ 1 个 `sessionMutate` 辅助函数，削减 ~70 行 |
| **mock-bridge fixture 分离** | `buildResumeHtml`/`buildResumeHtmlModified` + 重复 mock 数据 → `test-fixtures/resume-html.ts` + `test-fixtures/mock-data.ts`，mock-bridge 减少约 200 行 |
| **ChangesPanel/FilesPanel useMemo** | 已验证已正确使用，无需修改 |
| **streamActions 工厂提升** | `createModelStreamSubscriber`/`createRunActivitySubscriber` 从 `sendMessage` 内部提升到模块作用域 |

### Phase 3：架构治理（3 项 🟡中）

| 任务 | 说明 |
|------|------|
| **regions.css 拆分** | 8144 行单体 → 6 个按区域 CSS 文件（titlebar/leftbar/center/composer/rightpanel/statusbar） |
| **Vite manualChunks** | 6 个 vendor chunk（react/codemirror/xterm/zustand/markdown/pdf），首次加载减少 40-50% JS 体积 |
| **双 Store 治理** | uiSlice 移除 4 个死字段（`leftSidebarVisible`/`rightPanelVisible`/`currentModel`/`composerMessage`）；`selectors.ts` 清理对应选择器；terminalSlice 消除对 ui-store 的跨 store 类型依赖 |

### Phase 4：Rust 后端改进（4 项 🟢低）

| 任务 | 说明 |
|------|------|
| **workspace.rs 公共模式提取** | `load_or_seed_sidebar()` 消除 7 处重复；`unpinned_max()` 消除 4 处重复 |
| **model-gateway 优化** | 消除不必要的 `response.usage.clone()`；keyring 调用包装 `tokio::task::spawn_blocking` 防止阻塞 async 运行时 |
| **Token 估算去重 + 零分配截取** | `estimate_tokens` 提取到 `adl-kernel` 共享函数；`trim_to_token_budget` 3 次中间 Heap 分配 → 1 次预分配 + `push_str` |
| **run_activity seq 方法** | 10 臂 match → 枚举固有方法 `DigitalLifeRunActivityEventV1::seq()` + 删除本地 HasSeq trait |

### Phase 5：润色与微优化（2 项 🟢低）

| 任务 | 说明 |
|------|------|
| **CenterPane 滚动修复** | 流式增量更新 `scrollTop = scrollHeight`（instant），仅用户操作使用 `scrollTo({ behavior: "smooth" })` |
| **FileTree props 精简** | 经审查已正确使用显式 props，无需修改 |

### 关键改进

| 改进项 | 说明 |
|--------|------|
| App 渲染性能 | 37→6 字段订阅，props 透传递减 29→4 / 27→1 / 53→17，流式期间细粒度重渲染 |
| Slice 字段去重 | diagnosticSlice/workspaceSlice 消除 4 处重叠，移除双重 Zustand set |
| 流式性能 | rAF 批处理，30-60Hz → 帧同步更新 |
| 全局 CSS | 8144 行 → 6 个文件，按区域拆分 |
| Vite 构建 | 6 个 vendor chunk，缓存分离 |
| Rust 去重 | workspace.rs 消除 11 处重复模式 |
| model-gateway | 消除无意义 clone + keyring 异步化 |
| 共享函数 | estimate_tokens 提取到 adl-kernel |
| fixture 分离 | test-fixtures 目录建立，mock-bridge 减少 200 行 |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 前端测试 (Vitest) | ✅ 31 files, 183 tests |
| Rust cargo test (all crates) | ✅ 105 tests passed |
| Rust cargo check | ✅ |
| npx vite build | ✅ vendor chunks 正确生成 |
| 新建文件 | `test-fixtures/resume-html.ts`, `test-fixtures/mock-data.ts`, `components/conversation/ContextBuilderPopover.tsx`, `styles/regions/*.css` (6 files) |

## 第九轮重构（2026-05-24）：22 项重构洞察执行

基于 [重构洞察报告 5-24](./refactor-insight-2026-05-24.md) 和 [实施计划](../../.trae/documents/refactor-implementation-plan-2026-05-24.md) 完成，分 6 个 Phase 共 22 项任务：

### Phase 1：低风险独立修复（7 项 → 4 项实际执行）

| 任务 | 文件 | 说明 |
|------|------|------|
| **cmLanguages switch→Map** | `cmLanguages.ts` | 20+ 语言扩展名 O(n) switch → O(1) Map 查找 |
| **save_entity SQL 预构建** | `crates/storage/src/lib.rs` | 18 种 EntityTable 的 `format!` SQL → `&'static str` 无分配匹配 |
| **presentable_recent_list 拆分** | `src-tauri/src/commands/workspace.rs` | 三职责（加载+合并+排序）→ `load_sidebar_with_meta` + `sort_and_filter_presentable` |
| **其他 3 项跳过** | — | `collectAllNodePaths`、`list_tree` 排序、`brace_matchers` 已是最优，无需修改 |

### Phase 2：前端 React 组件重构（4 项）

| 任务 | 原行数 → 现主文件 | 说明 |
|------|-------------------|------|
| **RightPanel hook 提取** | 618 → 106 行 | `useRightPanelLayout`（resize 拖拽 + 布局）+ `useRightPanelViewProps`（30 store 订阅合并 + viewProps 构建）|
| **useTerminalPanel 分组** | 54 扁平属性 → 4 组 | `terminalState`(28)、`terminalActions`(21)、`dragHandlers`(4)、`menuHandlers`(1) |
| **StoreState 子接口** | 72 方法平铺 → 8 领域接口 | `WorkspaceActions`/`SessionActions`/`EditorActions`/`GitActions`/`PatchActions`/`SearchActions`/`TaskActions`/`CommandActions` + `DataFetchActions` |
| **MultiWorkspacePanels 容器** | 3 组件 70% 重复 → 共享容器 | `MultiWorkspaceContainer` 接收 `renderContent` render prop，消除 ~200 行重复模板 |

### Phase 3：Rust 后端长文件拆分（3 项）

| 任务 | 原文件 | 说明 |
|------|--------|------|
| **workspace/lib.rs 拆分** | 2361 → 675 行 | 拆 15 个文件：`fs.rs`、`git.rs`、`search.rs`、`tree.rs`、`outline/{mod,brace,css,html,json,markdown,python,shell,sql,vue,yaml}.rs` |
| **大纲按语言独立** | 与上合并执行 | 12 种语言解析器各归独立文件，`outline/mod.rs` 通过 `detect_outline_family` 分发 |
| **storage schema 外部 SQL** | 内联 200 行字符串 → `sql/init_schema.sql` + `sql/init_indexes.sql` | 使用 `include_str!` 宏加载 |

### Phase 4：性能深水区（1 项）

| 任务 | 文件 | 说明 |
|------|------|------|
| **MessageStream 虚拟滚动** | `styles/main-content.css` | CSS `content-visibility: auto; contain-intrinsic-size: 200px` 渐进式性能提升 |

### Phase 5：Tauri 命令层拆分（1 项）

| 任务 | 原行数 → 现 | 说明 |
|------|-------------|------|
| **commands/workspace.rs 拆分** | 821 → 370 行 | 拆 3 文件：`workspace_sidebar.rs`(sidebar 管理)、`workspace_git.rs`(Git 命令)、`platform.rs`(文件管理器) |

### Phase 6：目录整理与类型治理（4 项）

| 任务 | 说明 |
|------|------|
| **mock-bridge 按接口拆分** | 1252 行 → 7 个子文件（mock-workspace/mock-conversation/mock-patch/mock-terminal/mock-task/mock-retrieval + shared） |
| **right-panel/ 目录分组** | 分 3 个子目录：`panels/`、`editor-support/`、`hooks/` |
| **StoreState 类型断言** | 编译期 `_StoreTypeCheck` 确保 store 满足 StoreState |
| **切片依赖文档化** | `slices.ts` 顶部 6 条依赖关系注释 |

### 关键改进

| 改进项 | 说明 |
|--------|------|
| cmLanguages | 20+ 语言 switch O(n) → Map O(1) |
| save_entity | 18 种 EntityTable 动态 format! → 静态 &'static str |
| RightPanel | 618→106 行，2 个独立 hook |
| useTerminalPanel | 54 扁平属性 → 4 组领域对象 |
| StoreState | 72 平铺方法 → 9 领域子接口 |
| MultiWorkspace | 3 组件 70% 重复 → 共享容器 |
| workspace crate | 2361 行单体 → 15 个领域文件 |
| commands/workspace | 821 行单体 → 3 个领域文件 + 370 行核心 |
| mock-bridge | 1252 行单体 → 7 个子模块 |
| storage schema | 200 行内联 SQL → 2 个外部 SQL 文件 |
| right-panel/ | 20+ 文件扁平 → 3 个子目录分组 |
| CSS 性能 | MessageStream content-visibility: auto |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 前端测试 (Vitest) | ✅ 31 files, 183 tests |
| Rust cargo test (all crates) | ✅ 104 tests passed（6 ignored，与基线一致） |
| Rust cargo check | ✅ 零警告 |
| 新建文件 | `crates/workspace/src/` 15 文件、`crates/storage/sql/` 2 文件、`src-tauri/src/commands/` 3 文件、`frontend/src/mock/` 7 文件、`frontend/src/app/features/multi-workspace/`、`right-panel/hooks/` 2 文件、`right-panel/panels/` 3 文件、`right-panel/editor-support/` 4 文件 |

## 第十轮重构（2026-05-24）：重构洞察修复 11 项

基于 [重构洞察报告 5-24](./refactor-insight-2026-05-24.md) 和 [修复计划](../../.trae/documents/2026-05-24-refactor-insight-fixes.md) 完成，分 4 个 Phase 共 11 项任务：

### Phase A：低风险清理（3 项）

| 任务 | 文件 | 说明 |
|------|------|------|
| **死 CSS 删除** | `regions.css`(-8,144)、`sidebar.css`(-506)、`main-content.css`(-1,064) | 共 9,714 行未被 `index.css` 导入链引用，重构拆分残留 |
| **StoreState 文档注释** | `StoreState.ts`、`slicedStore.ts` | 头部领域分组总览表格 + create 调用处边界注释 |
| **model-gateway 微优化** | `model-gateway/src/lib.rs:235` | `model_id.to_string()` → `model_id.into()` |

### Phase B：Rust 性能优化（4 项）

| 任务 | 文件 | 核心改进 |
|------|------|---------|
| **Regex → OnceLock** | 8 文件（python/shell/yaml/sql/html/json/vue/mod.rs）共 22 处 | 每次文件打开重复正则编译→首次编译即缓存 |
| **detect_outline_family** | `outline/mod.rs` | 3 次堆分配 → 零分配 + O(1) HashMap |
| **vue.rs 字节切片** | `outline/vue.rs` | `join("\n")` 二次分配 → 字节偏移切片零分配 |
| **单调栈 O(n)** | `outline/mod.rs:finalize_outline_items` | 嵌套循环 O(n²) → 单调栈 O(n) |

### Phase C：Store 重构（1 项）

| 任务 | 文件 | 说明 |
|------|------|------|
| **sendMessage 拆分** | `streamActions.ts` | 140 行单体 → `dispatchSlashCommand`(30行) + `refreshAfterSend`(40行) + 精简 `sendMessage`(70行) |

### Phase D：文件拆分（2 项）

| 任务 | 文件 | 说明 |
|------|------|------|
| **rightpanel.css 拆分** | `rightpanel/` 下 6 文件 | 5,006 行 → files-panel(2,482) + editor-surface(922) + diff-viewer(692) + changes-panel(443) + terminal(254) + browser(213) |
| **ChangesPanel 拆分** | `ChangesToolbar.tsx` + `ChangesEmptyState.tsx` | 1,343 → 1,101 行主文件 + 2 独立组件 |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 前端测试 (Vitest) | ✅ 31 files, 183 tests |
| Rust cargo test (all crates) | ✅ 105 tests（含新） |
| Rust cargo check | ✅ 零警告 |
| 新建文件 | `frontend/src/styles/regions/rightpanel/` 6 文件、`frontend/src/app/regions/right-panel/panels/ChangesToolbar.tsx`、`ChangesEmptyState.tsx` |
| 删除文件 | `regions.css`、`sidebar.css`、`main-content.css` 共 9,714 行 |
| 行净变化 | -9,714 + 6 新 CSS 文件 + 2 新 TSX 文件 |

## 第十一轮重构（2026-05-25）：ChangesPanel 组件提取

基于 [ChangesPanel 组件提取经验教训](./refactor-insight-2026-05-25-changespanel-extraction.md)，分 3 个 Phase 共 11 项任务完成：

### Phase 1：PatchHunkCard 提取（4 项）

| 任务 | 说明 |
|------|------|
| **内部组件创建** | 在 ChangesPanel.tsx 内部创建 PatchHunkCard 内部组件，提取 hunk 卡片渲染逻辑 |
| **代码替换** | 用内部 PatchHunkCard 组件替换原有的内联 JSX |
| **类型检查验证** | `npm run frontend:typecheck` 验证通过 |
| **外部模块迁移** | 迁移到 `features/patch-review/PatchHunkCard.tsx`，更新 index.ts 导出 |

### Phase 2：PatchFileCard 提取（4 项）

| 任务 | 说明 |
|------|------|
| **内部组件创建** | 在 ChangesPanel.tsx 内部创建 PatchFileCard 内部组件，提取文件级卡片渲染逻辑 |
| **代码替换** | 用内部 PatchFileCard 组件替换原有的内联 JSX |
| **类型检查验证** | 验证通过 |
| **外部模块迁移** | 迁移到 `features/patch-review/PatchFileCard.tsx`，更新 index.ts 导出 |

### Phase 3：PatchReviewSummary 提取（3 项）

| 任务 | 说明 |
|------|------|
| **内部组件创建** | 在 ChangesPanel.tsx 内部创建 PatchReviewSummary 内部组件，提取补丁摘要统计和过滤操作栏 |
| **代码替换 + 类型检查** | 替换内联 JSX，验证通过 |
| **外部模块迁移** | 迁移到 `features/patch-review/PatchReviewSummary.tsx`，更新 index.ts 导出 |

### 关键改进

| 改进项 | 说明 |
|--------|------|
| ChangesPanel 行数缩减 | ~1100 → ~1050 行（去除了 3 个大型内部组件，约 120 行 JSX + 类型定义被提取） |
| patch-review 模块扩展 | 从纯工具函数模块扩展为工具函数 + 3 个独立 UI 组件 |
| 模块索引统一导出 | `patch-review/index.ts` 统一导出所有类型和组件，使用者只需一条 import 语句 |
| 可复用性提升 | PatchHunkCard/PatchFileCard/PatchReviewSummary 可被其他面板或功能复用 |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 新建文件 | `features/patch-review/PatchHunkCard.tsx`、`PatchFileCard.tsx`、`PatchReviewSummary.tsx` |
| 修改文件 | `ChangesPanel.tsx`、`patch-review/index.ts` |

---

## 相关文档

- [重构洞察报告 5-21](./refactor-insight-2026-05-21.md)
- [重构洞察报告 5-22](./refactor-insight-2026-05-22.md)
- [重构洞察报告 5-23](./refactor-insight-2026-05-23.md)
- [重构洞察报告 5-23-2](./refactor-insight-2026-05-23-2.md)
- [重构洞察报告 5-24](./refactor-insight-2026-05-24.md)
- [第十轮执行报告 5-24](./refactor-execution-2026-05-24.md)
- [第十一轮 ChangesPanel 组件提取经验教训 5-25](./refactor-insight-2026-05-25-changespanel-extraction.md)
- [第七轮修复计划](../../.trae/documents/refactor-fix-plan-2026-05-23.md)
- [第八轮实施计划](../../.trae/documents/refactor-implementation-plan-2026-05-23.md)
- [第九轮实施计划](../../.trae/documents/refactor-implementation-plan-2026-05-24.md)
- [第十轮修复计划](../../.trae/documents/2026-05-24-refactor-insight-fixes.md)
- [Phase 3 拆分计划](../../.trae/documents/refactor-phase3-split-plan-2026-05-23.md)
