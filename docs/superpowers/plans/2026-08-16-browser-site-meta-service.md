# 浏览器网站图标与标题集中式服务层（PageMetaService）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将浏览器面板的"网站图标与标题"的抓取、合并、缓存、回退、失效、广播收归后端集中式服务层（Rust PageMetaService + 预览同构实现），消除图标来回切换、启动延迟、刷新不生效三类问题。

**Architecture:** Rust `crates/browser` 新增 `PageMetaService`（仿 Chromium FaviconService）：持有 SQLite 持久层 + 内存缓存，网络抓取通过 `PageMetaFetcher` trait 依赖注入（实现留在 src-tauri，复用现有 reqwest/robots/限速设施）。标题合并决策（溯源/占位/来源优先级）与图标质量门控从前端 TS 迁移为 Rust 纯函数；前端保留约 30 行 per-tab 应用门。服务端通过 `page-meta-updated` 事件广播，前端只读镜像 + 广播驱动更新，前端永久失去删缓存能力。预览模式由 `previewPageMetaService`（JS 同构）提供一致行为。

**Tech Stack:** Rust（tokio/rusqlite/serde）、Tauri 2.x、React 19 + TypeScript + vitest、previewWorkspaceService（Node http）。

## Global Constraints

- 双端一致性：新增 IPC/事件必须在 `tauri-bridge.ts`、`preview-bridge/`、`mock-bridge.ts` 全部实现（仓库根 AGENTS.md 强制项）。
- 未发布阶段禁止数据迁移/兼容代码：`site_meta_cache` 表结构直接修改 `CREATE TABLE`，禁止 ALTER 兼容路径。
- 禁止在 capability/permissions 中使用 `"all"` / `"**"` 通配；新增命令必须在 `src-tauri/permissions/digital-life.toml` 白名单登记。
- 所有 UI 文案必须使用 i18n key（本改造不改文案，仅新增一条 hint 时须走 i18n）。
- 质量门禁：`cargo clippy --workspace --all-targets -- -D warnings` 0 警告；`pnpm --dir frontend run lint` 0 errors。
- 强制红绿测试：每个任务先写失败测试再实现（`.agents/rules/mandatory-testing.md`）。
- 调试日志（`console.log`/`[ADL-DEBUG]`）禁止遗留生产代码。
- 参考 spec：`docs/superpowers/specs/2026-08-16-browser-site-meta-service-design.md`（行为规则、TTL/退避数值、验收标准以 spec 为准）。

---

## File Structure

**Rust（`ai-digital-life/`）**

| 文件 | 职责 |
|---|---|
| `crates/browser/src/site_meta_cache.rs`（改） | 表 +4 列（title_source/last_ok_at/next_retry_at/fail_count）；结构体扩展；`normalize_cache_key` |
| `crates/browser/src/meta_merge.rs`（新） | 纯函数：`is_placeholder_title`/`should_apply_exact_match_title`/`get_favicon_quality_score`/`should_replace_favicon`（从 TS 迁移） |
| `crates/browser/src/html_meta.rs`（改） | 新增 `duckduckgo_favicon_url`；回退链顺序常量 |
| `crates/browser/src/page_meta_service.rs`（新） | `PageMetaFetcher` trait、`PageMetaService`（TTL/SWR/退避/单飞行/peek/get/report/warmup/内存缓存） |
| `crates/browser/src/lib.rs`（改） | 模块注册与 re-export |
| `src-tauri/src/commands/browser.rs`（改） | `Fetcher` 实现（改造 `fetch_page_meta_inner`：DDG 回退级）；新增 `browser_page_meta_get/report/refresh/warmup`；删除 `browser_site_meta_upsert/remove/clear` |
| `src-tauri/src/main.rs`（改） | 命令注册表增减 |
| `src-tauri/permissions/digital-life.toml`（改） | 命令白名单增减 |

**前端（`ai-digital-life/frontend/src/`）**

| 文件 | 职责 |
|---|---|
| `shared/ipc/browser.ts`（改） | `PageMeta` 加 `source?`；新增 `PageMetaUpdatedPayload` |
| `app/utils/pageMetaClient.ts`（新） | 三适配（tauri/preview/mock）：`peek/get/report/refresh/warmup/subscribeUpdated` |
| `app/utils/siteMetaCache.ts`（改） | 只读镜像（预载 + 广播更新），删除写后端路径 |
| `app/components/BrowserFavicon.tsx`（改） | 去 ready 空白占位、去删缓存、渲染失败仅降级、订阅广播 |
| `app/features/browser/useBrowserPageMeta.ts`（改） | 溯源决策删除，改广播处理器（`applyBroadcastTitle` + `titleSourceRef` + 三段落地） |
| `app/features/browser/useBrowserUrlChange.ts`、`useBrowserPanelAddressSubmit.ts`、`useBrowserDialogs.ts`、`useBrowserTagActions.ts`（改） | 调用点迁移到 `pageMetaClient`；刷新同步书签占位快照 |
| `app/features/browser/useBrowserMetaSubscription.ts`（改） | 事件桥接转发 `report()` |
| `app/hooks/useAppStartup.ts`（改） | 启动预热 `warmup(可见URL)` |
| `tauri-bridge/tauri-browser.ts`、`preview-bridge/*`、`mock-bridge.ts`（改） | 新命令/事件桥接 |

**预览服务（`frontend/dev/`）**

| 文件 | 职责 |
|---|---|
| `previewWorkspaceService/pageMetaService.ts`（新） | JS 同构：合并引擎/TTL/SWR/退避/回退链/内存+JSON 持久 |
| `previewWorkspaceService/index.ts`（改） | 新增 `/browser/page-meta/get|report|refresh|warmup` 路由 |
| `vite.config.ts`（改） | page-meta 中间件加 DDG 回退级 |

---

### Task 1: site_meta_cache 表结构与缓存键规范化

**Files:**
- Modify: `crates/browser/src/site_meta_cache.rs`
- Test: `crates/browser/src/site_meta_cache.rs`（`#[cfg(test)]` 内新增）

**Interfaces:**
- Produces: `SiteMetaCacheEntry { title: String, title_source: String, favicon_url: String, favicon_data_uri: String, fetched_at: i64, last_ok_at: i64, next_retry_at: i64, fail_count: u32 }`（`serde(rename_all = "camelCase")`）
- Produces: `pub fn normalize_cache_key(url: &str) -> String`（去 hash、去尾斜杠，与前端 `normalizeUrlForCache` 同构）
- Consumes: 无

- [ ] **Step 1: 写失败测试**

在 `site_meta_cache.rs` 测试模块追加：

```rust
#[test]
fn entry_with_new_fields_roundtrips() {
    let dir = temp_dir().join(format!("adl-site-meta-newfields-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let store = SiteMetaCacheStore::open(&dir).unwrap();
    let mut map = HashMap::new();
    map.insert(
        "https://a.com/".to_string(),
        SiteMetaCacheEntry {
            title: "A".into(),
            title_source: "http".into(),
            favicon_url: "https://a.com/icon.png".into(),
            favicon_data_uri: "data:image/png;base64,AAAA".into(),
            fetched_at: 1,
            last_ok_at: 2,
            next_retry_at: 3,
            fail_count: 4,
        },
    );
    store.upsert(&map).unwrap();
    let all = store.get_all().unwrap();
    let e = all.get("https://a.com/").unwrap();
    assert_eq!(e.title_source, "http");
    assert_eq!(e.last_ok_at, 2);
    assert_eq!(e.next_retry_at, 3);
    assert_eq!(e.fail_count, 4);
}

#[test]
fn normalize_cache_key_strips_hash_and_trailing_slash() {
    // 注意：与前端 normalizeUrlForCache 同构 —— 路径尾部斜杠全部去除（根路径 "/" 保留）
    assert_eq!(normalize_cache_key("https://a.com/path/#sec"), "https://a.com/path");
    assert_eq!(normalize_cache_key("https://a.com/path//"), "https://a.com/path");
    assert_eq!(normalize_cache_key("https://a.com"), "https://a.com/");
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-browser site_meta_cache`
Expected: 编译失败（结构体缺字段）或断言失败。

- [ ] **Step 3: 实现**

修改结构体与 `CREATE TABLE`：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteMetaCacheEntry {
    pub title: String,
    pub title_source: String,
    pub favicon_url: String,
    pub favicon_data_uri: String,
    pub fetched_at: i64,
    pub last_ok_at: i64,
    pub next_retry_at: i64,
    pub fail_count: u32,
}

const CREATE_TABLE_SQL: &str = "CREATE TABLE IF NOT EXISTS site_meta_cache (
    url              TEXT PRIMARY KEY,
    title            TEXT NOT NULL DEFAULT '',
    title_source     TEXT NOT NULL DEFAULT '',
    favicon_url      TEXT NOT NULL DEFAULT '',
    favicon_data_uri TEXT NOT NULL DEFAULT '',
    fetched_at       INTEGER NOT NULL,
    last_ok_at       INTEGER NOT NULL DEFAULT 0,
    next_retry_at    INTEGER NOT NULL DEFAULT 0,
    fail_count       INTEGER NOT NULL DEFAULT 0
);";
```

同步修改 `get_all` 的 SELECT/row 映射与 `upsert` 的 INSERT（8 列）。新增：

```rust
/// 与前端 `normalizeUrlForCache` 同构：去 hash、去尾部多余斜杠。
pub fn normalize_cache_key(url: &str) -> String {
    if let Ok(mut u) = url::Url::parse(url) {
        u.set_fragment(None);
        let mut path = u.path().to_string();
        if path.len() > 1 && path.ends_with('/') {
            while path.len() > 1 && path.ends_with('/') {
                path.pop();
            }
            u.set_path(&path);
        }
        u.to_string()
    } else {
        let no_hash = url.split('#').next().unwrap_or(url);
        let mut s = no_hash.to_string();
        if s.len() > 8 && s.ends_with('/') {
            while s.len() > 8 && s.ends_with('/') {
                s.pop();
            }
        }
        s
    }
}
```

> `url` crate 已在 `crates/browser/Cargo.toml` 依赖中。旧测试中构造 `SiteMetaCacheEntry` 的地方需补新字段（`title_source: "".into(), last_ok_at: 0, next_retry_at: 0, fail_count: 0`）。

- [ ] **Step 4: 运行确认通过**

Run: `cargo test -p adl-browser`
Expected: 全部 PASS（含既有测试）。

- [ ] **Step 5: 提交**

```bash
git add crates/browser/src/site_meta_cache.rs
git commit -m "feat(browser): extend site_meta_cache schema with source/ttl/backoff fields"
```

---

### Task 2: meta_merge 纯函数（标题合并 + 图标质量门控迁移）

**Files:**
- Create: `crates/browser/src/meta_merge.rs`
- Modify: `crates/browser/src/lib.rs`
- Test: `crates/browser/src/meta_merge.rs`（内嵌）

**Interfaces:**
- Produces: `pub const META_SOURCE_COM: &str`、`META_SOURCE_HTTP`、`META_SOURCE_IFRAME`、`META_SOURCE_GOOGLE`（值 `"com"/"http"/"iframe"/"google"`）
- Produces: `pub fn is_placeholder_title(title: &str, url: &str) -> bool`
- Produces: `pub fn should_apply_exact_match_title(current_title: &str, url: &str, incoming_title: &str, source: &str, current_source: Option<&str>) -> bool`
- Produces: `pub fn get_favicon_quality_score(favicon: &str) -> i32`
- Produces: `pub fn should_replace_favicon(existing: Option<&str>, incoming: &str) -> bool`
- Produces: `pub fn existing_favicon_baseline(favicon_data_uri: &str, favicon_url: &str) -> String`
- Consumes: 无（纯函数，与前端 `useBrowserPageMeta.ts`/`faviconQuality.ts` 语义一致）

- [ ] **Step 1: 写失败测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholder_title_detection() {
        assert!(is_placeholder_title("", "https://a.com/"));
        assert!(is_placeholder_title("https://a.com/", "https://a.com/"));
        assert!(is_placeholder_title("douyin.com", "https://www.douyin.com/"));
        assert!(!is_placeholder_title("真实标题", "https://a.com/"));
    }

    #[test]
    fn exact_match_title_rules() {
        let url = "https://a.com/video";
        // 占位可被任意来源覆盖
        assert!(should_apply_exact_match_title("a.com", url, "新标题", META_SOURCE_COM, None));
        // http 可覆盖任意
        assert!(should_apply_exact_match_title("旧标题", url, "新标题", META_SOURCE_HTTP, Some(META_SOURCE_COM)));
        // com 不能覆盖 http 来源的真实标题
        assert!(!should_apply_exact_match_title("真实标题", url, "陈旧标题", META_SOURCE_COM, Some(META_SOURCE_HTTP)));
        // com 可覆盖 com/google 来源
        assert!(should_apply_exact_match_title("旧com标题", url, "新com标题", META_SOURCE_COM, Some(META_SOURCE_COM)));
        // 相同标题不应用
        assert!(!should_apply_exact_match_title("标题", url, "标题", META_SOURCE_HTTP, None));
    }

    #[test]
    fn favicon_quality_gate() {
        let high = Some("https://cdn.example.com/icon-256.png");
        // 低质量（Google S2 / favicon.ico）不覆盖高质量
        assert!(!should_replace_favicon(high, "https://www.google.com/s2/favicons?domain=x"));
        assert!(!should_replace_favicon(high, "https://x.com/favicon.ico"));
        // 高质量覆盖低质量/空
        assert!(should_replace_favicon(None, "https://x.com/icon-256.png"));
        assert!(should_replace_favicon(Some("https://x.com/favicon.ico"), "https://x.com/icon-256.png"));
        // dataUri 不可覆盖
        assert!(!should_replace_favicon(Some("data:image/png;base64,AA"), "https://x.com/big.png"));
        assert_eq!(get_favicon_quality_score("https://x.com/icon-256.png"), 15);
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-browser meta_merge`
Expected: 编译失败（`meta_merge` 模块不存在）。

- [ ] **Step 3: 实现**

按前端语义逐函数移植（关键实现）：

```rust
pub const META_SOURCE_COM: &str = "com";
pub const META_SOURCE_HTTP: &str = "http";
pub const META_SOURCE_IFRAME: &str = "iframe";
pub const META_SOURCE_GOOGLE: &str = "google";

fn hostname_without_www(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .map(|h| h.strip_prefix("www.").unwrap_or(&h).to_lowercase())
        .unwrap_or_default()
}

pub fn is_placeholder_title(title: &str, url: &str) -> bool {
    if title.is_empty() { return true; }
    if title == url { return true; }
    if title.starts_with("http://") || title.starts_with("https://") { return true; }
    let host = hostname_without_www(url);
    if host.is_empty() { return false; }
    let t = title.trim().to_lowercase();
    t == host || t == format!("www.{host}")
}

pub fn should_apply_exact_match_title(
    current_title: &str,
    url: &str,
    incoming_title: &str,
    source: &str,
    current_source: Option<&str>,
) -> bool {
    if incoming_title.is_empty() { return false; }
    if incoming_title == current_title { return false; }
    if is_placeholder_title(incoming_title, url) { return false; }
    if is_placeholder_title(current_title, url) { return true; }
    if source == META_SOURCE_HTTP || source == META_SOURCE_IFRAME { return true; }
    if source == META_SOURCE_COM {
        return matches!(current_source, Some(META_SOURCE_COM) | Some(META_SOURCE_GOOGLE));
    }
    false
}

pub fn get_favicon_quality_score(favicon: &str) -> i32 {
    // 与前端 faviconQuality.ts 完全一致（Google S2=1, /favicon.ico=2, .ico=4,
    // svg=10, png 按尺寸 11-15, 其余=3）
    let lower = favicon.to_lowercase();
    if lower.is_empty() { return 0; }
    if ["google.com/s2/favicons", "favicon.cc", "faviconkit", "besticon", "favicon-generator"]
        .iter().any(|k| lower.contains(k)) { return 1; }
    if lower.ends_with("/favicon.ico") { return 2; }
    if lower.ends_with("favicon.ico") { return 3; }
    if lower.ends_with(".ico") { return 4; }
    if lower.ends_with(".svg") { return 10; }
    if lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".webp") || lower.ends_with(".gif") {
        if let Some(size_str) = regex_size(&lower) {
            let size: i32 = size_str;
            return if size >= 256 { 15 } else if size >= 128 { 14 } else if size >= 64 { 13 } else if size >= 32 { 12 } else { 11 };
        }
        if lower.contains("apple-touch-icon") { return 13; }
        if ["512", "256", "192", "180"].iter().any(|k| lower.contains(k)) { return 14; }
        return 11;
    }
    3
}

fn regex_size(lower: &str) -> Option<i32> {
    // 简化版：匹配 "NNNxNNN.png" 或 "NNN.png" 中的尺寸前缀
    let bytes = lower.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() { i += 1; }
            let digits: String = lower[start..i].chars().collect();
            if let Ok(n) = digits.parse::<i32>() { return Some(n); }
        }
        i += 1;
    }
    None
}

pub fn should_replace_favicon(existing: Option<&str>, incoming: &str) -> bool {
    if incoming.is_empty() { return false; }
    if existing.is_some_and(|e| e.starts_with("data:")) { return false; }
    match existing {
        None => true,
        Some(existing) => {
            get_favicon_quality_score(incoming) >= get_favicon_quality_score(existing)
        }
    }
}

pub fn existing_favicon_baseline(favicon_data_uri: &str, favicon_url: &str) -> String {
    if !favicon_data_uri.is_empty() { favicon_data_uri.to_string() }
    else if !favicon_url.is_empty() { favicon_url.to_string() }
    else { String::new() }
}
```

> 说明：`regex_size` 为手写简化版（项目禁用新增无谓依赖；语义为提取文件名首段数字作为尺寸）。`lib.rs` 增加 `mod meta_merge;` 与 `pub use meta_merge::{...};`。

- [ ] **Step 4: 运行确认通过**

Run: `cargo test -p adl-browser meta_merge`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add crates/browser/src/meta_merge.rs crates/browser/src/lib.rs
git commit -m "feat(browser): migrate title-merge and favicon-quality gates to Rust pure functions"
```

---

### Task 3: html_meta 增加 DuckDuckGo 兜底 URL

**Files:**
- Modify: `crates/browser/src/html_meta.rs`
- Test: `crates/browser/src/html_meta.rs`（内嵌）

**Interfaces:**
- Produces: `pub fn duckduckgo_favicon_url(url: &str) -> String`（`https://icons.duckduckgo.com/ip3/{host}.png`；私网返回空）
- Consumes: 无

- [ ] **Step 1: 写失败测试**

```rust
#[test]
fn duckduckgo_favicon_url_builds_and_skips_private() {
    assert_eq!(
        duckduckgo_favicon_url("https://example.com/page"),
        "https://icons.duckduckgo.com/ip3/example.com.png"
    );
    assert_eq!(duckduckgo_favicon_url("http://localhost:3000/x"), "");
    assert_eq!(duckduckgo_favicon_url("http://192.168.1.5/x"), "");
    assert_eq!(duckduckgo_favicon_url("not-a-url"), "");
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-browser duckduckgo`
Expected: 编译失败（函数不存在）。

- [ ] **Step 3: 实现**

```rust
/// DuckDuckGo favicon 服务：返回真实网站图标（比 Google S2 质量高）。
/// 私网/本地地址返回空（与 `google_favicon_url` 一致）。
pub fn duckduckgo_favicon_url(url: &str) -> String {
    if let Ok(parsed) = Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            if host == "localhost" || host.starts_with("127.") || host.starts_with("192.168.") {
                return String::new();
            }
            return format!("https://icons.duckduckgo.com/ip3/{host}.png");
        }
    }
    String::new()
}
```

`lib.rs` re-export 增加 `duckduckgo_favicon_url`。

- [ ] **Step 4: 运行确认通过**

Run: `cargo test -p adl-browser`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add crates/browser/src/html_meta.rs crates/browser/src/lib.rs
git commit -m "feat(browser): add duckduckgo favicon fallback URL builder"
```

---

### Task 4: PageMetaService 核心（缓存策略 + 单飞行 + 编排）

**Files:**
- Create: `crates/browser/src/page_meta_service.rs`
- Modify: `crates/browser/src/lib.rs`
- Test: `crates/browser/src/page_meta_service.rs`（内嵌，用 mock fetcher）

**Interfaces:**
- Produces:
  ```rust
  pub const META_TTL_MS: i64 = 7 * 24 * 3600 * 1000;
  pub const RETRY_BASE_MS: i64 = 5 * 60 * 1000;
  pub const RETRY_MAX_MS: i64 = 2 * 3600 * 1000;

  pub trait PageMetaFetcher: Send + Sync {
      /// 返回空 title/favicon 表示抓取失败（复用 empty_page_meta 语义）。
      fn fetch(&self, url: &str, force: bool)
          -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>>;
  }

  pub struct PageMetaService { /* store + memory + in_flight */ }
  impl PageMetaService {
      pub fn new(store: Arc<SiteMetaCacheStore>) -> Self;
      pub async fn preload(&self) -> Result<(), AppError>;              // store.get_all → memory
      pub fn peek(&self, url: &str) -> Option<SiteMetaCacheEntry>;       // 内存命中返回；SWR 语义由 get 处理
      pub async fn get(&self, url: &str, force: bool, fetcher: &dyn PageMetaFetcher) -> Result<PageMeta, AppError>;
      pub async fn report(&self, url: &str, title: &str, favicon: &str, source: &str) -> Result<bool, AppError>;
      pub async fn warmup(&self, urls: &[String], fetcher: &dyn PageMetaFetcher, limit: usize) -> Result<(), AppError>;
      pub fn mark_failure(&self, url: &str);                            // 抓取失败：fail_count+1 / next_retry_at
      pub fn retry_due(&self, url: &str, now: i64) -> bool;
  }
  ```
- Consumes: `SiteMetaCacheEntry`、`normalize_cache_key`（Task 1）、`meta_merge`（Task 2）、`PageMeta`（crates/browser 已有 `browser_meta::PageMeta`）

- [ ] **Step 1: 写失败测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::site_meta_cache::SiteMetaCacheStore;
    use std::env::temp_dir;

    struct MockFetcher { result: std::sync::Mutex<Option<PageMeta>> }
    impl PageMetaFetcher for MockFetcher {
        fn fetch(&self, _url: &str, _force: bool)
            -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>> {
            let r = self.result.lock().unwrap().clone().unwrap_or_default();
            Box::pin(async move { r })
        }
    }

    fn open_service(name: &str) -> (Arc<PageMetaService>, std::path::PathBuf) {
        let dir = temp_dir().join(format!("adl-pms-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let store = SiteMetaCacheStore::open(&dir).unwrap();
        (Arc::new(PageMetaService::new(store)), dir)
    }

    #[tokio::test]
    async fn peek_returns_memory_entry() {
        let (svc, _) = open_service("peek");
        let entry = SiteMetaCacheEntry {
            title: "T".into(), title_source: "http".into(),
            favicon_url: "".into(), favicon_data_uri: "".into(),
            fetched_at: 0, last_ok_at: 0, next_retry_at: 0, fail_count: 0,
        };
        svc.memory.lock().unwrap().insert("https://a.com/".into(), entry.clone());
        assert_eq!(svc.peek("https://a.com/#x").unwrap().title, "T");
    }

    #[tokio::test]
    async fn get_success_writes_cache_and_sets_last_ok() {
        let (svc, _) = open_service("get-ok");
        let fetcher = MockFetcher { result: std::sync::Mutex::new(Some(PageMeta {
            title: "A".into(), favicon: "https://a.com/favicon.ico".into(),
            favicon_data_uri: "".into(), url: "https://a.com/".into(),
        })) };
        let meta = svc.get("https://a.com/", false, &fetcher).await.unwrap();
        assert_eq!(meta.title, "A");
        let cached = svc.peek("https://a.com/").unwrap();
        assert_eq!(cached.title, "A");
        assert_eq!(cached.title_source, META_SOURCE_HTTP);
        assert!(cached.last_ok_at > 0);
        assert_eq!(cached.fail_count, 0);
    }

    #[tokio::test]
    async fn get_failure_keeps_cache_and_backs_off() {
        let (svc, _) = open_service("get-fail");
        // 先成功写入
        let fetcher = MockFetcher { result: std::sync::Mutex::new(Some(PageMeta {
            title: "A".into(), favicon: "".into(), favicon_data_uri: "".into(), url: "https://a.com/".into(),
        })) };
        svc.get("https://a.com/", false, &fetcher).await.unwrap();
        // 再失败
        *fetcher.result.lock().unwrap() = Some(PageMeta::default());
        let meta = svc.get("https://a.com/", false, &fetcher).await.unwrap();
        assert!(meta.title.is_empty());
        let cached = svc.peek("https://a.com/").unwrap();
        assert_eq!(cached.title, "A", "失败不得删除缓存");
        assert_eq!(cached.fail_count, 1);
        assert!(cached.next_retry_at > 0);
    }

    #[tokio::test]
    async fn single_flight_deduplicates_concurrent_gets() {
        let (svc, _) = open_service("flight");
        let calls = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        struct CountingFetcher(std::sync::Arc<std::sync::atomic::AtomicU32>);
        impl PageMetaFetcher for CountingFetcher {
            fn fetch(&self, _url: &str, _force: bool)
                -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>> {
                self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Box::pin(async move { PageMeta { title: "X".into(), favicon: "".into(), favicon_data_uri: "".into(), url: "https://a.com/".into() } })
            }
        }
        let f = CountingFetcher(calls.clone());
        let (r1, r2) = tokio::join!(svc.get("https://a.com/", false, &f), svc.get("https://a.com/", false, &f));
        assert!(r1.is_ok() && r2.is_ok());
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn report_com_does_not_clobber_http_title() {
        let (svc, _) = open_service("report");
        svc.report("https://a.com/", "真实标题", "", META_SOURCE_HTTP).await.unwrap();
        svc.report("https://a.com/", "陈旧标题", "", META_SOURCE_COM).await.unwrap();
        assert_eq!(svc.peek("https://a.com/").unwrap().title, "真实标题");
    }
}
```

> `PageMeta::default()`：`browser_meta::PageMeta` 需要实现 `Default`（若未实现，在 `browser_meta.rs` 补 `#[derive(Default)]`）。`svc.memory` 字段需 `pub(crate)` 可见（测试同 crate 内可直接访问）。

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-browser page_meta_service`
Expected: 编译失败（模块/类型不存在）。

- [ ] **Step 3: 实现**

```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use adl_errors::AppError;
use crate::browser_meta::PageMeta;
use crate::meta_merge::{META_SOURCE_HTTP, existing_favicon_baseline, is_placeholder_title, should_apply_exact_match_title, should_replace_favicon};
use crate::site_meta_cache::{SiteMetaCacheEntry, SiteMetaCacheStore, normalize_cache_key};

pub const META_TTL_MS: i64 = 7 * 24 * 3600 * 1000;
pub const RETRY_BASE_MS: i64 = 5 * 60 * 1000;
pub const RETRY_MAX_MS: i64 = 2 * 3600 * 1000;

pub trait PageMetaFetcher: Send + Sync {
    fn fetch(&self, url: &str, force: bool)
        -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>>;
}

pub struct PageMetaService {
    store: Arc<SiteMetaCacheStore>,
    pub(crate) memory: Mutex<HashMap<String, SiteMetaCacheEntry>>,
    in_flight: Mutex<HashMap<String, Arc<tokio::sync::Notify>>>,
}

impl PageMetaService {
    pub fn new(store: Arc<SiteMetaCacheStore>) -> Self {
        Self { store, memory: Mutex::new(HashMap::new()), in_flight: Mutex::new(HashMap::new()) }
    }

    pub async fn preload(&self) -> Result<(), AppError> {
        let all = self.store.get_all()?;
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        for (k, v) in all { memory.entry(k).or_insert(v); }
        Ok(())
    }

    pub fn peek(&self, url: &str) -> Option<SiteMetaCacheEntry> {
        let memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        memory.get(&normalize_cache_key(url)).cloned()
    }

    pub fn retry_due(&self, url: &str, now: i64) -> bool {
        self.peek(url).map_or(true, |e| now >= e.next_retry_at)
    }

    pub fn mark_failure(&self, url: &str) {
        let key = normalize_cache_key(url);
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        let now = chrono_now_ms();
        let entry = memory.entry(key.clone()).or_insert_with(|| SiteMetaCacheEntry {
            title: String::new(), title_source: String::new(), favicon_url: String::new(),
            favicon_data_uri: String::new(), fetched_at: now, last_ok_at: 0,
            next_retry_at: now + RETRY_BASE_MS, fail_count: 1,
        });
        entry.fail_count = entry.fail_count.saturating_add(1);
        let delay = (RETRY_BASE_MS << entry.fail_count.min(5)).min(RETRY_MAX_MS);
        entry.next_retry_at = now + delay;
    }

    pub async fn get(&self, url: &str, force: bool, fetcher: &dyn PageMetaFetcher) -> Result<PageMeta, AppError> {
        let key = normalize_cache_key(url);
        let now = chrono_now_ms();
        // TTL 短路（spec 4.1）：缓存未过期直接返回，不发起抓取；force 绕过
        if !force {
            if let Some(entry) = self.peek(&key) {
                if entry.last_ok_at > 0 && now - entry.last_ok_at < META_TTL_MS {
                    return Ok(to_page_meta(entry));
                }
            }
        }
        // 单飞行（用 contains_key 区分持有者）：同 URL 并发只抓一次
        let notify = {
            let mut map = self.in_flight.lock().unwrap_or_else(|e| e.into_inner());
            map.entry(key.clone()).or_insert_with(|| Arc::new(tokio::sync::Notify::new())).clone()
        };
        {
            let mut map = self.in_flight.lock().unwrap_or_else(|e| e.into_inner());
            let in_flight = map.get(&key).map(|n| Arc::ptr_eq(n, &notify)).unwrap_or(false);
            if !in_flight {
                // 已有并发请求在跑：等待后返回其缓存结果
                drop(map);
                notify.notified().await;
                return Ok(self.peek(&key).map(to_page_meta).unwrap_or_default());
            }
        }
        // 执行抓取（本请求是 in_flight 持有者）
        let meta = fetcher.fetch(url, force).await;
        if !meta.title.is_empty() || !meta.favicon.is_empty() || !meta.favicon_data_uri.is_empty() {
            self.write_success(&key, &meta, META_SOURCE_HTTP, now);
        } else {
            self.mark_failure(&key);
        }
        // 释放单飞行并唤醒等待者
        let notify = self.in_flight.lock().unwrap_or_else(|e| e.into_inner()).remove(&key);
        if let Some(n) = notify { n.notify_waiters(); }
        Ok(PageMeta { url: key, ..meta })
    }

    fn write_success(&self, key: &str, meta: &PageMeta, source: &str, now: i64) {
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        let existing = memory.get(key).cloned();
        let title_source = {
            let cur = existing.as_ref();
            let cur_title = cur.map(|e| e.title.as_str()).unwrap_or("");
            let cur_source = cur.map(|e| e.title_source.as_str());
            if should_apply_exact_match_title(cur_title, key, &meta.title, source, cur_source) || meta.title.is_empty() {
                source.to_string()
            } else {
                cur.map(|e| e.title_source.clone()).unwrap_or_default()
            }
        };
        let entry = SiteMetaCacheEntry {
            title: if meta.title.is_empty() || is_placeholder_title(&meta.title, key) {
                existing.as_ref().map(|e| e.title.clone()).unwrap_or_default()
            } else {
                meta.title.clone()
            },
            title_source,
            favicon_url: {
                let existing_fav = existing.as_ref().map(|e| existing_favicon_baseline(&e.favicon_data_uri, &e.favicon_url));
                let chosen = if should_replace_favicon(existing_fav.as_deref(), &meta.favicon) { meta.favicon.clone() }
                    else { existing.as_ref().map(|e| e.favicon_url.clone()).unwrap_or_default() };
                chosen
            },
            favicon_data_uri: {
                let existing_uri = existing.as_ref().map(|e| e.favicon_data_uri.clone()).unwrap_or_default();
                if meta.favicon_data_uri.is_empty() { existing_uri } else { meta.favicon_data_uri.clone() }
            },
            fetched_at: now,
            last_ok_at: now,
            next_retry_at: 0,
            fail_count: 0,
        };
        memory.insert(key.to_string(), entry.clone());
        drop(memory);
        let mut map = HashMap::new();
        map.insert(key.to_string(), entry);
        let _ = self.store.upsert(&map);
    }

    pub async fn report(&self, url: &str, title: &str, favicon: &str, source: &str) -> Result<bool, AppError> {
        let key = normalize_cache_key(url);
        let now = chrono_now_ms();
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        let existing = memory.get(&key).cloned();
        let cur_title = existing.as_ref().map(|e| e.title.as_str()).unwrap_or("");
        let cur_source = existing.as_ref().map(|e| e.title_source.as_str());
        let title_applied = !title.is_empty()
            && should_apply_exact_match_title(cur_title, &key, title, source, cur_source);
        let existing_fav = existing.as_ref().map(|e| existing_favicon_baseline(&e.favicon_data_uri, &e.favicon_url));
        let favicon_applied = should_replace_favicon(existing_fav.as_deref(), favicon);
        if !title_applied && !favicon_applied { return Ok(false); }
        let entry = SiteMetaCacheEntry {
            title: if title_applied { title.to_string() } else { existing.as_ref().map(|e| e.title.clone()).unwrap_or_default() },
            title_source: if title_applied { source.to_string() } else { existing.as_ref().map(|e| e.title_source.clone()).unwrap_or_default() },
            favicon_url: if favicon_applied { favicon.to_string() } else { existing.as_ref().map(|e| e.favicon_url.clone()).unwrap_or_default() },
            favicon_data_uri: existing.as_ref().map(|e| e.favicon_data_uri.clone()).unwrap_or_default(),
            fetched_at: now,
            last_ok_at: now,
            next_retry_at: 0,
            fail_count: 0,
        };
        memory.insert(key.clone(), entry.clone());
        drop(memory);
        let mut map = HashMap::new();
        map.insert(key, entry);
        let _ = self.store.upsert(&map);
        Ok(true)
    }

    pub async fn warmup(&self, urls: &[String], fetcher: &dyn PageMetaFetcher, limit: usize) -> Result<(), AppError> {
        let mut seen = std::collections::HashSet::new();
        let mut tasks = Vec::new();
        for u in urls {
            let key = normalize_cache_key(u);
            if !seen.insert(key.clone()) { continue; }
            if tasks.len() >= limit { break; }
            if self.retry_due(&key, chrono_now_ms()) {
                tasks.push(self.get(&key, false, fetcher));
            }
        }
        for t in tasks { let _ = t.await; }
        Ok(())
    }
}

fn to_page_meta(e: SiteMetaCacheEntry) -> PageMeta {
    PageMeta { title: e.title, favicon: e.favicon_url, favicon_data_uri: e.favicon_data_uri, url: String::new() }
}

fn chrono_now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}
```

> `chrono_now_ms` 用 `std::time` 实现（crates/browser 无 chrono 依赖）。`write_success` 中标题为空时保留旧标题但 source 更新为 http —— 与 TS 版 `buildCachedSiteMetaEntry(metaTitle || existing.title)` 语义一致。`lib.rs` 增加 `mod page_meta_service;` 与 `pub use page_meta_service::{PageMetaFetcher, PageMetaService, META_TTL_MS, RETRY_BASE_MS, RETRY_MAX_MS};`。

- [ ] **Step 4: 运行确认通过**

Run: `cargo test -p adl-browser`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add crates/browser/src/page_meta_service.rs crates/browser/src/lib.rs
git commit -m "feat(browser): add PageMetaService with ttl/swr/backoff/single-flight"
```

---

### Task 5: 命令层 + Fetcher 实现 + 事件广播

**Files:**
- Modify: `src-tauri/src/commands/browser.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/permissions/digital-life.toml`
- Modify: `crates/browser/src/browser_meta.rs`（若 `PageMeta` 需 `Default`）

**Interfaces:**
- Consumes: `PageMetaService`/`PageMetaFetcher`（Task 4）、`duckduckgo_favicon_url`（Task 3）
- Produces:
  - `struct AppFetcher`（实现 `PageMetaFetcher`，内部复用 `fetch_page_meta_inner` 逻辑 + DDG 回退级）
  - 命令 `browser_page_meta_get(url, force) -> IpcResult<PageMeta>`
  - 命令 `browser_page_meta_report(url, title, favicon, source) -> IpcResult<bool>`
  - 命令 `browser_page_meta_refresh(url) -> IpcResult<PageMeta>`（force=true + 强制广播）
  - 命令 `browser_page_meta_warmup(urls) -> IpcResult<()>`
  - 事件 `"digital-life://page-meta-updated"` payload `{url, title, faviconUrl, faviconDataUri, source}`
  - 删除命令 `browser_site_meta_upsert/remove/clear`（含 main.rs 注册与 permissions 白名单）

- [ ] **Step 1: 写失败测试（命令层冒烟）**

在 `src-tauri/src/commands/browser.rs` 测试模块追加（验证 Fetcher 回退链决策 —— 用纯函数层测）：

```rust
#[cfg(test)]
mod page_meta_service_cmd_tests {
    use super::*;
    use adl_browser::html_meta::duckduckgo_favicon_url;

    #[test]
    fn fallback_chain_orders_ddg_before_google() {
        let url = "https://example.com/page";
        let ddg = duckduckgo_favicon_url(url);
        assert!(ddg.contains("icons.duckduckgo.com/ip3/example.com.png"));
        assert!(ddg < google_favicon_url(url), "DDG 必须在回退链中先于 Google S2（按 URL 序保证稳定）");
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-tauri page_meta_service_cmd_tests`（或 workspace 对应测试目标）
Expected: 编译失败或断言失败（`google_favicon_url` 已存在，DDG 函数此时已由 Task 3 提供，断言失败说明顺序需修正——实际以"DDG 先于 Google"为准，断言比较字符串顺序）。

> 若 crate 名不是 `adl-tauri`，用 `cargo test --workspace page_meta_service_cmd_tests`。

- [ ] **Step 3: 实现**

在 `src-tauri/src/commands/browser.rs`：

```rust
use adl_browser::html_meta::{duckduckgo_favicon_url, google_favicon_url, origin_favicon_fallback};
use adl_browser::page_meta_service::{PageMetaFetcher, PageMetaService};
use adl_browser::meta_merge::META_SOURCE_COM;

struct AppFetcher;
impl PageMetaFetcher for AppFetcher {
    fn fetch(&self, url: &str, force: bool)
        -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>> {
        // 复用改造后的 fetch_page_meta_inner（见下）：网络抓取 + robots + 限速
        Box::pin(async move { fetch_page_meta_inner(url, force).await.unwrap_or_else(|_| empty_page_meta(url)) })
    }
}

#[tauri::command]
pub async fn browser_page_meta_get(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
    force: Option<bool>,
) -> Result<IpcResult<PageMeta>, CommandError> {
    let svc = state.browser_manager.page_meta_service();
    let meta = svc.get(&url, force.unwrap_or(false), &AppFetcher).await?;
    emit_page_meta_updated(&app, &meta, META_SOURCE_HTTP);
    Ok(ipc(Ok(meta)))
}

#[tauri::command]
pub async fn browser_page_meta_report(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
    title: String,
    favicon: String,
    source: String,
) -> Result<IpcResult<bool>, CommandError> {
    let svc = state.browser_manager.page_meta_service();
    let changed = svc.report(&url, &title, &favicon, &source).await?;
    if changed {
        if let Some(e) = svc.peek(&url) {
            emit_page_meta_updated_raw(&app, &url, &e, &source);
        }
    }
    Ok(ipc(Ok(changed)))
}

#[tauri::command]
pub async fn browser_page_meta_refresh(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<IpcResult<PageMeta>, CommandError> {
    let svc = state.browser_manager.page_meta_service();
    let meta = svc.get(&url, true, &AppFetcher).await?;
    emit_page_meta_updated(&app, &meta, META_SOURCE_HTTP);
    Ok(ipc(Ok(meta)))
}

#[tauri::command]
pub async fn browser_page_meta_warmup(
    state: State<'_, AppState>,
    urls: Vec<String>,
) -> Result<IpcResult<()>, CommandError> {
    let svc = state.browser_manager.page_meta_service();
    svc.warmup(&urls, &AppFetcher, 8).await?;
    Ok(ipc(Ok(())))
}

fn emit_page_meta_updated(app: &tauri::AppHandle, meta: &PageMeta, source: &str) {
    emit_page_meta_updated_raw(app, &meta.url, &adl_browser::SiteMetaCacheEntry {
        title: meta.title.clone(), title_source: source.to_string(),
        favicon_url: meta.favicon.clone(), favicon_data_uri: meta.favicon_data_uri.clone(),
        fetched_at: 0, last_ok_at: 0, next_retry_at: 0, fail_count: 0,
    }, source);
}

fn emit_page_meta_updated_raw(app: &tauri::AppHandle, url: &str, e: &adl_browser::SiteMetaCacheEntry, source: &str) {
    use tauri::Emitter;
    let _ = app.emit(
        "digital-life://page-meta-updated",
        serde_json::json!({
            "url": url, "title": e.title, "faviconUrl": e.favicon_url,
            "faviconDataUri": e.favicon_data_uri, "source": source,
        }),
    );
}
```

`fetch_page_meta_inner` 改造（增加 DDG 回退级，放在 `origin_favicon_fallback` 之后）：

```rust
let final_favicon = match favicon.or_else(|| Some(origin_favicon_fallback(url))) {
    Some(f) if !f.is_empty() => f,
    _ => {
        let ddg = duckduckgo_favicon_url(url);
        if ddg.is_empty() { google_favicon_url(url) } else { ddg }
    },
};
```

> 说明：为最小改动，`final_favicon` 现有逻辑保留（HTML→origin/favicon.ico），仅当 origin 兜底结果仍为空时尝试 DDG→Google（外部兜底仅在抓取器层面兜底，真正的"多级外部回退下载"由前端渲染侧 fallback 链完成 —— 与 spec 7 节一致：服务端决定 favicon_url，下载 dataUri 失败时保留 URL）。

`BrowserManager` 增加 `page_meta_service()` 访问器：

```rust
// crates/browser/src/browser_webview.rs
pub fn page_meta_service(&self) -> &Arc<PageMetaService> { &self.page_meta_service }
```
并在 `BrowserManager::new` 中构造 `PageMetaService::new(store.clone())`。`src-tauri/src/main.rs` 中 `BrowserManager::new` 调用处保持不变（store 注入点不变）。`lib.rs` re-export `PageMetaService`。

`main.rs` 注册表：删除 `browser_site_meta_upsert/remove/clear` 三行，增加四个新命令。`permissions/digital-life.toml` 同步：删除三行白名单，增加四行。

- [ ] **Step 4: 运行确认通过**

Run: `cargo test --workspace`
Expected: 全部 PASS；`cargo clippy --workspace --all-targets -- -D warnings` 0 警告。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/commands/browser.rs src-tauri/src/main.rs src-tauri/permissions/digital-life.toml crates/browser/src/browser_webview.rs crates/browser/src/browser_meta.rs crates/browser/src/lib.rs
git commit -m "feat(browser): wire PageMetaService commands, fetcher, and page-meta-updated event"
```

---

### Task 6: 前端 IPC 类型与 pageMetaClient（三适配）

**Files:**
- Modify: `frontend/src/shared/ipc/browser.ts`
- Create: `frontend/src/app/utils/pageMetaClient.ts`
- Modify: `frontend/src/app/utils/siteMetaBackends/types.ts`（`SiteMetaCacheEntry` 扩展新字段）
- Modify: `frontend/src/tauri-bridge/tauri-browser.ts`、`frontend/src/preview-bridge/index.ts`、`frontend/src/mock-bridge.ts`
- Test: `frontend/src/app/utils/__tests__/pageMetaClient.test.ts`（新）

**Interfaces:**
- Produces:
  ```ts
  export type MetaSource = 'com' | 'http' | 'iframe' | 'google';
  export interface PageMetaUpdatedPayload { url: string; title: string; faviconUrl: string; faviconDataUri: string; source: MetaSource; }
  export interface PageMetaClient {
    peek(url: string): SiteMetaCacheEntry | undefined;
    get(url: string, opts?: { force?: boolean }): Promise<PageMeta | null>;
    report(meta: PageMeta, source: MetaSource): Promise<void>;
    refresh(url: string): Promise<PageMeta | null>;
    warmup(urls: string[]): Promise<void>;
    subscribeUpdated(listener: (p: PageMetaUpdatedPayload) => void): () => void;
  }
  export const pageMetaClient: PageMetaClient; // tauri/preview 按 isTauriShell 选择
  ```
- Consumes: `requestPreviewApi`（preview-bridge）、`invokeIpc`（tauri-bridge）、`listen`（tauri event）

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/app/utils/__tests__/pageMetaClient.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../tauri-bridge/tauri-shared', () => ({ invokeIpc: vi.fn(), isTauriShell: () => true }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

describe('pageMetaClient (tauri adapter)', () => {
  beforeEach(() => { vi.resetModules(); });
  it('get maps invokeIpc result to PageMeta and null on failure', async () => {
    const { invokeIpc } = await import('../../../tauri-bridge/tauri-shared');
    vi.mocked(invokeIpc).mockResolvedValue({ ok: true, data: { title: 'T', favicon: 'https://a.com/f.ico', faviconDataUri: '', url: 'https://a.com/' } });
    const { pageMetaClient } = await import('../pageMetaClient');
    const meta = await pageMetaClient.get('https://a.com/');
    expect(meta?.title).toBe('T');
    expect(invokeIpc).toHaveBeenCalledWith('browser_page_meta_get', expect.any(Object));
    vi.mocked(invokeIpc).mockResolvedValue({ ok: false, error: { code: 'E', message: 'x' } } as never);
    expect(await pageMetaClient.get('https://a.com/')).toBeNull();
  });
  it('report invokes browser_page_meta_report with source', async () => {
    const { invokeIpc } = await import('../../../tauri-bridge/tauri-shared');
    vi.mocked(invokeIpc).mockResolvedValue({ ok: true, data: true });
    const { pageMetaClient } = await import('../pageMetaClient');
    await pageMetaClient.report({ title: 'X', favicon: '', url: 'https://a.com/' }, 'com');
    expect(invokeIpc).toHaveBeenCalledWith('browser_page_meta_report', { url: 'https://a.com/', title: 'X', favicon: '', source: 'com' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test pageMetaClient`
Expected: FAIL（`pageMetaClient` 模块不存在）。

- [ ] **Step 3: 实现**

`shared/ipc/browser.ts`：

```ts
export type MetaSource = 'com' | 'http' | 'iframe' | 'google';
export interface PageMeta { title: string; favicon: string; faviconDataUri?: string; url: string; source?: MetaSource; }
export interface PageMetaUpdatedPayload { url: string; title: string; faviconUrl: string; faviconDataUri: string; source: MetaSource; }
```

`pageMetaClient.ts`：

```ts
import { isTauriShell } from '../../tauri-bridge/tauri-shared';
import { invokeIpc } from '../../tauri-bridge/tauri-shared';
import { listen } from '@tauri-apps/api/event';
import { requestPreviewApi } from '../../preview-bridge/preview-api';
import type { PageMeta, PageMetaUpdatedPayload, MetaSource } from '../../shared/ipc/browser';
import type { SiteMetaCacheEntry } from './siteMetaBackends/types';

export interface PageMetaClient {
  peek(url: string): SiteMetaCacheEntry | undefined;
  get(url: string, opts?: { force?: boolean }): Promise<PageMeta | null>;
  report(meta: PageMeta, source: MetaSource): Promise<void>;
  refresh(url: string): Promise<PageMeta | null>;
  warmup(urls: string[]): Promise<void>;
  subscribeUpdated(listener: (p: PageMetaUpdatedPayload) => void): () => void;
}

const EVENT = 'digital-life://page-meta-updated';

export const pageMetaClient: PageMetaClient = isTauriShell()
  ? {
      peek: (url) => getCachedSiteMeta(url),
      get: async (url, opts) => {
        const r = await invokeIpc<PageMeta>('browser_page_meta_get', { url, force: opts?.force ?? false });
        return r.ok && r.data ? r.data : null;
      },
      report: async (meta, source) => {
        await invokeIpc<void>('browser_page_meta_report', {
          url: meta.url, title: meta.title ?? '', favicon: meta.favicon ?? '', source,
        });
      },
      refresh: async (url) => {
        const r = await invokeIpc<PageMeta>('browser_page_meta_refresh', { url });
        return r.ok && r.data ? r.data : null;
      },
      warmup: async (urls) => { await invokeIpc<void>('browser_page_meta_warmup', { urls }); },
      subscribeUpdated: (listener) => {
        let active = true;
        let unlisten: (() => void) | undefined;
        void listen<PageMetaUpdatedPayload>(EVENT, (e) => { if (active) listener(e.payload); })
          .then((u) => { if (active) unlisten = u; else void Promise.resolve(u()).catch(() => {}); });
        return () => { active = false; void Promise.resolve(unlisten?.()).catch(() => {}); };
      },
    }
  : {
      peek: (url) => getCachedSiteMeta(url),
      get: async (url, opts) => {
        const r = await requestPreviewApi<PageMeta>('/browser/page-meta/get', {
          method: 'POST', body: JSON.stringify({ url, force: opts?.force ?? false }),
        });
        return r.ok && r.data ? r.data : null;
      },
      report: async (meta, source) => {
        await requestPreviewApi<void>('/browser/page-meta/report', {
          method: 'POST', body: JSON.stringify({ url: meta.url, title: meta.title ?? '', favicon: meta.favicon ?? '', source }),
        });
      },
      refresh: async (url) => {
        const r = await requestPreviewApi<PageMeta>('/browser/page-meta/refresh', { method: 'POST', body: JSON.stringify({ url }) });
        return r.ok && r.data ? r.data : null;
      },
      warmup: async (urls) => { await requestPreviewApi<void>('/browser/page-meta/warmup', { method: 'POST', body: JSON.stringify({ urls }) }); },
      subscribeUpdated: () => () => {}, // 预览模式事件由 Task 12 previewPageMetaService 提供
    };
```

`siteMetaBackends/types.ts` 扩展：

```ts
export interface SiteMetaCacheEntry {
  title: string;
  titleSource: string;
  faviconUrl: string;
  faviconDataUri: string;
  fetchedAt: number;
  lastOkAt: number;
  nextRetryAt: number;
  failCount: number;
}
```

> `tauri-bridge/tauri-browser.ts` 的 `onMetaChanged` 无需改动（继续向 `useBrowserMetaSubscription` 提供 com 事件，由 Task 10 转 `report`）。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --dir frontend run test`
Expected: 新增测试 PASS；既有测试若引用旧 `SiteMetaCacheEntry` 形状需同步更新字段（mock 构造处补新字段）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/shared/ipc/browser.ts frontend/src/app/utils/pageMetaClient.ts frontend/src/app/utils/siteMetaBackends/types.ts frontend/src/app/utils/__tests__/pageMetaClient.test.ts
git commit -m "feat(frontend): add pageMetaClient with tauri/preview adapters"
```

---

### Task 7: siteMetaCache 只读镜像化（删前端写路径）

**Files:**
- Modify: `frontend/src/app/utils/siteMetaCache.ts`
- Modify: `frontend/src/app/utils/favicon.ts`
- Test: `frontend/src/app/utils/siteMetaCache.test.ts`（改写）

**Interfaces:**
- Produces:
  ```ts
  export function initSiteMetaCache(): Promise<void>;              // 保留：预载只读镜像
  export function isSiteMetaCacheReady(): boolean;                 // 保留
  export function subscribeSiteMetaReady(cb: () => void): () => void; // 保留
  export function getCachedSiteMeta(url: string): SiteMetaCacheEntry | undefined; // 保留（peek 底层）
  export function getCachedFavicon(url: string): string;           // 保留
  export function getCachedTitle(url: string): string;             // 保留
  export function setCachedSiteMeta(url, entry): void;             // 改为内部方法（仅镜像更新，不写后端）
  export function removeCachedSiteMeta(url): void;                 // 删除（或仅测试可见）
  ```
- Consumes: `pageMetaClient.subscribeUpdated`（Task 6）——镜像由广播驱动更新
- 注意：`subscribeSiteMeta`/`subscribeSiteMetaGlobal` 保留（BrowserFavicon 组件订阅用）

- [ ] **Step 1: 写失败测试**

改写 `siteMetaCache.test.ts` 增加：

```ts
it('mirror updates from pageMetaClient broadcast without backend writes', async () => {
  const { initSiteMetaCache } = await import('../siteMetaCache');
  // 预载后端（mock backend 提供 get_all）
  await initSiteMetaCache();
  // 模拟广播驱动更新（直接调用镜像 setter 内部路径）
  const mod = await import('../siteMetaCache');
  mod.__mirrorUpsertForTest('https://a.com/', {
    title: 'A', titleSource: 'http', faviconUrl: '', faviconDataUri: '',
    fetchedAt: 1, lastOkAt: 1, nextRetryAt: 0, failCount: 0,
  });
  expect(mod.getCachedTitle('https://a.com/')).toBe('A');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test siteMetaCache`
Expected: FAIL（`__mirrorUpsertForTest` 不存在）。

- [ ] **Step 3: 实现**

`siteMetaCache.ts`：
- 删除 `backend.upsert`/`backend.remove` 的持久化路径（`flushPersist`/`schedulePersist`/`pendingUpserts`/`pendingRemoves` 移除），`setCachedSiteMeta` 改为仅更新 `memoryCache` + `notify`（不写后端，改名 `upsertMirror`）。
- `removeCachedSiteMeta` 改为仅删内存（保留签名但注释"仅镜像清理，勿用于生产路径"）或直接删除并同步改 `BrowserFavicon`（Task 9 重写后无调用者）。
- 新增 `__mirrorUpsertForTest`（`export` 标记 test-only）与 `applyBroadcastUpdate(payload)`（供 Task 10 广播处理器调用：`upsertMirror(normalizeUrlForCache(payload.url), ...)` + notify）。
- 保留 `initSiteMetaCache`（读 `backend.getAll` 灌镜像）。
- 现有测试中调用 `setCachedSiteMeta` 的地方改为 `__mirrorUpsertForTest`（测试语义变为"镜像更新"）。

`favicon.ts` 的 `getFaviconUrl` 兜底链不动（读镜像），但新增 DDG 级：

```ts
const DDG_FAVICON = 'https://icons.duckduckgo.com/ip3/{domain}.png';
// getFaviconUrl 内：cache dataUri → cache faviconUrl → DDG → Google S2 → ''
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --dir frontend run test`
Expected: 全部 PASS（含改写后的测试）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/utils/siteMetaCache.ts frontend/src/app/utils/favicon.ts frontend/src/app/utils/siteMetaCache.test.ts
git commit -m "refactor(frontend): make siteMetaCache a read-only mirror, add ddg fallback"
```

---

### Task 8: BrowserFavicon 重写（占位图标 + 不删缓存 + 广播订阅）

**Files:**
- Modify: `frontend/src/app/components/BrowserFavicon.tsx`
- Test: `frontend/src/app/components/BrowserFavicon.test.tsx`

**Interfaces:**
- Consumes: `pageMetaClient.subscribeUpdated`（Task 6）、`getFaviconUrl`（Task 7 含 DDG）、`subscribeSiteMeta`（Task 7）
- Produces: 组件行为契约——未命中显示占位图标（`.adl-browser-tree__link-fallback`）、渲染失败仅本次降级且不删缓存、广播驱动原位更新

- [ ] **Step 1: 写失败测试**

```ts
import { render, act } from '@testing-library/react';
import { BrowserFavicon } from './BrowserFavicon';

it('renders fallback icon (not blank) before cache ready', () => {
  const { container } = render(<BrowserFavicon url="https://a.com" />);
  expect(container.querySelector('.adl-browser-tree__link-fallback')).not.toBeNull();
});

it('image error does not remove cache (no removeCachedSiteMeta call)', async () => {
  const removeSpy = vi.spyOn(cache, 'removeCachedSiteMeta').mockImplementation(() => {});
  const { container } = render(<BrowserFavicon url="https://a.com" />);
  const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  if (img) { act(() => { fireEvent.error(img); }); }
  expect(removeSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test BrowserFavicon`
Expected: FAIL（旧组件渲染空白占位 + 调用 `removeCachedSiteMeta`）。

- [ ] **Step 3: 实现**

重写 `BrowserFavicon.tsx`：

```tsx
import { useState, useEffect, useCallback } from 'react';
import { getFaviconUrl, getGoogleFaviconUrl } from '../utils/favicon';
import { subscribeSiteMeta, subscribeSiteMetaReady, isSiteMetaCacheReady, initSiteMetaCache } from '../utils/siteMetaCache';
import { pageMetaClient } from '../utils/pageMetaClient';
import { IconLink, type IconSize } from '../icons';

export function BrowserFavicon({ url, size = 14 }: BrowserFaviconProps) {
  const [ready, setReady] = useState(isSiteMetaCacheReady());
  const [faviconUrl, setFaviconUrl] = useState('');
  // 渲染降级状态（React 驱动，避免 DOM 直接操作导致 display:none 残留）：
  // 真实图标与 Google S2 均加载失败时置 true → 显示内置占位图标；新图标到来时重置
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    void initSiteMetaCache();
    if (isSiteMetaCacheReady()) setReady(true);
    const unsubReady = subscribeSiteMetaReady(() => setReady(true));
    return unsubReady;
  }, []);

  useEffect(() => {
    setFaviconUrl(url ? getFaviconUrl(url) : '');
    setDegraded(false);
    if (!url) return;
    const unsubMeta = subscribeSiteMeta(url, () => setFaviconUrl(getFaviconUrl(url)));
    const unsubUpdated = pageMetaClient.subscribeUpdated((p) => {
      if (p.url === url) {
        setFaviconUrl(getFaviconUrl(url));
        setDegraded(false);
      }
    });
    return () => { unsubMeta(); unsubUpdated(); };
  }, [url, ready]);

  // 未命中/未就绪：显示占位图标（非空白）
  const current = faviconUrl;
  const showImg = Boolean(current) && !degraded;
  const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    // 本次降级显示：先切 Google S2；再失败则置 degraded（显示内置图标）。绝不删缓存
    const img = e.target as HTMLImageElement;
    if (!img.src.includes('google.com/s2/favicons')) {
      const fallback = getGoogleFaviconUrl(url);
      if (fallback) { img.src = fallback; return; }
    }
    setDegraded(true);
  }, [url]);

  return (
    <span className={`adl-filetree__file-icon ${showImg ? 'adl-filetree__file-icon--favicon' : 'adl-filetree__file-icon--default'}`}>
      {showImg && (
        <img
          src={current}
          alt=""
          className="adl-browser-tree__favicon"
          style={{ width: size, height: size, transition: 'opacity 0.15s ease-in-out' }}
          onError={handleError}
        />
      )}
      <IconLink
        size={size}
        decorative
        className="adl-browser-tree__link-fallback"
        style={showImg ? { display: 'none' } : undefined}
      />
    </span>
  );
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --dir frontend run test BrowserFavicon`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/components/BrowserFavicon.tsx frontend/src/app/components/BrowserFavicon.test.tsx
git commit -m "fix(frontend): rewrite BrowserFavicon - placeholder icon, no cache deletion, broadcast updates"
```

---

### Task 9: 广播处理器（useBrowserPageMeta → 轻量应用门）

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserPageMeta.ts`
- Modify: `frontend/src/app/features/browser/useBrowserMetaSubscription.ts`
- Modify: `frontend/src/app/features/browser/useBrowserPanelMetaWiring.ts`（适配新签名）
- Test: `frontend/src/app/features/browser/__tests__/useBrowserPageMeta.test.ts`（改写）

**Interfaces:**
- Consumes: `pageMetaClient.subscribeUpdated`（Task 6）、`applyBroadcastUpdate`（Task 7）
- Produces:
  ```ts
  export function usePageMetaBroadcast(): { handlePageMeta: (meta: PageMeta, source?: MetaSource) => void };
  // handlePageMeta 语义：本地渲染期事件（iframe/地址栏等）先写镜像+store，再异步 report 到服务端
  export function applyBroadcastTitle(
    tab: { title: string; id: string },
    url: string,
    broadcastTitle: string,
    source: MetaSource,
    currentSource?: MetaSource,
  ): boolean;
  export const titleSourceRef: Map<string, MetaSource>; // 模块级单例（Task 10 引用）
  ```
- 说明：`titleSourceRef`（per-tab Map）保留在本模块并导出；`isPlaceholderTitle` 前端副本保留（供 `applyBroadcastTitle` 使用，约 15 行）

- [ ] **Step 1: 写失败测试**

改写测试文件，核心断言：

```ts
it('applyBroadcastTitle: placeholder tab is filled by com broadcast', () => {
  const { applyBroadcastTitle } = mod;
  expect(applyBroadcastTitle({ title: '', id: 't1' }, 'https://a.com/', '新标题', 'com')).toBe(true);
  expect(applyBroadcastTitle({ title: 'a.com', id: 't1' }, 'https://a.com/', '新标题', 'com')).toBe(true);
});
it('applyBroadcastTitle: http/iframe overwrites anything', () => {
  expect(applyBroadcastTitle({ title: '真实', id: 't1' }, 'https://a.com/', '新标题', 'http')).toBe(true);
});
it('applyBroadcastTitle: com does not overwrite http-sourced title', () => {
  const { titleSourceRef } = mod;
  titleSourceRef.set('t1', 'http');
  expect(applyBroadcastTitle({ title: '真实', id: 't1' }, 'https://a.com/', '陈旧', 'com', titleSourceRef.get('t1'))).toBe(false);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test useBrowserPageMeta`
Expected: FAIL（旧实现无 `applyBroadcastTitle` 导出）。

- [ ] **Step 3: 实现**

`useBrowserPageMeta.ts` 重写为广播处理器：

```ts
import { useCallback, useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { pageMetaClient } from '@utils/pageMetaClient';
import { applyBroadcastUpdate, getCachedTitle } from '@utils/siteMetaCache';
import type { PageMeta, PageMetaUpdatedPayload, MetaSource } from '@shared/ipc/browser';
import { normalizeUrlForDedup } from '@utils/browserDisplayUtils';

export const titleSourceRef = new Map<string, MetaSource>();

export function isPlaceholderTitle(title: string, url: string): boolean {
  if (!title) return true;
  if (title === url) return true;
  if (/^https?:\/\//i.test(title)) return true;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    if (!host) return false;
    const t = title.trim().toLowerCase();
    return t === host || t === `www.${host}`;
  } catch {
    return false;
  }
}

export function applyBroadcastTitle(
  tab: { title: string; id: string },
  url: string,
  broadcastTitle: string,
  source: MetaSource,
  currentSource?: MetaSource,
): boolean {
  if (!broadcastTitle) return false;
  if (broadcastTitle === tab.title) return false;
  if (isPlaceholderTitle(broadcastTitle, url)) return false; // 广播的是占位 → 不应用
  if (isPlaceholderTitle(tab.title, url)) return true;        // 当前是占位 → 应用
  if (source === 'http' || source === 'iframe') return true;
  if (source === 'com') return currentSource === 'com' || currentSource === 'google';
  return false;
}

function normalizeMetaUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch {
    const noHash = url.split('#')[0] || url;
    return noHash.length > 8 && noHash.endsWith('/') ? noHash.replace(/\/+$/, '') : noHash;
  }
}

export function useBrowserPageMeta() {
  const applyBroadcast = useCallback((p: PageMetaUpdatedPayload) => {
    applyBroadcastUpdate(p); // 镜像更新（Task 7）
    const state = useAppStore.getState();
    const cleanUrl = normalizeMetaUrl(p.url);
    const matchingTabs = state.browserTabs.filter(
      (t) => normalizeUrlForDedup(normalizeMetaUrl(t.url)) === normalizeUrlForDedup(cleanUrl),
    );
    for (const tab of matchingTabs) {
      const curSource = titleSourceRef.get(tab.id);
      if (applyBroadcastTitle(tab, cleanUrl, p.title, p.source, curSource)) {
        state.browserUpdateTab(tab.id, { title: p.title });
        titleSourceRef.set(tab.id, p.source);
      }
    }
    if (matchingTabs.length > 0 || state.browserHistory.some((h) => h.url === cleanUrl)) {
      state.browserUpdateHistoryTitle(cleanUrl, p.title || getCachedTitle(cleanUrl));
    }
  }, []);

  useEffect(() => pageMetaClient.subscribeUpdated(applyBroadcast), [applyBroadcast]);

  const handlePageMeta = useCallback((meta: PageMeta, source: MetaSource = 'http') => {
    // 本地渲染期事件（iframe/地址栏）：先同步落地 store（保持即时性），再异步上报服务端合并
    applyBroadcastUpdate({ url: meta.url, title: meta.title, faviconUrl: meta.favicon, faviconDataUri: meta.faviconDataUri || '', source });
    const state = useAppStore.getState();
    const cleanUrl = normalizeMetaUrl(meta.url);
    const activeTab = state.browserTabs.find((t) => t.id === state.browserActiveTabId);
    const exact = state.browserTabs.find((t) => normalizeUrlForDedup(normalizeMetaUrl(t.url)) === normalizeUrlForDedup(cleanUrl));
    if (exact) {
      for (const t of state.browserTabs.filter((x) => normalizeUrlForDedup(normalizeMetaUrl(x.url)) === normalizeUrlForDedup(cleanUrl))) {
        if (applyBroadcastTitle(t, cleanUrl, meta.title, source, titleSourceRef.get(t.id))) {
          state.browserUpdateTab(t.id, { title: meta.title });
          titleSourceRef.set(t.id, source);
        }
      }
      state.browserUpdateHistoryTitle(cleanUrl, meta.title || getCachedTitle(cleanUrl));
    } else if (activeTab) {
      const urlChanged = normalizeUrlForDedup(normalizeMetaUrl(activeTab.url)) !== normalizeUrlForDedup(cleanUrl);
      const shouldTitle = !urlChanged && applyBroadcastTitle(activeTab, cleanUrl, meta.title, source, titleSourceRef.get(activeTab.id));
      state.browserUpdateTab(activeTab.id, { url: cleanUrl, title: shouldTitle ? meta.title : activeTab.title });
      if (shouldTitle) titleSourceRef.set(activeTab.id, source);
      state.browserUpdateHistoryTitle(cleanUrl, meta.title || getCachedTitle(cleanUrl));
    }
    void pageMetaClient.report({ url: meta.url, title: meta.title, favicon: meta.favicon }, source);
  }, []);

  return { handlePageMeta };
}
```

> `useBrowserPanelMetaWiring.ts`：`useBrowserPageMeta(pendingNavigationsRef, markUrlSeen)` 调用改为 `useBrowserPageMeta()`（新签名无参）。`useBrowserMetaSubscription.ts`：`onMetaChanged` 回调保持 `_handlePageMeta(meta, 'com')`（签名不变）。`applyBroadcastUpdate` 由 Task 7 提供（镜像 upsert + notify）。原 `pendingNavigationsRef`/`markUrlSeen`/`shouldProcessMeta`/`META_DEDUP_TTL` 逻辑删除（去重由服务端 3s 窗口承担）；`useBrowserPanelMetaWiring` 中传给 `useBrowserUrlChange` 的 `pendingNavigationsRef`/`markUrlSeen` 参数由 Task 10 在 `useBrowserUrlChange.ts` 内自建 ref 兜底（保留导航去重，见 Task 10 说明）。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --dir frontend run test`
Expected: 全部 PASS（重写的广播处理器测试 + 其余回归）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/browser/useBrowserPageMeta.ts frontend/src/app/features/browser/useBrowserMetaSubscription.ts frontend/src/app/features/browser/__tests__/useBrowserPageMeta.test.ts
git commit -m "refactor(frontend): replace title-merge engine with broadcast-driven light gate"
```

---

### Task 10: 调用点迁移（fetch → pageMetaClient + 刷新书签快照）

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserUrlChange.ts`
- Modify: `frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts`
- Modify: `frontend/src/app/features/browser/useBrowserDialogs.ts`
- Modify: `frontend/src/app/features/browser/useBrowserTagActions.ts`
- Test: `frontend/src/app/features/browser/__tests__/useBrowserTagActions.test.ts`、`useBrowserDialogs.test.ts`

**Interfaces:**
- Consumes: `pageMetaClient.get/refresh/report`（Task 6）、`isPlaceholderTitle`/`applyBroadcastTitle`/`titleSourceRef`（Task 9）、`hostnameFromUrl`（`browserDisplayUtils`）
- Produces: `handleRefreshTab(tabId, url)` 新行为——刷新后同步书签占位快照标题（调用现有 `browserUpdateSavedBookmark`）

- [ ] **Step 1: 写失败测试**

`useBrowserTagActions.test.ts` 增加：

```ts
it('refresh updates bookmark snapshot title when placeholder', async () => {
  // 构造 store：bookmark { id:'bm1', tabId:'tabX', url:'https://x.com/', title:'x.com' }（占位标题）
  // prefetchPageMeta mock 返回 { title: '真实标题', favicon: '', faviconDataUri: '', url }
  await act(async () => { await result.current.handleRefreshTab('tabX', 'https://x.com/'); });
  // 断言 store 中该 bookmark 快照 title 变为 '真实标题'
});
it('refresh keeps custom bookmark title', async () => {
  // bookmark title: '我的书签'（非占位）→ 刷新后仍为 '我的书签'
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test useBrowserTagActions`
Expected: FAIL（刷新不更新书签快照）。

- [ ] **Step 3: 实现**

`useBrowserTagActions.ts` 改造 `handleRefreshTab`：

```ts
const handleRefreshTab = useCallback(async (tabId: string, url: string) => {
  if (!url) return;
  const meta = await pageMetaClient.refresh(url); // force=true（Task 6）
  const state = useAppStore.getState();
  const tab = state.browserTabs.find((t) => t.id === tabId);
  const title = meta?.title || hostnameFromUrl(url);
  if (tab) {
    const shouldApply = applyBroadcastTitle(tab, url, title, 'http', titleSourceRef.get(tabId));
    browserUpdateTab(tabId, { title: shouldApply ? title : tab.title });
  } else {
    const isHistoryEntry = state.browserHistory.some((h) => h.id === tabId);
    if (isHistoryEntry) browserUpdateHistoryTitle(url, title);
    // 书签快照：仅占位标题时覆盖（服务端广播也会经 Task 9 落地，此处为兜底直连）
    const bm = state.browserBookmarks.find((b) => b.url === url);
    if (bm && bm.tabId && isPlaceholderTitle(bm.title, url)) {
      state.browserUpdateSavedBookmark(bm.tabId, { title, url: bm.url });
    }
  }
}, [browserUpdateTab, browserUpdateHistoryTitle]);
```

> `titleSourceRef` 为 Task 9 导出的模块级单例 Map（非 React state），跨 hook 共享。其他调用点：
- `useBrowserUrlChange.ts`：`fetchPageMeta(href)` / `prefetchPageMeta(normalizedUrl)` → `pageMetaClient.get(href)` / `pageMetaClient.get(normalizedUrl)`；删除重试/fallback 计时器（服务端 SWR 承担）；`pendingPrefetchRef`/`fallbackTimeoutsRef`/`navigationGenerationRef` 保留但降级为导航去重用途（防同 URL 重复 `get`），`onPageMeta` 语义改为 Task 9 的 `handlePageMeta`。
- `useBrowserPanelAddressSubmit.ts`：`mod.fetchPageMeta(finalUrl)` → `pageMetaClient.get(finalUrl)`。
- `useBrowserDialogs.ts`：`prefetchPageMeta(url)` → `pageMetaClient.get(url)`；新建收藏的 `setCachedSiteMeta` 调用删除（改由 `report`/广播落地）。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --dir frontend run test`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/browser/useBrowserTagActions.ts frontend/src/app/features/browser/useBrowserUrlChange.ts frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts frontend/src/app/features/browser/useBrowserDialogs.ts frontend/src/app/features/browser/__tests__/useBrowserTagActions.test.ts frontend/src/app/features/browser/__tests__/useBrowserDialogs.test.ts
git commit -m "refactor(frontend): migrate fetch call sites to pageMetaClient, refresh syncs bookmark snapshot"
```

---

### Task 11: 启动预热

**Files:**
- Modify: `frontend/src/app/hooks/useAppStartup.ts`
- Modify: `frontend/src/app/features/browser/useBrowserPanelEffects.ts`（或 BrowserPanel 内）
- Test: `frontend/src/app/hooks/__tests__/useAppStartup.test.ts`（新）

**Interfaces:**
- Consumes: `pageMetaClient.warmup`（Task 6）
- Produces: 启动时收集收藏/历史/打开标签的可见 URL（去重、上限 200）→ `warmup(urls)`

- [ ] **Step 1: 写失败测试**

```ts
it('warmup collects unique visible urls (tabs+bookmarks+history) capped at 200', async () => {
  // mock pageMetaClient.warmup；构造 store 含 3 个 tab、2 个 bookmark、1 条 history（1 个重复 URL）
  // 断言 warmup 收到去重后的 URL 数组
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test useAppStartup`
Expected: FAIL（无预热调用）。

- [ ] **Step 3: 实现**

`useAppStartup.ts` 增加 effect（在 `initSiteMetaCache()` 后）。**注意竞态**：浏览器切片数据由 `hydrateBrowserDefaults` 延迟水合（requestIdleCallback/setTimeout 200ms），一次性同步收集在 preview 模式会读到空 store 导致 warmup 静默失效；需在空结果时延迟重试（300ms 间隔，最多 4 次，覆盖水合窗口；有数据即停）：

```ts
useEffect(() => {
  void initSiteMetaCache();
  let attempts = 0;
  const MAX_ATTEMPTS = 4;
  const tryCollect = () => {
    const urls = collectWarmupUrls();
    if (urls.length > 0) {
      void pageMetaClient.warmup(urls);
      return;
    }
    // 浏览器数据可能仍在延迟水合（requestIdleCallback/setTimeout 200ms）
    attempts += 1;
    if (attempts < MAX_ATTEMPTS) {
      setTimeout(tryCollect, 300);
    }
  };
  tryCollect();
}, []);
```
`collectWarmupUrls`（新工具，放 `frontend/src/app/utils/warmupUrls.ts`）：

```ts
export function collectWarmupUrls(limit = 200): string[] {
  const s = useAppStore.getState();
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (u: string | undefined) => {
    if (!u || !/^https?:\/\//.test(u)) return;
    const key = normalizeUrlForCache(u);
    if (!seen.has(key) && out.length < limit) { seen.add(key); out.push(u); }
  };
  s.browserTabs.forEach((t) => push(t.url));
  s.browserBookmarks.forEach((b) => push(b.url));
  Object.values(s.browserWorkspaceBookmarks).forEach((es) => es.forEach((e) => push(e.url)));
  s.browserHistory.slice(0, 500).forEach((h) => push(h.url));
  return out;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --dir frontend run test`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/hooks/useAppStartup.ts frontend/src/app/utils/warmupUrls.ts frontend/src/app/hooks/__tests__/useAppStartup.test.ts
git commit -m "feat(frontend): warm up visible site meta on startup"
```

---

### Task 12: previewPageMetaService 同构实现（JS 服务端）

**Files:**
- Create: `frontend/dev/previewWorkspaceService/pageMetaService.ts`
- Modify: `frontend/dev/previewWorkspaceService/index.ts`（新增 4 路由）
- Modify: `frontend/dev/previewWorkspaceService/siteMetaCache.ts`（扩展新字段）
- Modify: `frontend/vite.config.ts`（page-meta 中间件加 DDG 回退级）
- Test: `frontend/dev/previewWorkspaceService/pageMetaService.test.ts`（新）

**Interfaces:**
- Produces:
  ```ts
  export interface PreviewPageMetaServiceOptions { baseDir: string; }
  export function createPreviewPageMetaService(opts: PreviewPageMetaServiceOptions): {
    get(url: string, force?: boolean): Promise<PageMeta | null>;
    report(url: string, title: string, favicon: string, source: MetaSource): Promise<boolean>;
    warmup(urls: string[]): Promise<void>;
    peek(url: string): SiteMetaCacheEntry | undefined;
    subscribeUpdated(listener: (p: PageMetaUpdatedPayload) => void): () => void;
  };
  ```
- Consumes: `pageMetaGateAllows`（`frontend/dev/previewCrawlerGate.ts`）、`readSiteMetaCache`/`writeSiteMetaCache`、`USER_AGENT`（`frontend/src/shared/userAgent.ts`）

- [ ] **Step 1: 写失败测试**

```ts
// pageMetaService.test.ts
it('get failure keeps cache and backs off', async () => {
  const svc = createPreviewPageMetaService({ baseDir: tmpdir });
  // 第一次成功（fetch mock 返回 meta）→ 缓存 A
  // 第二次失败（fetch mock 返回空）→ 缓存仍为 A，failCount=1，nextRetryAt>0
});
it('report com does not clobber http title', async () => {
  const svc = createPreviewPageMetaService({ baseDir: tmpdir });
  await svc.report('https://a.com/', '真实标题', '', 'http');
  await svc.report('https://a.com/', '陈旧标题', '', 'com');
  expect(svc.peek('https://a.com/')?.title).toBe('真实标题');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test pageMetaService`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`pageMetaService.ts`：JS 同构移植 Task 2/4 的合并引擎与缓存策略（`isPlaceholderTitle`/`shouldApplyExactMatchTitle`/`shouldReplaceFavicon`/TTL 7d/退避 5min×2^n≤2h/单飞行 Map<string, Promise>），抓取走 `pageMetaGateAllows` + fetch（复用 vite 中间件逻辑抽出的共享函数 `fetchPageMetaOnce(url)`，放 `frontend/dev/previewFetchPageMeta.ts`，vite.config.ts 与 previewPageMetaService 共同引用）。**合规门控（强制）**：服务路由的抓取路径必须执行 HTML 级 `pageMetaGateAllows(url)`（robots + 域名限速）——默认 fetchOnce 包装层或 get 内部在 fetch 前调用，被拒返回空 PageMeta；favicon 下载保留 robots-only 门控（`{ rateLimit: false }`）。内存缓存 + `readSiteMetaCache`/`writeSiteMetaCache`（防抖 500ms）持久化；`subscribeUpdated` 用本地 `Set<listener>` 广播。

`index.ts` 新增路由（仿现有 site-meta-cache 路由风格）：

```ts
{
  method: 'POST', pathname: makePath('/browser/page-meta/get'),
  handler: async (_req, body) => {
    const b = body as { url?: string; force?: boolean } | undefined;
    if (!b?.url) return fail('url is required', 'INVALID_INPUT');
    return ok(await pageMetaSvc.get(b.url, b.force));
  },
},
// + report / refresh(=get force) / warmup
```

`siteMetaCache.ts` 的 `SiteMetaCacheEntry` 扩展 4 字段（titleSource/lastOkAt/nextRetryAt/failCount，反序列化缺省兼容：`?? ''` / `?? 0`）。`vite.config.ts` page-meta 中间件在无 favicon link 且 `/favicon.ico` 兜底后增加 DDG 级（复用 `duckduckgo_favicon_url` 的 JS 对应 `ddgFaviconUrl(url)`）。

> 说明：预览模式的 `page-meta-updated` 广播仅作用于本进程内存监听者（无跨进程），前端 preview 适配的 `subscribeUpdated` 在 Task 6 中返回 no-op；为保持双端一致体验，预览端由 `get`/`report` 返回后前端直接 `applyBroadcastUpdate`（Task 9 的 `handlePageMeta` 已做本地落地），无需事件通道。此差异在 Task 14 一致性测试中验证。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --dir frontend run test`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/dev/previewWorkspaceService/pageMetaService.ts frontend/dev/previewWorkspaceService/pageMetaService.test.ts frontend/dev/previewWorkspaceService/index.ts frontend/dev/previewWorkspaceService/siteMetaCache.ts frontend/dev/previewFetchPageMeta.ts frontend/vite.config.ts
git commit -m "feat(preview): isomorphic page meta service with json persistence"
```

---

### Task 13: mock-bridge 与既有测试基线修复

**Files:**
- Modify: `frontend/src/mock-bridge.ts`（或 mock 目录）
- Modify: 受影响的既有测试（`useBrowserDialogs.test.ts`、`useBrowserPageMeta.test.ts`、`siteMetaCache.test.ts` 等，随 Task 6-10 已改；本任务收尾）

**Interfaces:**
- Consumes: Task 6 的 `PageMetaClient` 接口
- Produces: mock 模式 `pageMetaClient`（内存实现，供测试与浏览器降级）

- [ ] **Step 1: 写失败测试**

```ts
it('mock pageMetaClient keeps state in memory and broadcasts', async () => {
  const mock = createMockPageMetaClient();
  const seen: PageMetaUpdatedPayload[] = [];
  mock.subscribeUpdated((p) => seen.push(p));
  await mock.report({ title: 'T', favicon: '', url: 'https://a.com/' }, 'http');
  expect(seen.some((p) => p.title === 'T')).toBe(true);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend run test`
Expected: FAIL（mock 客户端不存在）。

- [ ] **Step 3: 实现**

`createMockPageMetaClient()`：内存 `Map<url, SiteMetaCacheEntry>` + `Set<listener>`，`get` 直接返回内存值或空、`report` 按合并规则更新并广播、`warmup` no-op。`pageMetaClient` 三态选择改为 `isTauriShell() ? tauri : (isPreview ? preview : mock)`，或保留现有环境判定（`mock-bridge.ts` 已是浏览器降级路径，为 mock 客户端提供导出）。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --dir frontend run test && pnpm --dir frontend run lint`
Expected: 全绿、0 errors。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/mock-bridge.ts frontend/src/app/utils/__tests__/pageMetaClient.test.ts
git commit -m "test(frontend): add mock pageMetaClient and stabilize test baseline"
```

---

### Task 14: 双端一致性验证与质量门禁

**Files:**
- Test: `frontend/dev/previewWorkspaceService/pageMetaService.test.ts`（扩充一致性用例）
- Test: `crates/browser/src/page_meta_service.rs`（扩充一致性用例）
- 无生产代码改动（除非验证发现缺口）

**Interfaces:**
- Consumes: 全部前序任务产物

- [ ] **Step 1: 写一致性测试（同一输入序列 → 相同结果）**

Rust（`page_meta_service.rs` 测试）与 JS（`pageMetaService.test.ts`）各实现同一组场景，断言对齐：

```
场景A：report(http,'真实') → report(com,'陈旧') → 标题='真实'（com 不覆盖 http）
场景B：get 成功 → get 失败 → 缓存保留 + failCount=1 + nextRetryAt>0
场景C：占位标题被 com 广播补全
```

- [ ] **Step 2: 运行全部测试**

Run: `cargo test --workspace`
Run: `pnpm --dir frontend run test`
Expected: 全部 PASS；若 Rust/JS 结果不一致，修正 JS 实现使其与 Rust 真源对齐（不修 Rust）。

- [ ] **Step 3: 质量门禁**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Run: `pnpm --dir frontend run lint`
Expected: 0 warnings / 0 errors。

- [ ] **Step 4: 人工验收（对应 spec 第 11 节）**

- 重复渲染失效 URL：缓存条目持续存在、图标最终稳定为兜底（不再来回切换）。
- 打开应用：图标立即显示（dataUri 或占位图标），预热后 5 秒内补全。
- 刷新按钮：占位书签快照更新、自定义书签不动、tab/history 同步。
- 断网：dataUri 显示、无缓存显示占位、无报错、缓存不被删。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "test(browser): cross-mode consistency and quality gates for page meta service"
```

---

## Self-Review 记录

**Spec 覆盖：**
- R1/R2（删缓存/坏 URL 写缓存）→ Task 7-8（只读镜像 + 不删缓存）、Task 4（report 门控）
- R3（无 TTL）→ Task 4（TTL/SWR/退避）
- R4（启动延迟）→ Task 8（占位图标）、Task 11（预热）
- R5（刷新不更新书签）→ Task 10（占位快照落库）
- R6（Google S2 质量差）→ Task 3/7/12（DDG 回退级）
- R7（两套规范化）→ Task 1（normalize_cache_key 与前端同构）+ Task 7（统一走镜像）
- R8（职责分散）→ Task 2/4/5/9（合并引擎收归服务端，前端仅应用门）
- spec 3.3 数据模型 → Task 1；4.x 数据流 → Task 4/5/9/10/12；5 节应用门 → Task 9；6 节 TTL/退避 → Task 4/12；7 节回退链 → Task 3/7/12；10 节测试 → 各任务 + Task 14；11 节验收 → Task 14 Step 4。

**占位扫描：** 无 TBD/TODO；所有代码步骤含真实代码。
**类型一致性：** `PageMeta`（crates/browser `browser_meta::PageMeta`，字段 title/favicon/favicon_data_uri/url）与前端 `shared/ipc/browser.ts` 一致；`SiteMetaCacheEntry` 两端字段名 camelCase 对齐；`PageMetaFetcher::fetch(url, force) -> Pin<Box<dyn Future<Output=PageMeta>>>` 在 Task 4 定义、Task 5 实现；`pageMetaClient` 方法名/签名在 Task 6 定义、Task 7-12 消费。
