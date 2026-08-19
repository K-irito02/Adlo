# Task 3 报告 — 静默抓取：命令接线 + 通道轮询 + 完成判定

## 状态

**DONE**

## 变更文件

| 文件 | 类型 |
|------|------|
| `ai-digital-life/src-tauri/src/commands/browser.rs` | 修改（核心实现 + 单测） |
| `ai-digital-life/src-tauri/src/main.rs` | 修改（`generate_handler!` 注册新命令） |

未改动本 Task 范围外的任何文件；未新增依赖（`tokio`/`adl_browser`/`adl_types` 均为既有依赖，本文件已 import）。

## 消费接口（Task 2 交付，已确认）

- `create_silent_webview(app, state, url) -> Result<(String, tokio::sync::mpsc::UnboundedReceiver<(String,String,String,String)>), AppError>`（同步 `pub fn`，内部 `blocking_recv()`）— 存在本文件同模块，直接调用。
- `silent_webview_label(tab_id) -> String`（`adl-silent-view-{id}`）— 本文件。
- `adl_browser::META_SOURCE_COM` / `PageMetaService` / `is_placeholder_title` / `is_unsafe_title` / `SiteMetaCacheEntry` / `SiteMetaCacheStore` 均确认经 `adl_browser` 桶导出可用。

## 新增函数 / 常量 / 命令签名

```rust
/// 静默标签页抓取超时（毫秒），与前端 bookMarkMeta 体验对齐。
pub const SILENT_FETCH_TIMEOUT_MS: u64 = 6000;

fn silent_title_ok(title: &str, url: &str) -> bool
fn silent_converged(title: &str, url: &str, favicon_url: &str) -> bool
fn page_meta_from_entry(e: SiteMetaCacheEntry, url: &str) -> PageMeta
fn best_silent_meta(svc: &PageMetaService, url: &str) -> PageMeta

async fn wait_for_silent_meta(
    rx: &mut tokio::sync::mpsc::UnboundedReceiver<(String, String, String, String)>,
    svc: &PageMetaService,
    url: &str,
) -> PageMeta

async fn poll_silent_meta(...) -> PageMeta  // 轮询主体

fn destroy_silent_webview(app: &tauri::AppHandle, tab_id: &str)

#[tauri::command]
pub async fn browser_page_meta_get_silent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<IpcResult<PageMeta>, CommandError>
```

## wait_for_silent_meta 完成判定规则

- `silent_title_ok(title,url) = !title.is_empty() && !is_placeholder_title && !is_unsafe_title`
- `silent_converged(title,url,fav) = silent_title_ok(title,url) && !fav.is_empty()`
- 轮询：每轮 `tokio::time::timeout(300ms, rx.recv())`。收到元组即 `svc.report(&u,&title,&fav, META_SOURCE_COM).await` 持久化（用其缓存条目 `svc.peek` 做判定，避开 unsafe/placeholder 门控伪数据）。
- 收敛：`has_title && has_fav` → 立即返回。
- 部分提前返回：`(has_title || has_fav)` 且自首个非空起 `elapsed >= 1500ms`。
- 总体超时：`tokio::time::timeout(SILENT_FETCH_TIMEOUT_MS=6000ms, poll...)` → 超时走 `best_silent_meta`（返回已落缓存的部分；无有效元数据则 `empty_page_meta`）。
- channel 关闭（`Ok(None)`）→ `best_silent_meta`。
- 返回 `PageMeta` 的 `source`：有 title → `META_SOURCE_COM`，否则空（`page_meta_from_entry`）。

## spawn_blocking 方案与理由

`create_silent_webview` 是同步函数、内部用 `oneshot::Receiver::blocking_recv()` 阻塞等待主线程创建结果。在 `#[tauri::command]` 的 tokio async 工作线程内直接调用会 panic。解决：命令入口用 `tokio::task::spawn_blocking(move || { app_owned.state::<AppState>() … create_silent_webview(...) })` 包住创建；返回的 channel receiver 回到命令 async 上下文经 `wait_for_silent_meta` 以 `rx.recv().await` 消费。

Tauri 命令 runtime 默认即 tokio，`tokio::task::spawn_blocking` 可用且编译通过（`cargo check/clippy` 均通过），故无需退路 `tauri::async_runtime::spawn_blocking` 或 `std::thread::spawn`。

销毁在主线程：`app.run_on_main_thread` 内 `app.get_window("main") → window.get_webview(adl_silent_view_{tab_id}) → close()`；找不到记 `warn`（泄漏风险）。这是 `fn destroy_silent_webview`。

## 命令注册

在 `src-tauri/src/main.rs` 的 `tauri::generate_handler![]` 中、`browser_page_meta_warmup` 之后新增：
`commands::browser::browser_page_meta_get_silent,`

## `#[allow(dead_code)]` 处理

已移除 `create_silent_webview` 上的 `#[allow(dead_code)]`（及其 dead-code 说明注释），因为现在被 `browser_page_meta_get_silent` 引用、成为可达命令路径的一部分。保留 `#[allow(clippy::type_complexity)]`（签名按简报锁定）。

## 单测（`#[cfg(test)] mod silent_meta_tests`，8 个）

- `silent_title_ok_rejects_unsafe_and_placeholder` / `silent_title_ok_accepts_real_title`：unsafe/placeholder 判定。
- `silent_converged_requires_title_and_favicon`：收敛逻辑。
- `page_meta_from_entry_sets_com_source_when_title_present` / `_empty_title_loses_source`：source 语义。
- `best_silent_meta_falls_back_to_empty_when_no_cache`：空缓存兜底。
- `report_then_best_returns_partial_com_meta`：report→peek 部分元数据路径。
- `channel_close_returns_best_partial_meta`：channel 关闭提前返回已得部分。

测试辅助 `empty_svc()` 用临时目录构造 `PageMetaService`；目录名含 `adl_types::create_id("sm")` 唯一后缀，避免并行测试删建同一临时目录导致 `SiteMetaCacheStore::open` 竞争失败。

> WebView2 真实渲染无法单测，命令级仅编译/clippy/既有测试验证（符合简报）。

## 验证输出（按简报顺序）

| 步骤 | 结果 |
|------|------|
| `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` | 执行 |
| `cargo check --workspace` | ✅ 编译通过 |
| `cargo clippy --workspace --all-targets -- -D warnings` | ✅ 通过（无 error/warning） |
| `cargo test -p adl-browser` | ✅ 83 passed; 0 failed |
| `cargo test -p ai-digital-life`(src-tauri包名) | ✅ 52 passed; 0 failed（含新增 8 个 silent_meta_tests） |
| `cargo fmt --all` | ✅ 已格式化（首个 fmt 后校正 3 处，随后 `--check` 干净） |

已知 `crates/server` 的 `pty_ws` 集成测试在本沙箱环境因 PTY 失败属 Environment 问题，与本变更零耦合（Task 2 已确认），未阻塞。

## 提交

- Commit：`13c9f90135bdc062f73f76bbd662ba8ba5f2ed6a`
  （`feat(browser): add silent-tab meta fetch command with cache polling + timeout`）
- 纳入提交：`ai-digital-life/src-tauri/src/commands/browser.rs`、`ai-digital-life/src-tauri/src/main.rs`
- 本报告文件**未**提交。

## 未决疑虑

1. **生效/Pull 尚未接线**（设计内）：新命令当前可直接由前端调用，但 Task 4 才在 `SILENT_FETCH_ENABLED` 开启时将 `SILENT_FETCH_ENABLED` 作为目标调用接入。本 Task 未改动任何既有命令行为。
2. **销毁 await 时序**：`destroy_silent_webview` 在 `run_on_main_thread` 内 `close()`，未 await 其结果；对回收场景无硬性时序要求，靠主线程 dispatch 保证不在渲染创建线程上销毁。
3. **`first_meta_at` 语义近似**：以"peek 条目含有效 title 或 favicon"记为首个非空（report 对全空元组不会建条目，故近似安全）。
4. **`pty_ws` 环境性失败**：见上，非本 Task 引入。