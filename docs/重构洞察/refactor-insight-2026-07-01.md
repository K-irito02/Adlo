# 🏗️ 重构洞察报告
**生成日期**：2026-07-01
**轮次**：第 21 次洞察（项目第 91 轮）

## 1️⃣ 架构与设计

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| `frontend/src/shared/outline.ts` (862行) | 前端第二大文件（新发现）。文件大纲解析器，含 13 种语言族（markdown/brace/python/yaml/json/html/css/vue/shell/powershell/sql/config/none）的解析逻辑全部内联 | 按语言族拆分为子模块：`outline/markdown.ts`、`outline/brace.ts`、`outline/python.ts` 等，主文件作为编排器。参考 `crates/outline/` 已拆 11 模块的范例 | 🔴高 |
| `frontend/src/shared/ipc.ts` (932行) | 前端最大文件（从 1296→932）。已部分拆出 `shared/ipc/workspace.ts`(376行)，但其余 12 个子接口仍内联。IPC 契约定义极度膨胀 | 完成域拆分：`shared/ipc/app.ts`、`browser.ts`、`task.ts`、`terminal.ts`、`conversation.ts` 等，主文件变为纯 barrel re-export | 🔴高 |
| `frontend/src/shared/ipc.ts:616` | **IPC 契约错误**：`listPendingApprovals?` 标记为可选，但三个桥接层（tauri-bridge/mock-bridge/preview-bridge）和 Rust 后端（`task.rs:31` + `main.rs:131` 注册）全部实现了该方法。可选标记是陈旧的契约遗留 | 移除 `?` 使其成为必选方法，与所有实现一致 | 🔴高 |
| `frontend/src/styles.css` (4行) | 孤立遗留 shim 文件，全仓库无任何文件引用（`main.tsx:8` 直接导入 `./styles/index.css` 绕过 shim） | 删除该死文件 | 🔴高 |
| `frontend/src/app/features/browser/BrowserPanel.tsx` (778行) | 前端最大组件。已拆出 16+ 子 Hook，但主编排器仍含 10 个 useState、iframe 生命周期块、缩放状态等 | 提取 `useBrowserIframeState`（iframe 错误/历史状态）+ `useBrowserNavigatorState`（mode/address/path 状态）子 Hook | 🟡中 |
| `frontend/src/app/features/browser/useBrowserFolderActions.ts` (521行) | 最大 Hook 文件。混合文件夹 CRUD、拖拽排序、置顶等 5+ 职责 | 按操作域拆分：`useBrowserFolderCrud`（创建/重命名/删除）+ `useBrowserFolderReorder`（拖拽/置顶） | 🟡中 |
| `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx` (454行) | 变更面板状态 Hook，已拆出 Sort/Filters/Dialogs/StateUtils 子 Hook，但编排器仍大 | 验证编排器仅委托；将更多逻辑下沉到子 Hook | 🟡中 |
| `frontend/src/app/features/browser-tree/useBrowserTreeData.ts` (405行) | 浏览器树数据 Hook，含 3 个树构建器（workspace/userFolder/history）混合 | 每个 builder 提取为独立模块 `browser-tree/builders/` | 🟡中 |
| `frontend/src/app/stores/slices/browserFoldersSlice.ts` (437行) | Store Slice 超 400 行阈值。混合文件夹 CRUD、树遍历辅助函数（findFolderById/collectAllDescendantFolderIds 等 L42-80）、localStorage 持久化、拖拽逻辑、类型定义 | 提取 `browserFoldersUtils.ts`（纯树遍历辅助函数）+ `browserFoldersTypes.ts`（类型定义） | 🟡中 |
| `frontend/src/app/stores/actions/workspaceActions.ts` (425行) | 工作区 Action 超 400 行。混合树加载（loadWorkspaceTree/refreshOneWorkspaceTree 等）、导航展开切换、workspace 开闭操作 | 拆分为 `workspaceTreeActions.ts`（树加载+展开，~180行）+ 保留 `workspaceActions.ts`（开闭/pin/reorder） | 🟡中 |
| `frontend/src/app/stores/slices/githubRepoSlice.ts` (422行) | GitHub 仓库 Slice 超 400 行。混合仓库配置 CRUD、token 管理、pin/unpin、文件夹状态 | 进一步提取 token 管理到 `githubTokenActions.ts` | 🟡中 |
| `frontend/src/app/stores/slices/` browser 三切片类型环 | `browserFoldersSlice` → `browserTabsSlice` → `browserBookmarkSlice` → `browserFoldersSlice` 形成类型级循环依赖（两个 `import type` + 一个值导入）。虽无运行时循环（type-only 在编译期擦除），但影响 IDE 类型推断 | 提取共享类型（`BrowserTabState`/`TabFolderState`/`BookmarkTabItem`）和常量到 `browserSliceShared.ts` | 🟡中 |
| `frontend/src/app/stores/cacheHelpers.ts:42,49,61,74` | 4 个 `@deprecated` 缓存辅助函数（getFileDocumentCache/getChangePreviewCache/getCachedLru/setCachedLru）全仓库零引用 | 删除这 4 个废弃函数 | 🟢低 |
| `frontend/src/app/stores/slices/workspaceSlice.ts:95,109,132,146` | `@deprecated` 字段 `workspaceTree`（单数）+ setter `setWorkspaceTree` 已完成迁移到 `workspaceTrees`（复数），全仓库零调用 | 删除字段、setter、接口声明和初始值 | 🟢低 |
| `frontend/src/preview-bridge/preview-events.ts:6-8` | `onUrlChanged` 和 `onMetaChanged` 方法被返回但从未被消费——`index.ts:86-87` 内联重定义了两者，仅 `onFileChanged` 被使用 | 删除这两个死方法 | 🟢低 |

## 2️⃣ 性能优化

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| `frontend/src/styles/regions/rightpanel/diff-*.css` (3文件) | **CSS !important 滥用热点**：diff-viewer(68) + diff-inline(46) + diff-side-by-side(33) = 147 处 `!important`，且两文件存在大量重复规则（删除/插入 gutter 边框、条纹、chunk 按钮样式完全相同）。这些是应用代码而非第三方库覆盖 | 创建 `diff-shared.css`，提取共享的 gutter/stripe/button 规则，用更高特异性选择器替代 `!important`。可消除 ~40 行重复 + ~20 处 `!important` | 🔴高 |
| `diff-inline.css` + `diff-side-by-side.css` | **硬编码颜色绕过主题**：`rgba(239,68,68)`(danger红)、`rgba(34,197,94)`(success绿)、`rgba(74,222,128)`、`rgba(248,113,113)` 跨两文件重复，不响应 dark/light 主题切换 | 在 `themes.css` 定义 `--diff-danger-border`/`--diff-danger-stripe`/`--diff-success-border`/`--diff-success-stripe`/`--diff-fade-gradient` token | 🔴高 |
| `frontend/src/app/regions/right-panel/panels/communicate/GitHubLogViewer.tsx` (419行, 13 useState) | 13 个 useState 混杂：日志查看状态(4)、下拉菜单状态(4)、搜索状态(3)、其他(2)。浮窗菜单模式在多处重复 | 拆分为 3 个 Hook：`useLogViewerJobs`、`useFloatingMenu`（可复用）、`useLogSearch` | 🔴高 |
| `frontend/src/styles/` 30 文件 | **z-index 无规范**：78 处硬编码 z-index 值散布各处，无统一刻度。4 处 `z-index: ... !important`（diff-viewer:126,164,218、file-tree-browser:338、terminal-panel:28）源于魔法数字堆叠竞争 | 在 `tokens.css` 定义 z-index 刻度（`--z-base/raised/sticky/chrome/overlay/dropdown/popover/popover-top/max`），替换 78 处硬编码 | 🟡中 |
| `frontend/src/styles/index.css:19-20` + `rightpanel.css:11` | **CSS 重复导入**：`leftbar-workspace.css`、`leftbar-session.css` 被 `index.css` 和 `leftbar.css` 各导入一次；`editor-content.css` 被 `rightpanel.css` 和 `editor-surface.css` 各导入一次 | 移除 `index.css:19-20` 和 `rightpanel.css:11` 的冗余直接导入 | 🟡中 |
| `frontend/src/styles/regions/rightpanel/browser-webview.css:118` 等 | 纯硬编码颜色未用变量：`background: #fff`(L118)、`BackgroundLayer.css:10,14`(渐变)、`browser-landing.css:203`(overlay)、`file-operations.css:110,125`(surface) | 替换为 `var(--bg-strong)`/`var(--bg-overlay)`/`var(--surface-active)` 等 token | 🟡中 |
| `frontend/src/app/features/browser/browser-landing/BrowserLandingPage.tsx` (302行, 10 useState) | 对话框状态(3) + 端口菜单状态(3) + 其他(4) 混杂 | 分组：`useShortcutDialog`（dialogOpen+dialogMode+renameSite）+ `usePortRename`（portMenu+renamePortId+renamePortValue） | 🟡中 |
| `frontend/src/app/regions/left-sidebar/SessionList.tsx` (395行, 9 useState) | 拖拽状态(3) + 重命名状态 + 其他混杂 | 提取 `useSessionDragDrop`（dragSessionId+dragOverSessionId+droppedSessionId） | 🟡中 |
| `frontend/src/app/components/QuickActions.tsx:84,91,99` | 3 处硬编码 tooltip（"Skills"/"MCP Servers"/"New Workspace (Ctrl+N)"）违反 i18n 规范 | 迁移到 i18n key（`t.quickActionsSkills` 等），键盘快捷键需平台感知 | 🟡中 |
| `frontend/src/app/regions/center-pane/ComposerFooter.tsx:98,150` | 硬编码 aria-label（"Remove"/"Voice"） | 迁移到 i18n key | 🟢低 |
| `crates/adl-logging/src/manager.rs:80,83,268` | 3 处 `.lock().unwrap()` / `.as_mut().unwrap()`，与同文件其他方法（write_debug_logs/set_mode/prune_sessions 使用 `?` 传播）不一致 | 改为 `.map_err(\|_\| LogError::Config("session lock poisoned".into()))?`，与同文件模式一致 | 🟡中 |
| `src-tauri/src/commands/browser.rs:162` | `mutex.lock().expect("fetch cache mutex lock failed")`，与 `browser_pool.rs:4` 和 `browser_webview.rs:322` 的 poisoned-mutex 恢复模式不一致 | 改为 `.unwrap_or_else(\|e\| e.into_inner())`，与既有模式一致 | 🟡中 |
| `crates/ci-status/src/ci_client.rs:131` | `fetch_jobs(...).unwrap_or_default()` 静默吞错，返回空 Vec，日志映射丢失无任何追踪 | 在 fallback 前添加 `tracing::warn!(run_id, error, "fetch_jobs failed")` | 🟡中 |
| `crates/workspace/src/search.rs:62` | `fs::read_to_string(file).unwrap_or_default()` 静默返回空字符串，可能掩盖权限/IO 错误 | 在 fallback 前添加 `tracing::warn!(path, error, "failed to read file during search")` | 🟡中 |
| `src-tauri/src/commands/workspace_git.rs:41,140` | 2 处 clone 可消除：`..workspace.clone()`(L41) 和 `git_snapshot.clone()`(L140，传给 `update_workspace_after_git_change` 后又返回原值) | 字段逐个更新或 `update_workspace_after_git_change` 改为借用 `&GitSnapshot` | 🟡中 |
| `frontend/src/shared/ipc.ts:53-66` vs `crates/pty/` | `PtySessionInfo` 和 `PtyOutputEvent` 类型仅在 TS 侧定义，Rust 侧无对应 serde 契约，需手动保持同步 | 移入 `crates/kernel`（共享 serde 契约 crate），Rust 和 TS 共同派生 | 🟡中 |

## 3️⃣ 其他发现

### 3.1 架构亮点（本轮确认良好）

| 维度 | 状态 |
|------|------|
| 深层相对导入（3+ `../`） | 仅 1 处（测试文件），生产代码 100% 使用 `@` 别名 ✅ |
| useShallow 覆盖 | 179 处，多字段选择器 100% 合规 ✅ |
| React.memo 列表项 | browser-tree/github-tree/file-tree 全部 memoized ✅ |
| console.log 调试残留 | 仅 3 处（mock-bridge 2 + ErrorBoundary 1，均合理）✅ |
| transition: all | 0 处 ✅ |
| CSS >1000 行文件 | 0 个（最大 browser-webview.css 954 行）✅ |
| 前端 >800 行组件 | 0 个（最大 BrowserPanel.tsx 778 行）✅ |
| Rust >80 行函数 | 0 个 ✅ |
| Rust >300 行 lib.rs | 仅 2 个（credential 313 / command 307，均因内联测试膨胀）✅ |

### 3.2 浏览器树 vs GitHub 树 JSX 重复（重大架构机会）

`browser-tree/` 与 `github-tree/` 两个 feature 共享近乎相同的树结构架构，但作为并行文件实现：

| 组件对 | browser-tree | github-tree | 合并行 |
|--------|-------------|-------------|--------|
| CategorySection | BrowserCategorySection.tsx (83) | GitHubCategorySection.tsx (58) | 141 |
| TreeEntry | BrowserTreeEntry.tsx (185) | GitHubTreeEntry.tsx (303) | 488 |
| EntrySubEntries | BrowserEntrySubEntries.tsx (337) | GitHubEntrySubEntries.tsx (393) | 730 |
| EntryMenus | BrowserTreeEntryMenu.tsx (343) | GitHubEntryMenus.tsx (376) | 719 |

两组件仅 className 前缀（`adl-browser-*` vs `adl-github-*`）和回调类型不同。引入泛型 `<TreeCategorySection<TNode, TCallbacks>>` 共享组件可消除 ~400-500 行重复。

### 3.3 IPC 契约部分拆分

`shared/ipc.ts` 已拆出 `shared/ipc/workspace.ts`(376行) 一个子接口，但其余 12 个子接口仍内联在主文件（932行），组织不一致。完成全部域拆分后主文件可变为纯 barrel re-export。

### 3.4 回归项跟踪

| 指标 | 上轮(06-30) | 本轮(07-01) | 变化 |
|------|-------------|-------------|------|
| CSS `!important` | 311 处 | 311 处 | 持平 |
| `console.log` 残留（功能代码） | 3 处 | 3 处 | 持平 |
| React.lazy | 3 | 6 | +3 ✅ |
| 深层相对导入 | 105 处 | **1 处** | -104 ✅ |
| useShallow 覆盖 | 173 处 | 179 处 | +6 ✅ |
| Rust .clone() (commands/) | 62 处 | 62 处 | 持平 |
| Rust .unwrap() (commands/) | 2 处 | 2 处 | 持平 |
| CSS >1000 行文件 | 0 | 0 | 持平 ✅ |
| 前端 >800 行组件 | 2 | **0** (最大 778) | -2 ✅ |
| Store >400 行 Slice | 3 | 3 | 持平 |

### 📊 本轮统计数据

| 指标 | 数值 |
|------|------|
| 扫描维度 | 4（前端 TS/React、Rust、CSS、跨领域） |
| 总发现数（表格内） | 31 项（架构 15 + 性能 16） |
| 🔴 高优先级 | 7 项 |
| 🟡 中优先级 | 20 项 |
| 🟢 低优先级 | 4 项 |
| 附加发现（3.x 节） | 2 项（树 JSX 重复 + IPC 部分拆分） |
| 前端最大组件 | BrowserPanel.tsx (778行) |
| 前端最大 Hook | useBrowserFolderActions.ts (521行) |
| 前端最大非组件文件 | ipc.ts (932行) / outline.ts (862行) |
| Rust 最大文件 | webview2_message.rs (582行) |
| CSS 最大文件 | browser-webview.css (954行) |
| CSS !important 热点 | diff 系列 147 处（可优化） |
| 预测代码行变化 | 约 +300 行（新子模块） / -600 行（去重+精简） |

> 由重构洞察工作流生成于 2026-07-01（第 21 次洞察）
> 注：所有行数均已通过 PowerShell `Measure-Object -Line` 直接验证
