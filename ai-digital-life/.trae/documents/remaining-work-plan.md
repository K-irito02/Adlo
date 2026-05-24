# 剩余工作执行计划

> 基于全面探索，此前列出的 7 项中 3 项已在前序重构完成，实际剩余 4 项。

---

## 已完成但之前错误标记为未完成（无需操作）

| 任务 | 现状 |
|------|------|
| Rust Mutex panic 优雅处理 | ✅ **已完成** — `src-tauri/src` 中无 `.lock().unwrap()`，storage 层使用 `conn()` 统一 `map_err` 降级 |
| window 类型断言统一 | ✅ **已完成** — 100+ 处调用全部统一为 `window.digitalLife.{module}.{method}()` 形式 |
| Storage SQL 模板去重 | ✅ **已完成** — 20 张表通过 `OnceLock` 缓存 4 个 SQL 模板函数 |

---

## 实际剩余工作

### R1 — agent.rs `start_run_inner` God Function 拆分（~1h）

**目标**: 将 334 行函数拆为 5 个辅助函数 + 1 个编排函数。

**方案**: 只提取**不涉及 `emit_activity` 闭包**的纯逻辑函数，避免 `dyn Fn` 的 `Send` 约束问题。

| 提取函数 | 行数 | 逻辑 |
|---------|------|------|
| `make_activity_emitter()` | ~30 | 将 `emit_activity` 闭包提升为顶层函数（已内联在 start_run_inner 中） |
| `prepare_run()` | ~20 | Session/Workspace 校验 + 用户消息创建 + 审计日志 |
| `collect_context()` | ~95 | workspace/file/outline/symbol/search 上下文收集 + 审计 + activity 事件 |
| `generate_patches()` | ~60 | Patch 创建 + DB 持久化（patch_sets/file_patches/patch_hunks） |
| `finalize_run()` | ~50 | complete_plan + 保存 + assistant 消息 + session 更新 |

**实现方式**: 直接文本操作替换 `start_run_inner`。关键决策：
- `emit_activity` 闭包的类型: 使用 `&(dyn Fn(serde_json::Value) + '_)` 作为参数类型，避免 `Box<dyn Fn>` 的 Send 约束
- `workspace_scope_id`, `session_id` 等通过参数传递，不通过闭包捕获

**验证**: `cargo check --workspace` && `cargo test --workspace`

---

### R2 — PromptInput 替换（~0.5h）

**目标**: 将 [ComposerFooter.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/center-pane/ComposerFooter.tsx) 中的 `contentEditable` div + 自定义光标替换为已有的受控 `PromptInput` 组件。

**方案**:
- 替换 `contentEditable` div (L98-117) + 自定义光标 (L118-124) 为 `<PromptInput>`
- `PromptInput` 的 props 映射:
  - `value={draft}` → `onChange` 回调更新 draft
  - `onSubmit` → handleSend
  - `placeholder={t.composerPlaceholder}`
  - `disabled={streamingActiveRunId ? true : false}`
- 移除 `composerInputRef`, `composerCaretRef`, `composerEditorRef`, `setComposerFocused`, `updateCustomCaret`, `onInput`, `onKeyDown` props（从 CenterPane 和 ComposerFooter 中）

**需要更新的文件**:
1. `ComposerFooter.tsx` — 替换 contentEditable 为 PromptInput，简化 props
2. `CenterPane.tsx` — 移除已删除 props 的传递
3. 确认 PromptInput 是否支持所需功能（auto-resize, drag-and-drop, character count）

**验证**: `npm run typecheck` && `npm test`

---

### R3 — ChangesPanel.tsx 进一步缩减（~1h）

**目标**: 将 992 行的 ChangesPanel.tsx 再提取 ~200 行，降至 ~750 行。

**剩余可提取块**:

| 提取模块 | 行数 | JSX 区域 | 风险 |
|---------|------|----------|------|
| `ChangesPatchEditor.tsx` | ~150 | L757-L920（补丁 diff 编辑器 + hunk strip + DiffToolbar + 应用/回滚按钮） | 中 — 需传递较多 props |
| `ChangesPreviewEditor.tsx` | ~80 | L922-L978（change preview 的 diff 编辑器 / CodeEditor / Markdown 预览） | 中 |

**方案**:
1. 新建 `ChangesPatchEditor.tsx` — 提取补丁审查区域的 JSX 2. 新建 `ChangesPreviewEditor.tsx` — 提取 change preview 区域的 JSX
3. 更新 `ChangesPanel.tsx` — 导入 2 个新组件，主组件组合逻辑

**验证**: `npm run typecheck` && `npm test`

---

### R4 — 工作区选择分离（~2h）

**目标**: 左侧侧边栏工作区点击只切换对话区域会话，不影响右侧面板。

**方案**（基于 [workspace_switch_separation_plan.md](file:///e:/Programs/Obsidian/notes/.trae/documents/workspace_switch_separation_plan.md)）:

| 步骤 | 文件 | 改动 |
|------|------|------|
| 1 | `stores/actions/sessionActions.ts` | 新增 `switchToWorkspace(workspaceId, workspacePath)` — 按最近会话切换，无则创建新会话 |
| 2 | `left-sidebar/WorkspaceList.tsx` | 将工作区点击事件从 `onOpenWorkspace` 改为 `onSwitchToWorkspace` |
| 3 | `LeftSidebar.tsx` | 添加 `onSwitchToWorkspace` prop，传递并实现 |
| 4 | `stores/actions/generalActions.ts` | bootstrap 中确保所有可见工作区初始展开 |
| 5 | `stores/StoreState.ts` | 添加 `switchToWorkspace` action 类型声明 |

**验证**: `npm run typecheck` && `npm test`

---

## 执行路线

```
R1 (agent.rs, ~1h) → R2 (PromptInput, ~0.5h) → R3 (ChangesPanel, ~1h) → R4 (工作区分离, ~2h)
```

每项完成后立即 `typecheck + test` 验证。

---

## 验证策略

| 步骤 | 前端验证 | Rust 验证 |
|------|---------|----------|
| R1 | — | `cargo check --workspace` && `cargo test --workspace` |
| R2 | `npm run typecheck` && `npm test` | — |
| R3 | `npm run typecheck` && `npm test` | — |
| R4 | `npm run typecheck` && `npm test` | — |
