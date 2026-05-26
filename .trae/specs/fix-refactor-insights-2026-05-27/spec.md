# 重构洞察修复计划 Spec

## Why

2026-05-27 重构洞察报告识别了约 30 项技术债务与性能问题，涵盖双 Store 架构割裂、CSS 巨型文件、渲染性能退化、Bundle 体积膨胀、代码重复等维度。本计划按执行优先级组织为 4 个阶段，逐步修复全部问题。

## What Changes

### Phase 1 — 快赢修复（改动小、风险低、收益明确）
- 统一 `copyToClipboard` 3 处实现到 `copy.ts` 导出版本
- 提取 `useFileContextMenu` 共享 hook，消除 ChangesPanel/FileNavigatorShell 中 ~200 行右键菜单重复
- 删除 `terminalSlice.ts` 中 `normalizeTerminalTabs` 死代码
- 修复 2 处数组索引作为 React key（`ApprovalCard`、`ExecutionSummary`）
- 移除 `gitSlice.ts` 未使用的 2 个类型导入
- 修复 4 处 `as any` 类型断言为类型安全的等价实现

### Phase 2 — 渲染性能与 Rust 优化
- 为 7 个核心组件添加 `React.memo`（DiffViewer、CodeEditor、PatchFileCard、PatchHunkCard、OutlineTree、FileTree、FileTreeItem）
- `patchActions.ts` 批量 hunk decision 提交，消除 N 次级联重渲染
- `editorActions.ts openFileGeneric` 合并为单次 set()
- `gitActions.ts` 提取 `refreshAfterBranchChange` 共享函数
- `ChangesPanel.tsx` 为 Record 类型状态添加 `useShallow`
- `selectors.ts` 添加 O(1) `openTabsByPath` Record，消除 `useCurrentFileTab` 的 O(n) find
- Rust: `workspace_sidebar.rs` 实现 `From<&WorkspaceMeta>` 消除 6 处 4 字段 clone
- Rust: `search.rs` 消除 `search_text` 与 `search_text_async` 的 ~50% 逻辑重复
- Rust: `tree.rs` 为 `list_tree_inner` 静默错误添加 `tracing::warn` 日志

### Phase 3 — CSS 文件拆分
- `files-panel.css` (2486 行) → 4 文件：`file-tree.css`、`search-panel.css`、`outline-panel.css`、`file-badges.css`
- 迁移 30+ 处硬编码 hex 颜色到 `tokens.css` 语义化 Token
- `components.css` (1938 行) → 按组件拆分为独立 CSS 文件
- `leftbar.css` (1117 行) → `workspace-list.css`、`session-list.css`、`conversation-panel.css`
- `editor-surface.css` (922 行) → `cm-overrides.css`、`editor-tabs.css`

### Phase 4 — Bundle 体积优化
- CodeMirror 10 语言包从静态 `import` 改为动态 `import()` 按需懒加载，消除 ~285KB 语言包（用户通常仅用 1-2 种）
- `highlight.js` 从全量 190+ 语言 (150KB+) 改为 `lib/common` 35 种常用语言 (~40KB)
- `copy.ts` i18n 翻译按模块拆分，利用 Vite tree-shaking 按需加载；`copyToClipboard` 移到 `utils/clipboard.ts`
- `terminalSlice.ts` 顶层同步 localStorage 操作延迟到 `requestIdleCallback`

### Phase 5 — Action 职责边界清理
- `workspaceActions.ts` → Git 操作迁移到 `gitActions.ts`，搜索迁移到独立 `searchActions.ts`
- `generalActions.ts` → `decideApproval`/`restoreCheckpoint` 迁移到 `taskActions.ts`，`runCommand` 迁移到 `commandActions.ts`
- `terminalSlice.ts` (358 行) → 提取 localStorage 工具、写入调度器工厂到独立模块

### Phase 6 — 长期架构债务
- Legacy `ui-store.ts` 分批迁移：第一阶段面板布局状态→`uiSlice`，第二阶段终端 UI→`terminalSlice`，第三阶段菜单/浏览器/设置→对应 slice
- 终端状态双写统一：明确 `terminalSlice` 为唯一真源
- `RightPanelViewProps` 120+ 属性接口按 tool 类型拆分
- `kernel/types.rs` 1286 行按领域拆分
- `adl-terminal` crate 解耦 Tauri 依赖
- `workspaceTree` @deprecated 字段清理
- `indexingStatus`/`repoMap` 字段迁移到 `diagnosticSlice`
- `activeTool`/`activeRightTool` 命名统一
- Rust run-activity 事件构造提取公共工厂到 `crates/events`
- `IGNORED_DIRS` 线性扫描 → HashSet O(1) 查找

## Impact

- Affected specs: 无（不涉及新增功能）
- Affected code:
  - Frontend: `frontend/src/app/stores/`、`frontend/src/app/regions/`、`frontend/src/app/features/`、`frontend/src/styles/`、`frontend/src/app/copy.ts`、`frontend/src/app/icons.tsx`
  - Rust: `src-tauri/src/commands/`、`crates/workspace/src/`、`crates/kernel/src/`
  - CSS: `frontend/src/styles/` 全局
