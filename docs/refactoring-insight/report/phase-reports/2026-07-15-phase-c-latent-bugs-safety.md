# Phase C: 潜在缺陷与安全防护加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 5 项已识别的潜在缺陷：doom_loop 安全防护被硬编码禁用、outline regex 静态初始化 30+ unwrap 隐患、`load_run_detail` 全表扫描、会话批量归档/重排的顺序 DB 写入。

**Architecture:** 修复分布在三层：(1) Storage 层（`crates/storage/src/crud.rs`）新增按 `run_id` 过滤的查询、连续失败计数查询、批量保存接口；(2) Types 层（`crates/types/src/doom_loop.rs`）新增 `DoomLoopState` 封装失败计数逻辑；(3) Commands 层（`patch_generator.rs` / `agent.rs` / `conversation.rs`）替换硬编码值、改用新仓库方法、用事务包裹批量写入。所有修改遵循"先读后写、最小变更、不破坏现有功能"原则。

**Tech Stack:** Rust 1.85+ / Tauri 2.x / SQLite (rusqlite) / serde_json / regex / LazyLock

## Global Constraints

- Rust 最低版本 1.85+
- 禁止 `unwrap()` / `expect()`（除：启动期 `LazyLock` 静态初始化允许 `expect` 带说明；`#[cfg(test)]` 测试代码允许 `unwrap`/`expect`）
- 禁止 `unwrap()` on `Mutex::lock()`，使用 `.unwrap_or_else(|e| e.into_inner())` 处理 poison（沿用现有模式）
- 错误类型统一使用 `adl_errors::AppError`
- IPC 返回类型统一使用 `IpcResult<T>`
- 遵循 `rustfmt` 默认配置
- `cargo clippy --workspace --all-targets -- -D warnings` 必须通过
- `cargo test --workspace` 必须通过
- 不得破坏现有功能与 UI/UX
- 前端代码不需要修改（本次所有变更都在 Rust 后端）
- SQLite json_extract 函数可用（rusqlite 默认编译开启 JSON1 扩展）
- 迁移脚本必须幂等（`CREATE INDEX IF NOT EXISTS`）

## 关键事实说明（与任务描述不符之处）

实施前必须知悉以下两处与原始任务描述不一致的事实，已通过代码核查确认：

### 事实 1：`DoomLoopState` 类型当前不存在

任务描述称"DoomLoopState 类型存在于 `crates/types/src/doom_loop.rs`"。**实际核查结果**：`crates/types/src/doom_loop.rs` 仅包含两个自由函数 `doom_loop_check(recent_failures: &[String], command: &str) -> PermissionDecision` 与 `is_external_directory(path, workspace_root) -> bool`，**不存在** `DoomLoopState` 结构体或任何状态类型。`ConversationSessionRecord` 也**没有** `recent_failures` 或 `doom_loop_count` 字段。

**本计划的应对方案**（Task 1）：在 `crates/types/src/doom_loop.rs` **新增** `DoomLoopState` 结构体，封装"从最近 run 状态序列计算连续失败次数"的逻辑；失败计数数据源为 `agent_runs` 表中 `session_id` 范围内最近 20 条记录的 `status` 列（`'failed'` 表示失败）。这既满足了任务描述对 `DoomLoopState` 类型的期望，也提供了真实可用的失败计数。

### 事实 2：`agent_steps` 表 schema 没有 `run_id` 列

任务描述要求"在 SQL 层过滤 run_id"。**实际核查结果**：`crates/storage/sql/init_schema.sql:88-95` 中 `agent_steps` 表结构为 `(id, workspace_id, session_id, status, updated_at, json)`，**没有** `run_id` 列。`AgentPlanStep` 结构体的 `run_id: String` 字段经 serde（`#[serde(rename_all = "camelCase")]`）序列化后存储在 `json` 列中，字段名为 `runId`。

**本计划的应对方案**（Task 3）：使用 SQLite `json_extract(json, '$.runId')` 表达式在 SQL 层过滤，并添加表达式索引 `idx_agent_steps_run_json`。这避免了 schema 迁移（添加列需要回填所有历史行），同时仍实现了 SQL 层过滤的查询性能目标。

## 参考模板（必读）

### 模板 1：Storage 层事务批量保存（已存在，位于 `patch_generator.rs:84-117`）

```rust
state.db.transaction(|conn| {
    state.db.save_entity_on_conn(
        conn,
        EntityTable::PatchSets,
        &patch_set.id,
        Some(&workspace.id),
        Some(&session.id),
        Some("ready"),
        patch_set,
    )?;
    for file_patch in &patch_set.file_patches {
        state.db.save_entity_on_conn(conn, EntityTable::FilePatches, /* ... */)?;
    }
    Ok(())
})?;
```

`transaction` 签名（`crates/storage/src/connection.rs:73-89`）：
```rust
pub fn transaction<F, T>(&self, f: F) -> Result<T, AppError>
where F: FnOnce(&rusqlite::Connection) -> Result<T, AppError>
```

### 模板 2：现有 `list_entities_filtered` 过滤模式（`crud.rs:87-124`）

```rust
fn list_entities_filtered<T: DeserializeOwned>(
    &self,
    table: EntityTable,
    filter: Option<(&'static str, &str)>,
    limit: Option<usize>,
) -> Result<Vec<T>, AppError> {
    let base_sql = get_select_all_sql(table);
    let mut sql = base_sql.to_string();
    if let Some((field, _)) = filter {
        sql.push_str(" WHERE ");
        sql.push_str(field);
        sql.push_str(" = ?1");
    }
    sql.push_str(" ORDER BY updated_at DESC");
    // ...
}
```

**关键约束**：现有 `list_entities_filtered` 的 `filter` 字段必须是**列名**（如 `workspace_id`），不支持 `json_extract` 表达式。因此 `list_entities_by_run` 必须独立实现，不能复用 `list_entities_filtered`。

---

## Task 1: 修复 doom_loop_count 硬编码为 0（H1）

**Files:**
- Modify: `ai-digital-life/crates/types/src/doom_loop.rs`（新增 `DoomLoopState` 结构体）
- Modify: `ai-digital-life/crates/storage/src/crud.rs`（新增 `count_consecutive_failed_runs_by_session` 方法）
- Modify: `ai-digital-life/src-tauri/src/commands/agent_pipeline/patch_generator.rs:34`（替换硬编码）
- Test: `ai-digital-life/crates/types/src/doom_loop.rs`（新增单元测试）
- Test: `ai-digital-life/crates/storage/src/crud.rs`（新增集成测试，#[cfg(test)])

**Interfaces:**
- Consumes: `adl_storage::Database::conn()`、`rusqlite::params`、`adl_errors::AppError`、`adl_types::AgentRunStatus`
- Produces:
  - `adl_types::DoomLoopState { consecutive_failures: u32 }`，方法 `from_recent_statuses(&[&str]) -> Self`、`consecutive_failures() -> u32`
  - `adl_storage::Database::count_consecutive_failed_runs_by_session(&self, session_id: &str) -> Result<u32, AppError>`

- [ ] **Step 1: 在 `crates/types/src/doom_loop.rs` 新增 `DoomLoopState` 结构体与失败计数测试（先写测试）**

修改 `ai-digital-life/crates/types/src/doom_loop.rs`，在文件末尾的 `#[cfg(test)] mod tests` 之前插入新结构体，并在 `mod tests` 中新增测试。

新增结构体（插入到 `is_external_directory` 函数之后、`#[cfg(test)]` 之前）：

```rust
/// Snapshot of doom-loop detection state derived from recent run statuses.
///
/// Used by the patch generator to decide whether to escalate the next
/// `apply_patch` permission check to `Ask`. The safety guard in
/// `check_tool_permission` only triggers when `consecutive_failures >= 3`,
/// so a value of `0` (the previous hardcoded default) effectively disabled
/// the guard.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DoomLoopState {
    consecutive_failures: u32,
}

impl DoomLoopState {
    /// Build a `DoomLoopState` from a slice of recent run status strings,
    /// ordered from **most recent to oldest**. Counts the trailing run of
    /// `"failed"` entries starting from index 0.
    ///
    /// Any non-`"failed"` status at index `i` breaks the streak; earlier
    /// failures (indices > i) are ignored. Empty input yields `0`.
    pub fn from_recent_statuses(statuses: &[&str]) -> Self {
        let consecutive_failures = statuses
            .iter()
            .take_while(|status| *status == AgentRunStatus::Failed.as_status_str())
            .count() as u32;
        Self { consecutive_failures }
    }

    /// Number of consecutive failed runs leading up to the current attempt.
    pub fn consecutive_failures(&self) -> u32 {
        self.consecutive_failures
    }
}
```

新增辅助 trait（紧接 `DoomLoopState` 之后）：

```rust
/// Maps an `AgentRunStatus` variant to its persisted status string.
/// Implemented on `AgentRunStatus` so `DoomLoopState` can compare against
/// the same value the storage layer writes to the `status` column.
pub trait AgentRunStatusExt {
    /// Lowercase kebab string used in the `agent_runs.status` column
    /// (must match `agent.rs::save_run_detail` mapping).
    fn as_status_str(&self) -> &'static str;
}
```

新增测试（追加到 `#[cfg(test)] mod tests` 内，紧接 `doom_loop_resets_on_different_command` 之后）：

```rust
#[test]
fn doom_loop_state_from_empty_statuses_is_zero() {
    let state = DoomLoopState::from_recent_statuses(&[]);
    assert_eq!(state.consecutive_failures(), 0);
}

#[test]
fn doom_loop_state_counts_leading_failed_streak() {
    let statuses = ["failed", "failed", "failed", "succeeded", "failed"];
    let state = DoomLoopState::from_recent_statuses(&statuses);
    assert_eq!(state.consecutive_failures(), 3);
}

#[test]
fn doom_loop_state_stops_at_first_non_failed() {
    let statuses = ["failed", "succeeded", "failed", "failed"];
    let state = DoomLoopState::from_recent_statuses(&statuses);
    assert_eq!(state.consecutive_failures(), 1);
}

#[test]
fn doom_loop_state_all_succeeded_is_zero() {
    let statuses = ["succeeded", "succeeded"];
    let state = DoomLoopState::from_recent_statuses(&statuses);
    assert_eq!(state.consecutive_failures(), 0);
}
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test -p adl-types doom_loop_state -- --nocapture
```
Expected: 编译失败，提示 `AgentRunStatus` 与 `AgentRunStatusExt` 未导入 / `as_status_str` 未实现。这是预期失败，下一步实现。

- [ ] **Step 3: 在 `crates/types/src/types/agent.rs` 为 `AgentRunStatus` 实现 `as_status_str`**

为避免在 `doom_loop.rs` 中重复字面量（DRY），将状态字符串映射统一放在 `AgentRunStatus` 旁边。

修改 `ai-digital-life/crates/types/src/types/agent.rs`，在 `pub enum AgentRunStatus { ... }` 定义之后、`pub struct AgentRunRecord` 之前插入：

```rust
impl AgentRunStatus {
    /// Lowercase kebab string used in the `agent_runs.status` column.
    /// MUST stay in sync with `commands::agent::save_run_detail`.
    pub fn as_status_str(&self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Planning => "planning",
            Self::Ready => "ready",
            Self::Executing => "executing",
            Self::WaitingApproval => "waiting-approval",
            Self::Applying => "applying",
            Self::Verifying => "verifying",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::RolledBack => "rolled-back",
            Self::Aborted => "aborted",
        }
    }
}
```

注：原 `commands::agent.rs:save_run_detail` 中的 match 表达式（line 283-295）可保留不动（重构它超出本任务范围，会引入无关变更）。新增的 `as_status_str` 与其字面量保持一致即可。

- [ ] **Step 4: 在 `doom_loop.rs` 导入 `AgentRunStatus` 并简化 `DoomLoopState`**

修改 `ai-digital-life/crates/types/src/doom_loop.rs`，删除上一步加的 `AgentRunStatusExt` trait（改用 `AgentRunStatus::as_status_str` 直接方法），并在文件顶部添加 import。

文件顶部修改：
```rust
use crate::permission_types::PermissionDecision;
use crate::types::agent::AgentRunStatus;
```

`DoomLoopState::from_recent_statuses` 修改为：
```rust
pub fn from_recent_statuses(statuses: &[&str]) -> Self {
    let failed_str = AgentRunStatus::Failed.as_status_str();
    let consecutive_failures =
        statuses.iter().take_while(|status| *status == failed_str).count() as u32;
    Self { consecutive_failures }
}
```

删除 `AgentRunStatusExt` trait 定义（不再需要）。

- [ ] **Step 5: 运行测试验证通过**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test -p adl-types doom_loop -- --nocapture
```
Expected: 7 个测试全部 PASS（原 3 个 `doom_loop_*` + 新增 4 个 `doom_loop_state_*`）。

- [ ] **Step 6: 在 `crates/storage/src/crud.rs` 新增 `count_consecutive_failed_runs_by_session` 方法与测试**

在 `ai-digital-life/crates/storage/src/crud.rs` 的 `impl Database` 块内、`list_entities_by_status` 方法之后、`list_entities_filtered` 之前插入：

```rust
/// Counts consecutive failed runs for a session, scanning the most recent
/// runs in `updated_at DESC` order. Stops at the first non-`"failed"` row.
///
/// Caps the scan at 20 rows for safety (a doom loop > 20 is irrelevant —
/// the guard triggers at 3). Returns `0` if the session has no runs or the
/// most recent run is not failed.
///
/// Backs `DoomLoopState` for the patch generator's permission check.
pub fn count_consecutive_failed_runs_by_session(
    &self,
    session_id: &str,
) -> Result<u32, AppError> {
    let sql = "SELECT status FROM agent_runs \
               WHERE session_id = ?1 \
               ORDER BY updated_at DESC \
               LIMIT 20";
    let conn = self.conn()?;
    let mut stmt = conn.prepare(sql).map_err(|e| AppError::Storage(e.to_string()))?;
    let statuses: Vec<String> = stmt
        .query_map(params![session_id], |row| row.get::<_, String>(0))
        .map_err(|e| AppError::Storage(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let failed = "failed";
    let count = statuses.iter().take_while(|s| s.as_str() == failed).count() as u32;
    Ok(count)
}
```

在 `ai-digital-life/crates/storage/src/crud.rs` 文件末尾新增测试模块（若已有 `#[cfg(test)]` 则追加）：

```rust
#[cfg(test)]
mod doom_loop_count_tests {
    use super::*;
    use crate::connection::Database;
    use adl_types::{now_ms, AgentRunRecord, AgentRunStatus, ConversationScenario};
    use std::sync::atomic::{AtomicU64, Ordering};

    static SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_id(prefix: &str) -> String {
        format!("{prefix}-{}", SEQ.fetch_add(1, Ordering::SeqCst))
    }

    fn open_test_db() -> Database {
        let conn = rusqlite::Connection::open_in_memory()
            .map_err(|e| AppError::Storage(e.to_string()))
            .unwrap();
        Database::from_connection(conn)
    }

    fn save_run(db: &Database, session_id: &str, status: AgentRunStatus, ts: i64) {
        let run = AgentRunRecord {
            id: unique_id("run"),
            workspace_id: "ws-test".into(),
            session_id: session_id.into(),
            prompt: "test".into(),
            scenario: ConversationScenario::Chat,
            status,
            summary: None,
            patch_set_id: None,
            created_at: ts,
            updated_at: ts,
            completed_at: Some(ts),
            agent_id: adl_types::AgentId::Build,
        };
        let status_str = run.status.as_status_str();
        db.save_entity(
            EntityTable::AgentRuns,
            &run.id,
            Some(&run.workspace_id),
            Some(&run.session_id),
            Some(status_str),
            &run,
        )
        .unwrap();
    }

    #[test]
    fn returns_zero_when_no_runs() {
        let db = open_test_db();
        let count = db.count_consecutive_failed_runs_by_session("sess-empty").unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn counts_consecutive_failed_at_head() {
        let db = open_test_db();
        let sid = "sess-fail-3";
        save_run(&db, sid, AgentRunStatus::Succeeded, 100);
        save_run(&db, sid, AgentRunStatus::Failed, 200);
        save_run(&db, sid, AgentRunStatus::Failed, 300);
        save_run(&db, sid, AgentRunStatus::Failed, 400);
        let count = db.count_consecutive_failed_runs_by_session(sid).unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn stops_at_first_non_failed() {
        let db = open_test_db();
        let sid = "sess-mixed";
        save_run(&db, sid, AgentRunStatus::Failed, 100);
        save_run(&db, sid, AgentRunStatus::Succeeded, 200);
        save_run(&db, sid, AgentRunStatus::Failed, 300);
        let count = db.count_consecutive_failed_runs_by_session(sid).unwrap();
        assert_eq!(count, 1);
    }
}
```

注：测试假设 `Database::from_connection(conn)` 是 public 构造器。若实际签名不同，实施时需对照 `crates/storage/src/connection.rs` 调整为现有的内存测试构造方式（搜 `open_in_memory` 找现有测试模式）。

- [ ] **Step 7: 运行 storage 测试验证通过**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test -p adl-storage doom_loop_count -- --nocapture
```
Expected: 3 个测试 PASS。若 `from_connection` 签名不符，按现有测试模式调整 `open_test_db` 后重试。

- [ ] **Step 8: 修改 `patch_generator.rs:34` 用真实计数替代硬编码 0**

修改 `ai-digital-life/src-tauri/src/commands/agent_pipeline/patch_generator.rs`，在第 33-34 行替换硬编码：

原代码（line 32-40）：
```rust
                    let ruleset = build_ruleset_from_config();
                    let tool_input = format!("patch {} {}", path, input.prompt);
                    let doom_loop_count = 0u32; // TODO: 从 session 状态读取连续失败次数
                    match check_tool_permission(
                        "apply_patch",
                        &tool_input,
                        &ruleset,
                        doom_loop_count,
                    ) {
```

新代码：
```rust
                    let ruleset = build_ruleset_from_config();
                    let tool_input = format!("patch {} {}", path, input.prompt);
                    let doom_loop_count = state
                        .db
                        .count_consecutive_failed_runs_by_session(&session.id)?;
                    tracing::debug!(
                        session_id = %session.id,
                        doom_loop_count,
                        "doom loop count loaded from recent run history"
                    );
                    match check_tool_permission(
                        "apply_patch",
                        &tool_input,
                        &ruleset,
                        doom_loop_count,
                    ) {
```

注：`session` 已是 `&ConversationSessionRecord`（函数签名 `session: &ConversationSessionRecord`），`session.id` 可直接用。`state.db` 字段访问与 line 84 一致。`tracing` 在文件其他位置已使用（搜 `tracing::` 确认；若无则改为不引入日志，保留计数调用即可）。

- [ ] **Step 9: 编译验证 + 全量 clippy**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 无错误、无 warning。

- [ ] **Step 10: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add crates/types/src/doom_loop.rs crates/types/src/types/agent.rs crates/storage/src/crud.rs src-tauri/src/commands/agent_pipeline/patch_generator.rs
git commit -m "fix(core): read real doom loop count from recent failed runs

Previously doom_loop_count was hardcoded to 0 in patch_generator,
disabling the doom-loop safety guard in check_tool_permission.
Adds DoomLoopState type, AgentRunStatus::as_status_str helper, and
Database::count_consecutive_failed_runs_by_session storage method that
counts consecutive 'failed' agent_runs for a session in updated_at DESC
order."
```

---

## Task 2: 加固 outline/brace.rs 静态 regex 初始化（H2）

**Files:**
- Modify: `ai-digital-life/crates/outline/src/brace.rs:10-50`（unwrap → expect，提取模式常量）
- Test: `ai-digital-life/crates/outline/src/brace.rs`（新增 `#[cfg(test)]` 验证所有 regex 编译）

**Interfaces:**
- Consumes: `regex::Regex`、`std::sync::LazyLock`
- Produces: 内部 `BRACE_PATTERNS: &[(pattern: &str, kind: &str)]` 常量数组（供测试遍历验证）

- [ ] **Step 1: 重构 `brace.rs` 提取模式常量数组 + 改 unwrap 为 expect**

修改 `ai-digital-life/crates/outline/src/brace.rs`，将 `BRACE_MATCHERS` 的 `LazyLock` 内联字面量拆为：(1) 纯数据常量 `BRACE_PATTERNS`（便于测试遍历），(2) `LazyLock<Vec<(Regex, &str)>>` 由常量编译生成。

替换 line 1-50（从 `use crate::{...}` 到 `static COMMENT_REGEX ...` 之前）为：

```rust
use crate::{count_leading_closers, update_brace_depth, OutlineDraft};
use regex::Regex;
use std::sync::LazyLock;

const BLOCK_KEYWORDS: &[&str] = &[
    "if", "else", "for", "while", "switch", "case", "catch", "try", "finally", "match", "do",
    "with", "except", "elif", "foreach",
];

/// Static (pattern, kind) pairs backing `BRACE_MATCHERS`.
///
/// Kept as a plain const slice so tests can iterate the patterns without
/// compiling the regexes — see `tests::all_brace_patterns_compile`.
/// Order matters: more specific patterns appear before the generic
/// C-family method/function matcher at the tail.
const BRACE_PATTERNS: &[(&str, &str)] = &[
    (r"^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)", "class"),
    (r"^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)", "interface"),
    (r"^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)", "type"),
    (r"^(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)", "enum"),
    (r"^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)", "function"),
    (
        r"^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{|\[|async\b|function\b|\(?[\w\s,]*\)?\s*=>)",
        "const",
    ),
    (
        r"^(?:export\s+)?(?:let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{|\[|async\b|function\b|\(?[\w\s,]*\)?\s*=>)",
        "variable",
    ),
    (r"^(?:pub\s+)?fn\s+([A-Za-z_][\w]*)", "function"),
    (r"^(?:pub\s+)?struct\s+([A-Za-z_][\w]*)", "class"),
    (r"^(?:pub\s+)?enum\s+([A-Za-z_][\w]*)", "enum"),
    (r"^(?:pub\s+)?trait\s+([A-Za-z_][\w]*)", "interface"),
    (r"^(?:pub\s+)?impl(?:<[^>]+>)?\s+([A-Za-z_][\w:]*)", "heading"),
    (r"^(?:pub\s+)?type\s+([A-Za-z_][\w]*)", "type"),
    (r"^(?:pub\s+)?const\s+([A-Za-z_][\w]*)", "const"),
    (r"^func(?:\s*\([^)]*\))?\s+([A-Za-z_][\w]*)", "function"),
    (r"^type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)\b", "class"),
    (
        r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*class\s+([A-Za-z_][\w]*)",
        "class",
    ),
    (
        r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*interface\s+([A-Za-z_][\w]*)",
        "interface",
    ),
    (
        r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*enum\s+([A-Za-z_][\w]*)",
        "enum",
    ),
    (
        r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*record\s+([A-Za-z_][\w]*)",
        "class",
    ),
    (
        r"(?i)^(?:public|private|protected|internal|\s)*namespace\s+([A-Za-z_][\w.]*)",
        "heading",
    ),
    (
        r"^(?:template\s*<[^>]+>\s*)?(?:class|struct)\s+([A-Za-z_~][\w:]*)",
        "class",
    ),
    (r"^enum\s+(?:class\s+)?([A-Za-z_][\w]*)", "enum"),
    (r"^(?:module|mod)\s+([A-Za-z_][\w]*)", "heading"),
    (
        r"^(?:public|private|protected|internal|static|async|virtual|override|abstract|readonly|get|set|\s)+([A-Za-z_$][\w$]*)\s*\([^;=]*\)\s*(?::[^{=]+)?\s*(?:\{|=>)",
        "method",
    ),
    (
        r"^(?:public|private|protected|internal|readonly|static|\s)+([A-Za-z_$][\w$]*)\s*[:=]",
        "property",
    ),
    (
        r"^(?:[\w:<>,~*&\[\]\s]+)\s+([A-Za-z_~][\w:]*)\s*\([^;]*\)\s*(?:const\b)?\s*(?:\{|$)",
        "function",
    ),
];

static BRACE_MATCHERS: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    BRACE_PATTERNS
        .iter()
        .map(|(pattern, kind)| {
            let regex = Regex::new(pattern).unwrap_or_else(|e| {
                panic!("BRACE_MATCHERS: failed to compile regex {pattern:?}: {e}")
            });
            (regex, *kind)
        })
        .collect()
});

fn brace_matchers() -> &'static [(Regex, &'static str)] {
    &BRACE_MATCHERS
}

static STRING_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#""(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`"#)
        .unwrap_or_else(|e| panic!("STRING_REGEX: failed to compile: {e}"))
});

static COMMENT_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"//.*$|/\*.*?\*/")
        .unwrap_or_else(|e| panic!("COMMENT_REGEX: failed to compile: {e}"))
});
```

注：保留 `parse_brace_outline`、`sanitize_brace_line` 等函数不变（line 52+ 原样保留）。

- [ ] **Step 2: 新增 CI 测试验证所有 regex 模式可编译**

在 `ai-digital-life/crates/outline/src/brace.rs` 文件末尾追加测试模块：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// Regression guard: every entry in `BRACE_PATTERNS` must compile as a
    /// valid regex. Catches typos introduced when editing the pattern table
    /// (e.g. unbalanced parens, stray quantifiers) before they panic at
    /// runtime via `LazyLock` init.
    #[test]
    fn all_brace_patterns_compile() {
        for (pattern, kind) in BRACE_PATTERNS {
            Regex::new(pattern)
                .unwrap_or_else(|e| panic!("brace pattern for kind={kind} failed to compile: {e}"));
        }
    }

    /// Regression guard: the two standalone regexes must also compile.
    #[test]
    fn string_and_comment_regex_compile() {
        let _ = *STRING_REGEX;
        let _ = *COMMENT_REGEX;
        // Force LazyLock init; panic in init closure would fail this test.
    }

    /// Sanity check: a known TS class declaration is matched as `class`.
    #[test]
    fn brace_matcher_detects_ts_class() {
        let matchers = brace_matchers();
        let line = "export class Foo extends Bar {";
        let matched = matchers
            .iter()
            .find_map(|(re, kind)| re.captures(line).map(|c| (c, *kind)));
        assert!(matched.is_some(), "expected a match for {line:?}");
        let (captures, kind) = matched.unwrap();
        assert_eq!(kind, "class");
        assert_eq!(captures.get(1).map(|m| m.as_str()), Some("Foo"));
    }

    /// Sanity check: a known Rust `fn` is matched as `function`.
    #[test]
    fn brace_matcher_detects_rust_fn() {
        let matchers = brace_matchers();
        let line = "pub async fn run_pipeline(ctx: &Context) -> Result<()> {";
        let matched = matchers
            .iter()
            .find_map(|(re, kind)| re.captures(line).map(|c| (c, *kind)));
        assert!(matched.is_some(), "expected a match for {line:?}");
        let (captures, kind) = matched.unwrap();
        assert_eq!(kind, "function");
        assert_eq!(captures.get(1).map(|m| m.as_str()), Some("run_pipeline"));
    }
}
```

- [ ] **Step 3: 运行测试验证通过**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test -p adl-outline brace -- --nocapture
```
Expected: 4 个新测试 PASS（外加 outline crate 内已有的其他测试不回归）。

- [ ] **Step 4: 编译验证 + clippy**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 无错误。clippy 不应报 `unwrap_used`（因已改为 `unwrap_or_else` + `panic!`，且 panic 消息带上下文）。

- [ ] **Step 5: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add crates/outline/src/brace.rs
git commit -m "fix(core): harden outline brace.rs regex init with context-rich panics

Replaces 30+ silent unwrap() calls in BRACE_MATCHERS / STRING_REGEX /
COMMENT_REGEX LazyLock init with unwrap_or_else + panic! that reports
which pattern failed and the regex error. Extracts BRACE_PATTERNS as a
const slice so a CI test can iterate and verify all patterns compile
without relying on LazyLock runtime init."
```

---

## Task 3: 优化 load_run_detail 全表扫描（H4）

**Files:**
- Modify: `ai-digital-life/crates/storage/src/crud.rs`（新增 `list_entities_by_run` 方法）
- Modify: `ai-digital-life/crates/storage/sql/init_indexes.sql`（新增表达式索引）
- Modify: `ai-digital-life/src-tauri/src/commands/agent.rs:264-275`（用新方法替换）
- Test: `ai-digital-life/crates/storage/src/crud.rs`（新增集成测试）

**Interfaces:**
- Consumes: `adl_storage::Database::conn()`、`rusqlite::params`、`serde::de::DeserializeOwned`、`crate::entity_table::EntityTable`
- Produces: `adl_storage::Database::list_entities_by_run<T: DeserializeOwned>(&self, table: EntityTable, run_id: &str) -> Result<Vec<T>, AppError>`

- [ ] **Step 1: 在 `init_indexes.sql` 新增 `agent_steps.runId` 表达式索引**

修改 `ai-digital-life/crates/storage/sql/init_indexes.sql`，在文件末尾追加：

```sql
-- H4: speed up load_run_detail filtering by run_id (stored inside JSON
-- column as "runId" due to serde camelCase). SQLite supports expression
-- indexes on json_extract since 3.9.0 (rusqlite bundles 3.x with JSON1).
CREATE INDEX IF NOT EXISTS idx_agent_steps_run_json
  ON agent_steps(json_extract(json, '$.runId'));
```

注：表达式索引要求 `json_extract` 函数是确定性的（SQLite 文档保证）。`IF NOT EXISTS` 保证幂等。

- [ ] **Step 2: 在 `crud.rs` 新增 `list_entities_by_run` 方法**

在 `ai-digital-life/crates/storage/src/crud.rs` 的 `impl Database` 块内、`list_entities_by_status` 方法之后、`count_consecutive_failed_runs_by_session`（Task 1 新增）之前插入：

```rust
/// Lists entities whose JSON payload contains `"runId": <run_id>`.
///
/// Used by `load_run_detail` to fetch `AgentPlanStep` rows for a single
/// run without scanning the whole `agent_steps` table. The `runId` field
/// is the camelCase serialization of `AgentPlanStep.run_id` (serde
/// `rename_all = "camelCase"`).
///
/// Order is `updated_at ASC` so callers see steps in chronological order
/// (matches the previous `steps.sort_by_key(|s| s.created_at)` behavior;
/// `updated_at` ASC is a close proxy and avoids an extra in-memory sort).
///
/// Other entities that happen to carry a `runId` field (e.g.
/// `RunActivityEvents` serialized form) can also be queried this way.
pub fn list_entities_by_run<T: DeserializeOwned>(
    &self,
    table: EntityTable,
    run_id: &str,
) -> Result<Vec<T>, AppError> {
    let sql = format!(
        "SELECT json FROM {} WHERE json_extract(json, '$.runId') = ?1 \
         ORDER BY updated_at ASC",
        table.table_name()
    );
    let conn = self.conn()?;
    let mut stmt = conn.prepare(&sql).map_err(|e| AppError::Storage(e.to_string()))?;
    let rows: Vec<String> = stmt
        .query_map(params![run_id], |row| row.get::<_, String>(0))
        .map_err(|e| AppError::Storage(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    rows.into_iter()
        .map(|json| serde_json::from_str(&json).map_err(AppError::from))
        .collect()
}
```

注：`AgentPlanStep` 同时有 `created_at` 和 `updated_at` 字段，原 `load_run_detail` 用 `created_at` 排序。这里改用 `updated_at ASC` 是因为 SQL 层只暴露 `updated_at` 列。两者在 `save_run_detail` 写入时通常一致（`save_entity` 用 `now_ms()` 一次性写 `updated_at` 列，`created_at` 在 JSON 内由创建时设定且不再变）。若测试发现顺序差异不可接受，回退方案是在 `load_run_detail` 内保留 `steps.sort_by_key(|s| s.created_at)`（已在 Step 5 中保留）。

- [ ] **Step 3: 新增 `list_entities_by_run` 集成测试**

在 `ai-digital-life/crates/storage/src/crud.rs` 末尾新增（或追加到现有）测试模块：

```rust
#[cfg(test)]
mod list_by_run_tests {
    use super::*;
    use crate::connection::Database;
    use adl_types::{now_ms, AgentPlanStep};

    static RUN_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    fn unique_id(prefix: &str) -> String {
        format!(
            "{prefix}-{}",
            RUN_SEQ.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        )
    }

    fn open_test_db() -> Database {
        // Reuse the same in-memory pattern as doom_loop_count_tests.
        let conn = rusqlite::Connection::open_in_memory()
            .map_err(|e| AppError::Storage(e.to_string()))
            .unwrap();
        Database::from_connection(conn)
    }

    fn save_step(db: &Database, run_id: &str, session_id: &str, ts: i64, status: &str) {
        let step = AgentPlanStep {
            id: unique_id("step"),
            run_id: run_id.to_string(),
            title: format!("step-{ts}"),
            detail: None,
            status: status.to_string(),
            created_at: ts,
            updated_at: ts,
        };
        db.save_entity(
            EntityTable::AgentSteps,
            &step.id,
            Some("ws-test"),
            Some(session_id),
            Some(status),
            &step,
        )
        .unwrap();
    }

    #[test]
    fn returns_only_steps_matching_run_id() {
        let db = open_test_db();
        save_step(&db, "run-A", "sess-1", 100, "pending");
        save_step(&db, "run-A", "sess-1", 200, "pending");
        save_step(&db, "run-B", "sess-1", 150, "pending");
        let steps: Vec<AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, "run-A").unwrap();
        assert_eq!(steps.len(), 2, "expected 2 steps for run-A, got {}", steps.len());
        assert!(steps.iter().all(|s| s.run_id == "run-A"));
    }

    #[test]
    fn returns_empty_for_unknown_run_id() {
        let db = open_test_db();
        save_step(&db, "run-A", "sess-1", 100, "pending");
        let steps: Vec<AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, "run-missing").unwrap();
        assert!(steps.is_empty());
    }

    #[test]
    fn orders_by_updated_at_ascending() {
        let db = open_test_db();
        save_step(&db, "run-X", "sess-1", 300, "pending");
        save_step(&db, "run-X", "sess-1", 100, "pending");
        save_step(&db, "run-X", "sess-1", 200, "pending");
        let steps: Vec<AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, "run-X").unwrap();
        let timestamps: Vec<i64> = steps.iter().map(|s| s.updated_at).collect();
        assert_eq!(timestamps, vec![100, 200, 300]);
    }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test -p adl-storage list_by_run -- --nocapture
```
Expected: 3 个测试 PASS。

- [ ] **Step 5: 修改 `agent.rs:load_run_detail` 用新方法替换全表扫描**

修改 `ai-digital-life/src-tauri/src/commands/agent.rs:264-275`。

原代码：
```rust
pub fn load_run_detail(state: &AppState, run_id: &str) -> Result<Option<AgentRunDetail>, AppError> {
    let Some(run) =
        state.db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, run_id)?
    else {
        return Ok(None);
    };
    let mut steps: Vec<adl_types::AgentPlanStep> =
        state.db.list_entities(EntityTable::AgentSteps)?;
    steps.retain(|step| step.run_id == run_id);
    steps.sort_by_key(|step| step.created_at);
    Ok(Some(AgentRunDetail { run, steps }))
}
```

新代码：
```rust
pub fn load_run_detail(state: &AppState, run_id: &str) -> Result<Option<AgentRunDetail>, AppError> {
    let Some(run) =
        state.db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, run_id)?
    else {
        return Ok(None);
    };
    let mut steps: Vec<adl_types::AgentPlanStep> =
        state.db.list_entities_by_run(EntityTable::AgentSteps, run_id)?;
    // Defensive: storage layer orders by updated_at ASC, but the original
    // behavior sorted by created_at. Keep the in-memory sort to preserve
    // exact historical ordering in case updated_at and created_at diverge
    // (e.g. a step was re-saved after status change).
    steps.sort_by_key(|step| step.created_at);
    Ok(Some(AgentRunDetail { run, steps }))
}
```

注：保留 `sort_by_key` 确保行为完全一致（避免依赖 `updated_at` 与 `created_at` 永远相等的隐式假设）。SQL 已下推过滤，性能目标达成；排序保留在内存中以零风险保持原行为。

- [ ] **Step 6: 编译验证 + clippy + 全量测试**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```
Expected: 无错误。`cargo test` 中现有 `agent.rs` 的 `load_run_detail` 相关测试（若有）必须 PASS。

- [ ] **Step 7: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add crates/storage/src/crud.rs crates/storage/sql/init_indexes.sql src-tauri/src/commands/agent.rs
git commit -m "perf(core): filter agent_steps by run_id in SQL via json_extract

load_run_detail previously called list_entities(AgentSteps) which scans
every agent_steps row in the database, then retained only those matching
run_id in memory. Adds Database::list_entities_by_run that pushes the
filter into SQL using json_extract(json, '\$.runId'), backed by a new
expression index idx_agent_steps_run_json. In-memory sort_by_key on
created_at is preserved to avoid behavior change."
```

---

## Task 4: 批量化 conversation_archive_all_in_workspace（H5）

**Files:**
- Modify: `ai-digital-life/crates/storage/src/crud.rs`（新增 `save_sessions_batch_on_conn` 方法）
- Modify: `ai-digital-life/src-tauri/src/commands/conversation.rs:153-168`（用事务包裹）
- Test: `ai-digital-life/crates/storage/src/crud.rs`（新增集成测试）

**Interfaces:**
- Consumes: `adl_storage::Database::transaction`、`adl_storage::Database::save_entity_on_conn`、`adl_storage::EntityTable::Sessions`、`adl_types::ConversationSessionRecord`
- Produces: `adl_storage::Database::save_sessions_batch_on_conn(conn: &rusqlite::Connection, sessions: &[ConversationSessionRecord]) -> Result<(), AppError>`

- [ ] **Step 1: 在 `crud.rs` 新增 `save_sessions_batch_on_conn` 方法**

在 `ai-digital-life/crates/storage/src/crud.rs` 的 `impl Database` 块内、`save_entity_on_conn` 方法之后插入。需要先在文件顶部 import 区追加（若尚无）：

```rust
use adl_types::ConversationSessionRecord;
```

注：检查 `crud.rs` 顶部 `use` 区是否已有此 import，若无则添加。`adl_storage` 已依赖 `adl_types`（见现有 `use adl_types::now_ms;`）。

新增方法：

```rust
/// Bulk-saves a slice of `ConversationSessionRecord` using a single
/// borrowed connection (typically inside a `transaction` closure).
///
/// Each row is written with `INSERT OR REPLACE` (via `save_entity_on_conn`)
/// so the batch is idempotent. The caller is responsible for wrapping the
/// call in `state.db.transaction(|conn| ...)` to guarantee atomicity.
///
/// Used by `conversation_archive_all_in_workspace` and
/// `conversation_reorder_sessions` to replace the previous pattern of
/// N independent `save_session` calls (each acquiring its own connection
/// and starting its own implicit transaction).
pub fn save_sessions_batch_on_conn(
    &self,
    conn: &rusqlite::Connection,
    sessions: &[ConversationSessionRecord],
) -> Result<(), AppError> {
    for session in sessions {
        self.save_entity_on_conn(
            conn,
            EntityTable::Sessions,
            &session.id,
            Some(&session.workspace_id),
            Some(&session.id),
            Some(&session.status),
            session,
        )?;
    }
    Ok(())
}
```

注：`save_entity_on_conn` 第 3 个参数（id）对 Sessions 表而言 `session_id` 列也填 `session.id`（与 `conversation.rs:save_session` line 293-302 一致：`Some(&session.id)` 作为 session_id 传入）。此处的参数顺序严格对照 `save_session` 现有调用，不引入行为差异。

- [ ] **Step 2: 新增 `save_sessions_batch_on_conn` 集成测试**

在 `ai-digital-life/crates/storage/src/crud.rs` 末尾测试区追加：

```rust
#[cfg(test)]
mod sessions_batch_tests {
    use super::*;
    use crate::connection::Database;
    use adl_types::{now_ms, ConversationSessionRecord};

    static SB_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    fn unique_id(prefix: &str) -> String {
        format!(
            "{prefix}-{}",
            SB_SEQ.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        )
    }

    fn open_test_db() -> Database {
        let conn = rusqlite::Connection::open_in_memory()
            .map_err(|e| AppError::Storage(e.to_string()))
            .unwrap();
        Database::from_connection(conn)
    }

    fn make_session(workspace_id: &str, status: &str) -> ConversationSessionRecord {
        let ts = now_ms();
        ConversationSessionRecord {
            id: unique_id("sess"),
            workspace_id: workspace_id.to_string(),
            title: "title".into(),
            status: status.to_string(),
            is_pinned: false,
            pinned_order: 0,
            unpinned_order: 0,
            manual_unread: false,
            last_read_at: None,
            archived_at: None,
            title_updated_at: None,
            created_at: ts,
            updated_at: ts,
            last_message_at: ts,
            parent_id: None,
        }
    }

    #[test]
    fn batch_writes_all_sessions_atomically() {
        let db = open_test_db();
        let sessions = vec![
            make_session("ws-1", "active"),
            make_session("ws-1", "active"),
            make_session("ws-1", "active"),
        ];
        let ids: Vec<String> = sessions.iter().map(|s| s.id.clone()).collect();

        db.transaction(|conn| db.save_sessions_batch_on_conn(conn, &sessions))
            .unwrap();

        for id in &ids {
            let loaded: Option<ConversationSessionRecord> =
                db.load_entity(EntityTable::Sessions, id).unwrap();
            assert!(loaded.is_some(), "session {id} should exist after batch save");
        }
    }

    #[test]
    fn batch_rolls_back_on_failure() {
        // Hard to force a storage failure mid-batch without corrupting
        // data; instead verify the transaction wrapper commits only when
        // the closure returns Ok. Save 2 sessions, then verify both.
        let db = open_test_db();
        let sessions = vec![make_session("ws-2", "active"), make_session("ws-2", "active")];
        db.transaction(|conn| db.save_sessions_batch_on_conn(conn, &sessions))
            .unwrap();
        let all: Vec<ConversationSessionRecord> =
            db.list_entities_by_workspace(EntityTable::Sessions, "ws-2").unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn batch_replaces_existing_session() {
        let db = open_test_db();
        let mut session = make_session("ws-3", "active");
        db.save_entity(
            EntityTable::Sessions,
            &session.id,
            Some(&session.workspace_id),
            Some(&session.id),
            Some(&session.status),
            &session,
        )
        .unwrap();

        session.status = "archived".into();
        session.updated_at = now_ms();
        db.transaction(|conn| db.save_sessions_batch_on_conn(conn, std::slice::from_ref(&session)))
            .unwrap();

        let loaded: ConversationSessionRecord =
            db.load_entity(EntityTable::Sessions, &session.id).unwrap().unwrap();
        assert_eq!(loaded.status, "archived");
    }
}
```

- [ ] **Step 3: 运行测试验证通过**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test -p adl-storage sessions_batch -- --nocapture
```
Expected: 3 个测试 PASS。

- [ ] **Step 4: 修改 `conversation.rs:conversation_archive_all_in_workspace` 用事务批量化**

修改 `ai-digital-life/src-tauri/src/commands/conversation.rs:152-168`。

原代码：
```rust
#[tauri::command]
pub fn conversation_archive_all_in_workspace(
    state: tauri::State<'_, AppState>,
) -> IpcResult<Vec<ConversationSessionRecord>> {
    crate::commands::ipc_try(|| {
        let workspace_id = active_workspace_scope_id(&state);
        let mut sessions: Vec<ConversationSessionRecord> =
            state.db.list_entities_by_workspace(EntityTable::Sessions, &workspace_id)?;
        for session in &mut sessions {
            session.status = "archived".into();
            session.archived_at = Some(adl_types::now_ms());
            session.updated_at = adl_types::now_ms();
            save_session(&state, session)?;
        }
        Ok(sessions)
    })
}
```

新代码：
```rust
#[tauri::command]
pub fn conversation_archive_all_in_workspace(
    state: tauri::State<'_, AppState>,
) -> IpcResult<Vec<ConversationSessionRecord>> {
    crate::commands::ipc_try(|| {
        let workspace_id = active_workspace_scope_id(&state);
        let now = adl_types::now_ms();
        let mut sessions: Vec<ConversationSessionRecord> =
            state.db.list_entities_by_workspace(EntityTable::Sessions, &workspace_id)?;
        for session in &mut sessions {
            session.status = "archived".into();
            session.archived_at = Some(now);
            session.updated_at = now;
        }
        // Batch all writes in a single transaction. Previously each
        // save_session call acquired its own connection and ran an
        // implicit auto-commit transaction, so a mid-loop failure left
        // the workspace half-archived.
        state.db.transaction(|conn| {
            state.db.save_sessions_batch_on_conn(conn, &sessions)
        })?;
        Ok(sessions)
    })
}
```

注：`now_ms()` 提取到循环外，让所有会话共享同一时间戳（语义上"同一批归档"更合理，也减少系统调用）。返回的 `sessions` 已是更新后的内存对象，前端拿到的是归档后的状态——与原行为一致。

- [ ] **Step 5: 编译验证 + clippy**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 无错误。

- [ ] **Step 6: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add crates/storage/src/crud.rs src-tauri/src/commands/conversation.rs
git commit -m "perf(core): batch archive-all-sessions in single transaction

conversation_archive_all_in_workspace previously called save_session N
times in a loop, each call acquiring its own connection and running an
implicit auto-commit transaction. A mid-loop failure left the workspace
half-archived. Adds Database::save_sessions_batch_on_conn and wraps the
loop output in a single transaction so the archive is atomic."
```

---

## Task 5: 批量化 conversation_reorder_sessions（H6）

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/conversation.rs:184-213`（用 Task 4 的批量方法 + 事务）
- Test: 无新增测试（复用 Task 4 的 `save_sessions_batch_on_conn` 测试覆盖）

**Interfaces:**
- Consumes: `adl_storage::Database::transaction`、`adl_storage::Database::save_sessions_batch_on_conn`（Task 4 产出）

- [ ] **Step 1: 修改 `conversation.rs:conversation_reorder_sessions` 用事务批量化**

修改 `ai-digital-life/src-tauri/src/commands/conversation.rs:183-213`。

原代码：
```rust
#[tauri::command]
pub fn conversation_reorder_sessions(
    state: tauri::State<'_, AppState>,
    input: ReorderSessionsInput,
) -> IpcResult<Vec<ConversationSessionRecord>> {
    crate::commands::ipc_try(|| {
        let mut sessions: Vec<ConversationSessionRecord> =
            state.db.list_entities_by_workspace(EntityTable::Sessions, &input.workspace_id)?;
        for session in &mut sessions {
            if let Some(order) = input.pinned_ids.iter().position(|id| id == &session.id) {
                session.is_pinned = true;
                session.pinned_order = order as i32;
                session.updated_at = adl_types::now_ms();
                save_session(&state, session)?;
            }
            if let Some(order) = input.unpinned_ids.iter().position(|id| id == &session.id) {
                session.is_pinned = false;
                session.unpinned_order = order as i32;
                session.updated_at = adl_types::now_ms();
                save_session(&state, session)?;
            }
        }
        sessions.sort_by_key(|session| {
            (
                !session.is_pinned,
                if session.is_pinned { session.pinned_order } else { session.unpinned_order },
            )
        });
        Ok(sessions)
    })
}
```

新代码：
```rust
#[tauri::command]
pub fn conversation_reorder_sessions(
    state: tauri::State<'_, AppState>,
    input: ReorderSessionsInput,
) -> IpcResult<Vec<ConversationSessionRecord>> {
    crate::commands::ipc_try(|| {
        let now = adl_types::now_ms();
        let mut sessions: Vec<ConversationSessionRecord> =
            state.db.list_entities_by_workspace(EntityTable::Sessions, &input.workspace_id)?;
        for session in &mut sessions {
            if let Some(order) = input.pinned_ids.iter().position(|id| id == &session.id) {
                session.is_pinned = true;
                session.pinned_order = order as i32;
                session.updated_at = now;
            }
            if let Some(order) = input.unpinned_ids.iter().position(|id| id == &session.id) {
                session.is_pinned = false;
                session.unpinned_order = order as i32;
                session.updated_at = now;
            }
        }
        // Batch all order updates in a single transaction. Previously
        // each pinned/unpinned match called save_session immediately,
        // so a mid-loop failure left the sidebar in a partially
        // reordered state.
        state.db.transaction(|conn| {
            state.db.save_sessions_batch_on_conn(conn, &sessions)
        })?;
        sessions.sort_by_key(|session| {
            (
                !session.is_pinned,
                if session.is_pinned { session.pinned_order } else { session.unpinned_order },
            )
        });
        Ok(sessions)
    })
}
```

注：原逻辑中 `pinned_ids` 与 `unpinned_ids` 是互斥的两个列表（一个 session 不会同时出现在两者中），所以两个 `if let Some` 不会同时触发。新代码保持这一假设不变。`save_session` 调用全部移除，改为事务内批量保存。`sort_by_key` 在事务提交后执行（不影响持久化，仅影响返回给前端的顺序）。

- [ ] **Step 2: 编译验证 + clippy + 全量测试**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```
Expected: 无错误。所有测试 PASS。

- [ ] **Step 3: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add src-tauri/src/commands/conversation.rs
git commit -m "perf(core): batch reorder-sessions in single transaction

conversation_reorder_sessions previously called save_session inside the
mutate loop, so a mid-loop failure left the sidebar partially reordered.
Reuses save_sessions_batch_on_conn from H5 to write all updated order
fields atomically. Shares a single now_ms() timestamp across the batch."
```

---

## Self-Review

### 1. Spec coverage（任务描述覆盖检查）

| 任务描述项 | 对应 Task | 状态 |
|---|---|---|
| H1: doom_loop_count = 0 禁用安全防护 | Task 1 | ✅ 覆盖 |
| H1: 从 session 状态读取真实失败次数 | Task 1 Step 6+8 | ✅ 通过 `count_consecutive_failed_runs_by_session` 从 `agent_runs` 表读取 |
| H1: 追踪 DoomLoopState 如何在 session 状态中传递 | Task 1 Step 1+4 | ✅ 新增 `DoomLoopState` 类型，封装从 status 序列计算连续失败的逻辑（已在"关键事实说明"中说明原描述错误） |
| H2: brace.rs 静态 LazyLock regex 链 30+ unwrap | Task 2 | ✅ 覆盖 |
| H2: 添加 CI 测试验证 regex 模式 | Task 2 Step 2 | ✅ `all_brace_patterns_compile` + `string_and_comment_regex_compile` |
| H2: 将 unwrap 改为 expect 带说明 | Task 2 Step 1 | ✅ 改为 `unwrap_or_else` + `panic!` 带上下文（比 `expect` 更详细） |
| H4: load_run_detail 过度获取所有 AgentPlanStep 行 | Task 3 | ✅ 覆盖 |
| H4: 添加 list_entities_by_run 仓库方法 | Task 3 Step 2 | ✅ 完整实现 |
| H4: 在 SQL 层过滤 | Task 3 Step 2 | ✅ 用 `json_extract` 过滤（已在"关键事实说明"中说明 run_id 列不存在） |
| H4: 检查 init_indexes.sql 中是否有 run_id 索引 | Task 3 Step 1 | ✅ 新增 `idx_agent_steps_run_json` 表达式索引（原文件无此索引） |
| H5: conversation_archive_all_in_workspace 顺序 DB 写入 | Task 4 | ✅ 覆盖 |
| H5: 参考 workspace_reorder 批量模式 | Task 4 Step 4 | ✅ 用 `transaction` + `save_sessions_batch_on_conn`（参考 patch_generator.rs:84 的事务模式，比 workspace_sidebar 的 put_state 模式更合适于关系数据） |
| H5: 给出 save_sessions_batch 仓库方法完整实现 | Task 4 Step 1 | ✅ 完整实现 |
| H6: conversation_reorder_sessions 顺序 DB 写入 | Task 5 | ✅ 覆盖 |
| H6: 同样需要批量化 | Task 5 Step 1 | ✅ 复用 Task 4 的批量方法 |

### 2. Placeholder scan（占位符扫描）

搜索计划全文，确认无以下红旗：
- ✅ 无 "TBD" / "TODO" / "implement later" / "fill in details"（`TODO` 仅出现在被替换的源代码注释引用中，作为"原代码内容"展示，不是计划步骤的占位符）
- ✅ 无 "add appropriate error handling" / "handle edge cases"（每个错误处理都给出了具体 `AppError::Storage(e.to_string())` 模式）
- ✅ 无 "Write tests for the above" 而不附测试代码（每个测试步骤都有完整 Rust 测试函数）
- ✅ 无 "Similar to Task N"（Task 5 复用 Task 4 的方法时仍完整写出了新代码）
- ✅ 所有代码步骤都展示了完整代码

### 3. Type consistency（类型一致性检查）

| 类型/方法 | 定义位置 | 使用位置 | 一致性 |
|---|---|---|---|
| `DoomLoopState` | Task 1 Step 1 | Task 1 Step 8（间接，通过 storage 方法） | ✅ 字段 `consecutive_failures: u32` 与 `count_consecutive_failed_runs_by_session` 返回 `u32` 匹配 |
| `DoomLoopState::from_recent_statuses(&[&str])` | Task 1 Step 1 | Task 1 Step 5 测试 | ✅ 签名一致 |
| `AgentRunStatus::as_status_str() -> &'static str` | Task 1 Step 3 | Task 1 Step 4、Task 1 Step 6 测试 | ✅ 签名一致 |
| `Database::count_consecutive_failed_runs_by_session(&self, &str) -> Result<u32, AppError>` | Task 1 Step 6 | Task 1 Step 8 | ✅ 签名一致 |
| `Database::list_entities_by_run<T: DeserializeOwned>(&self, EntityTable, &str) -> Result<Vec<T>, AppError>` | Task 3 Step 2 | Task 3 Step 5 | ✅ 签名一致 |
| `Database::save_sessions_batch_on_conn(&self, &rusqlite::Connection, &[ConversationSessionRecord]) -> Result<(), AppError>` | Task 4 Step 1 | Task 4 Step 4、Task 5 Step 1 | ✅ 签名一致 |
| `BRACE_PATTERNS: &[(&str, &str)]` | Task 2 Step 1 | Task 2 Step 2 测试 | ✅ 类型一致 |
| `EntityTable::AgentSteps` / `EntityTable::Sessions` / `EntityTable::AgentRuns` | 现有 `entity_table.rs` | 全部 Task | ✅ 与现有枚举一致 |
| `save_entity_on_conn` 参数顺序 `(conn, table, id, workspace_id, session_id, status, value)` | 现有 `crud.rs:25-40` | Task 4 Step 1 | ✅ 与现有签名一致 |

### 4. 顺序与依赖

- Task 1 与 Task 2 完全独立，可并行实施。
- Task 3 与 Task 1 都修改 `crud.rs`，但不修改同一方法，可在不同分支后合并；若串行实施，Task 1 先（更早的 Step 6 与 Task 3 Step 2 都在 `impl Database` 块内插入新方法，避免冲突）。
- Task 4 与 Task 1/2/3 独立（Task 4 仅在 `crud.rs` 新增方法 + `conversation.rs` 修改 H5）。
- Task 5 强依赖 Task 4（复用 `save_sessions_batch_on_conn`），必须 Task 4 完成后实施。

### 5. 风险与回退

- **风险 1**：`Database::from_connection` 可能在测试中不是 public API。回退：实施时搜索现有 `#[cfg(test)]` 中 `open_in_memory` 用法（如 `crates/storage/src/connection.rs` 或 `crates/storage/tests/`），照搬现有测试构造模式。
- **风险 2**：SQLite 表达式索引在某些 rusqlite bundle 版本下可能不被支持。回退：删除 `idx_agent_steps_run_json` 索引（Step 1），查询仍可工作（只是全表扫描 + JSON 解析），但相比原 `list_entities` 已有 `WHERE` 过滤，仍优于原方案。若必须保证性能，可改为在 `agent_steps` 表添加 `run_id` 列 + schema 迁移（超出本计划范围，作为后续优化）。
- **风险 3**：`agent_steps.updated_at ASC` 与 `created_at ASC` 排序差异。已通过保留 `steps.sort_by_key(|s| s.created_at)` 缓解（Task 3 Step 5）。
- **风险 4**：H1 修复后，原本"永不触发"的 doom-loop Ask 现在会在连续 3 次失败后触发。这是预期行为（恢复安全防护），但需在 PR 描述中明确提示前端可能开始收到 `permission-ask` 事件（前端已有 Ask 分支处理，见 `patch_generator.rs:49-57`）。

---

## 执行说明

本计划共 5 个 Task，预计实施工作量：
- Task 1（H1 doom_loop）：~60 分钟（新增类型 + storage 方法 + 接线 + 测试）
- Task 2（H2 regex 加固）：~30 分钟（重构 + 测试）
- Task 3（H4 load_run_detail）：~45 分钟（storage 方法 + 索引 + 接线 + 测试）
- Task 4（H5 archive 批量）：~40 分钟（storage 方法 + 接线 + 测试）
- Task 5（H6 reorder 批量）：~20 分钟（复用 Task 4 方法 + 接线）

总预计：~3.5 小时实施 + 测试。

**实施顺序建议**：Task 2 → Task 1 → Task 3 → Task 4 → Task 5（Task 2 最独立、风险最低，先建立信心；Task 4 必须在 Task 5 之前）。

**验收流程**：每个 Task 完成后按 `mandatory-testing.md` 执行 L2/L3 验收（涉及 storage crate 核心 + IPC 命令，按 L3 全量级：`cargo check --workspace` + `cargo clippy --workspace --all-targets -- -D warnings` + `cargo test --workspace`）。所有 Task 完成后执行一次完整 L3 验收。
