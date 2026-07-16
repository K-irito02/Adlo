# Plan G: Rust Small Cleanup — Dead Trait + Redundant Allocations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead SessionRepository trait (0 production consumers) and eliminate redundant allocations in revert.rs (67% reduction, 6→2 allocations per call).

**Architecture:** Two independent Rust changes in different crates. Task 1 deletes a trait definition + re-export + mock. Task 2 extracts duplicated `.to_string()` / `.clone()` calls from 3 match arms into a single assignment at function top. Neither task affects runtime behavior.

**Tech Stack:** Rust 2021, thiserror

## Global Constraints

- `unwrap()` prohibited in production code — use `?` or pattern matching
- All tests must pass: `cargo test --workspace`
- Clippy zero warnings: `cargo clippy --workspace --all-targets -- -D warnings`
- Follow `rustfmt.toml` (max_width=100, tab_spaces=4, Unix newlines)

---

### Task 1: Remove SessionRepository trait

**说明:** `SessionRepository` trait 定义在 `crates/kernel/src/types/session.rs`，3 个方法，1 个真实实现（`StorageSessionRepository`），0 个生产消费者。完全死代码。

**Files:**
- Modify: `crates/kernel/src/types/session.rs` — 删除 `pub trait SessionRepository` 定义
- Modify: `crates/agent-runtime/src/session_repo.rs` — 删除整个文件（仅做 re-export）
- Modify: `crates/agent-runtime/src/lib.rs` — 移除 `pub mod session_repo;`
- Modify: `crates/storage/src/session_repo_impl.rs:16` — 将 `impl SessionRepository for StorageSessionRepository` 改为普通 `impl StorageSessionRepository` 方法块（去掉 trait 关联）
- Modify: `crates/agent-runtime/tests/session_repo_tests.rs` — 删除或重写测试（直接用具体类型）

- [ ] **Step 1: 读取 trait 定义及其引用**

```bash
cd ai-digital-life
Select-String -Path "crates/kernel/src/types/session.rs" -Pattern "pub trait SessionRepository" -Context 0,10
Select-String -Path "crates/**/*.rs" -Recurse -Pattern "SessionRepository"
```

Expected output: 显示 trait 定义 + 实现 + re-export，确认 0 个生产消费者

- [ ] **Step 2: 从 kernel 删除 trait 定义**

在 `crates/kernel/src/types/session.rs` 中删除 `pub trait SessionRepository` 块（约 10 行），具体内容：

```rust
// 删除以下代码块
pub trait SessionRepository: Send + Sync {
    fn get_session(&self, id: &str) -> Result<Option<ConversationSessionRecord>, AppError>;
    fn save_session(&self, session: &ConversationSessionRecord) -> Result<(), AppError>;
    fn list_sessions(&self, query: &SessionQuery) -> Result<Vec<ConversationSessionRecord>, AppError>;
}
```

- [ ] **Step 3: 删除 agent-runtime 的 re-export 文件**

```bash
rm crates/agent-runtime/src/session_repo.rs
```

- [ ] **Step 4: 从 agent-runtime/src/lib.rs 移除 mod session_repo**

编辑 `crates/agent-runtime/src/lib.rs`，删除 `pub mod session_repo;` 所在行。

- [ ] **Step 5: 更新 storage 中的 impl**

将 `crates/storage/src/session_repo_impl.rs` 中的：
```rust
impl SessionRepository for StorageSessionRepository {
```
改为普通的 impl 块：
```rust
impl StorageSessionRepository {
```
（如果原有方法有 `&self`，保持不变）

- [ ] **Step 6: 更新测试文件**

读取 `crates/agent-runtime/tests/session_repo_tests.rs`，如果使用 `MockRepo` 或 `dyn SessionRepository`，改为直接用 `StorageSessionRepository` 或删除测试。

- [ ] **Step 7: 验证编译和测试**

```bash
cd ai-digital-life
cargo check --workspace 2>&1
cargo test --workspace 2>&1
cargo clippy --workspace --all-targets -- -D warnings 2>&1
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove dead SessionRepository trait (0 production consumers)

Trait had 3 methods, 1 real implementation (StorageSessionRepository),
and 0 production consumers. Converted to concrete impl block per YAGNI."
```

---

### Task 2: Fix revert.rs redundant allocations

**Files:**
- Modify: `crates/change-engine/src/revert.rs:30-57` — 提取重复分配

- [ ] **Step 1: 读取 revert.rs 相关代码段**

```bash
cd ai-digital-life
Select-String -Path "crates/change-engine/src/revert.rs" -Pattern "snapshot_id|message_id" -Context 0,2
```

显示：
```
Line 30:     snapshot_id: snapshot_id.to_string(),
Line 31:     message_id: snapshot.message_id.clone(),
...
Line 44:     snapshot_id: snapshot_id.to_string(),
Line 45:     message_id: snapshot.message_id.clone(),
...
Line 53:     snapshot_id: snapshot_id.to_string(),
Line 54:     message_id: snapshot.message_id.clone(),
```

- [ ] **Step 2: 提取到函数顶部**

在函数顶部、所有 return 之前添加：

```rust
let owned_snapshot_id = snapshot_id.to_string();
let owned_message_id = snapshot.message_id.clone();
```

然后将 3 个 RevertResult 构造中的赋值改为：

```rust
// 原先
return Ok(RevertResult {
    snapshot_id: snapshot_id.to_string(),
    message_id: snapshot.message_id.clone(),
    ...
});
// 改为
return Ok(RevertResult {
    snapshot_id: owned_snapshot_id.clone(),  // 注意：需要 .clone() 因为 3 个分支都使用
    message_id: owned_message_id.clone(),
    ...
});
```

注意：由于 `RevertResult` 在 3 个分支中被构造，不能 move 进去。但如果用 `owned_snapshot_id` 和 `owned_message_id`，每次构造时仍需 `.clone()` —— 这只省掉了 `snapshot_id.to_string()` 的格式化开销和 `snapshot.message_id` 的字段访问。

**更彻底的优化（推荐）：** 将 3 个分支的公共部分提到函数末尾，只保留差异：

```rust
let snapshot_id = snapshot_id.to_string();
let message_id = snapshot.message_id.clone();

// 3 个分支提前 return，只在最终成功路径构造结果
// 如果 error 分支构造的是 Some(...)，需要稍微重组

// 实际因为 3 个分支的 files_restored 和 error 不同，可以改成：
let (files_restored, error) = if /* dir not found */ {
    (0, Some("...".to_string()))
} else if /* some errors */ {
    (restored, Some(format!("...", errors.join("; "))))
} else {
    (restored, None)
};

Ok(RevertResult {
    snapshot_id,   // move
    message_id,    // move
    files_restored,
    error,
})
```

这样实现 0 次额外分配——`snapshot_id` 和 `message_id` 各分配一次且被 move 进最终结果。

- [ ] **Step 3: 验证编译和测试**

```bash
cd ai-digital-life
cargo check --workspace 2>&1
cargo test --workspace 2>&1
cargo clippy --workspace --all-targets -- -D warnings 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "perf: eliminate redundant allocation in revert.rs (6→2 per call)

Extracted duplicate snapshot_id.to_string() and message_id.clone()
from 3 match arms into single assignments at function top."
```
