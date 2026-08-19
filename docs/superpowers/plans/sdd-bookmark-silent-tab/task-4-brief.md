# Task 4 简报 — 开关分流 + 禁用 HTTP 爬虫主路径

> 本简报是唯一需求来源。请严格按此实现，不要读整个计划文件。
> **子 Agent 隔离**：你只实现本 Task。Task 3 已交付静默抓取命令与轮询逻辑；Task 5（前端）由另一 Agent 实现。

## 目标与上下文

在 `src-tauri/src/commands/browser.rs` 引入开关 `SILENT_FETCH_ENABLED`，把 `browser_page_meta_get` / `browser_page_meta_refresh` 的主力路径从"HTTP 爬虫"切换到"静默 WebView 渲染"；HTTP 爬虫主路径在开启状态下被禁用（保留代码，验证通过后由用户决定删除）。这是对齐 Chrome/Edge 设计的关键开关与路由层。

## 已由主 Agent 解决的关键设计决策（必须遵守）

1. **开关常量**：`pub const SILENT_FETCH_ENABLED: bool = true;`（唯一真源，Task 5 前端独立判断，不要与后端强同步）。
2. **渲染逻辑抽取（DRY）**：Task 3 的 `browser_page_meta_get_silent` 中"创建→轮询→report→销毁→**返回 PageMeta**"整段抽出为共享 `async fn fetch_silent_meta(app, state, url) -> Result<PageMeta, AppError>`（不含 emit）。三个命令共用：
   - `browser_page_meta_get_silent` = `fetch_silent_meta` + emit + 返回。
   - `browser_page_meta_get`（SILENT 开启）= 缓存优先 → 未命中才 `fetch_silent_meta`。
   - `browser_page_meta_refresh`（SILENT 开启）= 直接 `fetch_silent_meta`。
3. **缓存优先（零 WebView）**：SILENT 开启时 `browser_page_meta_get` 先 `svc.peek(&url)`；若缓存条目含"有效标题"（非空且过 `is_unsafe_title`/`is_placeholder_title` 检查）**或** 非空 favicon → 立即返回（emit + return），不创建 WebView。`force=true` 才绕过缓存。
4. **爬虫主路径禁用**：`fetch_page_meta_inner`（browser.rs L492 起）入口加短路：`if SILENT_FETCH_ENABLED { return Ok(empty_page_meta(url)); }`（并记 `tracing::debug`）。**保留全部原爬虫代码**（不删）。已确认安全：`svc.get` 对空 fetch 走 `mark_failure`（非 `write_success`），不会用空值污染缓存。
5. **未改动范围外**：`browser_page_meta_warmup` 不在本 Task 范围（user 未要求）；在 SILENT 开启时其 `AppFetcher→fetch_page_meta_inner` 自动变 no-op 空结果，属预期可接受（自带退避自限），不要额外改动。

## 涉及文件

- Modify: `src-tauri/src/commands/browser.rs`

## 消费的接口（Task 3 交付，读 Task 3 报告确认）

- `#[tauri::command] async fn browser_page_meta_get_silent(app, state, url) -> Result<IpcResult<PageMeta>, CommandError>`
- `async fn wait_for_silent_meta(...)` / `poll_silent_meta` / `SilentPollDurations`（轮询引擎，`browser_page_meta_get_silent` 内部使用）
- `silent_webview_label(tab_id)`、`create_silent_webview`（Task 2）
- 既有 `emit_page_meta_updated(app, &meta, src)`（L275）、`empty_page_meta(url)`（L372）、`AppFetcher`（L192）

## 实现要求

### 1. 抽取 `fetch_silent_meta`

把 `browser_page_meta_get_silent` 命令体内真正抓取的部分（spawn_blocking 创建 → `wait_for_silent_meta` → 主线程销毁）抽为：

```rust
async fn fetch_silent_meta(
    app: tauri::AppHandle,
    state: &AppState,
    url: &str,
) -> Result<PageMeta, AppError>
```

- 返回 `PageMeta`（含已写缓存的值），**不**做 emit。
- 保留 Task 3 的 spawn_blocking 契约（创建绝不在 async worker 直接执行）、销毁、AppError 处理、`SILENT_FETCH_TIMEOUT_MS` 语义。
- 让 `browser_page_meta_get_silent` 改为调用它 + emit + 返回。行为不得回归（Task 3 的单测仍须全绿）。

### 2. `SILENT_FETCH_ENABLED` 常量

```rust
/// 静默 WebView 抓取开关。true → 真实渲染主路径（Chrome/Edge 式）；false → 回退 HTTP 爬虫。
pub const SILENT_FETCH_ENABLED: bool = true;
```

### 3. `browser_page_meta_get` 分流

```rust
#[tauri::command]
pub async fn browser_page_meta_get(app, state, url, force) -> Result<IpcResult<PageMeta>, CommandError> {
    let svc = state.browser_manager.page_meta_service();
    if SILENT_FETCH_ENABLED {
        if !force.unwrap_or(false) {
            if let Some(e) = svc.peek(&url) {
                let has_good_title = !e.title.is_empty()
                    && !adl_browser::is_unsafe_title(&e.title)
                    && !adl_browser::is_placeholder_title(&e.title, &url);
                if has_good_title || !e.favicon_url.is_empty() {
                    let meta = adl_browser::PageMeta {
                        title: e.title, favicon: e.favicon_url,
                        favicon_data_uri: e.favicon_data_uri, url: url.clone(),
                        source: e.title_source,
                    };
                    let src = if meta.source.is_empty() { adl_browser::META_SOURCE_HTTP } else { meta.source.as_str() };
                    emit_page_meta_updated(&app, &meta, src);
                    return Ok(ipc(Ok(meta)));   // 零 WebView
                }
            }
        }
        let meta = fetch_silent_meta(app, state, &url).await?;
        emit_page_meta_updated(&app, &meta, META_SOURCE_COM);
        return Ok(ipc(Ok(meta)));
    }
    // —— 原回退爬虫路径（SILENT 关闭时）——
    let meta = svc.get(&url, force.unwrap_or(false), &AppFetcher).await?;
    let src = ...;
    emit_page_meta_updated(&app, &meta, src);
    Ok(ipc(Ok(meta)))
}
```

> 上面的 `PageMeta { ... }` 构造是示意：用真实字段名（`title`/`favicon`/`favicon_data_uri`/`url`/`source`），类型对齐既有 `PageMeta`。缓存在 `browser_page_meta_get` 优先分支里是否复用 `svc.get` 的可选——**统一走 `peek`** 既简单又避免被禁爬虫触发 `mark_failure`。`emit` 的 `src` 与广播保持一致。

### 4. `browser_page_meta_refresh` 分流

```rust
if SILENT_FETCH_ENABLED {
    let meta = fetch_silent_meta(app, state, &url).await?;
    emit_page_meta_updated(&app, &meta, META_SOURCE_COM);
    Ok(ipc(Ok(meta)))
} else {
    // 原实现
}
```

### 5. `fetch_page_meta_inner` 入口禁用短路

函数第一行（非 http 校验之后）加：

```rust
if SILENT_FETCH_ENABLED {
    tracing::debug!(url, "fetch_page_meta_inner: HTTP crawler disabled by SILENT_FETCH_ENABLED");
    return Ok(empty_page_meta(url));
}
```

## 测试

- **可单测**：为分流逻辑补 `#[cfg(test)]` 单测，覆盖：
  - SILENT 开启 + 缓存含有效标题或非空 favicon → 不创建 WebView、直接返回缓存（纯 `peek` 判定可测，抽成小 helper `silent_cache_hit(entry, url) -> bool` 更好测）。
  - `silent_cache_hit` 对 unsafe 标题（如"验证码_哔哩哔哩"）、placeholder 标题、空缓存返回 false。
  - `fetch_page_meta_inner` 在 SILENT 开启时返回 empty（可对 `empty_page_meta` / 短路分支断言）。
  - 既有 Task 3 静默单测不回归。
- 必须通过：
  - `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`（若 cargo 不在 PATH）
  - `cargo check --workspace`、`cargo clippy --workspace --all-targets -- -D warnings`、`cargo fmt --all`
  - `cargo test -p adl-browser` 与对应 src-tauri test target 不回归。
  - 已知 `crates/server` `pty_ws` 本环境偶发失败属环境问题，不要阻塞。

## 全局约束

- 不新增依赖；禁止 `unwrap()`（测试除外）；错误用 `AppError`；遵循 `rustfmt`；`clippy -D warnings` 通过。
- 保留全部原爬虫代码（仅加短路）；不改变 `browser_page_meta_warmup` 与其路径语义。
- 不要改动本 Task 范围外文件；不重构非相关逻辑。
- 变更后按 `.trae/rules/mandatory-testing.md` 触发结束验收。

## 提交

```
git add src-tauri/src/commands/browser.rs
git commit -m "feat(browser): gate meta fetch behind SILENT_FETCH_ENABLED, disable crawler main path"
```

## 报告契约

将完整报告写入本简报同目录 `task-4-report.md`：改动文件、`SILENT_FETCH_ENABLED` 常量、`fetch_silent_meta` 抽取前后对比、三个命令的分流逻辑、爬虫禁用短路、新增单测与验证命令输出、commit hash、未决疑虑。返回消息只需给：状态（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED）、commit hash、一句话测试摘要、疑虑（如有）。