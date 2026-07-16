# Phase A: Tauri 同步命令异步化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有在主线程执行 I/O 的同步 `#[tauri::command] pub fn` 转换为 `pub async fn` + `tokio::task::spawn_blocking`，消除 UI 冻结。

**Architecture:** Tauri 命令层是 Rust 后端最薄的壳。每个命令做两件事：(1) 从 `AppState` 提取所需数据（快速、同步），(2) 调用 `adl_*` crate 执行实际 I/O（慢、需异步化）。转换模式：`app: tauri::AppHandle` 替代 `state: tauri::State<'_, AppState>`，在 `spawn_blocking` 之前提取所有需要的数据，闭包只捕获 owned 数据。前端 `invoke()` 无需修改——Tauri 对 sync/async 命令统一返回 Promise。

**Tech Stack:** Rust + Tauri 2.x + Tokio

## Global Constraints

- Rust 最低版本 1.85+
- 禁止 `unwrap()` / `expect()`（除启动代码和 `#[cfg(test)]`）
- 禁止 `unwrap()` on `Mutex::lock()`，使用 `.map_err(|_| AppError::Internal("... mutex poisoned".into()))?`
- 错误类型统一使用 `adl_errors::AppError`
- IPC 返回类型统一使用 `IpcResult<T>`
- 遵循 `rustfmt` 默认配置
- `cargo clippy --workspace -- -D warnings` 必须通过
- 不得破坏现有功能
- 前端代码不需要修改（`invoke()` 对 sync/async 统一处理）
- `main.rs` 的 `generate_handler!` 不需要修改（同时接受 sync 和 async 命令）

## 参考模板（必读）

以下两个命令是正确的 async 实现，所有转换都参照此模式：

```rust
// 模板 1：简单 async 命令（无状态写入）
// 位于 workspace_git.rs:48-63
#[tauri::command]
pub async fn workspace_get_git_status(
    app: tauri::AppHandle,
    workspace_path: Option<String>,
) -> Result<IpcResult<GitSnapshot>, AppError> {
    let state = app.state::<AppState>();
    let path_buf = match workspace_path {
        Some(p) => PathBuf::from(p),
        None => {
            let ws = crate::commands::workspace::current_workspace(&state)?;
            PathBuf::from(&ws.root_path)
        },
    };
    let snapshot = adl_workspace::capture_git_snapshot_async(&path_buf).await;
    Ok(ipc(Ok(snapshot)))
}

// 模板 2：spawn_blocking + 阻塞 I/O
// 位于 workspace_git.rs:65-83
#[tauri::command]
pub async fn workspace_list_git_branches(
    app: tauri::AppHandle,
    workspace_path: Option<String>,
) -> Result<IpcResult<Vec<GitBranchSummary>>, AppError> {
    let state = app.state::<AppState>();
    let path = match workspace_path {
        Some(p) => PathBuf::from(p),
        None => {
            let ws = crate::commands::workspace::current_workspace(&state)?;
            PathBuf::from(&ws.root_path)
        },
    };
    let branches =
        tokio::task::spawn_blocking(move || adl_workspace::list_git_branches(path.as_path()))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(branches)))
}
```

**转换关键点：**
1. `state: tauri::State<'_, AppState>` → `app: tauri::AppHandle`，函数体内 `let state = app.state::<AppState>();`
2. 返回类型 `IpcResult<T>` → `Result<IpcResult<T>, AppError>`
3. 在 `spawn_blocking` **之前**提取所有需要的数据（owned）
4. `spawn_blocking` 闭包只能捕获 owned 数据，不能捕获 `&state`
5. `spawn_blocking` 后的 `.await` 要处理 `JoinError`：`.map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?`
6. 如果需要在 `spawn_blocking` 之后写 DB，可以在 `.await` 之后用 `state`（`app` 仍然存活）

---

### Task 1: 转换 `workspace_git.rs` 中的 5 个同步 git 命令

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/workspace_git.rs`

**Interfaces:**
- Consumes: `adl_workspace::{switch_git_branch, create_git_branch, stage_file, unstage_file, discard_file_changes}`（已存在，签名不变）
- Produces: 5 个 async Tauri 命令，签名变更但返回类型语义不变

**需要转换的命令：**
1. `workspace_switch_git_branch` (L85-112) — spawn 2-4 git subprocesses
2. `workspace_create_git_branch` (L114-141) — spawn 2-3 git subprocesses
3. `workspace_git_stage_file` (L160-169) — spawn `git add`
4. `workspace_git_unstage_file` (L171-180) — spawn `git restore --staged`
5. `workspace_git_discard_file` (L183-191) — spawn `git checkout`

**辅助函数 `run_git_file_op` 也需要改为 async 版本。**

- [ ] **Step 1: 转换 `workspace_switch_git_branch`**

将 L85-112 的同步实现替换为：

```rust
#[tauri::command]
pub async fn workspace_switch_git_branch(
    app: tauri::AppHandle,
    input: WorkspaceGitBranchSwitchInput,
) -> Result<IpcResult<WorkspaceGitBranchChangeResult>, AppError> {
    let state = app.state::<AppState>();
    let workspace = crate::commands::workspace::current_workspace(&state)?;
    let branch_name = input.branch_name.trim().to_string();
    if branch_name.is_empty() {
        return Ok(ipc(Err(AppError::InvalidInput("branch name is required".into()))));
    }
    let root_path = workspace.root_path.clone();
    let allow_stash = input.allow_stash;
    let (git_snapshot, stashed_changes, previous_branch, has_restored) =
        tokio::task::spawn_blocking(move || {
            adl_workspace::switch_git_branch(
                PathBuf::from(root_path).as_path(),
                &branch_name,
                allow_stash,
            )
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    let result = build_branch_change_result(
        &state,
        workspace,
        git_snapshot,
        previous_branch,
        stashed_changes,
        &branch_name,
        has_restored,
    )?;
    Ok(ipc(Ok(result)))
}
```

**关键点：**
- `workspace.root_path.clone()` 在 `spawn_blocking` 之前提取（owned）
- `branch_name` 是 `String`，`.to_string()` 使其 owned
- `build_branch_change_result` 在 `.await` 之后调用（需要 `&state` 写 DB）
- `branch_name` 在闭包中以 `&branch_name` 引用使用（闭包 move 了 `branch_name` 的所有权，之后在 `build_branch_change_result` 中以 `&branch_name` 引用）

- [ ] **Step 2: 转换 `workspace_create_git_branch`**

将 L114-141 的同步实现替换为：

```rust
#[tauri::command]
pub async fn workspace_create_git_branch(
    app: tauri::AppHandle,
    input: WorkspaceGitBranchCreateInput,
) -> Result<IpcResult<WorkspaceGitBranchChangeResult>, AppError> {
    let state = app.state::<AppState>();
    let workspace = crate::commands::workspace::current_workspace(&state)?;
    let branch_name = input.branch_name.trim().to_string();
    if branch_name.is_empty() {
        return Ok(ipc(Err(AppError::InvalidInput("branch name is required".into()))));
    }
    let root_path = workspace.root_path.clone();
    let base_branch = input.base_branch;
    let allow_stash = input.allow_stash;
    let (git_snapshot, stashed_changes, previous_branch) =
        tokio::task::spawn_blocking(move || {
            adl_workspace::create_git_branch(
                PathBuf::from(root_path).as_path(),
                &branch_name,
                base_branch.as_deref(),
                allow_stash,
            )
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    let result = build_branch_change_result(
        &state,
        workspace,
        git_snapshot,
        previous_branch,
        stashed_changes,
        &branch_name,
        false,
    )?;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 3: 将 `run_git_file_op` 改为 async 辅助函数**

将 L143-158 的同步 `run_git_file_op` 替换为 async 版本：

```rust
async fn run_git_file_op(
    state: &AppState,
    workspace_path: Option<String>,
    relative_path: String,
    op: fn(&Path, &str) -> Result<(), AppError>,
) -> Result<(), AppError> {
    let root_path = match workspace_path {
        Some(p) => p,
        None => {
            let ws = crate::commands::workspace::current_workspace(state)?;
            ws.root_path
        },
    };
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(root_path);
        op(path.as_path(), &relative_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
    .map_err(Into::into)
}
```

**关键点：**
- `op` 改为 `fn` 指针（`impl FnOnce` 在 `spawn_blocking` 中难以传递，因为 `FnOnce` 闭包不是 `Send`）
- `root_path` 和 `relative_path` 都是 owned，可以 move 进闭包
- 如果 `workspace_path` 为 `None`，从 state 获取 `root_path`（快速同步读取）

- [ ] **Step 4: 转换 `workspace_git_stage_file`**

将 L160-169 替换为：

```rust
#[tauri::command]
pub async fn workspace_git_stage_file(
    app: tauri::AppHandle,
    relative_path: String,
    workspace_path: Option<String>,
) -> Result<IpcResult<()>, AppError> {
    let state = app.state::<AppState>();
    let result = run_git_file_op(&state, workspace_path, relative_path, |root, path| {
        adl_workspace::stage_file(root, path)
    })
    .await?;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 5: 转换 `workspace_git_unstage_file`**

将 L171-180 替换为：

```rust
#[tauri::command]
pub async fn workspace_git_unstage_file(
    app: tauri::AppHandle,
    relative_path: String,
    workspace_path: Option<String>,
) -> Result<IpcResult<()>, AppError> {
    let state = app.state::<AppState>();
    let result = run_git_file_op(&state, workspace_path, relative_path, |root, path| {
        adl_workspace::unstage_file(root, path)
    })
    .await?;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 6: 转换 `workspace_git_discard_file`**

将 L182-191 替换为：

```rust
#[tauri::command]
pub async fn workspace_git_discard_file(
    app: tauri::AppHandle,
    relative_path: String,
    workspace_path: Option<String>,
) -> Result<IpcResult<()>, AppError> {
    let state = app.state::<AppState>();
    let result = run_git_file_op(&state, workspace_path, relative_path, |root, path| {
        adl_workspace::discard_file_changes(root, path)
    })
    .await?;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 7: 编译验证**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace`
Expected: 编译通过，无错误

如果出现 `Send` 相关错误（例如闭包捕获了非 `Send` 的数据），检查：
- `spawn_blocking` 闭包是否捕获了 `&state` 或 `tauri::State`（不允许）
- 是否所有捕获的变量都是 owned 且 `Send`

- [ ] **Step 8: Clippy 验证**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo clippy --workspace -- -D warnings`
Expected: 无警告

- [ ] **Step 9: 运行测试**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test --workspace`
Expected: 所有现有测试通过（测试不直接测试 Tauri 命令，但测试底层 `adl_workspace::*` 函数）

- [ ] **Step 10: 格式化并提交**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo fmt --all`

```bash
git add ai-digital-life/src-tauri/src/commands/workspace_git.rs
git commit -m "refactor(rust): convert sync git commands to async + spawn_blocking

Converts 5 sync Tauri commands that spawn git subprocesses to async:
- workspace_switch_git_branch
- workspace_create_git_branch
- workspace_git_stage_file
- workspace_git_unstage_file
- workspace_git_discard_file

These were blocking the Tauri main thread, causing UI freezes during
git operations. The async template already existed in the same file
(workspace_get_git_status, workspace_list_git_branches).

Refs: C1 in refactor-insight-2026-07-15.md"
```

---

### Task 2: 转换 `workspace_open` 为 async

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/workspace.rs:17-46`

**Interfaces:**
- Consumes: `adl_workspace::{open_workspace, build_retrieval_snapshot}`（同步版本，保留）
- Produces: async `workspace_open` 命令

**注意：** `build_retrieval_snapshot_async` 已存在（`crates/workspace/src/tree.rs:261`），但它需要一个 `tokio::sync::broadcast::Receiver<()>` 参数用于取消。在 `workspace_open` 场景中我们不需要取消功能，所以直接用 `spawn_blocking` 包装同步版本 `build_retrieval_snapshot` 更简单。

- [ ] **Step 1: 转换 `workspace_open`**

将 L17-46 的同步实现替换为：

```rust
#[tauri::command]
pub async fn workspace_open(
    app: tauri::AppHandle,
    workspace_path: String,
) -> Result<IpcResult<WorkspaceMeta>, AppError> {
    let state = app.state::<AppState>();
    let path = PathBuf::from(workspace_path);

    // Phase 1: open workspace (file I/O) + build retrieval snapshot (tree walk) in spawn_blocking
    let (meta, snapshot) = tokio::task::spawn_blocking(move || {
        let (meta, _recent) = adl_workspace::open_workspace(path.as_path())?;
        let snapshot = adl_workspace::build_retrieval_snapshot(
            &meta.id,
            PathBuf::from(&meta.root_path).as_path(),
        )?;
        Ok::<_, AppError>((meta, snapshot))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;

    // Phase 2: persist to DB + emit events (back on async runtime, state access is safe)
    persist_workspace_meta(&state, &meta)?;
    state.event_bus.emit(adl_kernel::events::AppEvent::WorkspaceOpened(meta.id.clone()));

    state.db.save_entity(
        EntityTable::RetrievalSnapshots,
        &meta.id,
        Some(&meta.id),
        None,
        Some("completed"),
        &snapshot,
    )?;
    let _ = app.emit("digital-life://retrieval-status", &snapshot);
    state.event_bus.emit(adl_kernel::events::AppEvent::RetrievalStatusChanged(meta.id.clone()));
    super::workspace_sidebar::upsert_sidebar_after_open(&state, &meta)?;

    Ok(ipc(Ok(meta)))
}
```

**关键点：**
- `open_workspace` + `build_retrieval_snapshot` 在同一个 `spawn_blocking` 中执行（两者都是文件 I/O，合并减少线程切换）
- DB 写入 + 事件发射在 `.await` 之后执行（需要 `&state`，state 在 app 生命周期内存活）
- `meta` 和 `snapshot` 从闭包返回（owned，`Send`）

- [ ] **Step 2: 编译验证**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace`
Expected: 编译通过

- [ ] **Step 3: Clippy + 测试 + 格式化**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo clippy --workspace -- -D warnings
cargo test --workspace
cargo fmt --all
```
Expected: 全部通过

- [ ] **Step 4: 提交**

```bash
git add ai-digital-life/src-tauri/src/commands/workspace.rs
git commit -m "refactor(rust): convert workspace_open to async + spawn_blocking

workspace_open was a sync command performing heavy I/O on the main
thread: open_workspace (file I/O) + build_retrieval_snapshot (recursive
directory walk reading every file) + DB writes. This caused multi-second
UI freezes when opening workspaces with 10k+ files.

Now the I/O-heavy portion runs in spawn_blocking, with DB writes and
event emission back on the async runtime.

Refs: C2 in refactor-insight-2026-07-15.md"
```

---

### Task 3: 转换 `workspace.rs` 中的 10 个同步文件操作命令

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/workspace.rs`

**需要转换的命令：**
1. `workspace_create_file` (L73-80) — uses `workspace_cmd!` macro
2. `workspace_create_folder` (L82-88) — uses `workspace_cmd!` macro
3. `workspace_read_file` (L90-108) — file I/O
4. `workspace_get_change_preview` (L110-129) — file I/O + git diff
5. `workspace_search` (L150-156) — **worst case**: full text scan
6. `workspace_outline` (L158-164) — file read + parse
7. `workspace_rename_file` (L193-200) — uses `workspace_cmd!` macro
8. `workspace_delete_file` (L202-222) — file I/O + event emit
9. `workspace_duplicate_file` (L224-231) — uses `workspace_cmd!` macro
10. `workspace_move_file` (L241-248) — uses `workspace_cmd!` macro

**`workspace_cmd!` 宏的问题：** 该宏（`mod.rs:79-94`）是同步的，内部读取 `state.current_workspace`。我们需要为 async 命令提供等价的辅助函数。

- [ ] **Step 1: 添加 async 辅助函数 `with_workspace_async`**

在 `workspace.rs` 文件末尾（L280 之后）添加：

```rust
/// Async helper: get current workspace root path, then run a blocking
/// operation in spawn_blocking. The workspace is resolved on the async
/// runtime (fast sync read), the blocking op runs on a worker thread.
pub async fn with_workspace_async<T>(
    state: &AppState,
    op: fn(&Path) -> Result<T, AppError>,
) -> Result<T, AppError> {
    let ws = current_workspace(state)?;
    let root_path = ws.root_path;
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(root_path);
        op(path.as_path())
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
    .map_err(Into::into)
}
```

**关键点：**
- `op` 是 `fn(&Path) -> Result<T, AppError>` 函数指针（`Send`，可跨线程传递）
- `root_path` 是 owned `String`，move 进闭包
- 适用于单参数（`&Path`）的 `adl_workspace::*` 函数

- [ ] **Step 2: 转换 `workspace_create_file`**

```rust
#[tauri::command]
pub async fn workspace_create_file(
    app: tauri::AppHandle,
    relative_path: String,
    content: String,
) -> Result<IpcResult<WorkspaceFileDocument>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::create_file(
            PathBuf::from(root_path).as_path(),
            &relative_path,
            &content,
        )
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 3: 转换 `workspace_create_folder`**

```rust
#[tauri::command]
pub async fn workspace_create_folder(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let result = with_workspace_async(&state, |root| {
        adl_workspace::create_folder(root, &relative_path)
    })
    .await?;
    Ok(ipc(Ok(result)))
}
```

**注意：** `create_folder` 接受 `(&Path, &str)`，但 `with_workspace_async` 只接受 `fn(&Path)`。这里需要直接写 `spawn_blocking`（参考 Step 2 的模式），因为有两个参数。

修正：

```rust
#[tauri::command]
pub async fn workspace_create_folder(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::create_folder(PathBuf::from(root_path).as_path(), &relative_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 4: 转换 `workspace_read_file`**

```rust
#[tauri::command]
pub async fn workspace_read_file(
    app: tauri::AppHandle,
    relative_path: String,
    workspace_path: Option<String>,
) -> Result<IpcResult<WorkspaceFileDocument>, AppError> {
    let state = app.state::<AppState>();
    let root_path = match workspace_path {
        Some(p) => p,
        None => {
            let ws = current_workspace(&state)?;
            ws.root_path
        },
    };
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::read_file(PathBuf::from(root_path).as_path(), &relative_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 5: 转换 `workspace_get_change_preview`**

```rust
#[tauri::command]
pub async fn workspace_get_change_preview(
    app: tauri::AppHandle,
    relative_path: String,
    workspace_path: Option<String>,
) -> Result<IpcResult<WorkspaceChangePreview>, AppError> {
    let state = app.state::<AppState>();
    let root_path = match workspace_path {
        Some(p) => p,
        None => {
            let ws = current_workspace(&state)?;
            ws.root_path
        },
    };
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::read_change_preview(PathBuf::from(root_path).as_path(), &relative_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 6: 转换 `workspace_search`（最高优先级——全文扫描）**

```rust
#[tauri::command]
pub async fn workspace_search(
    app: tauri::AppHandle,
    query: String,
) -> Result<IpcResult<Vec<WorkspaceSearchHit>>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::search_text(PathBuf::from(root_path).as_path(), &query)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 7: 转换 `workspace_outline`**

```rust
#[tauri::command]
pub async fn workspace_outline(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<IpcResult<Vec<FileOutlineItem>>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::outline(PathBuf::from(root_path).as_path(), &relative_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 8: 转换 `workspace_rename_file`**

```rust
#[tauri::command]
pub async fn workspace_rename_file(
    app: tauri::AppHandle,
    relative_path: String,
    new_name: String,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::rename_entry(PathBuf::from(root_path).as_path(), &relative_path, &new_name)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 9: 转换 `workspace_delete_file`（需要事件发射）**

```rust
#[tauri::command]
pub async fn workspace_delete_file(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let rel_path = relative_path.clone();
    let succeeded = tokio::task::spawn_blocking(move || {
        adl_workspace::delete_entry(PathBuf::from(root_path).as_path(), &rel_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;

    match succeeded {
        true => {
            let _ = app.emit(
                "digital-life://workspace-file-changed",
                WorkspaceFileChangedEvent { path: relative_path, last_modified_at: now_ms() },
            );
            Ok(ipc(Ok(true)))
        },
        false => Ok(ipc(Ok(false))),
    }
}
```

**关键点：** 事件发射在 `.await` 之后（需要 `app.emit`）；`relative_path` 克隆一份给闭包，原值保留给事件

- [ ] **Step 10: 转换 `workspace_duplicate_file`**

```rust
#[tauri::command]
pub async fn workspace_duplicate_file(
    app: tauri::AppHandle,
    relative_path: String,
    new_path: String,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::duplicate_entry(PathBuf::from(root_path).as_path(), &relative_path, &new_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 11: 转换 `workspace_move_file`**

```rust
#[tauri::command]
pub async fn workspace_move_file(
    app: tauri::AppHandle,
    relative_path: String,
    new_path: String,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::move_entry(PathBuf::from(root_path).as_path(), &relative_path, &new_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 12: 转换 `workspace_get_absolute_path`（额外发现）**

```rust
#[tauri::command]
pub async fn workspace_get_absolute_path(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<IpcResult<String>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::get_absolute_path(PathBuf::from(root_path).as_path(), &relative_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 13: 删除不再使用的 `with_workspace_async` 辅助函数（如果未被使用）**

检查 Step 1 添加的 `with_workspace_async` 是否被任何命令使用。如果所有命令都直接写了 `spawn_blocking`（因为需要多个参数），则删除该函数避免 dead code 警告。

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace 2>&1 | Select-String "with_workspace_async"`
如果出现 `function is never used` 警告，删除该函数。

- [ ] **Step 14: 编译验证**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace`
Expected: 编译通过

- [ ] **Step 15: Clippy + 测试 + 格式化**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo clippy --workspace -- -D warnings
cargo test --workspace
cargo fmt --all
```
Expected: 全部通过

- [ ] **Step 16: 提交**

```bash
git add ai-digital-life/src-tauri/src/commands/workspace.rs
git commit -m "refactor(rust): convert sync workspace commands to async + spawn_blocking

Converts 11 sync Tauri commands performing file I/O to async:
- workspace_open (already converted in prior commit, included for context)
- workspace_create_file, workspace_create_folder
- workspace_read_file, workspace_get_change_preview
- workspace_search (worst: full text scan), workspace_outline
- workspace_rename_file, workspace_delete_file
- workspace_duplicate_file, workspace_move_file
- workspace_get_absolute_path

All were blocking the main thread. workspace_search on a large workspace
was the worst case (full text scan).

Refs: C3 in refactor-insight-2026-07-15.md"
```

---

### Task 4: 转换 `agent.rs` 中的 3 个同步命令

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/agent.rs:63-100`

**需要转换的命令：**
1. `agent_get_run` (L63-69) — DB read
2. `agent_retry_run` (L71-85) — DB read + write
3. `agent_abort_run` (L87-100) — DB read + write

**`load_run_detail` 和 `save_run_detail` 是同步函数（L264-300+），包含 DB I/O。需要包装在 `spawn_blocking` 中。**

- [ ] **Step 1: 转换 `agent_get_run`**

将 L63-69 替换为：

```rust
#[tauri::command]
pub async fn agent_get_run(
    app: tauri::AppHandle,
    run_id: String,
) -> Result<IpcResult<Option<AgentRunDetail>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let detail = tokio::task::spawn_blocking(move || {
        let run = db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, &run_id)?;
        let Some(run) = run else {
            return Ok(None);
        };
        let mut steps: Vec<adl_types::AgentPlanStep> =
            db.list_entities(EntityTable::AgentSteps)?;
        steps.retain(|step| step.run_id == run_id);
        steps.sort_by_key(|step| step.created_at);
        Ok::<_, AppError>(Some(AgentRunDetail { run, steps }))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(detail)))
}
```

**关键点：**
- `state.db.clone()` — 数据库连接池是 `Arc` 内部，clone 是廉价的
- 不使用 `load_run_detail` 辅助函数（因为它引用 `&AppState`，不能 move 进闭包）
- 闭包内内联了 `load_run_detail` 的逻辑

**注意：** 需要确认 `state.db` 类型是否实现 `Clone` + `Send`。如果不实现，需要改为在闭包内重新获取连接。检查 `AppState` 的 `db` 字段类型。

Run: `grep -n "pub db:" ai-digital-life/src-tauri/src/state.rs`
如果 `db` 是 `Arc<Storage>` 或类似 `Arc` 包装，`.clone()` 可行。

- [ ] **Step 2: 转换 `agent_retry_run`**

将 L71-85 替换为：

```rust
#[tauri::command]
pub async fn agent_retry_run(
    app: tauri::AppHandle,
    run_id: String,
) -> Result<IpcResult<Option<AgentRunDetail>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let detail = tokio::task::spawn_blocking(move || {
        let run = db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, &run_id)?;
        let Some(mut detail) = run.map(|run| {
            let mut steps: Vec<adl_types::AgentPlanStep> =
                db.list_entities(EntityTable::AgentSteps).unwrap_or_default();
            steps.retain(|step| step.run_id == run_id);
            steps.sort_by_key(|step| step.created_at);
            AgentRunDetail { run, steps }
        }) else {
            return Ok(None);
        };
        detail.run.status = AgentRunStatus::Ready;
        detail.run.updated_at = adl_types::now_ms();
        // save_run_detail logic inlined
        db.save_entity(
            EntityTable::AgentRuns,
            &detail.run.id,
            Some(&detail.run.workspace_id),
            Some(&detail.run.session_id),
            Some("ready"),
            &detail.run,
        )?;
        for step in &detail.steps {
            db.save_entity(
                EntityTable::AgentSteps,
                &step.id,
                Some(&step.workspace_id),
                Some(&step.session_id),
                Some(&step.run_id),
                step,
            )?;
        }
        Ok(Some(detail))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(detail)))
}
```

**注意：** 这里需要检查 `save_run_detail` 的完整实现。如果 `save_run_detail` 函数（agent.rs:277+）只使用 `state.db`，可以将其改为接受 `&Storage` 参数的独立函数。

- [ ] **Step 3: 检查 `save_run_detail` 完整实现并决定是否重构**

Run: `grep -n "fn save_run_detail" ai-digital-life/src-tauri/src/commands/agent.rs`

阅读 `save_run_detail` 函数体。如果它只使用 `state.db`，考虑将其重构为：

```rust
fn save_run_detail_with_db(db: &adl_storage::Storage, detail: &AgentRunDetail) -> Result<(), AppError> {
    // ... existing logic, replacing state.db with db ...
}
```

然后 `save_run_detail` 变为：
```rust
pub fn save_run_detail(state: &AppState, detail: &AgentRunDetail) -> Result<(), AppError> {
    save_run_detail_with_db(&state.db, detail)
}
```

这样 `spawn_blocking` 闭包可以调用 `save_run_detail_with_db(&db, &detail)`。

- [ ] **Step 4: 转换 `agent_abort_run`**

```rust
#[tauri::command]
pub async fn agent_abort_run(
    app: tauri::AppHandle,
    run_id: String,
) -> Result<IpcResult<Option<AgentRunDetail>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let detail = tokio::task::spawn_blocking(move || {
        let run = db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, &run_id)?;
        let Some(detail) = run.map(|run| {
            let mut steps: Vec<adl_types::AgentPlanStep> =
                db.list_entities(EntityTable::AgentSteps).unwrap_or_default();
            steps.retain(|step| step.run_id == run_id);
            steps.sort_by_key(|step| step.created_at);
            AgentRunDetail { run, steps }
        }) else {
            return Ok(None);
        };
        let detail = adl_agent_runtime::abort_run(detail);
        save_run_detail_with_db(&db, &detail)?;
        Ok(Some(detail))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(detail)))
}
```

- [ ] **Step 5: 编译验证**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check --workspace`
Expected: 编译通过

如果 `state.db` 不是 `Clone`，检查 `AppState` 定义：
Run: `grep -n "pub struct AppState" ai-digital-life/src-tauri/src/state.rs`
查看 `db` 字段类型。如果是 `Arc<Storage>`，clone 可行。如果需要改造，将 `db` 包装在 `Arc` 中（如果还不是的话）。

- [ ] **Step 6: Clippy + 测试 + 格式化**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo clippy --workspace -- -D warnings
cargo test --workspace
cargo fmt --all
```
Expected: 全部通过

- [ ] **Step 7: 提交**

```bash
git add ai-digital-life/src-tauri/src/commands/agent.rs ai-digital-life/src-tauri/src/state.rs
git commit -m "refactor(rust): convert sync agent commands to async + spawn_blocking

Converts 3 sync Tauri commands doing DB I/O to async:
- agent_get_run, agent_retry_run, agent_abort_run

Also refactors save_run_detail into save_run_detail_with_db to allow
reuse in spawn_blocking context where &AppState is not available.

Refs: C4 in refactor-insight-2026-07-15.md"
```

---

### Task 5: 修复 `snapshot.rs` 中 `list_snapshots` / `prune_snapshots` 缺少 `spawn_blocking`

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/snapshot.rs:45-54, 71-80`

**问题：** 这两个命令已经是 `pub async fn`，但直接调用 `manager.list_snapshots()` / `manager.prune_snapshots()`，这些方法执行 `std::fs::read_dir` + `std::fs::read_to_string` + `std::fs::remove_dir_all`，阻塞 Tokio 运行时。同文件的 `create_snapshot` (L27-43) 和 `revert_to_snapshot_cmd` (L56-69) 已正确使用 `spawn_blocking`。

- [ ] **Step 1: 修复 `list_snapshots`**

将 L45-54 替换为：

```rust
#[tauri::command]
pub async fn list_snapshots(
    workspace_id: String,
    workspace_root: String,
) -> Result<IpcResult<Vec<SnapshotRecord>>, AppError> {
    let manager = get_snapshot_manager(&workspace_id, &workspace_root)?;
    let snapshots = tokio::task::spawn_blocking(move || manager.list_snapshots())
        .await
        .map_err(|e| AppError::Internal(format!("List snapshots task failed: {}", e)))??;
    Ok(ipc(Ok(snapshots)))
}
```

- [ ] **Step 2: 修复 `prune_snapshots`**

将 L71-80 替换为：

```rust
#[tauri::command]
pub async fn prune_snapshots(
    workspace_id: String,
    workspace_root: String,
) -> Result<IpcResult<usize>, AppError> {
    let manager = get_snapshot_manager(&workspace_id, &workspace_root)?;
    let pruned = tokio::task::spawn_blocking(move || manager.prune_snapshots())
        .await
        .map_err(|e| AppError::Internal(format!("Prune snapshots task failed: {}", e)))??;
    Ok(ipc(Ok(pruned)))
}
```

**关键点：**
- 模式完全照搬同文件 `create_snapshot` (L34-42) 的 `spawn_blocking` 写法
- `manager` 是 owned，可以 move 进闭包
- 需要确认 `SnapshotManager` 实现了 `Send`（应该已实现，因为它只包含 `PathBuf` 和 `String`）

- [ ] **Step 3: 编译 + Clippy + 测试 + 格式化**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check --workspace
cargo clippy --workspace -- -D warnings
cargo test --workspace
cargo fmt --all
```
Expected: 全部通过

- [ ] **Step 4: 提交**

```bash
git add ai-digital-life/src-tauri/src/commands/snapshot.rs
git commit -m "fix(rust): wrap list_snapshots/prune_snapshots in spawn_blocking

These async commands were calling sync fs I/O (read_dir, read_to_string,
remove_dir_all) directly on the Tokio runtime, stalling other async tasks.
The fix mirrors the pattern already used by create_snapshot and
revert_to_snapshot_cmd in the same file.

Refs: H3 in refactor-insight-2026-07-15.md"
```

---

### Task 6: 全量验证与回归测试

**Files:**
- 无文件修改，仅验证

- [ ] **Step 1: 全量编译检查**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check --workspace
```
Expected: 编译通过，无错误

- [ ] **Step 2: 全量 Clippy 检查**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo clippy --workspace --all-targets -- -D warnings`
Expected: 无警告

- [ ] **Step 3: 全量测试**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test --workspace`
Expected: 所有测试通过

- [ ] **Step 4: 前端类型检查（确保 IPC 类型未受影响）**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: 类型检查通过（如果 `ts_rs` 生成的类型有变化，前端类型应该自动更新）

- [ ] **Step 5: 前端 Lint 检查**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run lint
```
Expected: 无 lint 错误

- [ ] **Step 6: 最终格式化**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo fmt --all
```

- [ ] **Step 7: 验收报告**

在终端输出验收结果：
- [ ] `cargo check --workspace` 通过
- [ ] `cargo clippy --workspace --all-targets -- -D warnings` 通过
- [ ] `cargo test --workspace` 通过
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm lint` 通过
- [ ] 所有同步命令已转换为 async
- [ ] 无 `unwrap()` 新增（除 `#[cfg(test)]`）
- [ ] `cargo fmt --all` 已执行

---

## Self-Review

### Spec coverage

对照 `refactor-insight-2026-07-15.md` 的 Phase A 发现：

| Finding | Covered by Task | Status |
|---------|----------------|--------|
| C1 — sync git commands (5) | Task 1 (Steps 1-6) | ✅ |
| C2 — sync workspace_open | Task 2 | ✅ |
| C3 — sync workspace file ops (10+) | Task 3 (Steps 2-12) | ✅ |
| C4 — sync agent commands (3) | Task 4 | ✅ |
| H3 — list_snapshots/prune_snapshots | Task 5 | ✅ |

### Placeholder scan

- ✅ 无 "TBD" / "TODO" / "implement later"
- ✅ 每个 Step 都有完整代码
- ✅ 每个命令的转换都有确切的替换代码
- ✅ 验证步骤有确切的命令和预期输出

### Type consistency

- ✅ 所有 async 命令使用 `app: tauri::AppHandle` + `app.state::<AppState>()`
- ✅ 所有返回类型统一为 `Result<IpcResult<T>, AppError>`
- ✅ `spawn_blocking` 错误处理统一为 `.map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?`
- ✅ `save_run_detail_with_db` 在 Task 4 Step 3 定义，Step 4 使用——名称一致

### 已知风险

1. **`state.db` 的 `Clone` 能力**：Task 4 假设 `state.db` 可以 clone（`Arc<Storage>`）。如果不行，需要在 Task 4 Step 1 中先改造 `AppState`。这是唯一的不确定性，需要在执行时验证。

2. **`workspace_cmd!` 宏的遗留使用**：转换后，如果某些命令仍使用 `workspace_cmd!` 宏（同步），需要确认这些命令是否也被转换。Task 3 转换了所有使用该宏的命令，转换后该宏可能变为 dead code。需要检查是否有其他文件使用该宏。

3. **闭包 `Send` 约束**：如果 `adl_workspace::*` 函数返回的类型不是 `Send`，`spawn_blocking` 闭包无法编译。但这些函数返回的都是 `Result<T, AppError>`，其中 `T` 是基本类型或 `Vec`，应该都是 `Send`。
