# 阶段 3 — 组件架构拆分计划

> 基于重构修复计划，按建议顺序依次执行全部 5 项

## 执行路线

```
→ P1 ChangesPanel.tsx → P2 CenterPane.tsx → P3 StatusBar.tsx → P4 useTerminalPanel.ts → P5 agent.rs
```

---

## P1 — ChangesPanel.tsx（1037 行 → <500 行）

### 当前问题
`panels/ChangesPanel.tsx` 包含 7 项混合职责：
1. 变更树渲染 + 多工作区导航
2. 上下文菜单（右键文件/变更）
3. 内联 ConfirmDialog（删除确认）
4. 内联 RenameInput（重命名）
5. diff 编辑器渲染（InlineDiffViewer/SideBySideDiffViewer）
6. 补丁预览（PatchReviewSummary/PatchFileCard/PatchHunkCard）
7. 拖拽排序（PatchFileCard）

### 拆分方案

| 提取模块 | 行数目标 | 内容 | 风险 |
|----------|---------|------|------|
| `ChangesTreePanel.tsx` | ~200 | 变更树渲染 + 多工作区展开/折叠 + 右键菜单 | 低 |
| `ChangesEditorPanel.tsx` | ~200 | diff 编辑器 + 粘性上下文 + 补丁预览切换 | 中 |
| `ChangesConfirmDialogs.tsx` | ~50 | ConfirmDialog + RenameInput 内联组件 | 极低 |

**文件路径**: `frontend/src/app/regions/right-panel/panels/`

### 改动步骤
1. 新建 `ChangesTreePanel.tsx` — 提取 L428-L682（multi-workspace changes tree + context menu）
2. 新建 `ChangesEditorPanel.tsx` — 提取 L789-L1007（diff editor + patch review）
3. 新建 `ChangesConfirmDialogs.tsx` — 提取 L1013-L1035（ConfirmDialog + RenameInput）
4. 更新 `ChangesPanel.tsx` — 导入 3 个新组件，主组件保持组合逻辑 ~300 行

### 验证
`npm run typecheck` && `npm test`

---

## P2 — CenterPane.tsx（629 行 → <300 行）

### 当前问题
- `ApprovalInlineCard`（L41-L83）是内联组件
- `WelcomeState`（L85-L187）是内联组件
- 编写器使用 `contentEditable` div（反模式），应替换为现有 `PromptInput.tsx` 受控组件
- Composer footer（L488-L625）可提取

### 拆分方案

| 提取模块 | 行数目标 | 内容 |
|----------|---------|------|
| `ApprovalInlineCard.tsx` | ~50 | 移到 `features/` 目录 |
| `WelcomeState.tsx` | ~110 | 移到 `features/` 目录 |
| `ComposerFooter.tsx` | ~130 | 提取 footer 组件 |
| `PromptInput` 替换 | — | 用现有受控组件替换 `contentEditable` |

**文件路径**: `frontend/src/app/regions/center-pane/`

### 改动步骤
1. 新建 `center-pane/ApprovalInlineCard.tsx`
2. 新建 `center-pane/WelcomeState.tsx`
3. 新建 `center-pane/ComposerFooter.tsx`
4. 查找 `PromptInput.tsx` 并替换 L531 的 contentEditable div
5. 更新 `CenterPane.tsx` 导入 3 个新组件

### 验证
`npm run typecheck` && `npm test`

---

## P3 — StatusBar.tsx（588 行 → <300 行）

### 当前问题
- 6 个辅助函数（L38-L108）可以直接提取
- 3 个弹出菜单（工作区/分支/模型）混合在同一组件
- Git 信息显示在状态栏最左侧

### 拆分方案

| 提取模块 | 行数目标 | 内容 |
|----------|---------|------|
| `StatusBar.utils.ts` | ~70 | 6 个辅助函数（modelLabel, gitIcon 等） |
| `StatusBarGitInfo.tsx` | ~120 | Git 分支 + 变更计数显示 |
| `StatusBarModelStatus.tsx` | ~80 | 模型健康状态 + 选择 |
| `StatusBarWorkspaceMenu.tsx` | ~100 | 工作区切换菜单 |

**文件路径**: `frontend/src/app/regions/`

### 改动步骤
1. 新建 `StatusBar/StatusBar.utils.ts`
2. 新建 `StatusBar/StatusBarGitInfo.tsx`
3. 新建 `StatusBar/StatusBarModelStatus.tsx`
4. 新建 `StatusBar/StatusBarWorkspaceMenu.tsx`
5. 更新 `StatusBar.tsx` 导入 4 个新模块

### 验证
`npm run typecheck` && `npm test`

---

## P4 — useTerminalPanel.ts（519 行 → <200 行）

### 当前问题
- 单个 hook 包含 13 个 useState、25 个 useCallback
- 返回 78 项按 4 组分组
- 混合标签管理、PTY 会话、拖拽、菜单逻辑

### 拆分方案

| 子 hook | 行数目标 | 内容 |
|---------|---------|------|
| `useTerminalTabs.ts` | ~100 | 标签 CRUD、active tab 管理、pin/reorder |
| `useTerminalSession.ts` | ~100 | PTY 连接生命周期、SSE 监听、resize/kill |
| `useTerminalDragReorder.ts` | ~60 | 拖拽排序（DnD） |
| `useTerminalContextMenu.ts` | ~40 | 右键菜单状态 |

**文件路径**: `frontend/src/app/features/terminal/`

### 改动步骤
1. 新建 `useTerminalTabs.ts`
2. 新建 `useTerminalSession.ts`
3. 新建 `useTerminalDragReorder.ts`
4. 新建 `useTerminalContextMenu.ts`
5. 更新 `useTerminalPanel.ts` — 组合 4 个子 hook，仅保留编排逻辑

### 验证
`npm run typecheck` && `npm test`

---

## P5 — agent.rs start_run_inner God Function 拆分

### 当前问题
334 行函数（L186-L519）混合 4 项职责。

### 拆分方案

| 函数 | 行数 | 职责 |
|------|------|------|
| `make_activity_emitter()` | ~30 | 创建 emit_activity 闭包（已内联在 start_run_inner 中） |
| `prepare_run()` | ~40 | 用户消息创建 + 审批日志 |
| `collect_context()` | ~110 | workspace/file/search/outline 上下文收集 |
| `execute_model_call()` | ~70 | 模型网关调用 + 审计 + 流式事件 |
| `generate_patches()` | ~50 | Patch 生成 + DB 持久化 |
| `finalize_run()` | ~60 | 完成 run + 创建 assistant 消息 + 保存会话 |

### 改动步骤
1. 在 `agent.rs` 中逐个添加上述 5 个独立函数
2. 替换 `start_run_inner` 为 6 步编排调用
3. 注意：上下文中引用的 `workspace_scope_id`、`session_id` 等变量作为参数传递

### 验证
`cargo check --workspace` && `cargo test --workspace`

---

## 验证策略

| 阶段 | 命令 |
|------|------|
| P1-P4 (前端 JS/TS) | `npm run typecheck` && `npm test` |
| P5 (Rust) | `cargo check --workspace` && `cargo test --workspace` |
