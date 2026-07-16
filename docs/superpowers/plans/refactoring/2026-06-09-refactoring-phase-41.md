# Phase 41 残余架构清理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理 06-09 重构洞察报告中发现的死代码、类型重复、层级越界、切片耦合、缺失 React.memo 及 Rust 参数过多问题，共 6 个独立子任务。

**Architecture:** 每个子任务为独立、可逆的纯化重构——删除无用代码、修复类型引用、下沉共享函数、包装记忆化组件、提取 Rust 上下文结构体。使用 TDD 流程，前端依赖 TypeScript 编译检查验证，Rust 依赖 `cargo clippy` + `cargo test` 验证。

**Tech Stack:** Rust + Tauri 2.x / React 19 + TypeScript + Zustand

**文件变更总览：**
| 操作 | 文件 |
|------|------|
| 删除 | `frontend/src/app/components/TitleBar.tsx` |
| 删除 | `frontend/src/app/components/StatusBar.tsx` |
| 创建 | `frontend/src/shared/repoMapFromEntries.ts`（从 `app/utils/` 迁入） |
| 创建 | `frontend/src/shared/preferencesMerger.ts`（从 `app/utils/` 迁入） |
| 创建 | `frontend/src/app/stores/constants.ts` |
| 修改 | `frontend/src/tauri-bridge.ts` |
| 修改 | `frontend/src/preview-bridge/index.ts` |
| 修改 | `frontend/src/mock-bridge.ts` |
| 修改 | `frontend/src/app/stores/slices/terminalSlice.ts` |
| 修改 | `frontend/src/app/stores/slices/browserSlice.ts` |
| 修改 | `frontend/src/app/stores/types.ts` |
| 修改 | `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx` |
| 修改 | `frontend/src/app/regions/right-panel/panels/FilesPanel.tsx` |
| 修改 | `frontend/src/app/features/editor/EditorSurfaceShell.tsx` |
| 创建 | `src-tauri/src/commands/agent_pipeline_types.rs` |
| 修改 | `src-tauri/src/commands/agent_pipeline.rs` |
| 修改 | `src-tauri/src/commands/mod.rs` |

---

### Task 1: 删除死代码 — components/TitleBar.tsx 和 components/StatusBar.tsx

**文件：**
- 删除：`frontend/src/app/components/TitleBar.tsx`
- 删除：`frontend/src/app/components/StatusBar.tsx`

- [ ] **Step 1: 验证两个文件确为死代码**

Run: `Select-String -Path "frontend/src/**/*.tsx","frontend/src/**/*.ts" -Pattern "from.*components/(TitleBar|StatusBar)"`
Expected: 无匹配结果

- [ ] **Step 2: 删除 TitleBar.tsx**

Run: `Remove-Item -LiteralPath "frontend/src/app/components/TitleBar.tsx"`

- [ ] **Step 3: 删除 StatusBar.tsx**

Run: `Remove-Item -LiteralPath "frontend/src/app/components/StatusBar.tsx"`

- [ ] **Step 4: 验证 TypeScript 编译通过**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/components/TitleBar.tsx frontend/src/app/components/StatusBar.tsx
git commit -m "cleanup: remove dead TitleBar and StatusBar components (replaced by regions/ variants)"
```

---

### Task 2: 类型重复消除 — terminalSlice.ts 删除重复类型定义

**文件：**
- 修改：`frontend/src/app/stores/slices/terminalSlice.ts`
- 修改：`frontend/src/app/stores/types.ts`（如需确保导出完整）
- 验证：`frontend/src/app/stores/StoreState.ts` 导入无断裂

- [ ] **Step 1: 检查 types.ts 中的现有定义**

Read: `frontend/src/app/stores/types.ts` 确认 `TerminalProfile` 和 `ToolId` 是否存在以及导出方式。

```typescript
// 期望看到的内容（示例）:
export type TerminalProfile = 'powershell' | 'bash' | 'cmd';
export type ToolId = 'files' | 'changes' | 'browser' | 'terminal' | 'audit' | 'settings' | 'models';
```

- [ ] **Step 2: 删除 terminalSlice.ts 中的本地重复定义**

在 `frontend/src/app/stores/slices/terminalSlice.ts` 中，删除第 7-9 行：

```diff
- // 本地类型定义，消除对 ui-store 的跨 store 依赖
- export type TerminalProfile = 'powershell' | 'bash' | 'cmd';
- export type ToolId = 'files' | 'changes' | 'browser' | 'terminal' | 'audit' | 'settings' | 'models';
```

添加从 `types.ts` 的导入：

```diff
+ import type { TerminalProfile, ToolId } from '../types';
```

- [ ] **Step 3: 验证 TypeScript 编译通过**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: 检查 StoreState.ts 导入链无断裂**

Run: `Select-String -Path "frontend/src/app/stores/StoreState.ts" -Pattern "TerminalProfile|ToolId"`
Expected: 确认 `StoreState.ts` 从 `stores/types.ts` 导入这些类型（而非直接从 `terminalSlice`）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/stores/slices/terminalSlice.ts
git commit -m "refactor: deduplicate TerminalProfile/ToolId types in terminalSlice"
```

---

### Task 3: 切片耦合解耦 — browserSlice 提取 localStorage key 到 shared 常量

**文件：**
- 创建：`frontend/src/app/stores/constants.ts`
- 修改：`frontend/src/app/stores/slices/browserSlice.ts`
- 修改：`frontend/src/app/stores/slices/uiSlice.ts`（将 `BROWSER_NAVIGATOR_COLLAPSED_KEY` 定义迁移）

- [ ] **Step 1: 识别所有使用 BROWSER_NAVIGATOR_COLLAPSED_KEY 的地方**

Run: `Select-String -Path "frontend/src/**/*.ts","frontend/src/**/*.tsx" -Pattern "BROWSER_NAVIGATOR_COLLAPSED_KEY"`

- [ ] **Step 2: 从 uiSlice.ts 中找到常量定义**

Read: `frontend/src/app/stores/slices/uiSlice.ts` 寻找 `BROWSER_NAVIGATOR_COLLAPSED_KEY` 定义（通常在一个 `const` 声明中）。

- [ ] **Step 3: 创建 constants.ts**

创建 `frontend/src/app/stores/constants.ts`：

```typescript
export const BROWSER_NAVIGATOR_COLLAPSED_KEY = 'browser-navigator-collapsed';
```

- [ ] **Step 4: 从 uiSlice.ts 中移除该常量**

编辑 `frontend/src/app/stores/slices/uiSlice.ts`，删除 `BROWSER_NAVIGATOR_COLLAPSED_KEY` 定义行。添加从新文件的导入：

```diff
+ import { BROWSER_NAVIGATOR_COLLAPSED_KEY } from '../constants';
```

- [ ] **Step 5: 更新 browserSlice.ts 的导入**

编辑 `frontend/src/app/stores/slices/browserSlice.ts` 第 6 行：

```diff
- import { BROWSER_NAVIGATOR_COLLAPSED_KEY } from './uiSlice';
+ import { BROWSER_NAVIGATOR_COLLAPSED_KEY } from '../constants';
```

- [ ] **Step 6: 验证 TypeScript 编译通过**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: 提交**

```bash
git add frontend/src/app/stores/constants.ts frontend/src/app/stores/slices/uiSlice.ts frontend/src/app/stores/slices/browserSlice.ts
git commit -m "refactor: extract BROWSER_NAVIGATOR_COLLAPSED_KEY to shared constants"
```

---

### Task 4: 层级越界修复 — 桥接层导入下沉到 shared/

**文件：**
- 创建：`frontend/src/shared/repoMapFromEntries.ts`
- 创建：`frontend/src/shared/preferencesMerger.ts`
- 修改：`frontend/src/tauri-bridge.ts`
- 修改：`frontend/src/preview-bridge/index.ts`
- 修改：`frontend/src/mock-bridge.ts`
- 验证：`frontend/src/app/utils/repoMapFromEntries.ts` 和 `frontend/src/app/utils/preferencesMerger.ts` 的原始导入仍有效

- [ ] **Step 1: 确认共享工具函数的纯函数性质**

Read: `frontend/src/app/utils/repoMapFromEntries.ts` — 确认其不依赖 `app/` 下的任何模块或 store 类型（只应依赖 `shared/` 或 `kernel/` 类型）。
Read: `frontend/src/app/utils/preferencesMerger.ts` — 同上。

- [ ] **Step 2: 将 repoMapFromEntries 复制到 shared/**

```bash
Copy-Item -LiteralPath "frontend/src/app/utils/repoMapFromEntries.ts" -Destination "frontend/src/shared/repoMapFromEntries.ts"
```

编辑 `frontend/src/shared/repoMapFromEntries.ts`，更新所有相对导入路径（如有）从 `../../` 调整为 `./` 或 `../`。若其导入了 `kernel/` 或 `shared/` 则无需修改。

- [ ] **Step 3: 将 preferencesMerger 复制到 shared/**

```bash
Copy-Item -LiteralPath "frontend/src/app/utils/preferencesMerger.ts" -Destination "frontend/src/shared/preferencesMerger.ts"
```

编辑 `frontend/src/shared/preferencesMerger.ts`，更新内部导入路径。

- [ ] **Step 4: 更新 tauri-bridge.ts 导入路径**

编辑 `frontend/src/tauri-bridge.ts` 第 45 行：

```diff
- import { repoMapEntriesToTree } from './app/utils/repoMapFromEntries';
+ import { repoMapEntriesToTree } from './shared/repoMapFromEntries';
```

- [ ] **Step 5: 更新 preview-bridge/index.ts 导入路径**

编辑 `frontend/src/preview-bridge/index.ts` 第 19 和 21 行：

```diff
- import { applyPreferencePatch } from '../app/utils/preferencesMerger';
- import { repoMapEntriesToTree } from '../app/utils/repoMapFromEntries';
+ import { applyPreferencePatch } from '../shared/preferencesMerger';
+ import { repoMapEntriesToTree } from '../shared/repoMapFromEntries';
```

- [ ] **Step 6: 更新 mock-bridge.ts 导入路径**

编辑 `frontend/src/mock-bridge.ts` 第 2 行：

```diff
- import { applyPreferencePatch } from './app/utils/preferencesMerger';
+ import { applyPreferencePatch } from './shared/preferencesMerger';
```

- [ ] **Step 7: 验证 TypeScript 编译通过**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: 验证原始导入路径仍可工作**

Run: `Select-String -Path "frontend/src/app/**/*.ts","frontend/src/app/**/*.tsx" -Pattern "from.*app/utils/(repoMapFromEntries|preferencesMerger)"`
Expected: 仍有匹配（`app/` 内其他组件仍在用原始路径），这没问题

- [ ] **Step 9: 提交**

```bash
git add frontend/src/shared/repoMapFromEntries.ts frontend/src/shared/preferencesMerger.ts frontend/src/tauri-bridge.ts frontend/src/preview-bridge/index.ts frontend/src/mock-bridge.ts
git commit -m "refactor: sink bridge-layer shared utils from app/utils to shared/"
```

---

### Task 5: 添加缺失的 React.memo 包装

**文件：**
- 修改：`frontend/src/app/regions/right-panel/FileNavigatorShell.tsx`
- 修改：`frontend/src/app/regions/right-panel/panels/FilesPanel.tsx`
- 修改：`frontend/src/app/features/editor/EditorSurfaceShell.tsx`

- [ ] **Step 1: 为 FileNavigatorShell.tsx 添加 React.memo**

编辑 `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx`：

找到 `function FileNavigatorShell(` 或导出的默认函数定义，包装为：

```diff
+ import React from 'react';
...
- function FileNavigatorShell(props: FileNavigatorShellProps) {
+ const FileNavigatorShell = React.memo(function FileNavigatorShell(props: FileNavigatorShellProps) {
...
- }
+ });
```

同时调整默认导出（如有 `export default function` 则改为 `export default FileNavigatorShell`）。

- [ ] **Step 2: 为 FilesPanel.tsx 添加 React.memo**

编辑 `frontend/src/app/regions/right-panel/panels/FilesPanel.tsx`：

```diff
+ const FilesPanel = React.memo(function FilesPanel(props: FilesPanelProps) {
- function FilesPanel(props: FilesPanelProps) {
...
- }
+ });
```

- [ ] **Step 3: 为 EditorSurfaceShell.tsx 添加 React.memo**

编辑 `frontend/src/app/features/editor/EditorSurfaceShell.tsx`：

```diff
+ const EditorSurfaceShell = React.memo(function EditorSurfaceShell(props: EditorSurfaceShellProps) {
- function EditorSurfaceShell(props: EditorSurfaceShellProps) {
...
- }
+ });
```

- [ ] **Step 4: 验证 TypeScript 编译通过**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: 验证 ESLint 通过**

Run: `cd frontend && npx eslint .`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add frontend/src/app/regions/right-panel/FileNavigatorShell.tsx frontend/src/app/regions/right-panel/panels/FilesPanel.tsx frontend/src/app/features/editor/EditorSurfaceShell.tsx
git commit -m "perf: add React.memo to FileNavigatorShell, FilesPanel, EditorSurfaceShell"
```

---

### Task 6: Rust 参数过多修复 — 提取上下文结构体

**文件：**
- 创建：`src-tauri/src/commands/agent_pipeline_types.rs`
- 修改：`src-tauri/src/commands/agent_pipeline.rs`
- 修改：`src-tauri/src/commands/mod.rs`
- 修改：`src-tauri/src/commands/task.rs`（如果 `save_and_emit_run_activity` 在此处调用）

- [ ] **Step 1: 创建 agent_pipeline_types.rs**

创建 `src-tauri/src/commands/agent_pipeline_types.rs`：

```rust
use crate::AppState;
use adl_kernel::workspace::WorkspaceMeta;
use adl_kernel::conversation::ConversationSessionRecord;
use adl_kernel::conversation::ConversationScenario;
use adl_kernel::context::ContextEntry;
use adl_agent_runtime::AgentRunDetail;
use crate::commands::agent::StartRunInput;
use crate::commands::audit::AuditBatchEntry;

pub struct CallModelContext<'a> {
    pub state: &'a AppState,
    pub workspace: &'a WorkspaceMeta,
    pub session: &'a ConversationSessionRecord,
    pub scenario: ConversationScenario,
    pub context: Vec<ContextEntry>,
    pub detail: &'a AgentRunDetail,
    pub input: &'a StartRunInput,
    pub app: &'a tauri::AppHandle,
    pub emit_activity: Box<dyn Fn(serde_json::Value) + 'a>,
    pub audit_batch: &'a mut Vec<AuditBatchEntry>,
}

pub struct FinalizeRunContext {
    pub state: AppState,
    pub run_id: String,
    pub workspace_path: String,
    pub detail: AgentRunDetail,
    pub status: String,
    pub ended_at: i64,
    pub final_message: String,
    pub error_message: Option<String>,
    pub context: Vec<ContextEntry>,
    pub model_usage: Option<serde_json::Value>,
    pub app: tauri::AppHandle,
}
```

- [ ] **Step 2: 注册新模块到 commands/mod.rs**

编辑 `src-tauri/src/commands/mod.rs`，添加：

```diff
+ pub mod agent_pipeline_types;
```

- [ ] **Step 3: 更新 agent_pipeline.rs — 使用 CallModelContext**

编辑 `src-tauri/src/commands/agent_pipeline.rs`：

- 移除第 236 行的 `#[allow(clippy::too_many_arguments)]`
- 将 `call_model` 签名从 10 参数改为：

```rust
pub(crate) async fn call_model(
    ctx: CallModelContext<'_>,
) -> Result<ModelResponse, AppError> {
    // 函数体内将 ctx.state、ctx.workspace 等替换原来的参数名
}
```

函数体内替换：`state` → `ctx.state`, `workspace` → `ctx.workspace`, `session` → `ctx.session`，以此类推。

- [ ] **Step 4: 更新 agent_pipeline.rs — 使用 FinalizeRunContext**

编辑 `src-tauri/src/commands/agent_pipeline.rs`：

- 移除第 369 行的 `#[allow(clippy::too_many_arguments)]`
- 将 `finalize_run` 签名从 11 参数改为：

```rust
pub(crate) fn finalize_run(
    ctx: FinalizeRunContext,
) -> Result<(), AppError> {
    // 用 ctx.state、ctx.run_id 等替换
}
```

- [ ] **Step 5: 更新所有调用方**

搜索 `call_model(` 和 `finalize_run(` 的所有调用处，构建对应的上下文结构体：

```rust
// 调用 call_model 处:
let ctx = CallModelContext {
    state: &state,
    workspace: &workspace,
    session: &session,
    scenario,
    context,
    detail: &detail,
    input: &input,
    app: &app,
    emit_activity: Box::new(emit_activity),
    audit_batch: &mut audit_batch,
};
call_model(ctx).await?
```

- [ ] **Step 6: 修复 mod.rs 中的 save_and_emit_run_activity**

编辑 `src-tauri/src/commands/mod.rs`：

- 移除第 40 行的 `#[allow(clippy::too_many_arguments)]`
- 在 `agent_pipeline_types.rs` 中添加 `RunActivityContext` 结构体
- 将 9 参数函数改为接受结构体

- [ ] **Step 7: 运行 cargo test 验证**

Run: `cargo test --workspace`
Expected: 所有测试通过

- [ ] **Step 8: 运行 cargo clippy 验证无新警告**

Run: `cargo clippy --workspace --all-targets`
Expected: 0 warnings（且不再出现 `too_many_arguments` 相关抑制）

- [ ] **Step 9: 提交**

```bash
git add src-tauri/src/commands/agent_pipeline_types.rs src-tauri/src/commands/mod.rs src-tauri/src/commands/agent_pipeline.rs
git commit -m "refactor: extract CallModelContext and FinalizeRunContext structs"
```

---

## 验证清单

所有任务完成后，执行以下全量验证：

- **前端编译检查**：`cd frontend && npx tsc --noEmit` → 0 errors
- **前端 Lint**：`cd frontend && npx eslint .` → 0 warnings
- **Rust 编译**：`cargo build --workspace` → 成功
- **Rust 测试**：`cargo test --workspace` → 全部通过
- **Rust Lint**：`cargo clippy --workspace --all-targets` → 0 warnings
- **Rust 格式**：`cargo fmt --check` → 合规
