# 书签 favicon/标题获取 —— 静默标签页改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Tauri 桌面端 favicon/标题获取从"HTTP 爬虫主路径"改为"真实 WebView2 渲染的静默标签页主路径"，对齐 Chrome/Edge（Chromium）设计；HTTP 爬虫等回退方案先禁用（保留代码），验证通过后删除。

**Architecture:** 新增 `SilentTabFetcher`（实现 `PageMetaFetcher` trait）与一个"事件→缓存"的后端通路。`browser_page_meta_get` 命令通过开关 `SILENT_FETCH_ENABLED` 分流：开启则用静默 tab 渲染获取 title/favicon 并写入 `page_meta_service` 缓存；关闭则回退原爬虫。渲染数据不经前端回传，直接由后端写入缓存。__Tauri 桌面端 WebView 创建必须在主线程 dispatch。

**Tech Stack:** Rust（adl-browser crate + src-tauri/commands/browser.rs）、Tauri 2.x、WebView2 COM 事件、tokio、react -Z（仅前端 save-only 三步走）、TypeScript。

## Global Constraints

- Crate 命名 `adl-` 前缀；Tauri Command 命名 `{domain}_{action}` 蛇形。
- 跨 IPC 边界 Rust 类型 serde 双注解（`rename_all = "camelCase"` + `#[serde(rename_all = "camelCase")]`）。
- 错误统一 `adl-errors::AppError`，禁止 `unwrap()`/裸 `String` 错误。
- 前端 Bridge 三实现对齐（Tauri/Preview/Mock），方法签名一致、返回 `IpcResult<T>`。
- 展示层启发式（`is_unsafe_title`/`is_placeholder_title`/`is_framework_default_favicon`/质量分）须保留。
- 所有 user-visible 文本走 i18n；空状态不给句号、居中。
- 遵守 mandatory-testing.md：变更后自动触发验收；Rust/Python 编译、clippy、tsc、测试门禁。

---

### Task 1: 后端事件→缓存通路（CachedMetaBridge）

渲染数据当前从 WebView2 事件 → `TauriWebView2EventBridge.emit_meta_changed` → 前端 report 回传。静默 tab 没有前端，需一个"直接写缓存"的 bridge 实现。

**Files:**
- Create: `crates/browser/src/meta_cache_bridge.rs`
- Modify: `crates/browser/src/lib.rs`（导出）

**Interfaces:**
- Consumes: `crate::webview_handle::WebView2EventBridge` trait（`emit_meta_changed` 等 5 方法）、`crate::PageMetaService::report`（`async fn report(&self, url, title, favicon, source) -> Result<bool, AppError>`）、`crate::META_SOURCE_COM`。
- Produces: `CachedMetaBridge::new(svc: Arc<PageMetaService>)`，实现 `WebView2EventBridge`：`emit_meta_changed` 内 `#\[cfg(windows)\]` 下异步 `svc.report(url,title,favicon, META_SOURCE_COM)`（`tauri::async_runtime::spawn` 包裹）；其余 4 方法为 no-op。

- [ ] **Step 1: 写失败测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::SiteMetaCacheStore;

    #[tokio::test]
    async fn cached_bridge_writes_meta_into_service() {
        let dir = std::env::temp_dir().join(format!(
            "adl-cache-bridge-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let store = SiteMetaCacheStore::open(&dir).unwrap();
        let svc = Arc::new(PageMetaService::new(Arc::new(store)));
        let bridge = CachedMetaBridge::new(svc.clone());
        bridge.emit_meta_changed("tab-1", "真实标题", "https://a.com/fav.ico", "https://a.com/");
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        let entry = svc.peek("https://a.com/").unwrap();
        assert_eq!(entry.title, "真实标题");
        assert_eq!(entry.favicon_url, "https://a.com/fav.ico");
    }
}
```

> 因 `open_service` 为 page_meta_service 测试私有，此测试自建临时目录的 `SiteMetaCacheStore`。

- [ ] **Step 2: 运行确认失败**（`cargo test -p adl-browser meta_cache_bridge`，预期 FAIL：`CachedMetaBridge` 未定义）

- [ ] **Step 3: 实现 `CachedMetaBridge`**

```rust
use std::sync::Arc;
use crate::page_meta_service::PageMetaService;
use crate::webview_handle::WebView2EventBridge;

/// 静默标签页专用事件桥：渲染数据直接写入 page_meta_service，不转发前端。
pub struct CachedMetaBridge {
    svc: Arc<PageMetaService>,
}

impl CachedMetaBridge {
    pub fn new(svc: Arc<PageMetaService>) -> Self {
        Self { svc }
    }
}

impl WebView2EventBridge for CachedMetaBridge {
    fn emit_meta_changed(&self, _tab_id: &str, title: &str, favicon: &str, url: &str) {
        if url.is_empty() || title.is_empty() {
            return;
        }
        let svc = self.svc.clone();
        let title = title.to_string();
        let favicon = favicon.to_string();
        let url = url.to_string();
        tauri::async_runtime::spawn(async move {
            let _ = svc.report(&url, &title, &favicon, crate::META_SOURCE_COM).await;
        });
    }
    fn emit_url_changed(&self, _tab_id: &str, _url: &str) {}
    fn emit_audio_changed(&self, _tab_id: &str, _is_playing: bool, _is_muted: bool) {}
    fn emit_open_new_tab(&self, _url: &str) {}
    fn spawn_spa_fallback(&self, _label: &str, _url: &str) {}
}
```

> `tauri::async_runtime` 位于 `tauri` crate；adl-browser 若未依赖 tauri，需加 `tauri` 为 dependency（或改用 `tokio::spawn`，并用 `futures`/自建 runtime）。优先尝试 `tokio::spawn` 以最小化依赖——但调用处需在 tokio runtime 内。**决策点：** 若 `page_meta_service.report` 已在 tokio runtime（`PageMetaService` 的调用方都在 async 中），用 `tokio::spawn`；否则引入 tauri 依赖。实现时选择可编译路径并记录。

- [ ] **Step 4: 运行确认通过**（`cargo test -p adl-browser meta_cache_bridge`，预期 PASS）
- [ ] **Step 5: 修改 lib.rs 导出**

```rust
mod meta_cache_bridge;
pub use meta_cache_bridge::CachedMetaBridge;
```

- [ ] **Step 6: 运行全 `adl-browser` 测试 + clippy + fmt**
  - `cargo test -p adl-browser`
  - `cargo clippy --workspace --all-targets -- -D warnings`
  - `cargo fmt --all`

- [ ] **Step 7: Commit** — `git add crates/browser/src/meta_cache_bridge.rs crates/browser/src/lib.rs` + `git commit -m "feat(browser): add CachedMetaBridge for silent-tab meta write-through"`

---

### Task 2: 静默标签页创建/导航/销毁的后端命令

利用现有 `browser_create_for_tab`/`browser_navigate_tab`/`browser_destroy_tab`，但需能传入自定义 bridge 且不向用户展示。将创建逻辑抽为可复用函数 `create_silent_webview`，接受 `bridge` 参数。

**Files:**
- Modify: `src-tauri/src/commands/browser.rs`（抽取创建函数 + 新增静默命令）

**Interfaces:**
- Consumes: `browser_create_for_tab` 现有实现（约 L22-L108）、`browser_navigate_tab`、`browser_destroy_tab`、`CachedMetaBridge`。
- Produces: `pub fn create_silent_webview(app, state, url) -> Result<String, AppError>`（返回静默 tab_id）；`pub fn silent_tab_navigate_and_destroy(state, tab_id, url) -> Result<(), AppError>`。

- [ ] **Step 1: 抽取公用 WebView 创建逻辑**

将 `browser_create_for_tab` 内"建 builder → add_child → setup handlers → register"抽取为：

```rust
fn build_silent_webview(
    app: tauri::AppHandle,
    state: &State<'_, AppState>,
    url: &str,
    tab_id: &str,
    bridge: EventBridgeRef,
) -> Result<(), AppError> {
    // 复用现有 builder/add_child/handlers 逻辑；用传入的 bridge 替代 TauriWebView2EventBridge
    // 静默 tab 置于 (-10000,-10000) 且不调用 show()，保证用户无感知（与现有后台创建一致）
    // 与 browser_create_for_tab 的差异点：
    //   1) bridge = Arc::new(CachedMetaBridge::new(svc.clone()))
    //   2) 不 apply_theme_and_navigate 的交互式阶段——直接 navigate(url)
}
```

> 为防止复制大段代码，优先做法：给 `browser_create_for_tab` 增加内部辅助 `fn spawn_webview_creation(app, window, label, tab_id, url, bridge)`，两个命令共用。

- [ ] **Step 2: 新增静默命令**

```rust
#[tauri::command]
pub async fn browser_page_meta_get_silent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<IpcResult<adl_browser::PageMeta>, CommandError> {
    let svc = state.browser_manager.page_meta_service();
    // 创建静默 tab → 导航 → 轮询缓存 → 销毁
    // 返回 PageMeta（含已写缓存的值）
}
```

> 注意：此命令必须模仿现有命令在**主线程 dispatch**（`tauri::async_runtime::spawn` + `run_on_main_thread`），因为 WebView 创建只能在主线程。实现参照 `browser_create_for_tab` 的 L22-L106 主线程模式。

- [ ] **Step 3: 运行确认编译 + clippy**（`cargo check --workspace`、`cargo clippy`）
- [ ] **Step 4: Commit** — `git commit -m "feat(browser): add silent webview create/navigate/destroy + silent meta command"`

---

### Task 3: `SilentTabFetcher` 实现 `PageMetaFetcher`

轮询 `page_meta_service.peek` 检测缓存是否已含真实 title+favicon，含超时与"完成判定"。

**Files:**
- Create: `src-tauri/src/commands/silent_tab_fetcher.rs`（或并入 browser.rs 模块）
- Modify: `src-tauri/src/commands/browser.rs`（命令层换用该 fetcher）

**Interfaces:**
- Consumes: `PageMetaFetcher` trait、`PageMeta`、`silent` 命令、`PageMetaService::peek`。
- Produces: `pub struct SilentTabFetcher { svc: Arc<PageMetaService>, app: tauri::AppHandle, state_provider: ... }`，实现 `PageMetaFetcher::fetch(url) -> Pin<Box<dyn Future<Output=PageMeta>>>`。

- [ ] **Step 1: 实现完成判定 + 轮询 + 超时**

```rust
pub const SILENT_FETCH_TIMEOUT_MS: u64 = 6000;

async fn wait_for_meta(svc: &PageMetaService, url: &str) -> PageMeta {
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(SILENT_FETCH_TIMEOUT_MS);
    loop {
        if let Some(e) = svc.peek(url) {
            let has_title = !e.title.is_empty() && !crate::is_placeholder_title(&e.title, url) && !crate::is_unsafe_title(&e.title);
            let has_fav = !e.favicon_url.is_empty();
            if (has_title || has_fav) && tokio::time::Instant::now() >= tokio::time::Instant::now() /* 至少一次非空即提质 */ {
                let title_ok = has_title && !crate::is_unsafe_title(&e.title);
                return PageMeta {
                    title: e.title.clone(),
                    favicon: e.favicon_url.clone(),
                    favicon_data_uri: e.favicon_data_uri.clone(),
                    url: url.to_string(),
                    source: e.title_source.clone(),
                };
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        if tokio::time::Instant::now() >= deadline {
            return PageMeta { url: url.to_string(), ..Default::default() };
        }
    }
}
```

> 轮询间隔 300ms、超时 6s。实现时避免上述占位 `tokio::time::Instant::now() >= tokio::time::Instant::now()`，改为收敛条件：`has_title && has_fav` → 立即返回；`has_title || has_fav` 且距首个非空已等待数轮 → 返回；超时返回已得部分。

- [ ] **Step 2: 命令层接入 fetcher**

```
browser_page_meta_get_silent:
  1. 创建静默 tab（返回 tab_id）
  2. navigate_tab(tab_id, url)
  3. let page_meta = wait_for_meta(&svc, &url).await
  4. destroy_tab(tab_id)
  5. emit_page_meta_updated(app, &page_meta, source) // 复用现有广播
  6. return ipc(Ok(page_meta))
```

- [ ] **Step 3: 运行确认编译 + clippy**
- [ ] **Step 4: Commit** — `git commit -m "feat(browser): implement SilentTabFetcher with cache polling + timeout"`

---

### Task 4: 开关分流 + 禁用 HTTP 爬虫主路径

引入 `SILENT_FETCH_ENABLED` 常量/配置开关，`browser_page_meta_get` 与 `browser_page_meta_refresh` 按开关分流；`fetch_page_meta_inner` 入口加禁用短路。

**Files:**
- Modify: `src-tauri/src/commands/browser.rs`

**Interfaces:**
- Consumes: `SILENT_FETCH_ENABLED`、静默命令、`fetch_page_meta_inner`。
- Produces: 开关常量的唯一真源。

- [ ] **Step 1: 定义开关**

```rust
/// 静默标签页抓取开关。true → 走真实渲染主路径；false → 回退 HTTP 爬虫。
pub const SILENT_FETCH_ENABLED: bool = true;
```

- [ ] **Step 2: `browser_page_meta_get` 分流**

```rust
let src = if SILENT_FETCH_ENABLED {
    // 调用静默 tab 路径（复用 svc.get 的缓存/单飞行；仅当缓存未命中时走静默）
    // 注意：为避免静默 tab 打断缓存 TTL/退避，先 svc.get(url, force, &NoopFetcher?) 再判断
    // 简化：SILENT 开启时直接调用 fetch_page_meta_silent，未命中缓存才创建 tab
} else {
    svc.get(&url, force.unwrap_or(false), &AppFetcher).await?
};
```

> 设计要点：缓存命中（TTL/退避短路）时 `svc.get` 已返回缓存值；`SilentTabFetcher` 需在真正需要时创建 tab。此逻辑在 Step 3 细化：
> - 先 `let cached = svc.get(&url, force.unwrap_or(false), &AppFetcher).await?;`（`AppFetcher` 已禁用，实际短路走缓存或空）
> - 若返回 title/favicon 为空且需强制刷新 → 调静默路径
> - 回退干净：Silent 关闭时走原 `&AppFetcher`

- [ ] **Step 3: `fetch_page_meta_inner` 入口禁用**

```rust
async fn fetch_page_meta_inner(_url: &str) -> Result<PageMeta, AppError> {
    if SILENT_FETCH_ENABLED {
        return Ok(empty_page_meta(_url));  // 爬虫已禁用，返回空兜底
    }
    // ... 以下为原爬虫逻辑（保留不删）
}
```

- [ ] **Step 4: `browser_page_meta_refresh` 同步分流**（同理，force=true 走静默）
- [ ] **Step 5: 运行确认编译 + clippy**
- [ ] **Step 6: Commit** — `git commit -m "feat(browser): gate meta fetch behind SILENT_FETCH_ENABLED, disable crawler main path"`

---

### Task 5: 前端 save-only 三步走 + 移除前端 6s 计时

前端新建书签"仅保存"分支改为缓存 → tab → 静默补齐；移除前端 `META_FETCH_TIMEOUT_MS` 等待（超时交给后端静默 tab）。

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserDialogs.ts`
- Modify: `frontend/src/app/utils/pageMetaClient.ts`（新增 `getSilent`，三桥对齐）
- Modify: `frontend/src/mock-bridge.ts`

**Interfaces:**
- Consumes: `pageMetaClient.peek/get`、`isUnsafeTitle`、`isPlaceholderTitle`、`hostnameFromUrl`。
- Produces: `pageMetaClient.getSilent(url: string): Promise<PageMeta|null>`（Tauri 调 `browser_page_meta_get_silent`；Preview 调 `/browser/page-meta/silent`；Mock 返回本地；均 fallback 到 `get`）。

- [ ] **Step 1: pageMetaClient 增加 `getSilent`**

```typescript
// PageMetaClient 接口新增
getSilent(url: string): Promise<PageMeta | null>;

// Tauri adapter
getSilent: async (url) => {
  const r = await invokeIpc<PageMeta>('browser_page_meta_get_silent', { url });
  return r.ok && r.data ? r.data : null;
},

// Preview adapter：无静默实现，回退 get
getSilent: async (url) => pageMetaClientPreview.get(url),

// Mock adapter：内存 fallback
```

- [ ] **Step 2: 更新接口定义** `frontend/src/shared/ipc/browser.ts`（若接口含 client 类型，同步加 `getSilent`）
- [ ] **Step 3: 改写 useBrowserDialogs save-only 标题解析**

```typescript
if (!title) {
  setIsCreatingTab(true);
  const requestStart = Date.now();
  console.info('[bookmark-new-meta] start', { url });
  const cached = pageMetaClient.peek(url);
  const cachedTitle = cached?.title?.trim() ?? '';
  if (cachedTitle && !isUnsafeTitle(cachedTitle) && !isPlaceholderTitle(cachedTitle, url)) {
    title = cachedTitle;
    console.info('[bookmark-new-meta] cache hit', { url, cachedTitle });
  } else {
    try {
      // META_FETCH_TIMEOUT_MS 移除：超时由后端静默 tab 兜底（≤6s）
      const meta = await pageMetaClient.getSilent(url);
      const metaTitle = meta?.title?.trim() ?? '';
      const titleOk = Boolean(metaTitle) && !isUnsafeTitle(metaTitle) && !isPlaceholderTitle(metaTitle, url);
      console.info('[bookmark-new-meta] silent fetched', { url, metaTitle, titleOk, hasFavicon: Boolean(meta?.faviconDataUri), elapsedMs: Date.now() - requestStart });
      if (titleOk && metaTitle) title = metaTitle;
    } catch (err) {
      console.warn('[bookmark-new-meta] silent fetch failed', { url, err: String(err) });
    }
    if (!title) {
      title = hostnameFromUrl(url) || url;
      console.info('[bookmark-new-meta] fallback hostname', { url, title });
    }
  }
  setIsCreatingTab(false);
}
```

- [ ] **Step 4: 移除 `META_FETCH_TIMEOUT_MS` 常量**（若仅此处使用则删除定义）
- [ ] **Step 5: 更新前端单测**

`frontend/src/app/features/browser/__tests__/`（若存在 dialogs 测试）更新 mock：`vi.mocked(pageMetaClient.getSilent)`。新增断言：命中缓存走缓存；未命中调用 `getSilent`；返回空则宿主名占位。

- [ ] **Step 6: tsc + vitest + eslint**

```
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
pnpm --dir frontend run lint:fix
```

- [ ] **Step 7: Commit** — `git commit -m "feat(frontend): cache→tab→silent three-step bookmark meta, drop 6s timer"`

---

### Task 6: 双端一致性验证 + 全量验收

**Files:** 无新增，仅验证。

- [ ] **Step 1: 前端 lint/format/typecheck + 全部 vitest**（L3 级，因涉及 IPC 契约 + store）
- [ ] **Step 2: rustfmt + clippy + cargo check + cargo test --workspace**（L3 级，跨 crate + 命令层）
- [ ] **Step 3: 手动验证清单（用户执行）**
  - [ ] B 站书签：标题为真实标题非"验证码"；favicon 为 B 站图标
  - [ ] xiaogans.online：favicon 为该站真实图标，非 Vite 占位
  - [ ] 抖音：标题为真实标题或宿主名，非空
  - [ ] 已缓存/已打开站：立即返回（零 WebView）
  - [ ] "正在获取页面信息…" ≤ ~5~6s，超时后书签仍保存成功
  - [ ] `debug-logs.txt` 可见静默 tab 创建→导航→销毁时间戳；`meta_cache_bridge` 写入日志
- [ ] **Step 4: 提交验收结果**

---

## 涉及文件清单

- Create: `crates/browser/src/meta_cache_bridge.rs`
- Create: `src-tauri/src/commands/silent_tab_fetcher.rs`（或并入 browser.rs）
- Modify: `crates/browser/src/lib.rs`
- Modify: `src-tauri/src/commands/browser.rs`
- Modify: `frontend/src/app/features/browser/useBrowserDialogs.ts`
- Modify: `frontend/src/app/utils/pageMetaClient.ts`
- Modify: `frontend/src/shared/ipc/browser.ts`
- Modify: `frontend/src/mock-bridge.ts`
- Modify: 相关 `__tests__/`
- 保留：三层缓存、展示层启发式、`[bookmark-new-meta]` 调试日志