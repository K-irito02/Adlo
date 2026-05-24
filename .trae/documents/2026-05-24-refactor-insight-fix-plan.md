# 重构洞察问题修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复重构洞察报告（2026-05-24）中识别的全部架构与性能问题

**Architecture:** 按优先级分组执行，先解决高重复代码问题（Storage SQL），再处理性能问题（Statement 缓存），最后处理前端组件拆分和类型安全问题

**Tech Stack:** Rust (rusqlite, OnceLock) / TypeScript / React

---

## 目录

1. [Task 1: Storage EntityTable SQL 模板去重](#task-1-storage-entitytable-sql-模板去重) — 🔴 高
2. [Task 2: Storage SQL 动态构建优化](#task-2-storage-sql-动态构建优化) — 🟡 中
3. [Task 3: ChangesPanel.tsx 组件拆分](#task-3-changespaneltsx-组件拆分) — 🟡 中
4. [Task 4: window 类型断言统一](#task-4-window-类型断言统一) — 🟡 中
5. [Task 5: mock-bridge 类型安全修复](#task-5-mock-bridge-类型安全修复) — 🟡 中
6. [Task 6: Rust Mutex panic 优雅处理](#task-6-rust-mutex-panic-优雅处理) — 🟡 中
7. [Task 7: ChangesPanel useMemo 依赖优化](#task-7-changespanel-usememo-依赖优化) — 🟡 中
8. [Task 8: streamActions finally 块优化](#task-8-streamactions-finally-块优化) — 🟢 低

---

## Task 1: Storage EntityTable SQL 模板去重

**优先级:** 🔴 高

**Files:**
- Modify: `crates/storage/src/lib.rs:332-406` (`EntityTable` 枚举及其方法)
- Modify: `crates/storage/src/lib.rs:74-92` (`save_entity` 使用处)

### 步骤

- [ ] **Step 1: 分析现有结构**

读取 `crates/storage/src/lib.rs` 中 `EntityTable` 枚举定义（332-406 行），确认 24 个变体及 `as_str`、`insert_sql` 方法的具体内容。

- [ ] **Step 2: 添加静态 SQL 模板映射**

在 `impl EntityTable` 之前添加私有常量：

```rust
const TABLE_NAMES: &[&str] = &[
    "workspaces",
    "sessions",
    "retrieval_snapshots",
    "tasks",
    "approvals",
    "audit_records",
    "checkpoints",
    "conversation_messages",
    "agent_runs",
    "agent_steps",
    "tool_invocations",
    "patch_sets",
    "file_patches",
    "patch_hunks",
    "command_requests",
    "command_executions",
    "validation_results",
    "model_preferences",
    "model_call_audit",
    "run_activity_events",
    // Legacy/未使用
    "workspaces",
    "sessions",
    "retrieval_snapshots",
];

const INSERT_TEMPLATE: &str = "INSERT OR REPLACE INTO {table} (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)";
```

- [ ] **Step 3: 添加索引方法**

在 `EntityTable` impl 块中添加：

```rust
fn index(&self) -> usize {
    match self {
        Self::Workspaces => 0,
        Self::Sessions => 1,
        Self::RetrievalSnapshots => 2,
        Self::Tasks => 3,
        Self::Approvals => 4,
        Self::AuditRecords => 5,
        Self::Checkpoints => 6,
        Self::ConversationMessages => 7,
        Self::AgentRuns => 8,
        Self::AgentSteps => 9,
        Self::ToolInvocations => 10,
        Self::PatchSets => 11,
        Self::FilePatches => 12,
        Self::PatchHunks => 13,
        Self::CommandRequests => 14,
        Self::CommandExecutions => 15,
        Self::ValidationResults => 16,
        Self::ModelPreferences => 17,
        Self::ModelCallAudit => 18,
        Self::RunActivityEvents => 19,
        Self::Workspaces => 0,
        Self::Sessions => 1,
        Self::RetrievalSnapshots => 2,
    }
}
```

**注：** 枚举定义实际只有 20 个变体（去重后），需确认实际数量。

- [ ] **Step 4: 简化 `as_str` 方法**

```rust
pub fn as_str(self) -> &'static str {
    TABLE_NAMES[self.index()]
}
```

- [ ] **Step 5: 简化 `insert_sql` 方法**

```rust
pub fn insert_sql(self) -> &'static str {
    INSERT_TEMPLATE.replace("{table}", self.as_str())
}
```

- [ ] **Step 6: 运行 Rust 编译检查**

```bash
cd ai-digital-life && cargo check
```

Expected: 无编译错误

- [ ] **Step 7: 运行 storage 模块测试**

```bash
cd ai-digital-life && cargo test --package adl-storage
```

Expected: 所有测试通过

- [ ] **Step 8: 提交变更**

```bash
git add crates/storage/src/lib.rs
git commit -m "refactor(storage): deduplicate EntityTable SQL templates with const arrays"
```

---

## Task 2: Storage SQL 动态构建优化

**优先级:** 🟡 中

**Files:**
- Modify: `crates/storage/src/lib.rs` (load_entity, list_entities_filtered, delete_entity)
- Modify: `crates/storage/Cargo.toml` (如需添加 once_cell 依赖)

### 步骤

- [ ] **Step 1: 添加 OnceLock 依赖**

检查 `crates/storage/Cargo.toml` 是否已有 `once_cell` 依赖，如有则跳过。

```toml
[dependencies]
once_cell = "1.19"
```

- [ ] **Step 2: 添加预编译 SQL 语句缓存**

在 `Database` 结构体中添加：

```rust
use once_cell::sync::OnceCell;
use std::collections::HashMap;

pub struct Database {
    conn: Arc<Mutex<Connection>>,
    // 新增：预编译 SQL 语句缓存
    prepared_stmts: OnceCell<HashMap<PreparedKey, String>>,
}

#[derive(Hash, Eq, PartialEq)]
enum PreparedKey {
    SelectById(EntityTable),
    SelectAll(EntityTable),
    DeleteById(EntityTable),
}
```

- [ ] **Step 3: 实现 SQL 获取方法**

```rust
impl Database {
    fn get_select_sql(&self, table: EntityTable) -> &'static str {
        static SELECT_BY_ID: OnceLock<HashMap<EntityTable, &'static str>> = OnceLock::new();
        SELECT_BY_ID.get_or_init(|| {
            HashMap::from_iter([
                (EntityTable::Workspaces, "SELECT json FROM workspaces WHERE id = ?1"),
                // ... 其他表
            ])
        });
        SELECT_BY_ID.get().unwrap().get(&table).copied().unwrap_or("")
    }
}
```

**注：** 由于 24 个表的 SQL 完全相同（仅表名不同），可以直接复用 `EntityTable::as_str()` 构建：

```rust
fn get_select_sql(&self, table: EntityTable) -> String {
    format!("SELECT json FROM {} WHERE id = ?1", table.as_str())
}
```

但为了避免每次调用都 format!，仍需 OnceCell 缓存。

- [ ] **Step 4: 优化 `load_entity` 方法**

```rust
pub fn load_entity<T: DeserializeOwned>(
    &self,
    table: EntityTable,
    id: &str,
) -> Result<Option<T>, AppError> {
    static SELECT_SQL: OnceLock<HashMap<EntityTable, &'static str>> = OnceLock::new();
    let sql = SELECT_SQL
        .get_or_init(|| HashMap::from_iter([
            (EntityTable::Workspaces, "SELECT json FROM workspaces WHERE id = ?1"),
            (EntityTable::Sessions, "SELECT json FROM sessions WHERE id = ?1"),
            // ... 其他表
        ]))
        .get(&table)
        .copied()
        .unwrap_or("");

    let json: Option<String> = self
        .conn()?
        .query_row(sql, params![id], |row| row.get(0))
        .optional()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    json.map(|value| serde_json::from_str(&value).map_err(AppError::from))
        .transpose()
}
```

- [ ] **Step 5: 优化 `delete_entity` 方法**

```rust
pub fn delete_entity(&self, table: EntityTable, id: &str) -> Result<bool, AppError> {
    static DELETE_SQL: OnceLock<HashMap<EntityTable, &'static str>> = OnceLock::new();
    let sql = DELETE_SQL
        .get_or_init(|| HashMap::from_iter([
            (EntityTable::Workspaces, "DELETE FROM workspaces WHERE id = ?1"),
            (EntityTable::Sessions, "DELETE FROM sessions WHERE id = ?1"),
            // ... 其他表
        ]))
        .get(&table)
        .copied()
        .unwrap_or("");

    let changed = self
        .conn()?
        .execute(sql, params![id])
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(changed > 0)
}
```

- [ ] **Step 6: 运行编译和测试**

```bash
cd ai-digital-life && cargo test --package adl-storage
```

- [ ] **Step 7: 提交变更**

```bash
git add crates/storage/src/lib.rs crates/storage/Cargo.toml
git commit -m "perf(storage): cache precompiled SQL statements with OnceLock"
```

---

## Task 3: ChangesPanel.tsx 组件拆分

**优先级:** 🟡 中

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx`
- Create: `frontend/src/app/regions/right-panel/panels/PatchReviewSummary.tsx`
- Create: `frontend/src/app/regions/right-panel/panels/ChangesTreeNavigator.tsx`
- Create: `frontend/src/app/regions/right-panel/panels/ChangePreviewEditor.tsx`

### 步骤

- [ ] **Step 1: 分析 ChangesPanel.tsx 结构**

读取 ChangesPanel.tsx，识别主要功能区块：
- 686-703 行：`ChangesToolbar`（top placement）
- 705-782 行：Navigator 区域（包含 ChangesToolbar + MultiWorkspaceChangesTree 或 OutlineTree）
- 784-1112 行：主内容区（Patch Review 或 Change Preview）
- 1172-1193 行：对话框（ConfirmDialog、RenameInput）

- [ ] **Step 2: 提取 PatchReviewSummary 组件**

创建 `frontend/src/app/regions/right-panel/panels/PatchReviewSummary.tsx`：

```typescript
import type { PatchSet } from "@ai-digital-life/kernel";
import type { PatchFileSummary } from "../../../features/patch-review";
import { countReviewedHunks } from "../../../features/patch-review";
import { IconFileText } from "../../../components/Icon";
import { IconChevronDown, IconChevronRight, IconTarget } from "../../../icons";
import { TooltipSimple } from "../../../components/Tooltip";

interface PatchReviewSummaryProps {
  activePatchSet: PatchSet;
  activeSummary?: PatchFileSummary;
  patchReviewFilter: "all" | "pending" | "accepted" | "rejected";
  onSetPatchReviewFilter: (filter: "all" | "pending" | "accepted" | "rejected") => void;
  collapsedPatchHunkIds: Set<string>;
  onSelectPatchHunk: (
    relativePath: string,
    hunkId: string,
    targetLine: number,
    options?: { activateTool?: boolean }
  ) => void;
  onTogglePatchHunkCollapse: (hunkId: string) => void;
  onSetHunkDecision: (hunkId: string, decision: "pending" | "accepted" | "rejected") => void;
  t: Record<string, string | ((key: string) => string)>;
}

export function PatchReviewSummary(props: PatchReviewSummaryProps) {
  // 从原 ChangesPanel.tsx 796-991 行提取
  // ...
}
```

- [ ] **Step 3: 提取 ChangesTreeNavigator 组件**

创建 `frontend/src/app/regions/right-panel/panels/ChangesTreeNavigator.tsx`：

```typescript
interface ChangesTreeNavigatorProps {
  // 从原 ChangesPanel.tsx props 中提取导航相关部分
  t: Record<string, string | ((key: string) => string)>;
  // ... 其他导航相关 props
}

export function ChangesTreeNavigator(props: ChangesTreeNavigatorProps) {
  // 从原 ChangesPanel.tsx 705-782 行提取
  // ...
}
```

- [ ] **Step 4: 简化 ChangesPanel.tsx 主文件**

将提取的组件导入并使用，重构后主文件应仅包含：
- Props 接口定义
- 状态管理（useState, useMemo 依赖）
- 布局组合（JSX return）
- 工具函数（如 getChangeKindLabel, getEditorView）

- [ ] **Step 5: 运行 TypeScript 类型检查**

```bash
cd ai-digital-life/frontend && npm run typecheck
```

Expected: 无类型错误

- [ ] **Step 6: 运行测试**

```bash
cd ai-digital-life/frontend && npm test
```

Expected: 所有测试通过

- [ ] **Step 7: 提交变更**

```bash
git add frontend/src/app/regions/right-panel/panels/ChangesPanel/
git commit -m "refactor(frontend): split ChangesPanel into focused components"
```

---

## Task 4: window 类型断言统一

**优先级:** 🟡 中

**Files:**
- Modify: `frontend/src/preview-bridge/index.ts`
- Modify: `frontend/src/shared/ipc.ts` (如需添加类型定义)

### 步骤

- [ ] **Step 1: 定义 DigitalLifeWindow 类型**

在 `frontend/src/shared/ipc.ts` 或新建 `frontend/src/types/window.d.ts`：

```typescript
interface DigitalLifeWindow extends Window {
  digitalLife?: DigitalLifeBridge;
}

declare global {
  interface Window extends DigitalLifeWindow {}
}
```

- [ ] **Step 2: 添加类型守卫函数**

在 `frontend/src/preview-bridge/index.ts` 顶部添加：

```typescript
function hasDigitalLife(w: unknown): w is { digitalLife: DigitalLifeBridge } {
  return (
    typeof w === "object" &&
    w !== null &&
    "digitalLife" in w &&
    typeof (w as { digitalLife?: unknown }).digitalLife === "object"
  );
}
```

- [ ] **Step 3: 替换 `window as any` 断言**

```typescript
// Before: (window as any).digitalLife = previewBridge
// After:
if (typeof window !== "undefined" && !window.digitalLife) {
  window.digitalLife = previewBridge;
}
```

- [ ] **Step 4: 替换 mock-bridge 中的断言**

```typescript
// Before: (window as typeof window & { digitalLife: DigitalLifeBridge }).digitalLife
// After: 使用类型守卫或直接赋值
```

- [ ] **Step 5: 运行类型检查**

```bash
cd ai-digital-life/frontend && npm run typecheck
```

- [ ] **Step 6: 提交变更**

```bash
git add frontend/src/preview-bridge/index.ts frontend/src/mock-bridge.ts
git commit -m "type(frontend): use type-safe window assertions instead of 'as any'"
```

---

## Task 5: mock-bridge 类型安全修复

**优先级:** 🟡 中

**Files:**
- Modify: `frontend/src/mock-bridge.ts`

### 步骤

- [ ] **Step 1: 分析 mockConversation.sendMessage 类型不匹配**

读取 `frontend/src/mock/mock-conversation.ts`，确认 `sendMessage` 返回类型与 `ConversationSendResult` 的差异。

- [ ] **Step 2: 定义 MockConversationSendResult 类型**

```typescript
interface MockConversationSendResult {
  ok: true;
  data: {
    runDetail?: unknown;
    patchSet?: unknown;
  };
}
```

- [ ] **Step 3: 修复 as any 断言**

```typescript
// Before:
const result: { ok: true; data: ConversationSendResult } = await mockConversation.sendMessage({ sessionId, content: prompt }) as any;

// After:
const result = await mockConversation.sendMessage({ sessionId, content: prompt });
// 确保返回值符合预期结构
```

- [ ] **Step 4: 运行类型检查**

```bash
cd ai-digital-life/frontend && npm run typecheck
```

- [ ] **Step 5: 提交变更**

```bash
git add frontend/src/mock-bridge.ts
git commit -m "type(frontend): eliminate 'as any' in mock-bridge"
```

---

## Task 6: Rust Mutex panic 优雅处理

**优先级:** 🟡 中

**Files:**
- Modify: `src-tauri/src/setup.rs`
- Modify: `src-tauri/src/commands/app.rs`
- Modify: `src-tauri/src/commands/agent.rs`
- Create: `src-tauri/src/commands/mutex_utils.rs` (如需共享工具函数)

### 步骤

- [ ] **Step 1: 定义 MutexGuard 工具函数**

创建 `src-tauri/src/commands/mutex_utils.rs`：

```rust
use adl_errors::AppError;

/// 将 Mutex poisoning 优雅转换为 AppError，而非 panic
#[track_caller]
pub fn mutex_result<T>(result: std::sync::MutexGuard<'_, T>) -> Result<std::sync::MutexGuard<'_, T>, AppError> {
    Ok(result) // MutexGuard 解引用不会 panic，只有 lock() 失败才会
}

/// 用于 state.xxx.lock().map_err() 模式，将 poisoning 转为错误
pub fn mutex_error<T>(_: std::sync::MutexGuard<'_, T>) -> AppError {
    AppError::Internal("mutex poisoned".into())
}
```

- [ ] **Step 2: 更新 setup.rs**

```rust
// Before:
let config = state.config.lock().expect("config mutex poisoned");

// After:
let config = state.config.lock()
    .map_err(|_| AppError::Internal("config lock poisoned".into()))?;
```

- [ ] **Step 3: 更新 app.rs**

```rust
// 同样模式替换 4 处 .expect() 调用
```

- [ ] **Step 4: 更新 agent.rs**

```rust
// 替换 config.lock().expect() 调用
```

- [ ] **Step 5: 运行编译检查**

```bash
cd ai-digital-life && cargo check --package tauri-app
```

- [ ] **Step 6: 运行测试**

```bash
cd ai-digital-life && cargo test --workspace
```

- [ ] **Step 7: 提交变更**

```bash
git add src-tauri/src/commands/mutex_utils.rs src-tauri/src/setup.rs src-tauri/src/commands/app.rs src-tauri/src/commands/agent.rs
git commit -m "error(tauri): replace Mutex::expect() with graceful error handling"
```

---

## Task 7: ChangesPanel useMemo 依赖优化

**优先级:** 🟡 中

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx`

### 步骤

- [ ] **Step 1: 分析 changesTreeData 依赖问题**

识别 `changesTreeData` useMemo（592-611 行）中的依赖项：
- `workspaceChangesExpanded`
- `gitSnapshots`
- `activePatchSets`
- `collapsedPatchHunkIds`
- `changesNavigatorMode`
- `changesStatusFilter`

- [ ] **Step 2: 提取按 workspace 的独立 memo**

```typescript
// 在组件内添加
const workspaceTrees = useMemo(() => {
  const result: Record<string, ChangeTreeNode[]> = {};
  for (const wsId of Object.keys(workspaceChangesExpanded)) {
    if (!workspaceChangesExpanded[wsId]) continue;
    const snapshot = gitSnapshots[wsId];
    const patchSet = activePatchSets[wsId];
    const patchSummaries = patchSet 
      ? summarizePatchSet(patchSet, collapsedPatchHunkIds)
      : [];
    const entries = snapshot 
      ? buildChangeEntries(snapshot, patchSummaries)
      : [];
    const filtered = changesStatusFilter.size > 0 && changesStatusFilter.size < 3
      ? entries.filter((entry) => entry.states.some((state) => changesStatusFilter.has(state)))
      : entries;
    result[wsId] = changesNavigatorMode === "tree" 
      ? buildChangeTree(filtered)
      : buildFlatChangeNodes(filtered);
  }
  return result;
}, [workspaceChangesExpanded, gitSnapshots, activePatchSets, collapsedPatchHunkIds, changesNavigatorMode, changesStatusFilter]);
```

**注：** 此步骤本身可能不减少重算，但配合按需 memo 化可改善。

- [ ] **Step 3: 优化 handleSelectNavigatorNode 依赖**

```typescript
// 将 activePatchSets 相关的计算提取为 useMemo
const activePatchForPath = useMemo(() => {
  if (!selectedChangePreviewPath) return undefined;
  for (const [, patchSet] of Object.entries(activePatchSets)) {
    const summary = summarizePatchSet(patchSet, collapsedPatchHunkIds)
      .find((s) => s.relativePath === selectedChangePreviewPath);
    if (summary) return { patchSet, summary };
  }
  return undefined;
}, [activePatchSets, collapsedPatchHunkIds, selectedChangePreviewPath]);

// handleSelectNavigatorNode 可简化为
const handleSelectNavigatorNode = useCallback(
  (workspacePath: string, relativePath: string) => {
    const summaries = activePatchSet 
      ? summarizePatchSet(activePatchSet, collapsedPatchHunkIds)
      : [];
    const patchSummary = summaries.find((summary) => summary.relativePath === relativePath);
    if (patchSummary) {
      onSelectPatchFile(relativePath, {
        line: patchSummary.hunks[0]?.targetLine,
        hunkId: patchSummary.hunks[0]?.id
      });
      return;
    }
    useAppStore.getState().openChangePreviewForWorkspace(workspacePath, relativePath);
  },
  [activePatchSet, collapsedPatchHunkIds, onSelectPatchFile]
);
```

- [ ] **Step 4: 运行类型检查和测试**

```bash
cd ai-digital-life/frontend && npm run typecheck && npm test
```

- [ ] **Step 5: 提交变更**

```bash
git add frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx
git commit -m "perf(frontend): optimize useMemo dependencies in ChangesPanel"
```

---

## Task 8: streamActions finally 块优化

**优先级:** 🟢 低

**Files:**
- Modify: `frontend/src/app/stores/actions/streamActions.ts`

### 步骤

- [ ] **Step 1: 分析当前 finally 块**

读取 `streamActions.ts:221-230`，确认当前优化后的代码：

```typescript
finally {
  unsubscribe();
  unsubscribeRunActivity();
  if (get().streamingAssistantText) {  // 当前已有条件检查
    set({
      streamingAssistantText: "",
      streamingActiveRunId: undefined,
    });
  }
}
```

- [ ] **Step 2: 进一步优化为立即清除模式**

```typescript
finally {
  unsubscribe();
  unsubscribeRunActivity();
  // 在 finally 开始时立即读取并清除，避免竞态
  const hadStreaming = get().streamingAssistantText;
  if (hadStreaming) {
    set({
      streamingAssistantText: "",
      streamingActiveRunId: undefined,
    });
  }
}
```

**注：** 此优化效果有限，属于微优化。

- [ ] **Step 3: 运行测试**

```bash
cd ai-digital-life/frontend && npm test
```

- [ ] **Step 4: 提交变更**

```bash
git add frontend/src/app/stores/actions/streamActions.ts
git commit -m "perf(frontend): minor optimization in streamActions finally block"
```

---

## 执行后验证

所有任务完成后，运行完整验证：

```bash
# Rust 编译和测试
cd ai-digital-life && cargo test --workspace && cargo check

# 前端类型检查和测试
cd ai-digital-life/frontend && npm run typecheck && npm test
```

---

## 文件变更汇总

| 任务 | 新增文件 | 修改文件 |
|------|----------|----------|
| Task 1 | — | `crates/storage/src/lib.rs` |
| Task 2 | — | `crates/storage/src/lib.rs`, `crates/storage/Cargo.toml` |
| Task 3 | `PatchReviewSummary.tsx`, `ChangesTreeNavigator.tsx`, `ChangePreviewEditor.tsx` | `ChangesPanel.tsx` |
| Task 4 | — | `preview-bridge/index.ts` |
| Task 5 | — | `mock-bridge.ts` |
| Task 6 | `mutex_utils.rs` | `setup.rs`, `commands/app.rs`, `commands/agent.rs` |
| Task 7 | — | `ChangesPanel.tsx` |
| Task 8 | — | `streamActions.ts` |
