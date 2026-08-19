# Task 3 简报 — 静默抓取：命令接线 + 通道轮询 + 完成判定

> 本简报是唯一需求来源。请严格按此实现，不要读整个计划文件。
> **子 Agent 隔离**：你只实现本 Task。Task 2 已交付 `create_silent_webview`（见下方接口），你消费它。

## 目标与上下文

把静默标签页真正用起来：新增 Tauri 命令 `browser_page_meta_get_silent`，创建静默 WebView 渲染真实页面 → 从 Task 2 返回的 channel 轮询拿到 title/favicon → 写入 `PageMetaService` 缓存 → 销毁静默 WebView → 广播并返回 `PageMeta`。这是"Chrome/Edge 视为真实渲染主路径"的核心落地；HTTP 爬虫在 Task 4 才被降级/禁用。

## 已由主 Agent 解决的关键设计决策（必须遵守）

1. **`create_silent_webview` 是同步函数，内部用 `blocking_recv()`，在 tokio async worker 内调用会 panic。命令必须用 `spawn_blocking` 包装创建调用。**（这是 Task 2 评审强制落实的跨 Task 契约。）
2. **不走 `PageMetaFetcher` trait**。计划原文设想 `SilentTabFetcher` 实现 `PageMetaFetcher`，但 `fetch` 只给 `&self + url`、无法提供 `AppHandle`/`AppState`，且返回的 future 在被 `svc.get` await 的 tokio 上下文执行，无法安全做阻塞主线程创建。**本 Task 改为自包含 async 命令** `browser_page_meta_get_silent`（创建用 spawn_blocking、轮询用 async `rx.recv().await`）。该命令在 Task 4 作为 `SILENT_FETCH_ENABLED` 开启时的目标调用。这是对计划的技术性偏差，行为目标一致。
3. **channel 元组语义**：`(tab_id, url, title, favicon)`（`CachedMetaBridge` 只发送 `url/title` 均非空的条目；它写的是页面的 title/favicon，不写缓存）。消费方收到后自行 `svc.report(...)` 持久化入缓存。
4. **缓存来源**：静默抓取统一以 `META_SOURCE_COM` 作为写入来源（对齐 WebView2/Chromium 语义，与 `TauriWebView2EventBridge` 前端回传同源）。命令层用 WebView2 静默抓取时，写入 source 用 `adl_browser::META_SOURCE_COM`。

## 涉及文件

- Modify: `src-tauri/src/commands/browser.rs`

## 消费的接口（Task 2 交付，读 Task 2 报告确认）

```rust
pub fn create_silent_webview(
    app: tauri::AppHandle,
    state: &AppState,
    url: &str,
) -> Result<
    (String, tokio::sync::mpsc::UnboundedReceiver<(String, String, String, String)>),
    AppError,
>;

pub fn silent_webview_label(tab_id: &str) -> String; // "adl-silent-view-{id}"
```

需要读取确认：
- `crates/browser/src/webview_handle.rs`：无（本 Task 关命令层）。
- `src-tauri/src/commands/browser.rs` 现有 `browser_page_meta_get`（L207-L219）、`emit_page_meta_updated*`（L275-L307）、`empty_page_meta`（L372-L380）、`AppFetcher`（L192-L205）、`META_SOURCE_*` 引入。
- `crates/browser/src/page_meta_service.rs`：`PageMetaService::peek`（L64）、`report(&self, url, title, favicon, source) -> Result<bool, AppError>`（L247）、`is_unsafe_title`、`is_placeholder_title`。
- `crates/browser/src/meta_merge.rs`：`META_SOURCE_COM` 是否为 `pub` 且经 `adl_browser` 桶导出（browser.rs 里 `adl_browser::META_SOURCE_HTTP` 已存在，确认 `META_SOURCE_COM` 同样可用）。

## 实现要求

### 1. 常量

```rust
/// 静默标签页抓取超时（与前端 bookMarkMeta 体验对齐）。
pub const SILENT_FETCH_TIMEOUT_MS: u64 = 6000;
```

### 2. 轮询 + 完成判定（`wait_for_silent_meta`）

`async fn wait_for_silent_meta(rx: &mut UnboundedReceiver<...>, svc: &PageMetaService, url: &str) -> PageMeta`

- 循环内 `rx.recv()` 用 `tokio::time::timeout` 包裹（每轮 ~300ms 上限），收到元组即调 `svc.report(&u, &title, &favicon, META_SOURCE_COM).await` 持久化入缓存。
- 完成判定（读 `svc.peek(url)` 对应缓存条目，对 MetaFetcher 启发式校验）：
  - `has_title = !title.is_empty() && !is_placeholder_title(title, url) && !is_unsafe_title(title)`
  - `has_fav = !favicon_url.is_empty()`
  - 收敛条件：`has_title && has_fav` → 立即返回已完成；或 `(has_title || has_fav)` 且自首个非空起已等待 ≥ 1500ms → 返回当前结果；到 6s 超时返回已得部分（可能 title/favicon 缺失）。
- 返回 `PageMeta`：`title`、`favicon`（=条目 favicon_url）、`favicon_data_uri`（如有）、`url`、`source`（有 title 则 `META_SOURCE_COM`，无则空）。
- 无任何有效元数据 + 超时 → 返回 `empty_page_meta(url)`（复用现有 helper）。

> 完成判定允许"只拿到 title 或只拿到 favicon"就提前返回（Tag 3 不要求全量）。
> 关键校验分解为小 helper（如 `silent_title_ok(title, url) -> bool`），便于阅读与测试。

### 3. `browser_page_meta_get_silent` 命令

```rust
#[tauri::command]
pub async fn browser_page_meta_get_silent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<IpcResult<PageMeta>, CommandError>
```

流程（按序）：
1. `let svc = state.browser_manager.page_meta_service();`
2. **spawn_blocking 创建**（解决 blocking_recv 必须在非 async worker 的契约）：
   ```rust
   let app_owned = app.clone();
   let url_owned = url.clone();
   let (tab_id, mut rx) = tokio::task::spawn_blocking(move || {
       let g = app_owned.state::<AppState>();  // Manager trait；borrow 绑定到 app_owned，闭包内有效
       create_silent_webview(app_owned.clone(), &g, &url_owned)
   })
   .await
   .map_err(|e| AppError::Internal(format!("silent webview join: {e}")))??;
   ```
3. `let page_meta = wait_for_silent_meta(&mut rx, &svc, &url).await;`
4. **销毁**：主线程 `run_on_main_thread` 里 `window.get_webview(&silent_webview_label(&tab_id))` 若有则 `close()`；找不到则记 warn（泄漏风险）。实现为 `fn destroy_silent_webview(app: tauri::AppHandle, tab_id: &str)`。
5. `emit_page_meta_updated(&app, &page_meta, src)`（src 取 `META_SOURCE_COM`，若有 title）。
6. `Ok(ipc(Ok(page_meta)))`。
- 全程无 `unwrap()`（测试除外）；错误统一 `AppError`。

> 若 `tokio::task::spawn_blocking` 在 `#[tauri::command]` 环境不可用（tauri 内部 runtime 非 tokio），改用 `tauri::async_runtime::spawn_blocking` 或 `std::thread::spawn`，选可编译路径并记录。关键在于：**创建调用绝不能在 async 工作线程直接执行**。

### 5. 命令注册

确保 `browser_page_meta_get_silent` 出现在 `src-tauri/src/lib.rs` 或对应命令注册表（`generate_handler!`/`invoke_handler`）中被注册（查现有 `browser_page_meta_get` 注册位置，照抄）。

## 测试

- **可单测**：完成判定/轮询的纯逻辑（标题启发式、提前返回条件、超时兜底）拆成可测纯函数并写 `#[cfg(test)]` 单测。**优先级最高**：`silent_title_ok` 的 unsafe/placeholder 判定、完成收敛逻辑（伪造 `SiteMetaCacheEntry` 走 `peek` 模拟）。WebView2 实际渲染无法单测，命令级仅编译验证。
- 必须通过：
  - `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`（若 cargo 不在 PATH）
  - `cargo check --workspace`、`cargo clippy --workspace --all-targets -- -D warnings`、`cargo fmt --all`
  - `cargo test -p adl-browser` 与 `cargo test -p tauri-app`（或对应 src-tauri test target，查现有测试目标名）不回归。
  - 已知 `crates/server` 的 `pty_ws` 集成测试在本环境偶发失败属环境问题，**不要**因它阻塞；其余测试须全绿。
- **`#[allow(dead_code)]`**：一旦 `create_silent_webview` 被命令引用，其上的 `#[allow(dead_code)]`（Task 2 遗留过渡）应可移除——若能移除请移除，否则说明原因。

## 全局约束

- 不新增依赖（除非确有需要并说明）。
- 禁止 `unwrap()`（测试除外）；错误用 `AppError`。
- 遵循 `rustfmt`；`cargo clippy -D warnings` 通过。
- 不改变既有命令对外行为；不要改动本 Task 范围外文件。
- 变更后按 `.trae/rules/mandatory-testing.md` 触发结束验收。

## 提交

```
git add src-tauri/src/commands/browser.rs
git commit -m "feat(browser): add silent-tab meta fetch command with cache polling + timeout"
```

> 若还需最小支撑改动（如注册表、constant 文件），一并 `git add` 并说明。

## 报告契约

将完整报告写入本简报同目录 `task-3-report.md`。报告须自包含：改动文件、新增函数/命令签名、wait_for_silent_meta 完成判定规则、spawn_blocking 方案与理由、测试（单测 + 命令验证命令及输出）、clippy/fmt 结果、commit hash、未决疑虑。返回消息只需给：状态（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED）、commit hash、一句话测试摘要、疑虑（如有）。