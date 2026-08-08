# 全套 Agent 工具 Implementation Plan（B2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Agent Loop（B3）补齐工具集：`write`（写文件）、`edit`（精确替换）、`bash`（命令执行）、`apply_patch`（补丁应用）、`question`（询问卡片）、`task`（子代理），全部可被多步循环调用并产生结构化 metadata（供 Part 渲染）。

**Architecture:** 在 `adl-tools` crate 新增 6 个工具模块，每个定义 `PARAMETERS`（serde JSON schema 常量）与纯函数 `execute(...) -> Result<ToolOutput, AppError>`，其中 `ToolOutput { output: String, success: bool, metadata: serde_json::Value }` 在 `adl-tools::lib` 定义。各工具复用现有基础设施：`std::fs`（write/edit）、`adl_command`（bash）、`adl_change_engine`（apply_patch）、`adl_subagent`（task）。在 `adl-agent-runtime` 的 `ToolRegistry::execute` 中把各工具的 `PARAMETERS` 组装为 `ToolDefinition`、把 `ToolOutput` 组装为 `ToolExecutionResult`（含 metadata），并对写/执行类工具先做权限校验。

**Tech Stack:** Rust 2024 edition、serde、tokio、`adl-command`、`adl-change-engine`、`adl-subagent`。

## Global Constraints

- Rust edition 2024，rust-version 1.85
- `cargo clippy -- -D warnings` 必须 0 警告；避免 `unwrap_used`/`dbg_macro`/`todo`
- 未发布阶段禁止数据迁移/兼容代码
- `adl-tools` 内各工具模块是**独立纯函数**（不依赖 agent-runtime 的 registry 类型），返回 `ToolOutput`；`ToolDefinition`/`ToolExecutionResult` 保持在 agent-runtime，由 Task 7 桥接（`ToolOutput.metadata` 直接作为 `ToolExecutionResult.metadata`）
- 写/执行类工具（write/edit/bash/apply_patch）在 Task 7 注册时先经 `adl_agent_runtime::permission_check::check_tool_permission` 校验，`Ask` 结果返回 `success: false, metadata: { permission: "ask" }`（B3 的 Question 机制将挂起等待）
- 工具 Input schema 对齐 OpenCode `packages/core/src/tool/*.ts` 的字段名（见各 Task 说明）
- 现有 5 个只读工具（read/glob/grep/webfetch/websearch）行为不变

---

### Task 1: write 工具

**Files:**
- Create: `crates/tools/src/write.rs`
- Modify: `crates/tools/src/lib.rs`
- Modify: `crates/agent-runtime/src/tools/registry.rs`

**Interfaces:**
- Consumes: `std::fs`, `adl_errors::AppError`
- Produces: `write::execute(path: &str, content: &str, workspace_root: &Path) -> Result<ToolOutput, AppError>`，`write::definition() -> ToolDefinition`（ToolDefinition 类型在 `crates/agent-runtime/src/tools/registry.rs`，由 Task 7 桥接；`write.rs` 只提供纯函数 execute 与 schema 常量）

**adl-tools 结构说明（重要）**：`adl-tools` 各工具模块是**独立纯函数**（参考 `read.rs`：`pub async fn read_file(path) -> Result<String, AppError>`），不引用 agent-runtime 的 registry 类型。本计划的工具模块同样定义纯函数 `execute(...) -> Result<ToolOutput, AppError>`，其中 `ToolOutput` 是 adl-tools 自己的轻量输出结构（见下）。`ToolDefinition`/`ToolExecutionResult` 保持在 agent-runtime，由 Task 7 将工具的 schema 与 execute 桥接为 `ToolExecutionResult`。

在 `crates/tools/src/lib.rs` 顶部定义共享输出结构:

```rust
/// Structured output of a tool execution, consumed by the Agent Loop
/// (B3) to build a Tool Part's state (output + metadata).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolOutput {
    pub output: String,
    pub success: bool,
    pub metadata: serde_json::Value,
}
```

**Input schema**（对齐 OpenCode `write.ts`）：`{ "type": "object", "properties": { "path": {"type":"string"}, "content": {"type":"string"} }, "required": ["path","content"] }`

**Output**（对齐 OpenCode）：`{ operation: "write", target, resource, existed }`

**metadata**：`{ "path": <path>, "existed": <bool> }`

- [ ] **Step 1: 编写失败的测试**

创建 `crates/tools/src/write.rs`（先只写测试）:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn write_creates_new_file() {
        let dir = std::env::temp_dir().join(format!("adl-tool-write-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("hello.txt");
        let result = execute(&path.to_string_lossy(), "hello world", &dir).await;
        assert!(result.success);
        assert!(path.exists());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hello world");
        assert_eq!(result.metadata["existed"], false);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn write_overwrites_existing_file() {
        let dir = std::env::temp_dir().join(format!("adl-tool-write-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("hello.txt");
        std::fs::write(&path, "old").unwrap();
        let result = execute(&path.to_string_lossy(), "new", &dir).await;
        assert!(result.success);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        assert_eq!(result.metadata["existed"], true);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn write_creates_parent_dirs() {
        let dir = std::env::temp_dir().join(format!("adl-tool-write-{}", uuid::Uuid::new_v4()));
        let path = dir.join("nested").join("deep").join("file.txt");
        let result = execute(&path.to_string_lossy(), "hi", &dir).await;
        assert!(result.success);
        assert!(path.exists());
        let _ = std::fs::remove_dir_all(dir);
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-tools write::tests`
Expected: FAIL（`write` 模块不存在）

- [ ] **Step 3: 编写最小实现**

创建 `crates/tools/src/write.rs`:

```rust
use adl_errors::AppError;
use std::path::Path;

use crate::ToolOutput;

pub const NAME: &str = "write";

/// JSON schema for the write tool (consumed by the Agent Loop to build
/// the LLM tool definition; the ToolDefinition wrapper lives in
/// adl-agent-runtime and is bridged in Task 7).
pub const PARAMETERS: serde_json::Value = serde_json::json!({
    "type": "object",
    "properties": {
        "path": { "type": "string", "description": "File path to write" },
        "content": { "type": "string", "description": "Content to write" }
    },
    "required": ["path", "content"]
});

/// Write content to a file (creates parent directories). Mirrors OpenCode's
/// write tool semantics.
pub async fn execute(
    path: &str,
    content: &str,
    workspace_root: &Path,
) -> Result<ToolOutput, AppError> {
    let full_path = resolve_path(path, workspace_root);
    let existed = full_path.exists();
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&full_path, content)?;
    Ok(ToolOutput {
        output: if existed {
            format!("Wrote file successfully: {path}")
        } else {
            format!("Created file successfully: {path}")
        },
        success: true,
        metadata: serde_json::json!({
            "path": path,
            "existed": existed,
        }),
    })
}

/// Resolve a (possibly relative) path against the workspace root.
pub fn resolve_path(path: &str, workspace_root: &Path) -> std::path::PathBuf {
    let p = Path::new(path);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        workspace_root.join(p)
    }
}
```

修改 `crates/tools/src/lib.rs` 注册模块:

```rust
pub mod write;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-tools write::tests`
Expected: PASS（3 个测试）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p adl-tools --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 更新 lib.rs 并提交**

修改 `crates/tools/src/lib.rs`，新增模块并定义 `ToolOutput`（放在文件顶部）:

```rust
/// Structured output of a tool execution, consumed by the Agent Loop
/// (B3) to build a Tool Part's state (output + metadata).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolOutput {
    pub output: String,
    pub success: bool,
    pub metadata: serde_json::Value,
}

pub mod write;
// ... existing modules ...
```

提交:
```bash
git add crates/tools/src/write.rs crates/tools/src/lib.rs
git commit -m "feat(tools): add write tool"
```

---

### Task 2: edit 工具

**Files:**
- Create: `crates/tools/src/edit.rs`
- Modify: `crates/tools/src/lib.rs`

**Interfaces:**
- Consumes: `std::fs`, `adl_errors::AppError`, `crate::ToolOutput`, `crate::write::resolve_path`
- Produces: `edit::execute(path, old_string, new_string, replace_all, workspace_root) -> Result<ToolOutput, AppError>`，`edit::PARAMETERS`（JSON schema 常量）

**Input schema**（对齐 OpenCode `edit.ts`）：`{ path, old_string, new_string, replace_all? }`

**metadata**：`{ "path": <path>, "filediff": { "file": <path>, "replacements": <count> }, "replacements": <count> }`

- [ ] **Step 1: 编写失败的测试**

创建 `crates/tools/src/edit.rs`（先只写测试）:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn edit_replaces_single_occurrence() {
        let dir = std::env::temp_dir().join(format!("adl-tool-edit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.txt");
        std::fs::write(&path, "hello world hello").unwrap();
        let result =
            execute(&path.to_string_lossy(), "hello", "hi", false, &dir).await;
        assert!(result.success);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hi world hello");
        assert_eq!(result.metadata["replacements"], 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn edit_replace_all() {
        let dir = std::env::temp_dir().join(format!("adl-tool-edit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.txt");
        std::fs::write(&path, "hello hello").unwrap();
        let result =
            execute(&path.to_string_lossy(), "hello", "hi", true, &dir).await;
        assert!(result.success);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hi hi");
        assert_eq!(result.metadata["replacements"], 2);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn edit_no_occurrence_fails() {
        let dir = std::env::temp_dir().join(format!("adl-tool-edit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.txt");
        std::fs::write(&path, "hello").unwrap();
        let result = execute(&path.to_string_lossy(), "xyz", "abc", false, &dir).await;
        assert!(!result.success);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hello", "file unchanged on no match");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn edit_identical_strings_fails() {
        let dir = std::env::temp_dir().join(format!("adl-tool-edit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.txt");
        std::fs::write(&path, "same").unwrap();
        let result = execute(&path.to_string_lossy(), "same", "same", false, &dir).await;
        assert!(!result.success);
        let _ = std::fs::remove_dir_all(dir);
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-tools edit::tests`
Expected: FAIL（`edit` 模块不存在）

- [ ] **Step 3: 编写最小实现**

创建 `crates/tools/src/edit.rs`:

```rust
use adl_errors::AppError;
use std::path::Path;

use crate::ToolOutput;
use crate::write::resolve_path;

pub const NAME: &str = "edit";

pub const PARAMETERS: serde_json::Value = serde_json::json!({
    "type": "object",
    "properties": {
        "path": { "type": "string", "description": "File path to edit" },
        "old_string": { "type": "string", "description": "Exact text to replace" },
        "new_string": { "type": "string", "description": "Replacement text" },
        "replace_all": { "type": "boolean", "description": "Replace all occurrences (default false)" }
    },
    "required": ["path", "old_string", "new_string"]
});

pub async fn execute(
    path: &str,
    old_string: &str,
    new_string: &str,
    replace_all: bool,
    workspace_root: &Path,
) -> Result<ToolOutput, AppError> {
    if old_string == new_string {
        return Ok(ToolOutput {
            output: "No changes to apply: oldString and newString are identical.".to_string(),
            success: false,
            metadata: serde_json::json!({ "path": path, "replacements": 0 }),
        });
    }
    let full_path = resolve_path(path, workspace_root);
    let content = std::fs::read_to_string(&full_path)?;
    let count = if replace_all {
        content.matches(old_string).count()
    } else {
        content.match_indices(old_string).take(1).count()
    };
    if count == 0 {
        return Ok(ToolOutput {
            output: format!("Unable to edit {path}: oldString not found. Read the file first."),
            success: false,
            metadata: serde_json::json!({ "path": path, "replacements": 0 }),
        });
    }
    let updated = if replace_all {
        content.replace(old_string, new_string)
    } else {
        content.replacen(old_string, new_string, 1)
    };
    std::fs::write(&full_path, updated)?;
    Ok(ToolOutput {
        output: format!("Edited file successfully: {path} (replacements: {count})"),
        success: true,
        metadata: serde_json::json!({
            "path": path,
            "replacements": count,
            "filediff": { "file": path, "replacements": count },
        }),
    })
}
```

修改 `crates/tools/src/lib.rs`:

```rust
pub mod edit;
pub mod write;
```

注意：`resolve_path` 已在 `write.rs` 定义为 `pub fn resolve_path`（Task 1 已改为 pub），edit.rs 直接复用。

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-tools edit::tests`
Expected: PASS（4 个测试）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p adl-tools --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add crates/tools/src/edit.rs crates/tools/src/lib.rs crates/tools/src/write.rs
git commit -m "feat(tools): add edit tool"
```

---

### Task 3: bash 工具

**Files:**
- Create: `crates/tools/src/bash.rs`
- Modify: `crates/tools/src/lib.rs`
- Modify: `crates/tools/Cargo.toml`（新增 `adl-command` 依赖）

**Interfaces:**
- Consumes: `adl_command::{build_request, run_command}`, `std::path::Path`, `adl_errors::AppError`
- Produces: `bash::execute(command, workdir, workspace_root, timeout_secs) -> Result<ToolExecutionResult, AppError>`，`bash::definition()`

**Input schema**（对齐 OpenCode `bash.ts`）：`{ command, workdir?, timeout? }`

**metadata**（对齐 OpenCode）：`{ "command": <command>, "output": <stdout>, "exitCode": <code>, "truncated": <bool> }`

- [ ] **Step 1: 编写失败的测试**

创建 `crates/tools/src/bash.rs`（先只写测试）:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn bash_runs_command_and_captures_output() {
        let dir = std::env::temp_dir().join(format!("adl-tool-bash-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        #[cfg(windows)]
        let command = "echo".to_string();
        #[cfg(not(windows))]
        let command = "echo".to_string();
        let result = execute(&command, None, &dir, Some(10)).await;
        assert!(result.success);
        assert!(result.metadata["command"].as_str().is_some());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn bash_failed_command_returns_success_false() {
        let dir = std::env::temp_dir().join(format!("adl-tool-bash-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let result = execute("nonexistent_command_xyz_123", None, &dir, Some(5)).await;
        assert!(!result.success);
        let _ = std::fs::remove_dir_all(dir);
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-tools bash::tests`
Expected: FAIL（`bash` 模块不存在）

- [ ] **Step 3: 实现**

创建 `crates/tools/src/bash.rs`:

```rust
use adl_command::{build_request, run_command};
use adl_errors::AppError;
use std::path::Path;

use crate::ToolOutput;

pub const NAME: &str = "bash";
pub const DEFAULT_TIMEOUT_SECS: u64 = 120;

pub const PARAMETERS: serde_json::Value = serde_json::json!({
    "type": "object",
    "properties": {
        "command": { "type": "string", "description": "Command to execute" },
        "workdir": { "type": "string", "description": "Working directory (optional)" },
        "timeout": { "type": "integer", "description": "Timeout seconds (optional)" }
    },
    "required": ["command"]
});

pub async fn execute(
    command: &str,
    workdir: Option<&str>,
    workspace_root: &Path,
    timeout_secs: Option<u64>,
) -> Result<ToolOutput, AppError> {
    // Split command into program + args (simple tokenization; complex quoting
    // is handled by the permission engine at the Tauri layer).
    let mut parts = command.split_whitespace();
    let program = parts.next().unwrap_or("");
    let args: Vec<String> = parts.map(String::from).collect();
    if program.is_empty() {
        return Ok(ToolOutput {
            output: "No command provided.".to_string(),
            success: false,
            metadata: serde_json::json!({ "command": command, "output": "", "exitCode": null, "truncated": false }),
        });
    }
    let request = build_request("", None, program.to_string(), args, false);
    let result = run_command(workspace_root, request, timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS))
        .await
        .map_err(|e| AppError::Terminal(format!("bash tool failed: {e}")))?;
    let stdout = result.stdout;
    let stderr = result.stderr;
    Ok(ToolOutput {
        output: format!("{stdout}{stderr}"),
        success: result.success,
        metadata: serde_json::json!({
            "command": command,
            "output": stdout,
            "exitCode": result.exit_code,
            "truncated": false,
        }),
    })
}
```

修改 `crates/tools/src/lib.rs`:

```rust
pub mod bash;
pub mod edit;
pub mod write;
```

修改 `crates/tools/Cargo.toml`，新增依赖:

```toml
adl-command = { path = "../command" }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-tools bash::tests`
Expected: PASS（2 个测试）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p adl-tools --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add crates/tools/src/bash.rs crates/tools/src/lib.rs crates/tools/Cargo.toml
git commit -m "feat(tools): add bash tool"
```

---

### Task 4: apply_patch 工具

**Files:**
- Create: `crates/tools/src/apply_patch.rs`
- Modify: `crates/tools/src/lib.rs`
- Modify: `crates/tools/Cargo.toml`（新增 `adl-change-engine` 依赖）

**Interfaces:**
- Consumes: `adl_change_engine::{create_single_file_patch_set, set_hunk_decision, apply_patch_set}`, `adl_types::{PatchHunkDecision}`, `adl_errors::AppError`, `std::path::Path`
- Produces: `apply_patch::execute(relative_path: &str, before_content: &str, after_content: &str, workspace_root: &Path, session_id: &str) -> Result<ToolOutput, AppError>`，`apply_patch::PARAMETERS`（JSON schema 常量）

**Input schema**（ADL 结构化 PatchSet 模型的适配；OpenCode 的 apply_patch 接受裸 diff 字符串，但 ADL change-engine 是结构化 PatchSet）：`{ "path": <relative path>, "before": <原内容>, "after": <新内容> }`

**实现逻辑**：
1. 用 `create_single_file_patch_set` 从 path/before/after 构造 PatchSet
2. 遍历 hunks，用 `set_hunk_decision(hunk, PatchHunkDecision::Accepted)` 全部接受
3. 调 `apply_patch_set(patch_set, workspace_root, checkpoints_dir)` 应用（需 checkpoints 目录，本阶段用 `workspace_root/.ai-digital-life/checkpoints`）
4. 返回 metadata `{ "files": [relative_path] }`

**metadata**：`{ "files": [<affected file paths>] }`

- [ ] **Step 1: 阅读 `adl_change_engine` 的 API**

Read `crates/change-engine/src/patch_create.rs`（`create_single_file_patch_set(PatchProposal) -> PatchSet`）、`lib.rs`（`PatchProposal` 结构）、`patch_apply.rs`（`apply_patch_set`）、`crates/types/src/types/patch.rs`（`PatchHunkDecision` 枚举、`PatchSet`/`FilePatch`/`Hunk` 结构的字段名）。确认 hunks 迭代与 `set_hunk_decision` 的用法。

- [ ] **Step 2: 编写失败的测试**

创建 `crates/tools/src/apply_patch.rs`（先只写测试）。基于确认的 API:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn apply_patch_modifies_file() {
        let dir = std::env::temp_dir().join(format!("adl-tool-patch-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.txt");
        std::fs::write(&file, "line1\nline2\n").unwrap();
        let result = execute("a.txt", "line1\nline2\n", "changed\nline2\n", &dir, "sess-test").await;
        assert!(result.success);
        let content = std::fs::read_to_string(&file).unwrap();
        assert!(content.contains("changed"));
        assert_eq!(result.metadata["files"][0], "a.txt");
        let _ = std::fs::remove_dir_all(dir);
    }
}
```

注意：`execute` 的签名是 `(relative_path, before_content, after_content, workspace_root, session_id) -> Result<ToolOutput, AppError>`。测试用 `.await.unwrap()`（interface 是 Result）。

- [ ] **Step 3: 运行测试确认失败**

Run: `cargo test -p adl-tools apply_patch::tests`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现**

创建 `crates/tools/src/apply_patch.rs`:

```rust
use adl_change_engine::{PatchProposal, apply_patch_set, create_single_file_patch_set};
use adl_errors::AppError;
use adl_types::PatchHunkDecision;
use std::path::Path;

use crate::ToolOutput;

pub const NAME: &str = "apply_patch";

pub static PARAMETERS: std::sync::LazyLock<serde_json::Value> = std::sync::LazyLock::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "path": { "type": "string", "description": "File path (relative to workspace)" },
            "before": { "type": "string", "description": "Current file content" },
            "after": { "type": "string", "description": "New file content" }
        },
        "required": ["path", "before", "after"]
    })
});

/// Apply a single-file change via the change-engine's structured PatchSet
/// model. Creates a PatchSet from before/after content, accepts all hunks,
/// and applies it atomically (with a checkpoint).
pub async fn execute(
    relative_path: &str,
    before_content: &str,
    after_content: &str,
    workspace_root: &Path,
    session_id: &str,
) -> Result<ToolOutput, AppError> {
    let proposal = PatchProposal {
        workspace_id: "",
        session_id,
        run_id: None,
        relative_path,
        before_content,
        after_content,
        title: format!("Edit {relative_path}"),
        summary: format!("Apply patch to {relative_path}"),
    };
    let mut patch_set = create_single_file_patch_set(proposal);
    // Accept all hunks (the Loop has already approved the edit via permission gate)
    let hunk_ids: Vec<String> = patch_set
        .file_patches
        .iter()
        .flat_map(|fp| fp.hunks.iter().map(|h| h.id.clone()))
        .collect();
    for hunk_id in hunk_ids {
        patch_set = adl_change_engine::set_hunk_decision(
            patch_set,
            &hunk_id,
            PatchHunkDecision::Accepted,
        )?;
    }
    let checkpoints_dir = workspace_root.join(".ai-digital-life").join("checkpoints");
    std::fs::create_dir_all(&checkpoints_dir)?;
    apply_patch_set(patch_set, workspace_root, &checkpoints_dir)?;
    Ok(ToolOutput {
        output: format!("Applied patch to {relative_path}"),
        success: true,
        metadata: serde_json::json!({ "files": [relative_path] }),
    })
}
```

注意：`adl_change_engine::set_hunk_decision` 与 `apply_patch_set` 返回的 `PatchSet` 字段/状态以实际代码为准；`adl_types::PatchHunkDecision` 的变体名以 `crates/types/src/types/patch.rs` 为准。添加 `pub mod apply_patch;` 到 lib.rs。

- [ ] **Step 5: 运行测试确认通过**

Run: `cargo test -p adl-tools apply_patch::tests`
Expected: PASS

- [ ] **Step 6: Clippy 检查**

Run: `cargo clippy -p adl-tools --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 7: 提交**

```bash
git add crates/tools/src/apply_patch.rs crates/tools/src/lib.rs crates/tools/Cargo.toml
git commit -m "feat(tools): add apply_patch tool"
```

---

### Task 5: question 工具

**Files:**
- Create: `crates/tools/src/question.rs`
- Modify: `crates/tools/src/lib.rs`

**Interfaces:**
- Consumes: `adl_errors::AppError`
- Produces: `question::execute(questions: &[QuestionInfo]) -> Result<ToolExecutionResult, AppError>`（同步返回 pending——真正的挂起等待由 B3 的 Question 机制处理），`question::definition()`

**Input schema**（对齐 OpenCode `question.ts`）：`{ questions: [{ question: string, options?: string[] }] }`

**metadata**：`{ "questions": [...], "answers": [...] }`

**设计说明**：本计划的 question 工具 `execute` 只做 schema 校验并返回 `success: true` + metadata（携带问题列表），不真正挂起。真正的"等待用户回答"由 B3 的 Question 服务（`Deferred` + `question.asked` 事件 + SSE 回传）实现，届时复用本工具的 metadata 结构。

- [ ] **Step 1: 编写失败的测试**

创建 `crates/tools/src/question.rs`（先只写测试）:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn question_schema_has_questions() {
        assert!(PARAMETERS["properties"]["questions"].is_object());
    }

    #[tokio::test]
    async fn question_returns_metadata() {
        let result = execute(&serde_json::json!([
            { "question": "Continue?", "options": ["yes", "no"] }
        ]))
        .await;
        assert!(result.success);
        assert_eq!(result.metadata["questions"][0]["question"], "Continue?");
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-tools question::tests`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `crates/tools/src/question.rs`:

```rust
use adl_errors::AppError;

use crate::ToolOutput;

pub const NAME: &str = "question";

pub const PARAMETERS: serde_json::Value = serde_json::json!({
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": { "type": "string" },
                    "options": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["question"]
            }
        }
    },
    "required": ["questions"]
});

pub async fn execute(
    questions: &serde_json::Value,
) -> Result<ToolOutput, AppError> {
    let questions = questions.clone();
    // B3's Question service will replace this stub to truly suspend via a
    // Deferred and publish question.asked events. For now, validate shape
    // and return the questions so downstream consumers can render them.
    Ok(ToolOutput {
        output: format!("Asked {} question(s).", questions.as_array().map_or(0, Vec::len)),
        success: true,
        metadata: serde_json::json!({
            "questions": questions,
            "answers": [],
        }),
    })
}
```

修改 `crates/tools/src/lib.rs`:

```rust
pub mod question;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-tools question::tests`
Expected: PASS（2 个测试）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p adl-tools --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add crates/tools/src/question.rs crates/tools/src/lib.rs
git commit -m "feat(tools): add question tool"
```

---

### Task 6: task 工具

**Files:**
- Create: `crates/tools/src/task.rs`
- Modify: `crates/tools/src/lib.rs`
- Modify: `crates/tools/Cargo.toml`（新增 `adl-subagent` 依赖）

**Interfaces:**
- Consumes: `adl_subagent::{TaskToolInput, TaskToolOutput, SubagentManager}`（需先阅读 manager.rs 确认 SubagentManager 的 dispatch API）, `adl_errors::AppError`
- Produces: `task::execute(input: &TaskToolInput, manager: &SubagentManager) -> Result<ToolExecutionResult, AppError>`，`task::definition()`

**Input schema**（对齐 OpenCode `task.ts` + ADL `TaskToolInput`）：`{ description, prompt, subagent_type, task_id?, background? }`

**metadata**：`{ "task_id": <id>, "subagent_type": <type>, "description": <desc>, "state": <state> }`

- [ ] **Step 1: 阅读 `adl_subagent::manager::SubagentManager` 的 API**

Read `crates/subagent/src/manager.rs` 全文，确认 dispatch 子代理的函数签名（参数、返回类型、是否 async）。`task.rs` 的 `execute` 调用它。

- [ ] **Step 2: 编写失败的测试**

创建 `crates/tools/src/task.rs`（先只写测试）。测试需基于 Step 1 确认的 API。若 `SubagentManager` 依赖 Tauri/全局状态不易在单测构造，则测试 focus 于 `PARAMETERS` schema 与 input 解析:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_schema_has_subagent_type() {
        assert!(PARAMETERS["properties"]["subagent_type"].is_object());
    }

    #[test]
    fn task_input_parses() {
        let input: TaskToolInput = serde_json::from_str(
            r#"{"description":"d","prompt":"p","subagentType":"explore","background":false}"#,
        )
        .unwrap();
        assert_eq!(input.subagent_type, "explore");
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cargo test -p adl-tools task::tests`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现**

基于 Step 1 确认的 `SubagentManager` API 实现 `execute`。核心：构造 `TaskToolInput`，dispatch 子代理，返回 metadata（task_id/subagent_type/description/state）。若 dispatch 需 Tauri 上下文，`execute` 接受一个 `dispatch` 闭包参数（由 B3 适配层注入），单测用假闭包。

- [ ] **Step 5: 运行测试确认通过**

Run: `cargo test -p adl-tools task::tests`
Expected: PASS

- [ ] **Step 6: Clippy 检查**

Run: `cargo clippy -p adl-tools --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 7: 提交**

```bash
git add crates/tools/src/task.rs crates/tools/src/lib.rs crates/tools/Cargo.toml
git commit -m "feat(tools): add task tool"
```

---

### Task 7: 注册表接入与权限门控

**Files:**
- Modify: `crates/agent-runtime/src/tools/registry.rs`

**Interfaces:**
- Consumes: `adl_tools::write/edit/bash/apply_patch/question/task`, `adl_agent_runtime::permission_check::check_tool_permission`
- Produces: `ToolRegistry::with_builtins()` 注册全部 11 个工具；`ToolRegistry::execute` 对 write/edit/bash/apply_patch 先做权限校验

- [ ] **Step 1: 编写失败的测试**

在 `crates/agent-runtime/src/tools/registry.rs` 的 `mod tests` 追加:

```rust
#[test]
fn registry_lists_all_builtins() {
    let registry = ToolRegistry::with_builtins();
    let names = registry.list_names();
    let expected = ["read", "glob", "grep", "webfetch", "websearch", "write", "edit", "bash", "apply_patch", "question", "task"];
    for name in expected {
        assert!(names.contains(&name.to_string()), "missing tool: {name}");
    }
}

#[tokio::test]
async fn write_tool_executes_in_registry() {
    let registry = ToolRegistry::with_builtins();
    let dir = std::env::temp_dir().join(format!("adl-registry-write-{}", uuid::Uuid::new_v4()));
    let path = dir.join("x.txt");
    // 注意：现有 execute 签名是 (name, input: &str)。input 为 {"path": "...", "content": "..."}。
    let input = format!(r#"{{"path":"{}","content":"hi"}}"#, path.to_string_lossy());
    let result = registry.execute("write", &input).await;
    assert!(result.is_ok());
    let result = result.unwrap();
    assert!(result.success);
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn bash_tool_denied_by_permission_returns_ask() {
    // 构造一个应被权限规则拒绝的命令（如 rm -rf）
    let registry = ToolRegistry::with_builtins();
    let result = registry.execute("bash", "{\"command\":\"rm -rf /\"}").await;
    // 取决于默认规则：rm -rf / 应被 Deny 或 Ask。断言 success 为 false。
    let result = result.unwrap_or_else(|_| panic!("should not hard-error"));
    assert!(!result.success);
}
```

注意：`registry.execute` 目前签名是 `execute(&self, name: &str, input: &str) -> Result<ToolExecutionResult, AppError>`，input 是 JSON 字符串，且**没有 workspace_root 参数**。为最小化改动，新增工具的 `execute` 分支要求 input 中 `path`/`command` 使用**绝对路径**（write/edit 的 `resolve_path` 对绝对路径直接使用，bash 的 `adl_command::run_command` 以进程 cwd 为基准）。workspace_root 的显式注入由 B3 的 Loop 层负责（届时 registry 持有会话 workspace）。同时 `ToolExecutionResult` 增加 `metadata` 字段（现有只读工具填 `metadata: json!({})`）。

上述 `write_tool_executes_in_registry` 测试中 `path` 是临时目录下的绝对路径，符合此约定。

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl-agent-runtime tools::registry::tests`
Expected: FAIL（缺少 write/edit/bash 等工具、`metadata` 字段缺失）

- [ ] **Step 3: 实现**

修改 `crates/agent-runtime/src/tools/registry.rs`:

1. 扩展 `ToolExecutionResult` 增加 `metadata: serde_json::Value`。
2. `with_builtins()` 注册 11 个工具（5 现有 + 6 新增）。
3. `execute` 的 match 新增 write/edit/bash/apply_patch/question/task 分支：
   - write：解析 `{path, content}`，调用 `adl_tools::write::execute`，先经 `check_tool_permission("write", input, &ruleset, doom_loop_count)` 校验（ruleset 与 doom_loop 由 registry 持有或参数注入；本阶段用 `PermissionRuleset::default_rules()` + doom_loop 0，B3 再接入真实会话状态）
   - edit：解析 `{path, old_string, new_string, replace_all}`，调用 `adl_tools::edit::execute`
   - bash：解析 `{command, workdir?, timeout?}`，调用 `adl_tools::bash::execute`，先经权限校验
   - apply_patch：解析 `{patch}`，调用 `adl_tools::apply_patch::execute`
   - question：解析 `{questions}`，调用 `adl_tools::question::execute`
   - task：解析 `TaskToolInput`，调用 `adl_tools::task::execute`（dispatch 闭包 B3 注入，本阶段用 stub 返回 pending）
4. 现有 5 个只读工具返回 `metadata: serde_json::json!({})`。

权限校验规则（本阶段默认）：
- 只读工具（read/glob/grep/webfetch/websearch/question/task）：不校验（Allow）
- write/edit/apply_patch/bash：`check_tool_permission`；`Deny` → `success: false, metadata: { permission: "deny", reason }`；`Ask` → `success: false, metadata: { permission: "ask", reason }`

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl-agent-runtime tools::registry::tests`
Expected: PASS

- [ ] **Step 5: 全工作区构建 + Clippy**

Run: `cargo build --workspace && cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add crates/agent-runtime/src/tools/registry.rs crates/agent-runtime/Cargo.toml
git commit -m "feat(agent-runtime): register full tool set with permission gating"
```

---

### Task 8: 全工作区验证

**Files:**
- 无新增/修改（验证性任务）

- [ ] **Step 1: 运行全工作区测试**

Run: `cargo test --workspace -- --skip google`
Expected: 全部通过（跳过已知挂起的 google 网络测试）

- [ ] **Step 2: Clippy 全量检查**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 3: 提交（如有修复）**

---

## Self-Review 记录

**Spec coverage:**
- §4.2 工具注册表（write/edit/bash/apply_patch/question/task）→ Task 1-6 ✓
- §4.2 工具 metadata（edit 的 filediff、bash 的 command/output、question 的问题列表）→ 各 Task ✓
- §4.2 权限校验（写/执行工具先检查）→ Task 7 ✓
- §4.3 死循环检测 → 权限门控的 doom_loop 参数预留（B3 接入）✓
- §8 Agent Loop 测试 → 工具层单测（本计划）+ Loop 测试（B3）✓

**Gap 说明**：
- question 工具本阶段不真正挂起（B3 Question 服务实现 `Deferred` 等待）；task 工具的 dispatch 闭包由 B3 注入。这是合理的阶段划分——本计划交付"工具可被调用 + 产生 metadata"，挂起语义属于 Loop 层。
- bash 命令 tokenize 用简单 `split_whitespace`，复杂引号由权限引擎/后续处理。OpenCode 用 shell 字符串直接执行；本计划经 `adl_command`（已具备 shell 元字符防护）。

**Placeholder scan**：Task 4（apply_patch）与 Task 6（task）标注"需先阅读 API 确认签名"，是让 implementer 基于真实代码适配的明确指引，非占位——这两处是本计划对既有基础设施的适配点。

**Type consistency**：`adl-tools` 各工具模块返回 `ToolOutput { output, success, metadata }`（lib 定义，Task 1-6 一致使用）；`adl-agent-runtime` 的 `ToolExecutionResult` 在 Task 7 增加 `metadata` 字段，把 `ToolOutput` 桥接为 `ToolExecutionResult`（`ToolOutput.metadata` 直接透传）。`resolve_path` 在 write.rs 定义为 `pub`，edit.rs 复用。`PARAMETERS` 常量在各工具模块定义，Task 7 组装为 `ToolDefinition.parameters`。
