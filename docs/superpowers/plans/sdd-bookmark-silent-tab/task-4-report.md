# Task 4 报告 — 开关分流 + 禁用 HTTP 爬虫主路径

## 状态

**DONE**

## 变更文件

| 文件 | 类型 |
|------|------|
| `ai-digital-life/src-tauri/src/commands/browser.rs` | 修改（核心实现 + 单测） |

未改动本 Task 范围外的任何文件；未新增依赖。`browser_page_meta_warmup` 未改动（按其任务边界保留；SILENT 开启时其 `AppFetcher → fetch_page_meta_inner` 自动变 no-op 空结果，属预期可接受）。

## `SILENT_FETCH_ENABLED`

```rust
/// 静默 WebView 抓取开关。true → 真实渲染主路径（Chrome/Edge 式）；false → 回退 HTTP 爬虫。
/// 唯一真源：Task 5 前端独立判断，不与后端强同步。
pub const SILENT_FETCH_ENABLED: bool = true;
```

位于 `SILENT_FETCH_TIMEOUT_MS` 之后，紧邻新增的 `silent_cache_hit` 帮助函数。

## `fetch_silent_meta` 抽取（DRY）

**抽取前**（原 `browser_page_meta_get_silent` 命令体内）：

```rust
let (tab_id, mut rx) = spawn_blocking(create_silent_webview).await??;
let page_meta = wait_for_silent_meta(&mut rx, svc, &url).await;
destroy_silent_webview(&app, &tab_id);
// + emit + return
```

**抽取后**（共享核心内部，不含 emit）：

```rust
async fn fetch_silent_meta(app: tauri::AppHandle, state: &AppState, url: &str) -> Result<PageMeta, AppError> {
    let app_owned = app.clone();
    let url_owned = url.to_string();
    let (tab_id, mut rx) = tokio::task::spawn_blocking(move || {
        let g = app_owned.state::<AppState>();
        create_silent_webview(app_owned.clone(), &g, &url_owned)
    })
    .await
    .map_err(|e| AppError::Internal(format!("silent webview join: {e}")))??;

    let page_meta = wait_for_silent_meta(&mut rx, state.browser_manager.page_meta_service(), url).await;

    destroy_silent_webview(&app, &tab_id);
    Ok(page_meta)
}
```

`synchronous` 契约完全保留：`spawn_blocking` 创建绝不在 async worker 直接执行；主线程销毁；`SILENT_FETCH_TIMEOUT_MS`（6s）语义不变；返回 `PageMeta` 已写缓存。`browser_page_meta_get_silent` 改为「调用 + emit + 返回」，行为无回归，Task 3 的 8 个静默单测保持全绿。

## 三个命令的分流逻辑

### `browser_page_meta_get`（SILENT 开启）
- 缓存优先：`!force` 时 `svc.peek(&url)`，命中有效缓存（`silent_cache_hit` 为真：有效标题**或**非空 favicon）→ 立即 emit + 返回（**零 WebView**）。
- 未命中或 `force=true` → `fetch_silent_meta` + emit(`META_SOURCE_COM`) + 返回。
- SILENT 关闭 → 保留原 `svc.get(&url, force, &AppFetcher)` 路径不变。

### `browser_page_meta_refresh`
- SILENT 开启 → `fetch_silent_meta` + emit(`META_SOURCE_COM`)（强制重新渲染抓取）。
- SILENT 关闭 → 原 `svc.get(&url, true, &AppFetcher)` 路径不变。

### `browser_page_meta_get_silent`
- 恒走 `fetch_silent_meta` + emit + 返回（Task 3 语义不变）。

## `silent_cache_hit` 帮助函数

```rust
fn silent_cache_hit(e: &SiteMetaCacheEntry, url: &str) -> bool {
    let has_good_title = !e.title.is_empty() && !is_unsafe_title(&e.title) && !is_placeholder_title(&e.title, url);
    has_good_title || !e.favicon_url.is_empty()
}
```

缓存优先统一走 `peek` 判定（不调用 `svc.get`/`AppFetcher`），避免被禁爬虫触发 `mark_failure` 污染缓存。

## 爬虫禁用短路（`fetch_page_meta_inner`）

非 http 校验之后、构造 reqwest client 之前加入：

```rust
if SILENT_FETCH_ENABLED {
    tracing::debug!(url = %url, "fetch_page_meta_inner: HTTP crawler disabled by SILENT_FETCH_ENABLED");
    return Ok(empty_page_meta(url));
}
```

**保留全部原爬虫代码**（robots 门控、限速、HTML 解析、favicon 下载等均未删）。已确认安全：`svc.get` 对空 fetch 走 `mark_failure`（非 `write_success`），不会用空值污染缓存。

## 新增单测

`silent_meta_tests` 内新增 5 个：

| 测试 | 断言 |
|------|------|
| `silent_cache_hit_rejects_unsafe_title` | 验证码/安全验证标题 → false |
| `silent_cache_hit_rejects_placeholder_title` | 空标题、宿主名占位、裸 URL → false |
| `silent_cache_hit_accepts_valid_title_or_favicon` | 真实标题 / 仅 favicon / 两者 → true |
| `fetch_page_meta_inner_short_circuits_when_silent_enabled` | SILENT 开启时返回 empty（无网络） |

Task 3 的 8 个静默单测保持通过（无回归）。

## 验证输出（按简报顺序）

| 步骤 | 结果 |
|------|------|
| `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` | 执行 |
| `cargo check --workspace` | ✅ 编译通过 |
| `cargo clippy --workspace --all-targets -- -D warnings` | ✅ 无 error/warning |
| `cargo test -p adl-browser` | ✅ 全绿（含集成测试） |
| `cargo test -p ai-digital-life`（src-tauri 包名） | ✅ 57 passed; 0 failed（原 52 + 新增 5） |
| `cargo fmt --all` | ✅ 已格式化，`FMT_OK` |

已知 `crates/server` 的 `pty_ws` 集成测试在本沙箱环境因 PTY 失败属 Environment 问题，非本 Task 引入，未阻塞。

## 提交

- Commit：`5ad1d15cbb63e68ae45627344fb8200417970a31`
  （`feat(browser): gate meta fetch behind SILENT_FETCH_ENABLED, disable crawler main path`）
- 纳入提交：`ai-digital-life/src-tauri/src/commands/browser.rs`
- 本报告文件**未**提交。

## 未决疑虑

1. **`t0`/原爬虫代码保留**：`fetch_page_meta_inner` 开头 `let t0 = Instant::now()` 及全部爬虫代码在 SILENT 开启时运行期不可达但仍编译；`t0` 仍被后续代码引用，未触发 unused 警告。验证通过后是否删除原爬虫代码由用户决定。
2. **爬虫 main 路径禁用对 warmup 的影响**：SILENT 开启时 `browser_page_meta_warmup` 的 `AppFetcher` 命中短路返回 empty（`mark_failure`），自带退避自限自限，符合 Task 边界预期，已确认不改动。
3. **前端接线未做**（Task 5 范围）：`SILENT_FETCH_ENABLED` 由 Task 5 前端独立判断是否调用 `browser_page_meta_get_silent` / 走 get 缓存路径。