# Tauri 同步命令阻塞主线程导致"未响应"（2026-07-14）

## 问题

启动覆盖层动画期间，用户点击窗口会触发 Windows "未响应"状态，动画也会停顿。

## 根因

**Tauri 同步命令（`pub fn`，非 `async fn`）在主线程上执行 I/O 操作，阻塞了 tao 事件循环。**

### 证据链

1. Rust 日志显示宿主窗口在 11.5 秒内收到**零条** Windows 消息（`msg[2]` → `msg[3]` 间隙）
2. 前端日志显示 `[BOOT-TIMING] git status loaded` → `[BOOT-TIMING] workspaces loaded` 耗时 ~11 秒
3. 在此期间，前端执行工作区批量加载，调用以下**同步** Tauri 命令：

| 命令 | 阻塞操作 | 调用次数 |
|------|---------|---------|
| `workspace_list_tree` | 递归遍历文件系统 | ×N |
| `workspace_list_git_branches` | git 子进程 | ×1 |
| `command_list_recent` | 数据库读取 | ×1 |
| `task_list_audit_entries` | 数据库读取 | ×1 |

4. 所有已尝试的"前端方案"均无效（根因在后端）：
   - `pointer-events: none` — 不影响后端主线程
   - OffscreenCanvas + Web Worker — 动画已移出主线程，但后端仍阻塞
   - `SetWindowSubclass` + WM_NCHITTEST 拦截 — `hittest_intercepts=0`，从未触发

## 修复

### 1. 后端：同步命令改 async + spawn_blocking

将 4 个同步命令改为 `async fn` + `tokio::task::spawn_blocking`，将 I/O 操作移到 tokio 阻塞线程池。

| 文件 | 命令 | 修改 |
|------|------|------|
| `src-tauri/src/commands/workspace.rs` | `workspace_list_tree` | `pub fn` → `pub async fn` + `spawn_blocking` |
| `src-tauri/src/commands/workspace_git.rs` | `workspace_list_git_branches` | `pub fn` → `pub async fn` + `spawn_blocking` |
| `src-tauri/src/commands/command.rs` | `command_list_recent` | `pub fn` → `pub async fn` + `spawn_blocking` |
| `src-tauri/src/commands/task.rs` | `task_list_audit_entries` | `pub fn` → `pub async fn` + `spawn_blocking` |

### 2. 前端：修复 OffscreenCanvas 主题切换崩溃

`flow-field-background.tsx` 的 `useEffect` 依赖项包含颜色 props（`color`, `bgColor`, `trailColor`, `trailOpacity`）。启动期间主题从 HTML 默认 `light` 切换到实际主题时，effect 重新执行，对同一 canvas 再次调用 `transferControlToOffscreen()` 导致崩溃（该方法只能调用一次）。

**修复**：将 canvas 初始化（空依赖，仅执行一次）与颜色更新（通过 `postMessage` 通知 Worker）分离。

### 3. 删除无效的防御层

`overlay_state.rs`（WM_NCHITTEST 拦截）和 `commands/overlay.rs`（`set_startup_overlay_active` 命令）已证明无效（`hittest_intercepts=0`），已删除。

### 标准模式

```rust
// ❌ 错误：同步命令阻塞主线程
#[tauri::command]
pub fn workspace_list_tree(state: tauri::State<'_, AppState>) -> IpcResult<Vec<WorkspaceTreeNode>> {
    ipc(adl_workspace::list_tree(...))
}

// ✅ 正确：async + spawn_blocking
#[tauri::command]
pub async fn workspace_list_tree(
    app: tauri::AppHandle,
    workspace_path: Option<String>,
) -> Result<IpcResult<Vec<WorkspaceTreeNode>>, AppError> {
    let state = app.state::<AppState>();
    let path = /* resolve */;
    let tree = tokio::task::spawn_blocking(move || adl_workspace::list_tree(path.as_path()))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(tree)))
}
```

## 经验教训

1. **Tauri 同步命令在主线程执行**。任何 I/O 操作（文件、git、数据库）必须使用 `async fn` + `spawn_blocking`
2. **前端方案无法解决后端阻塞**。Canvas 动画、CSS 隔离、事件拦截都无法缓解 Rust 主线程阻塞
3. **无效防御层应及时删除**。WM_NCHITTEST 拦截从未触发（`hittest_intercepts=0`），保留只会增加代码复杂度
4. **`transferControlToOffscreen` 只能调用一次**。涉及颜色变化的 canvas 组件必须将初始化与颜色更新分离
5. **覆盖层需要超时保底**。appReady 可能因各种原因卡住，必须有最大超时强制退出机制

## 相关文件

- [tauri-shell.md](../../../.trae/rules/tauri-shell.md) — Tauri 命令 async 规范
- [dev-rules.md](../../../.trae/rules/dev-rules.md) — 常见根因速查
- [startup-overlay-design.md](../../specs/ui/2026-07-13-startup-overlay-design.md) — 覆盖层设计文档
