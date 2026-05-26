# Tasks

## Phase 1 — 快赢修复（改动小、风险低、收益明确）

- [x] Task 1.1: 统一 `copyToClipboard` 3 处实现到 `copy.ts` 导出版本
  - ✅ 确认签名兼容，ChangesPanel.tsx 和 FileNavigatorShell.tsx 已替换为共享导入
  - ✅ 两处内联 `useCallback` 定义已删除
  - ✅ 依赖数组已清理（移除 `copyToClipboard`）
- [x] Task 1.2: 提取 `useFileContextMenu` 共享 hook，消除 ~200 行右键菜单重复
  - ✅ `app/hooks/useFileContextMenu.tsx` 已创建，管理所有共享状态和逻辑
  - ✅ 参数化：`onOpenFile?`、`fileOnly?`、`isDisabled?` + 统一图标工具函数
  - ✅ ChangesPanel.tsx（-150 行）和 FileNavigatorShell.tsx（-142 行）改为调用同一 hook
- [x] Task 1.3: 删除 `terminalSlice.ts` 中 `normalizeTerminalTabs` 死代码
  - ✅ 函数定义已删除，无调用点残留
- [x] Task 1.4: 修复 2 处数组索引作为 React key
  - ✅ `ApprovalCard.tsx:L52` → `key={`impact-${idx}`}`
  - ✅ `ExecutionSummary.tsx:L62` → `key={`cmd-${i}`}`
- [x] Task 1.5: 移除 `gitSlice.ts` 未使用的 2 个类型导入
  - ✅ 已验证 `WorkspaceGitBranchCreateInput` 和 `WorkspaceGitBranchSwitchInput` 未被 GitSlice 使用
  - ✅ 导入已移除
- [x] Task 1.6: 修复 4 处 `as any` 类型断言
  - ✅ ChangesPanel.tsx:L727 → 删除冗余 `as any`（类型一致）
  - ✅ ChangesPanel.tsx:L743 → 删除冗余 `as any`（类型匹配）
  - ✅ ChangesTreePanel.tsx:L162 → 精确类型断言 `as (node) => ...`
  - ✅ editorAdapters.ts:L221 → `as MergeConfig` + 移除未使用的 `Extension` import

## Phase 2 — 渲染性能与 Rust 优化

- [x] Task 2.1: 为 7 个核心组件添加 `React.memo`
  - ✅ DiffViewer、CodeEditor、PatchFileCard、PatchHunkCard、OutlineTree、FileTree、TreeNodeRow 全部包裹 `React.memo`
  - ✅ 类型检查通过
- [x] Task 2.2: `patchActions.ts` 批量 hunk decision 提交
  - ✅ `acceptAllHunks`/`rejectAllHunks` 改为先收集变更、最后一次性 `set()`
  - ✅ 从 N 次 `set()` 降为 1 次
- [x] Task 2.3: `editorActions.ts openFileGeneric` 合并为单次 set()
  - ✅ 删除第一个单独 `set()`，非缓存路径只通过 `applyDocument` 进行一次 `set()`
- [x] Task 2.4: `gitActions.ts` 提取 `refreshAfterBranchChange` 共享函数
  - ✅ 提取为模块级函数，`switchGitBranch` 和 `createGitBranch` 都调用它
  - ✅ 消除 12 行重复代码
- [x] Task 2.5: `ChangesPanel.tsx` Record 类型状态添加 `useShallow`
  - ✅ `workspaceChangesTreeLoading` 和 `workspaceChangesTreeErrors` 已包裹 `useShallow`
- [x] Task 2.6: `selectors.ts` 添加 O(1) `openTabsByPath` Record
  - ✅ `editorSlice.ts` 新增 `openTabsByPath` Record + 同步维护
  - ✅ `useCurrentFileTab` 选择器改为 O(1) 查找
- [x] Task 2.7: Rust: `workspace_sidebar.rs` 消除 6 处 4 字段 clone
  - ✅ 在 `types.rs` 实现 `From<&WorkspaceMeta>` + `From<WorkspaceMeta>` + `update_from`
  - ✅ 6 处替换为 `.into()`，累计消除 22 个 `.clone()` 调用
- [x] Task 2.8: Rust: `search.rs` 消除 `search_text` 与 `search_text_async` 重复
  - ✅ 使用 `impl FnMut() -> bool` 统一取消机制
  - ✅ `search_text_async` 改为委托给公共 `search_text_in_files` 函数
- [x] Task 2.9: Rust: `tree.rs` 静默错误添加日志
  - ✅ `debug!` → `tracing::warn!`，附带修复 `search.rs` 中 `mut` 缺失编译错误

## Phase 3 — CSS 文件拆分

- [x] Task 3.1: `files-panel.css` (2486 行) 拆分
  - ✅ 拆分为 `file-tree.css`(858)、`search-panel.css`(204)、`outline-panel.css`(114)、`file-badges.css`(142)
  - ✅ 34 个硬编码 hex 颜色迁移到 `tokens.css` 语义化 Token
  - ✅ `rightpanel.css` 更新为导入 5 个文件
- [x] Task 3.2: `components.css` (1938 行) 拆分
  - ✅ 拆分为 `button.css`、`input.css`、`badge.css`、`modal.css`、`tooltip.css` + 精简版 `components.css`
  - ✅ `index.css` 更新为依次导入新文件
- [x] Task 3.3: `leftbar.css` (1117 行) 拆分
  - ✅ 拆分为 `workspace-list.css`、`session-list.css`、`conversation-panel.css` + 精简版 `leftbar.css`
- [x] Task 3.4: `editor-surface.css` (922 行) 拆分
  - ✅ 拆分为 `cm-overrides.css`(326) + `editor-tabs.css`(596)
  - ✅ 删除原 `editor-surface.css`

## Phase 4 — Bundle 体积优化

- [x] Task 4.1: CodeMirror 语言包动态导入
  - ✅ 已完成（先前重构中已实现）
- [x] Task 4.2: `highlight.js` 按需加载
  - ✅ 已在使用 `highlight.js/lib/common`（~40KB），无需修改
- [x] Task 4.3: `copy.ts` i18n 拆分
  - ✅ 创建 `utils/clipboard.ts`，移入 `copyToClipboard`/`copyMultiple`
  - ✅ `copy.ts` 通过 re-export 保持向后兼容
- [x] Task 4.4: `terminalSlice.ts` 顶层同步 localStorage 优化
  - ✅ 先前重构中已实现：`requestIdleCallback` 延迟 hydration

## Phase 5 — Action 职责边界清理

- [x] Task 5.1: `workspaceActions.ts` 迁移 Git/搜索操作
  - ✅ Git 操作 → `gitActions.ts`，`searchFiles` → 新建 `searchActions.ts`
  - ✅ `actions/index.ts`、`slicedStore.ts`、`StoreState.ts` 更新注册
- [x] Task 5.2: `generalActions.ts` 迁移 task/command 操作
  - ✅ `decideApproval`/`restoreCheckpoint` → 新建 `taskActions.ts`
  - ✅ `runCommand` → 新建 `commandActions.ts`
- [x] Task 5.3: `terminalSlice.ts` 拆分
  - ✅ 创建 `localStorageUtils.ts`（5 个工具函数）
  - ✅ 创建 `storageScheduler.ts`（`createStorageScheduler` 工厂）
  - ✅ terminalSlice 减少 57 行内联代码

## Phase 6 — 长期架构债务

- [x] Task 6.1: Legacy `ui-store.ts` 迁移第一阶段—面板布局
  - ✅ 6 个面板布局状态 + 9 个 setter/toggle 方法迁移到 `uiSlice`
  - ✅ 8 个消费者文件已更新（App/TitleBar/RightPanel/FilesPanel/ChangesPanel 等）
  - ✅ `ui-store.ts` 字段标记 `@deprecated`
- [x] Task 6.2: 终端状态双写统一
  - ✅ `ui-store.ts` 中 12 个终端字段/方法标记 `@deprecated`
  - ✅ `useRightPanelViewProps.ts` 已改为从 `terminalSlice` 读取终端标签页
- [x] Task 6.3: `RightPanelViewProps` 拆分
  - ✅ 拆分为 7 个 per-tool 接口（FilesPanelProps 48/ChangesPanelProps 36/BrowserPanelProps 1 等）
  - ✅ 各 panel 组件签名已更新，`ActiveToolPanel` 不再透传大对象
- [x] Task 6.4: `kernel/types.rs` 按领域拆分
  - ✅ 1286 行 → 7 个文件（mod/config/workspace/conversation/agent/command/model）
  - ✅ `pub use X::*` 保持向后兼容，cargo check 零错误
- [x] Task 6.5: `adl-terminal` crate 解耦 Tauri
  - ✅ 已确认零 Tauri 依赖，无需修改
- [x] Task 6.6: 清理 `workspaceTree` @deprecated 字段
  - ✅ 从 7 个文件中完全移除（workspaceSlice/selectors/types/useRightPanelViewProps + 3 个 action 文件）
  - ✅ 验证零消费者，唯一写入点已使用 `workspaceTrees`（复数版本）
- [x] Task 6.7: `indexingStatus`/`repoMap` 字段迁移到 `diagnosticSlice`
  - ✅ 从 workspaceSlice 完全迁移到 diagnosticSlice
  - ✅ 21 个消费者零改动（StoreState 合并层屏蔽差异）
- [x] Task 6.8: `activeTool`/`activeRightTool` 命名统一
  - ✅ `ui-store.ts` 中 `activeTool`/`setActiveTool` 重命名为 `activeRightTool`/`setActiveRightTool`
  - ✅ 5 个消费者文件更新（App/RightPanel/TitleBar/useRightPanelViewProps/ui-store）
- [x] Task 6.9: Rust run-activity 事件构造提取公共工厂
  - ✅ `crates/events` 新增 `run_activity_event()` 公共函数
  - ✅ 替换 agent.rs/task.rs/patch.rs 中 5 处内联 `json!()` 构造
- [x] Task 6.10: `IGNORED_DIRS` 改用 HashSet
  - ✅ `std::sync::OnceLock` + `HashSet<&'static str>` O(1) 查找
  - ✅ 零第三方依赖

# Task Dependencies

- Task 4.1 (CM 动态导入) 依赖于 Task 2.1 (React.memo) 完成，因为动态导入可能引入新的异步边界
- Task 6.1 (ui-store 迁移) 依赖于 Phase 5 (Action 职责清理) 完成，确保 slicedStore 基础设施稳固
- Task 6.2 (终端状态统一) 依赖于 Task 6.1 (面板布局迁移) 的部分完成
- Task 1.x 类之间无依赖关系，可并行执行
- Task 2.x 类之间无依赖关系，可并行执行
- Task 3.x (CSS) 与其他 Phase 无依赖，可并行执行
