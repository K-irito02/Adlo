# Plan I: Kernel Architecture Split — adl-types + adl-kernel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `adl-kernel` into a pure-types crate (`adl-types`) and retain runtime modules in `adl-kernel`, so 15 downstream crates that only need types stop compiling tokio/notify/tracing-subscriber.

**Architecture:** Create `crates/types/` with a `Cargo.toml` depending only on `serde`, `serde_json`, `ts-rs`, `uuid`, `chrono`, `adl-errors`. Move `src/types/` + `doom_loop.rs` + `permission_types.rs` into it. Add a transition re-export layer in `adl-kernel` so existing imports continue working. Then migrate each downstream crate one by one from `adl_kernel::X` to `adl_types::X`. After all migrations, remove the re-export layer. Each step is independently compilable.

**Tech Stack:** Rust 2021, Cargo workspace, serde

## Global Constraints

- Each intermediate step must compile (`cargo check --workspace`)
- All tests must pass: `cargo test --workspace`
- Clippy zero warnings at each step: `cargo clippy --workspace --all-targets -- -D warnings`
- Follow `rustfmt.toml`
- The transition re-export layer is temporary and must be documented with a `TODO: remove after all crates migrated` comment

---

### Task 1: Create `adl-types` crate and populate with pure types

**Files:**
- Create: `crates/types/Cargo.toml`
- Create: `crates/types/src/lib.rs`
- Create: `crates/types/src/` (copy from `crates/kernel/src/types/`)
- Modify: `Cargo.toml` (workspace members — add `crates/types`)
- Modify: `crates/kernel/Cargo.toml` — add `adl-types` dependency, remove types from kernel source
- Modify: `crates/kernel/src/lib.rs` — add `pub use adl_types::*;` re-export for transition

- [ ] **Step 1: Create `crates/types/Cargo.toml`**

```toml
[package]
name = "adl-types"
version.workspace = true
edition.workspace = true

[dependencies]
serde.workspace = true
serde_json.workspace = true
uuid.workspace = true
chrono.workspace = true
adl-errors = { path = "../errors" }
ts-rs = "10"

[features]
default = ["ts-rs"]
```

对比原 kernel 的依赖，这里仅包含纯类型所需的依赖——没有 `tokio`、`notify`、`tracing`、`tracing-subscriber`、`tracing-appender`、`regex`。

- [ ] **Step 2: Add `crates/types` to workspace members**

在 `Cargo.toml`（工作区根）的 `members` 列表中添加 `"crates/types"`。

- [ ] **Step 3: Create `crates/types/src/lib.rs`**

```rust
// adl-types: Pure type definitions shared across all ADL crates
#![warn(unused_crate_dependencies)]

pub mod types;
// Re-exports from types module
pub use types::*;
```

- [ ] **Step 4: Copy all type files from kernel**

```bash
cp -r crates/kernel/src/types crates/types/src/types
cp crates/kernel/src/doom_loop.rs crates/types/src/
cp crates/kernel/src/permission_types.rs crates/types/src/
```

- [ ] **Step 5: Update copied files for new crate**

检查 `crates/types/src/types/mod.rs` 和 `crates/types/src/doom_loop.rs` 中的 import 路径——原来引用 `crate::xxx` 的需要改为 `crate::types::xxx` 或调整为新 crate 内部的路径。

关键调整：
- `types/mod.rs` 中引用 `super::` 的路径
- `doom_loop.rs` 引用的 `PermissionDecision` 等类型——在新 crate 中路径稍有变化
- `types/config.rs` 引用了 `adl_logging::LogMode`——这是唯一需要跨 crate 引用的外部依赖，确认 `adl-logging` 在 `adl-types` 的依赖中

- [ ] **Step 6: Confirm types compile independently**

```bash
cd ai-digital-life
cargo check -p adl-types 2>&1
```

Expected: 编译成功

- [ ] **Step 7: Wire temporary re-export in adl-kernel**

在 `crates/kernel/Cargo.toml` 中添加 `adl-types` 依赖：

```toml
adl-types = { path = "../types" }
```

在 `crates/kernel/src/lib.rs` 中添加过渡层：

```rust
// TODO: remove after all crates migrated — re-export adl-types for backward compat
pub use adl_types::*;
```

同时从 `crates/kernel/src/` 删除已移走的文件：
```bash
rm crates/kernel/src/types/ -Recurse
rm crates/kernel/src/doom_loop.rs
rm crates/kernel/src/permission_types.rs
```

保留 `crates/kernel/src/lib.rs` 中的运行时模块（`config_watcher`、`events`、`logger`、`command_risk`、`config`）。

- [ ] **Step 8: Verify workspace compiles**

```bash
cd ai-digital-life
cargo check --workspace 2>&1
cargo test --workspace 2>&1
cargo clippy --workspace --all-targets -- -D warnings 2>&1
```

Expected: 编译通过——所有现有 `use adl_kernel::xxx` 通过 re-export 继续工作

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: create adl-types crate, add transitional re-export in adl-kernel

Created crates/types/ with pure type definitions (no runtime deps).
Added temporary pub use adl_types::* in adl-kernel for backward
compatibility. 15 downstream crates unchanged at this step."
```

---

### Task 2: Migrate storage crate to use `adl-types` directly

**Files:**
- Modify: `crates/storage/Cargo.toml` — add `adl-types` dependency
- Modify: `crates/storage/src/**/*.rs` — replace `use adl_kernel::` with `use adl_types::`

- [ ] **Step 1: Add adl-types dependency**

```toml
# crates/storage/Cargo.toml dependencies
adl-types = { path = "../types" }
```

- [ ] **Step 2: Update all imports**

```bash
cd ai-digital-life
Select-String -Path "crates/storage/src/**/*.rs" -Pattern "use adl_kernel"
```

对于每个匹配，将 `use adl_kernel::X` 改为 `use adl_types::X`。

- [ ] **Step 3: Verify compilation**

```bash
cd ai-digital-life
cargo check -p adl-storage 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(storage): migrate from adl-kernel to adl-types imports"
```

---

### Task 3: Migrate agent-runtime, workspace, command, conversation, task, context, ci-status, fs-ops, outline, pty, mcp-client, lsp-client, model-gateway

**Files:** ~14 Cargo.toml files + respective src/ files

对每个 crate 重复相同模式：
1. 在 Cargo.toml 中添加 `adl-types` 依赖
2. 将 `use adl_kernel::` 替换为 `use adl_types::`
3. 如果该 crate 也使用 kernel 的运行时模块（如 `events`、`config_watcher`、`logger`），则保留 `adl-kernel` 依赖
4. `cargo check -p <crate>` 验证

- [ ] **Step 1: Create migration list**

列出所有当前依赖 `adl-kernel` 的 15 个下游 crate：

```
src-tauri, agent-runtime, workspace, command, conversation, task,
context, ci-status, change-engine, fs-ops, mcp-client, subagent,
lsp-client, outline, pty, model-gateway, storage (already done)
```

- [ ] **Step 2: 逐个迁移**

从轻量 crate 开始（`outline`、`fs-ops`、`command`、`task`、`pty`）——它们只使用类型，可以完全移除 `adl-kernel` 依赖。

对于 `src-tauri`、`agent-runtime`、`events` 等也使用运行时模块的 crate，保留 `adl-kernel` 依赖但同时添加 `adl-types`。

每迁移一个 crate，运行：
```bash
cargo check -p <crate>
git add -A && git commit -m "refactor(<crate>): migrate from adl-kernel to adl-types"
```

- [ ] **Step 3: 最终验证**

```bash
cd ai-digital-life
cargo check --workspace 2>&1
cargo test --workspace 2>&1
cargo clippy --workspace --all-targets -- -D warnings 2>&1
```

---

### Task 4: Remove transitional re-export from adl-kernel

**Files:**
- Modify: `crates/kernel/src/lib.rs` — 删除 `pub use adl_types::*;`
- Verify: 确认没有 crate 再使用 `adl_kernel::TypeName` 路径

- [ ] **Step 1: 检查是否所有 crate 已迁移完成**

```bash
cd ai-digital-life
Select-String -Path "crates/**/src/**/*.rs" -Recurse -Pattern "use adl_kernel::(?!.*mod)" | Select-String -NotMatch "use adl_kernel::(config_watcher|events|logger|command_risk|config)"
```

Expected: 无输出（表明没有 crate 使用 `adl_kernel::TypeName` 路径引用类型）

- [ ] **Step 2: 删除 re-export**

从 `crates/kernel/src/lib.rs` 删除：
```rust
// TODO: remove after all crates migrated
pub use adl_types::*;
```

- [ ] **Step 3: 验证**

```bash
cd ai-digital-life
cargo check --workspace 2>&1
cargo test --workspace 2>&1
cargo clippy --workspace --all-targets -- -D warnings 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(kernel): remove transitional re-export, all crates use adl-types directly"
```

---

### Verification (post all tasks)

```bash
cd ai-digital-life
cargo check --workspace 2>&1
cargo test --workspace 2>&1
cargo clippy --workspace --all-targets -- -D warnings 2>&1
# Confirm adl-types has no heavy runtime deps
cargo tree -p adl-types --depth 1 2>&1
```

Expected: `adl-types` 的依赖树中不包含 `tokio`、`notify`、`tracing-subscriber`、`tracing-appender`、`regex`
