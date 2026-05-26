# Checklist — 重构洞察修复计划验证

## Phase 1 — 快赢修复

- [x] T1.1: `copyToClipboard` 3 处实现已统一到 `copy.ts` 导出版本，组件内无重复定义
- [x] T1.2: `useFileContextMenu` hook 已提取，ChangesPanel 和 FileNavigatorShell 调用同一 hook
- [x] T1.3: `normalizeTerminalTabs` 死代码已删除，无残留引用
- [x] T1.4: `ApprovalCard.tsx` 和 `ExecutionSummary.tsx` 的 React key 已使用稳定标识
- [x] T1.5: `gitSlice.ts` 未使用的 2 个类型导入已移除
- [x] T1.6: 4 处 `as any` 类型断言已替换为类型安全等价实现

## Phase 1 红绿测试验证

- [x] 前端类型检查通过：`npm --prefix frontend run typecheck` — exit 0
- [x] 前端测试通过：`npm --prefix frontend test` — 183 passed

## Phase 2 — 渲染性能与 Rust 优化

- [x] T2.1: 7 个组件已包裹 `React.memo`（DiffViewer、CodeEditor、PatchFileCard、PatchHunkCard、OutlineTree、FileTree、TreeNodeRow）
- [x] T2.2: `acceptAllHunks`/`rejectAllHunks` 已改为批量一次性 `set()`，N→1 次
- [x] T2.3: `openFileGeneric` 已合并为单次 `set()`，消除双重重渲染
- [x] T2.4: `refreshAfterBranchChange` 共享函数已提取，消除 12 行重复
- [x] T2.5: `ChangesPanel.tsx` 的 Record 类型状态已包裹 `useShallow`
- [x] T2.6: `editorSlice.ts` 已添加 `openTabsByPath` Record，`useCurrentFileTab` 改为 O(1) 查找
- [x] T2.7: Rust `workspace_sidebar.rs` `From` trait 已实现，消除 22 个 clone
- [x] T2.8: Rust `search.rs` 中 `search_text`/`search_text_async` 重复已消除
- [x] T2.9: Rust `tree.rs` `list_tree_inner` 静默错误已添加 `tracing::warn` 日志

## Phase 2 红绿测试验证

- [x] Rust 测试通过：`cargo test --workspace` — 全部 passed
- [x] 前端类型检查通过：`npm --prefix frontend run typecheck` — exit 0
- [x] 前端测试通过：`npm --prefix frontend test` — 183 passed

## Phase 3 — CSS 文件拆分

- [x] T3.1: `files-panel.css` 已拆分为 4 文件（file-tree/search-panel/outline-panel/file-badges），34 硬编码 hex 已迁移到 `tokens.css`
- [x] T3.2: `components.css` 已拆分为 5 个独立文件（button/input/badge/modal/tooltip）+ 精简 catch-all
- [x] T3.3: `leftbar.css` 已拆分为 3 个独立文件（workspace-list/session-list/conversation-panel）
- [x] T3.4: `editor-surface.css` 已拆分为 `cm-overrides.css` + `editor-tabs.css`

## Phase 3 红绿测试验证

- [x] 前端类型检查通过：`npm --prefix frontend run typecheck` — exit 0
- [x] 前端测试通过：`npm --prefix frontend test` — 183 passed（含 cmPreviewStyling）

## Phase 4 — Bundle 体积优化

- [x] T4.1: CodeMirror 语言包已改为动态 `import()` 按需加载（先前重构已完成）
- [x] T4.2: `highlight.js` 已在使用 `lib/common`（~40KB），无需修改
- [x] T4.3: `copy.ts` i18n — clipboard 工具已提取到 `utils/clipboard.ts`，保持向后兼容
- [x] T4.4: `terminalSlice.ts` 顶层同步 localStorage 已延迟（先前重构已完成）

## Phase 5 — Action 职责边界清理

- [x] T5.1: `workspaceActions.ts` 中 Git/搜索操作已迁移到对应 action 文件
- [x] T5.2: `generalActions.ts` 中 task/command 操作已迁移到 `taskActions.ts`/`commandActions.ts`
- [x] T5.3: `terminalSlice.ts` 中的 localStorage 工具和写入调度器已提取到独立模块

## Phase 5 红绿测试验证

- [x] Rust 测试通过：`cargo test --workspace` — 全部 passed
- [x] 前端类型检查通过：`npm --prefix frontend run typecheck` — exit 0
- [x] 前端测试通过：`npm --prefix frontend test` — 183 passed

## Phase 6 — 长期架构债务

- [x] T6.1: `ui-store.ts` 面板布局状态已迁移到 `uiSlice`（6 字段 + 9 setter，8 消费者更新）
- [x] T6.2: 终端状态已统一 `terminalSlice` 为唯一真源，`ui-store.ts` 终端字段标记 `@deprecated`
- [x] T6.3: `RightPanelViewProps` 已按 tool 类型拆分为 7 个独立接口
- [x] T6.4: `kernel/types.rs` 1286 行已按领域拆分为 7 个文件
- [x] T6.5: `adl-terminal` crate 已确认零 Tauri 依赖
- [x] T6.6: `workspaceTree` @deprecated 字段已从 7 个文件中完全移除
- [x] T6.7: `indexingStatus`/`repoMap` 已迁移到 `diagnosticSlice`（21 消费者零改动）
- [x] T6.8: `activeTool`/`activeRightTool` 命名已统一
- [x] T6.9: Rust run-activity 事件构造已提取公共工厂到 `crates/events`
- [x] T6.10: `IGNORED_DIRS` 已改用 `OnceLock<HashSet>` O(1) 查找

## 最终验证

- [x] 前端类型检查通过：`npm --prefix frontend run typecheck` — exit 0
- [x] 前端测试通过：`npm --prefix frontend test` — 183 passed
- [x] Rust 编译通过：`cargo check` — 零错误
- [x] Rust 测试通过：`cargo test --workspace` — 全部 passed
