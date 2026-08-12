# 浏览器面板网站元数据持久化缓存（favicon data-URI + 标题）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重开应用后浏览器面板图标/标题零网络秒开——favicon 图片本体（base64 data-URI）与标题经 SQLite（Tauri）/ JSON 文件（浏览器 preview）持久化，前端内存层同步渲染。

**Architecture:** 三层架构：① Rust `SiteMetaCacheStore`（SQLite，`crates/browser`，WAL + 行级写）与 Node preview 服务（JSON 文件）为持久化层；② 前端 `siteMetaCache.ts` 内存 `Map<url, entry>` 为渲染唯一来源（启动一次批量预载，预载门控图标渲染）；③ `SiteMetaBackend` 三端实现（tauri/preview/mock）统一接口。抓取函数扩展为同时下载 favicon 图片字节返回 data-URI；生命周期：仅用户打开/导航时刷新、失败保留旧缓存、删除按引用计数清缓存。

**Tech Stack:** Rust (rusqlite 0.39 + reqwest + base64 0.22 + serde)、React 19 + Zustand + TypeScript、Vite preview 服务 (Node)、Vitest。

## Global Constraints

- **双端一致**：Tauri 桌面与浏览器模式行为一致；新增 IPC 三端各实现一次（tauri/preview/mock）
- **零网络秒开**：已缓存条目渲染纯同步读内存，不向任何远端发请求；预载门控（`isSiteMetaCacheReady` false 时图标区渲染空占位，**不显示回退图标**）
- **生命周期**：仅「点击打开标签/书签/历史项」或「地址栏导航」触发刷新，**成功才写**；切换标签不刷新；手动"重新抓取"`force` 成功才更新；抓取失败保留旧缓存
- **删除按引用计数**：URL 仍被标签/书签/工作区书签/文件夹/历史引用则保留缓存，引用归零才 `removeCachedSiteMeta`
- **无条数上限**：持久化与内存层不设条数上限、无 LRU 淘汰；单条尺寸上限：`faviconDataUri` ≤ 64KB、`title` ≤ 200 字符，超限丢图片本体仅留标题
- **零新依赖（前端）**：不引入新 npm 依赖；Rust 侧新增 `rusqlite`（workspace 已有 0.39）与 `base64` 0.22（仅 src-tauri）
- **禁止兼容层**：旧 `adl-ui:browser-favicon-cache` localStorage 数据不迁移、不读取；`getCachedFavicon/setCachedFavicon/clearFaviconCacheForUrl/clearPageMetaCacheForUrl/subscribeFavicon` 旧 API 全部删除并更新调用点
- **渲染读路径零解析**：`getCachedSiteMeta/getCachedFavicon/getCachedTitle` 命中为纯 `Map.get`（key 经 `normalizeUrlForCache` 一次归一化），无网络、无 IPC
- 所有 UI 展示文本硬编码禁止（本功能无新增 UI 文本）
- 产品未发布，禁止向后兼容/迁移代码

---
---

## Task 1: Rust `SiteMetaCacheStore`（SQLite）

**Files:**
- Create: `crates/browser/src/site_meta_cache.rs`
- Modify: `crates/browser/Cargo.toml`（加 `rusqlite`）
- Modify: `crates/browser/src/lib.rs`（导出模块）
- Test: `crates/browser/src/site_meta_cache.rs`（内嵌 `#[cfg(test)]`）

**Interfaces:**
- Produces: `pub struct SiteMetaCacheEntry { title: String, favicon_url: String, favicon_data_uri: String, fetched_at: i64 }`（serde `rename_all = "camelCase"`）
- Produces: `pub struct SiteMetaCacheStore { db: Mutex<rusqlite::Connection> }`，方法 `open(data_dir: &Path) -> Result<Arc<Self>, AppError>`、`get_all() -> Result<HashMap<String, SiteMetaCacheEntry>, AppError>`、`upsert(&HashMap<String, SiteMetaCacheEntry>) -> Result<(), AppError>`、`remove(&[String]) -> Result<(), AppError>`、`clear() -> Result<(), AppError>`

- [ ] **Step 1: 在 workspace 根确认 rusqlite 版本可用（读 `Cargo.toml:54`）**

Run: `Select-String -Path Cargo.toml -Pattern "rusqlite"`
Expected: `rusqlite = { version = "0.39", features = ["bundled", "serde_json"] }`（已在 workspace，无需改根文件）

- [ ] **Step 2: 写失败测试（`crates/browser/src/site_meta_cache.rs`）**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    fn open_test_store(name: &str) -> Arc<SiteMetaCacheStore> {
        let dir = temp_dir().join(format!("adl-site-meta-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        SiteMetaCacheStore::open(&dir).unwrap()
    }

    fn entry(title: &str) -> SiteMetaCacheEntry {
        SiteMetaCacheEntry {
            title: title.to_string(),
            favicon_url: format!("https://{title}/favicon.ico"),
            favicon_data_uri: "data:image/png;base64,AAAA".to_string(),
            fetched_at: 1700000000000,
        }
    }

    #[test]
    fn upsert_then_get_all_roundtrips() {
        let store = open_test_store("roundtrip");
        let mut map = HashMap::new();
        map.insert("https://a.com/".to_string(), entry("A"));
        map.insert("https://b.com/x".to_string(), entry("B"));
        store.upsert(&map).unwrap();
        let all = store.get_all().unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all.get("https://a.com/").unwrap().title, "A");
        assert_eq!(all.get("https://b.com/x").unwrap().fetched_at, 1700000000000);
    }

    #[test]
    fn upsert_replaces_existing_row() {
        let store = open_test_store("replace");
        let mut m1 = HashMap::new();
        m1.insert("https://a.com/".to_string(), entry("old"));
        store.upsert(&m1).unwrap();
        let mut m2 = HashMap::new();
        m2.insert("https://a.com/".to_string(), entry("new"));
        store.upsert(&m2).unwrap();
        assert_eq!(store.get_all().unwrap().len(), 1);
        assert_eq!(store.get_all().unwrap().get("https://a.com/").unwrap().title, "new");
    }

    #[test]
    fn remove_deletes_rows() {
        let store = open_test_store("remove");
        let mut map = HashMap::new();
        map.insert("https://a.com/".to_string(), entry("A"));
        map.insert("https://b.com/x".to_string(), entry("B"));
        store.upsert(&map).unwrap();
        store.remove(&["https://a.com/".to_string()]).unwrap();
        let all = store.get_all().unwrap();
        assert_eq!(all.len(), 1);
        assert!(all.contains_key("https://b.com/x"));
    }

    #[test]
    fn clear_empties_store() {
        let store = open_test_store("clear");
        let mut map = HashMap::new();
        map.insert("https://a.com/".to_string(), entry("A"));
        store.upsert(&map).unwrap();
        store.clear().unwrap();
        assert!(store.get_all().unwrap().is_empty());
    }

    #[test]
    fn empty_store_returns_empty_map() {
        let store = open_test_store("empty");
        assert!(store.get_all().unwrap().is_empty());
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cargo test -p adl-browser site_meta_cache`
Expected: FAIL — 模块不存在（`mod site_meta_cache` 未声明 / 无 `SiteMetaCacheStore`）

- [ ] **Step 4: 实现 `site_meta_cache.rs`**

```rust
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

use adl_errors::AppError;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteMetaCacheEntry {
    pub title: String,
    pub favicon_url: String,
    pub favicon_data_uri: String,
    pub fetched_at: i64,
}

const CREATE_TABLE_SQL: &str = "CREATE TABLE IF NOT EXISTS site_meta_cache (
    url              TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    favicon_url      TEXT NOT NULL DEFAULT '',
    favicon_data_uri TEXT NOT NULL DEFAULT '',
    fetched_at       INTEGER NOT NULL
);";

pub struct SiteMetaCacheStore {
    db: Mutex<Connection>,
}

impl SiteMetaCacheStore {
    pub fn open(data_dir: &Path) -> Result<Arc<Self>, AppError> {
        std::fs::create_dir_all(data_dir)?;
        let db_path = data_dir.join("site-meta-cache.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| AppError::Storage(format!("open site-meta-cache.db: {e}")))?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| AppError::Storage(format!("set WAL: {e}")))?;
        conn.execute_batch(CREATE_TABLE_SQL)
            .map_err(|e| AppError::Storage(format!("create site_meta_cache table: {e}")))?;
        Ok(Arc::new(Self { db: Mutex::new(conn) }))
    }

    pub fn get_all(&self) -> Result<HashMap<String, SiteMetaCacheEntry>, AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn
            .prepare("SELECT url, title, favicon_url, favicon_data_uri, fetched_at FROM site_meta_cache")
            .map_err(|e| AppError::Storage(format!("prepare select: {e}")))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    SiteMetaCacheEntry {
                        title: row.get(1)?,
                        favicon_url: row.get(2)?,
                        favicon_data_uri: row.get(3)?,
                        fetched_at: row.get(4)?,
                    },
                ))
            })
            .map_err(|e| AppError::Storage(format!("query rows: {e}")))?;
        let mut map = HashMap::new();
        for r in rows {
            let (k, v) = r.map_err(|e| AppError::Storage(format!("row: {e}")))?;
            map.insert(k, v);
        }
        Ok(map)
    }

    pub fn upsert(&self, entries: &HashMap<String, SiteMetaCacheEntry>) -> Result<(), AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        for (url, entry) in entries {
            conn.execute(
                "INSERT OR REPLACE INTO site_meta_cache (url, title, favicon_url, favicon_data_uri, fetched_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![url, entry.title, entry.favicon_url, entry.favicon_data_uri, entry.fetched_at],
            )
            .map_err(|e| AppError::Storage(format!("upsert {url}: {e}")))?;
        }
        Ok(())
    }

    pub fn remove(&self, urls: &[String]) -> Result<(), AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        for url in urls {
            conn.execute("DELETE FROM site_meta_cache WHERE url = ?1", params![url])
                .map_err(|e| AppError::Storage(format!("delete {url}: {e}")))?;
        }
        Ok(())
    }

    pub fn clear(&self) -> Result<(), AppError> {
        let conn = self.db.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute_batch("DELETE FROM site_meta_cache")
            .map_err(|e| AppError::Storage(format!("clear site_meta_cache: {e}")))?;
        Ok(())
    }
}

// (below: the #[cfg(test)] tests from Step 2)
```

- [ ] **Step 5: 修改 `crates/browser/Cargo.toml` 添加 rusqlite**

在 `[dependencies]` 段 `adl-errors` 下方加入：

```toml
rusqlite.workspace = true
```

- [ ] **Step 6: 修改 `crates/browser/src/lib.rs` 导出**

在 `mod browser_events;` 上方加 `mod site_meta_cache;`，在 `pub use` 区加：

```rust
pub use site_meta_cache::{SiteMetaCacheEntry, SiteMetaCacheStore};
```

- [ ] **Step 7: 运行测试确认通过**

Run: `cargo test -p adl-browser site_meta_cache`
Expected: PASS（5 个测试）

- [ ] **Step 8: Commit**

```bash
git add crates/browser/src/site_meta_cache.rs crates/browser/src/lib.rs crates/browser/Cargo.toml
git commit -m "feat(browser): add SQLite SiteMetaCacheStore (row-level CRUD + WAL)"
```

---

## Task 2: Rust `PageMeta` 扩展 `favicon_data_uri` + favicon 字节下载

**Files:**
- Modify: `crates/browser/src/browser_meta.rs`
- Modify: `src-tauri/Cargo.toml`（加 `base64 = "0.22"`）
- Modify: `src-tauri/src/commands/browser.rs`（`fetch_page_meta_inner` 下载 favicon 字节）
- Test: `src-tauri/src/commands/browser.rs`（内嵌测试）

**Interfaces:**
- Consumes: `adl_browser::html_meta` 的 `extract_favicon` / `origin_favicon_fallback`
- Produces: `PageMeta { title, favicon, url, favicon_data_uri }`（serde camelCase；favicon_data_uri 用于前端缓存写入）

- [ ] **Step 1: 写失败测试（内嵌在 `src-tauri/src/commands/browser.rs`）**

```rust
#[cfg(test)]
mod favicon_data_uri_tests {
    use super::*;

    fn sample_meta() -> PageMeta {
        PageMeta { title: "T".into(), favicon: "https://a.com/favicon.ico".into(), url: "https://a.com/".into(), favicon_data_uri: String::new() }
    }

    #[test]
    fn page_meta_serializes_camel_case() {
        let json = serde_json::to_string(&sample_meta()).unwrap();
        assert!(json.contains("\"faviconDataUri\""));
    }

    #[test]
    fn empty_favicon_url_produces_empty_data_uri() {
        let out = to_data_uri(&[], "image/x-icon");
        assert!(out.starts_with("data:image/x-icon;base64,"));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p tauri-app`（若 workspace 包名不同，用 `cargo test -p $(cat src-tauri/Cargo.toml | Select-String -Pattern '^name' | head -1)` 查包名；测试预期 FAIL：`to_data_uri` 未定义 / `PageMeta` 无 `favicon_data_uri`）

- [ ] **Step 3: 扩展 `crates/browser/src/browser_meta.rs`**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PageMeta {
    pub title: String,
    pub favicon: String,
    pub url: String,
    pub favicon_data_uri: String,
}
```

- [ ] **Step 4: 在 `src-tauri/Cargo.toml` 添加 base64**

在 `[dependencies]` 添加：`base64 = "0.22"`

- [ ] **Step 5: 在 `src-tauri/src/commands/browser.rs` 添加下载 helper 并更新 `fetch_page_meta_inner`**

在 `use` 区加 `use base64::{engine::general_purpose::STANDARD, Engine as _};`

在 `fetch_page_meta_inner` 上方加：

```rust
/// Download favicon image bytes as a base64 data-URI. Returns empty string on
/// any failure (network / timeout / non-success / > 64KB). Callers must not
/// cache a failed result — the previous cached entry stays intact.
async fn download_favicon_data_uri(client: &reqwest::Client, favicon_url: &str) -> String {
    if favicon_url.is_empty() || !favicon_url.starts_with("http://") && !favicon_url.starts_with("https://") {
        return String::new();
    }
    let Ok(resp) = client.get(favicon_url).send().await else {
        return String::new();
    };
    if !resp.status().is_success() {
        return String::new();
    }
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(';').next().unwrap_or(s).trim().to_string())
        .unwrap_or_else(|| "image/x-icon".to_string());
    let Ok(bytes) = resp.bytes().await else {
        return String::new();
    };
    if bytes.is_empty() || bytes.len() > 64 * 1024 {
        return String::new();
    }
    to_data_uri(&bytes, &content_type)
}

fn to_data_uri(bytes: &[u8], content_type: &str) -> String {
    format!("data:{content_type};base64,{}", STANDARD.encode(bytes))
}
```

更新 `fetch_page_meta_inner` 结尾（第 320-323 行区域），在 `final_favicon` 之后下载字节：

```rust
    let final_favicon = favicon.unwrap_or_else(|| origin_favicon_fallback(url));

    let favicon_data_uri = if final_favicon.is_empty() {
        String::new()
    } else {
        download_favicon_data_uri(&client, &final_favicon).await
    };

    tracing::info!(url = %url, title = %final_title, favicon_len = final_favicon.len(), favicon_data_uri_len = favicon_data_uri.len(), "fetch_page_meta_inner: result");
    Ok(PageMeta {
        title: final_title,
        favicon: final_favicon,
        url: url.to_string(),
        favicon_data_uri,
    })
```

同时更新其余 3 处 `PageMeta { ... }` 构造（第 266、278、303 行附近）补 `favicon_data_uri: String::new(),`。

- [ ] **Step 6: 运行测试确认通过**

Run: `cargo test -p <tauri-package> favicon_data_uri`（及 `cargo test -p adl-browser` 确认 PageMeta 变更不破坏现有）
Expected: PASS；PageMeta 序列化含 `faviconDataUri`，空字节返回 `data:image/x-icon;base64,`

- [ ] **Step 7: Commit**

```bash
git add crates/browser/src/browser_meta.rs src-tauri/Cargo.toml src-tauri/src/commands/browser.rs
git commit -m "feat(browser): PageMeta favicon_data_uri + download favicon bytes to data-URI"
```

---

## Task 3: Rust 命令 + BrowserManager 接线 + capabilities

**Files:**
- Modify: `crates/browser/src/browser_webview.rs`（BrowserManager 持有 store）
- Modify: `src-tauri/src/setup.rs`（传入 data_dir 初始化 store）
- Modify: `src-tauri/src/commands/browser.rs`（新增 4 命令）
- Modify: `src-tauri/src/main.rs`（注册命令）
- Modify: `src-tauri/permissions/digital-life.toml`（登记命令）

**Interfaces:**
- Consumes: Task 1 的 `SiteMetaCacheStore::open/get_all/upsert/remove/clear`
- Produces: `state.browser_manager.site_meta_cache() -> &Arc<SiteMetaCacheStore>`；命令 `browser_site_meta_get_all/upsert/remove/clear`

- [ ] **Step 1: BrowserManager 持有 store（`crates/browser/src/browser_webview.rs`）**

`use` 区加 `use std::sync::Arc;`（若未引入）与 `use crate::site_meta_cache::SiteMetaCacheStore;`。字段与构造：

```rust
pub struct BrowserManager {
    pool: BrowserPool,
    handles: Mutex<HashMap<String, Arc<dyn WebViewHandle>>>,
    current_color_scheme: Mutex<String>,
    site_meta_cache: Arc<SiteMetaCacheStore>,
}

impl Default for BrowserManager {
    fn default() -> Self {
        Self {
            pool: BrowserPool::new(DEFAULT_POOL_SIZE),
            handles: Mutex::new(HashMap::new()),
            current_color_scheme: Mutex::new("dark".to_string()),
            site_meta_cache: Arc::new(SiteMetaCacheStore::open(std::env::temp_dir().as_path()).expect("in-memory store open")),
        }
    }
}

impl BrowserManager {
    pub fn new(store: Arc<SiteMetaCacheStore>) -> Self {
        Self {
            pool: BrowserPool::new(DEFAULT_POOL_SIZE),
            handles: Mutex::new(HashMap::new()),
            current_color_scheme: Mutex::new("dark".to_string()),
            site_meta_cache: store,
        }
    }

    pub fn site_meta_cache(&self) -> &Arc<SiteMetaCacheStore> {
        &self.site_meta_cache
    }

    pub fn set_site_meta_cache(&mut self, store: Arc<SiteMetaCacheStore>) {
        self.site_meta_cache = store;
    }
    // ... 其余既有方法不变
}
```

> 注意：若 `Default`/`new()` 有既有调用方，`cargo build` 会指出。`setup.rs` 是唯一生产调用点，见 Step 2。

- [ ] **Step 2: setup.rs 初始化 store（`src-tauri/src/setup.rs` 第 408 行区域）**

```rust
    let site_meta_cache = std::sync::Arc::new(
        adl_browser::SiteMetaCacheStore::open(&data_dir)
            .map_err(|e| anyhow::anyhow!("failed to open site-meta-cache store: {e}"))?,
    );
    let mut browser_manager = adl_browser::BrowserManager::new(site_meta_cache);
    let _ = &mut browser_manager; // BrowserManager 已含 store，无需额外 set
```

然后 `AppState { ..., browser_manager, ... }`。若 `BrowserManager::new()` 签名变更，更新此构造点。

- [ ] **Step 3: 新增 4 个命令（`src-tauri/src/commands/browser.rs`）**

在 `browser_fetch_page_meta` 之后添加：

```rust
#[tauri::command]
pub fn browser_site_meta_get_all(
    state: State<'_, AppState>,
) -> Result<IpcResult<HashMap<String, adl_browser::SiteMetaCacheEntry>>, CommandError> {
    Ok(ipc(state.browser_manager.site_meta_cache().get_all()))
}

#[tauri::command]
pub fn browser_site_meta_upsert(
    state: State<'_, AppState>,
    entries: HashMap<String, adl_browser::SiteMetaCacheEntry>,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.site_meta_cache().upsert(&entries)))
}

#[tauri::command]
pub fn browser_site_meta_remove(
    state: State<'_, AppState>,
    urls: Vec<String>,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.site_meta_cache().remove(&urls)))
}

#[tauri::command]
pub fn browser_site_meta_clear(
    state: State<'_, AppState>,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.site_meta_cache().clear()))
}
```

确保文件顶部已 `use std::collections::HashMap;`（已存在）。

- [ ] **Step 4: main.rs 注册命令（第 127 行附近）**

在 `commands::browser::browser_clear_cache,` 后追加：

```rust
            commands::browser::browser_site_meta_get_all,
            commands::browser::browser_site_meta_upsert,
            commands::browser::browser_site_meta_remove,
            commands::browser::browser_site_meta_clear,
```

- [ ] **Step 5: capabilities 登记命令（`src-tauri/permissions/digital-life.toml`）**

在 `"browser_clear_cache",` 后加：

```toml
  "browser_site_meta_get_all",
  "browser_site_meta_upsert",
  "browser_site_meta_remove",
  "browser_site_meta_clear",
```

- [ ] **Step 6: 编译验证**

Run: `cargo build -p <tauri-package>` 与 `cargo build -p adl-browser`
Expected: 编译通过，无警告（`cargo clippy -p adl-browser -- -D warnings` 0 警告）

- [ ] **Step 7: Commit**

```bash
git add crates/browser/src/browser_webview.rs src-tauri/src/setup.rs src-tauri/src/commands/browser.rs src-tauri/src/main.rs src-tauri/permissions/digital-life.toml
git commit -m "feat(browser): site-meta-cache Tauri commands + BrowserManager wiring"
```

---

## Task 4: 浏览器 preview 服务（JSON 文件 + 端点 + page-meta 字节下载）

**Files:**
- Create: `frontend/dev/previewWorkspaceService/siteMetaCache.ts`
- Modify: `frontend/dev/previewWorkspaceService/index.ts`（注册端点 + 支持 PUT/DELETE body）
- Modify: `frontend/vite.config.ts`（`/browser/page-meta` 下载 favicon 字节）

**Interfaces:**
- Produces: `readSiteMetaCache()/writeSiteMetaCache()`（JSON 文件）；HTTP 端点 `GET/PUT/DELETE /__adl_preview_api__/browser/site-meta-cache`，`GET/PUT/DELETE` 均返回 `IpcResult`

- [ ] **Step 1: 写失败测试（`frontend/dev/previewWorkspaceService/siteMetaCache.ts` 内嵌或新测试文件）**

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { readSiteMetaCache, writeSiteMetaCache } from './siteMetaCache';

describe('siteMetaCache preview store', () => {
  it('roundtrips entries through JSON file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adl-site-meta-'));
    await writeSiteMetaCache(dir, {
      'https://a.com/': { title: 'A', faviconUrl: 'https://a.com/favicon.ico', faviconDataUri: 'data:image/png;base64,AA', fetchedAt: 1700000000000 },
    });
    const all = await readSiteMetaCache(dir);
    expect(all['https://a.com/'].title).toBe('A');
  });
});
```

- [ ] **Step 2: 实现 `frontend/dev/previewWorkspaceService/siteMetaCache.ts`**

```ts
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface SiteMetaCacheEntry {
  title: string;
  faviconUrl: string;
  faviconDataUri: string;
  fetchedAt: number;
}

const CACHE_DIR = '.adl-cache';
const CACHE_FILE = 'site-meta-cache.json';

function cachePath(baseDir: string): string {
  return path.join(baseDir, CACHE_DIR, CACHE_FILE);
}

export async function readSiteMetaCache(baseDir: string): Promise<Record<string, SiteMetaCacheEntry>> {
  try {
    const raw = await fs.readFile(cachePath(baseDir), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, SiteMetaCacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeSiteMetaCache(
  baseDir: string,
  entries: Record<string, SiteMetaCacheEntry>,
): Promise<void> {
  await fs.mkdir(path.dirname(cachePath(baseDir)), { recursive: true });
  await fs.writeFile(cachePath(baseDir), JSON.stringify(entries), 'utf8');
}
```

- [ ] **Step 3: 在 `index.ts` 导入并注册端点**

`import * as siteMetaCache from './siteMetaCache';`

在 `routes` 数组末尾追加 3 个端点（`makePath('/browser/site-meta-cache')`）：

```ts
  {
    method: 'GET', pathname: makePath('/browser/site-meta-cache'),
    handler: async (_req, _body, searchParams) => {
      const baseDir = searchParams.get('baseDir') ?? process.cwd();
      return ok(await siteMetaCache.readSiteMetaCache(baseDir));
    },
  },
  {
    method: 'PUT', pathname: makePath('/browser/site-meta-cache'),
    handler: async (_req, body) => {
      const b = body as { baseDir?: string; entries?: Record<string, siteMetaCache.SiteMetaCacheEntry> } | undefined;
      if (!b?.entries) return fail('entries required', 'INVALID_INPUT');
      const baseDir = b.baseDir ?? process.cwd();
      await siteMetaCache.writeSiteMetaCache(baseDir, b.entries);
      return ok(true);
    },
  },
  {
    method: 'DELETE', pathname: makePath('/browser/site-meta-cache'),
    handler: async (_req, body) => {
      const b = body as { baseDir?: string; urls?: string[]; clearAll?: boolean } | undefined;
      const baseDir = b?.baseDir ?? process.cwd();
      const current = await siteMetaCache.readSiteMetaCache(baseDir);
      if (b?.clearAll) {
        await siteMetaCache.writeSiteMetaCache(baseDir, {});
        return ok(true);
      }
      for (const url of b?.urls ?? []) delete current[url];
      await siteMetaCache.writeSiteMetaCache(baseDir, current);
      return ok(true);
    },
  },
```

- [ ] **Step 4: 支持 PUT/DELETE body（`index.ts` 第 496 行区域）**

将 `if (request.method === 'POST')` 改为：

```ts
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
      body = await readBody(request);
    }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- siteMetaCache`
Expected: PASS（roundtrip）

- [ ] **Step 6: `/browser/page-meta` 端点下载 favicon 字节（`frontend/vite.config.ts` 第 126-141 行区域）**

在 favicon 解析之后、`res.end` 之前加入：

```ts
              let faviconDataUri = '';
              if (favicon && (favicon.startsWith('http://') || favicon.startsWith('https://'))) {
                try {
                  const iconController = new AbortController();
                  const iconTimeout = setTimeout(() => iconController.abort(), 5000);
                  const iconResp = await fetch(favicon, { signal: iconController.signal, headers: { 'User-Agent': USER_AGENT } });
                  clearTimeout(iconTimeout);
                  if (iconResp.ok) {
                    const buf = await iconResp.arrayBuffer();
                    if (buf.byteLength > 0 && buf.byteLength <= 64 * 1024) {
                      const contentType = iconResp.headers.get('content-type')?.split(';')[0] ?? 'image/x-icon';
                      faviconDataUri = `data:${contentType};base64,${Buffer.from(buf).toString('base64')}`;
                    }
                  }
                } catch { faviconDataUri = ''; }
              }

              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify({ title, favicon, faviconDataUri, url: targetUrl }));
```

- [ ] **Step 7: 类型检查 + Commit**

Run: `pnpm --dir frontend exec tsc --noEmit`
Expected: 无类型错误

```bash
git add frontend/dev/previewWorkspaceService/siteMetaCache.ts frontend/dev/previewWorkspaceService/index.ts frontend/vite.config.ts
git commit -m "feat(browser): preview service site-meta-cache JSON store + favicon bytes download"
```

---

## Task 5: 前端 `SiteMetaBackend` 三端 + `siteMetaCache.ts` 内存层

**Files:**
- Create: `frontend/src/app/utils/siteMetaBackends/types.ts`
- Create: `frontend/src/app/utils/siteMetaBackends/tauri.ts`
- Create: `frontend/src/app/utils/siteMetaBackends/preview.ts`
- Create: `frontend/src/app/utils/siteMetaBackends/mock.ts`
- Create: `frontend/src/app/utils/siteMetaCache.ts`
- Create: `frontend/src/app/utils/siteMetaCache.test.ts`（与源文件同级，符合项目惯例）

**Interfaces:**
- Produces: `interface SiteMetaBackend { getAll(): Promise<Record<string, SiteMetaCacheEntry>>; upsert(entries): Promise<void>; remove(urls: string[]): Promise<void>; clear(): Promise<void> }`
- Produces: `initSiteMetaCache/isSiteMetaCacheReady/whenSiteMetaCacheReady/getCachedSiteMeta/getCachedFavicon/getCachedTitle/setCachedSiteMeta/removeCachedSiteMeta/subscribeSiteMeta/subscribeSiteMetaGlobal/subscribeSiteMetaReady/getSiteMetaCacheStats/normalizeUrlForCache`（normalizeUrlForCache 自 fetchPageMeta 移入，供 Task 6 使用）

- [ ] **Step 1: 写失败测试（`siteMetaCache.test.ts`）**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('siteMetaCache memory layer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  });

  it('set + get roundtrips data-URI first', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    mod.setCachedSiteMeta('https://a.com', { title: 'A', faviconUrl: 'https://a.com/favicon.ico', faviconDataUri: 'data:image/png;base64,AA', fetchedAt: 1 });
    expect(mod.getCachedFavicon('https://a.com')).toBe('data:image/png;base64,AA');
    expect(mod.getCachedTitle('https://a.com')).toBe('A');
  });

  it('remove clears entry', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    mod.setCachedSiteMeta('https://a.com', { title: 'A', faviconUrl: '', faviconDataUri: 'data:x;base64,AA', fetchedAt: 1 });
    mod.removeCachedSiteMeta('https://a.com');
    expect(mod.getCachedSiteMeta('https://a.com')).toBeUndefined();
  });

  it('preload gates readiness (false before init, true after)', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    expect(mod.isSiteMetaCacheReady()).toBe(false);
    await mod.initSiteMetaCache();
    expect(mod.isSiteMetaCacheReady()).toBe(true);
  });

  it('size caps: oversized data-URI dropped, title kept', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    const big = 'data:image/png;base64,' + 'x'.repeat(64 * 1024 + 1);
    mod.setCachedSiteMeta('https://a.com', { title: 'A'.repeat(500), faviconUrl: '', faviconDataUri: big, fetchedAt: 1 });
    const entry = mod.getCachedSiteMeta('https://a.com')!;
    expect(entry.faviconDataUri).toBe('');
    expect(entry.title).toHaveLength(200);
  });

  it('subscribe fires on set for matching url', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    let fired = 0;
    mod.subscribeSiteMeta('https://a.com', () => { fired++; });
    mod.setCachedSiteMeta('https://a.com', { title: 'A', faviconUrl: '', faviconDataUri: '', fetchedAt: 1 });
    expect(fired).toBe(1);
  });

  it('normalizeUrlForCache strips hash and trailing slash', async () => {
    const mod = await import('./siteMetaCache');
    expect(mod.normalizeUrlForCache('https://a.com/#section')).toBe('https://a.com/');
    expect(mod.normalizeUrlForCache('https://a.com/path/')).toBe('https://a.com/path');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- siteMetaCache`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 `siteMetaBackends/types.ts`**

```ts
export interface SiteMetaCacheEntry {
  title: string;
  faviconUrl: string;
  faviconDataUri: string;
  fetchedAt: number;
}

export interface SiteMetaBackend {
  getAll(): Promise<Record<string, SiteMetaCacheEntry>>;
  upsert(entries: Record<string, SiteMetaCacheEntry>): Promise<void>;
  remove(urls: string[]): Promise<void>;
  clear(): Promise<void>;
}
```

- [ ] **Step 4: 实现 `siteMetaBackends/mock.ts`**

```ts
import type { SiteMetaBackend, SiteMetaCacheEntry } from './types';

export function createMockSiteMetaBackend(): SiteMetaBackend {
  const store = new Map<string, SiteMetaCacheEntry>();
  return {
    getAll: async () => Object.fromEntries(store.entries()),
    upsert: async (entries) => {
      for (const [url, entry] of Object.entries(entries)) store.set(url, entry);
    },
    remove: async (urls) => {
      for (const url of urls) store.delete(url);
    },
    clear: async () => store.clear(),
  };
}
```

- [ ] **Step 5: 实现 `siteMetaBackends/tauri.ts`**

```ts
import { invokeIpc } from '../../../tauri-bridge/tauri-shared';
import type { SiteMetaBackend, SiteMetaCacheEntry } from './types';

export const tauriSiteMetaBackend: SiteMetaBackend = {
  getAll: async () => {
    const r = await invokeIpc<Record<string, SiteMetaCacheEntry>>('browser_site_meta_get_all');
    return r.ok ? (r.data ?? {}) : {};
  },
  upsert: async (entries) => {
    await invokeIpc<void>('browser_site_meta_upsert', { entries });
  },
  remove: async (urls) => {
    await invokeIpc<void>('browser_site_meta_remove', { urls });
  },
  clear: async () => {
    await invokeIpc<void>('browser_site_meta_clear');
  },
};
```

- [ ] **Step 6: 实现 `siteMetaBackends/preview.ts`**

```ts
import { requestPreviewApi } from '../../../preview-bridge/preview-api';
import type { SiteMetaBackend, SiteMetaCacheEntry } from './types';

const PREFIX = '/browser/site-meta-cache';

export const previewSiteMetaBackend: SiteMetaBackend = {
  getAll: async () => {
    const r = await requestPreviewApi<Record<string, SiteMetaCacheEntry>>(`${PREFIX}`);
    return r.ok ? (r.data ?? {}) : {};
  },
  upsert: async (entries) => {
    await requestPreviewApi<void>(`${PREFIX}`, {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    });
  },
  remove: async (urls) => {
    await requestPreviewApi<void>(`${PREFIX}`, {
      method: 'DELETE',
      body: JSON.stringify({ urls }),
    });
  },
  clear: async () => {
    await requestPreviewApi<void>(`${PREFIX}`, {
      method: 'DELETE',
      body: JSON.stringify({ clearAll: true }),
    });
  },
};
```

> 注意：preview 后端用 `process.cwd()` 作为默认 baseDir（preview 服务运行于 frontend 目录）；若需指向工作区根，可在 `index.ts` 端点里用 `path.resolve(process.cwd(), '../../')`（见 Task 4 Step 3 注释）——按当前实现默认 `process.cwd()` 即可，与调试日志 `.adl-logs` 机制一致即可满足预览需求。

- [ ] **Step 7: 实现 `siteMetaCache.ts`**

```ts
import { isTauriShell } from '../../../tauri-bridge/tauri-shared';
import type { SiteMetaBackend, SiteMetaCacheEntry } from './siteMetaBackends/types';
import { tauriSiteMetaBackend } from './siteMetaBackends/tauri';
import { previewSiteMetaBackend } from './siteMetaBackends/preview';
import { createMockSiteMetaBackend } from './siteMetaBackends/mock';

export type { SiteMetaCacheEntry };
export { createMockSiteMetaBackend };

export function normalizeUrlForCache(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch {
    const noHash = url.split('#')[0] || url;
    if (noHash.length > 8 && noHash.endsWith('/')) {
      return noHash.replace(/\/+$/, '');
    }
    return noHash;
  }
}

const FAVICON_MAX_BYTES = 64 * 1024;
const TITLE_MAX_LEN = 200;
const PERSIST_DEBOUNCE_MS = 500;

const memoryCache = new Map<string, SiteMetaCacheEntry>();
const urlListeners = new Map<string, Set<() => void>>();
const globalListeners = new Set<(url: string) => void>();
const readyListeners = new Set<() => void>();

let ready = false;
let initPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUpserts = new Map<string, SiteMetaCacheEntry>();
let pendingRemoves = new Set<string>();

let backend: SiteMetaBackend = isTauriShell() ? tauriSiteMetaBackend : previewSiteMetaBackend;

export function setSiteMetaBackendForTest(b: SiteMetaBackend): void {
  backend = b;
}

function clamp(entry: SiteMetaCacheEntry): SiteMetaCacheEntry {
  return {
    ...entry,
    title: entry.title.slice(0, TITLE_MAX_LEN),
    faviconDataUri:
      entry.faviconDataUri.length <= FAVICON_MAX_BYTES ? entry.faviconDataUri : '',
  };
}

function notify(url: string): void {
  urlListeners.get(url)?.forEach((fn) => {
    try { fn(); } catch { /* listener error */ }
  });
  globalListeners.forEach((fn) => {
    try { fn(url); } catch { /* listener error */ }
  });
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushPersist();
  }, PERSIST_DEBOUNCE_MS);
}

async function flushPersist(): Promise<void> {
  if (pendingUpserts.size === 0 && pendingRemoves.size === 0) return;
  const upserts = new Map(pendingUpserts);
  const removes = [...pendingRemoves];
  pendingUpserts.clear();
  pendingRemoves.clear();
  try {
    if (upserts.size > 0) await backend.upsert(Object.fromEntries(upserts));
    if (removes.length > 0) await backend.remove(removes);
  } catch (err) {
    console.warn('siteMetaCache: persist failed', err);
  }
}

export async function initSiteMetaCache(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const persisted = await backend.getAll();
      for (const [url, entry] of Object.entries(persisted ?? {})) {
        if (!memoryCache.has(url)) memoryCache.set(url, entry);
      }
    } catch (err) {
      console.warn('siteMetaCache: preload failed', err);
    } finally {
      ready = true;
      readyListeners.forEach((fn) => {
        try { fn(); } catch { /* listener error */ }
      });
      readyListeners.clear();
    }
  })();
  return initPromise;
}

export function isSiteMetaCacheReady(): boolean {
  return ready;
}

export function whenSiteMetaCacheReady(): Promise<void> {
  return initPromise ?? initSiteMetaCache();
}

export function subscribeSiteMetaReady(callback: () => void): () => void {
  if (ready) {
    queueMicrotask(callback);
    return () => {};
  }
  readyListeners.add(callback);
  return () => readyListeners.delete(callback);
}

export function getCachedSiteMeta(url: string): SiteMetaCacheEntry | undefined {
  return memoryCache.get(normalizeUrlForCache(url));
}

export function getCachedFavicon(url: string): string {
  return memoryCache.get(normalizeUrlForCache(url))?.faviconDataUri ?? '';
}

export function getCachedTitle(url: string): string {
  return memoryCache.get(normalizeUrlForCache(url))?.title ?? '';
}

export function setCachedSiteMeta(url: string, entry: SiteMetaCacheEntry): void {
  const key = normalizeUrlForCache(url);
  const clean = clamp(entry);
  memoryCache.set(key, clean);
  pendingUpserts.set(key, clean);
  pendingRemoves.delete(key);
  notify(key);
  schedulePersist();
}

export function removeCachedSiteMeta(url: string): void {
  const key = normalizeUrlForCache(url);
  memoryCache.delete(key);
  pendingRemoves.add(key);
  pendingUpserts.delete(key);
  notify(key);
  schedulePersist();
}

export function subscribeSiteMeta(url: string, callback: () => void): () => void {
  const key = normalizeUrlForCache(url);
  if (!urlListeners.has(key)) urlListeners.set(key, new Set());
  urlListeners.get(key)!.add(callback);
  return () => {
    const set = urlListeners.get(key);
    set?.delete(callback);
    if (set?.size === 0) urlListeners.delete(key);
  };
}

export function subscribeSiteMetaGlobal(callback: (url: string) => void): () => void {
  globalListeners.add(callback);
  return () => globalListeners.delete(callback);
}

export function getSiteMetaCacheStats(): { size: number; persisted: boolean } {
  return { size: memoryCache.size, persisted: ready };
}
```

> `previewSiteMetaBackend` 若未在预览模式真正使用（isTauriShell false 时后端仍为 preview），preview 端点会因 vite dev 不可达而静默失败（`requestPreviewApi` 捕获），内存层仍可用——符合"后端失败降级为仅内存"的边界。

- [ ] **Step 8: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- siteMetaCache`
Expected: PASS（6 个测试）

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/utils/siteMetaCache.ts frontend/src/app/utils/siteMetaCache.test.ts frontend/src/app/utils/siteMetaBackends/
git commit -m "feat(browser): siteMetaCache memory layer + SiteMetaBackend (tauri/preview/mock)"
```

---

## Task 6: `fetchPageMeta.ts` 重构为纯抓取 + `PageMeta` 类型扩展

**Files:**
- Modify: `frontend/src/shared/ipc/browser.ts`（`PageMeta` 加 `faviconDataUri`）
- Modify: `frontend/src/app/utils/fetchPageMeta.ts`（移除缓存状态，纯抓取）
- Modify: `frontend/src/app/utils/__tests__/fetchPageMeta.test.ts`（适配）

**Interfaces:**
- Consumes: Task 5 的 `normalizeUrlForCache`（不再在本文件导出缓存 API）
- Produces: `fetchPageMeta(url): Promise<{ title; favicon; faviconDataUri; url } | null>`、`prefetchPageMeta(url, { force? })` 同上

- [ ] **Step 1: 扩展 `shared/ipc/browser.ts` 的 `PageMeta`**

```ts
export interface PageMeta {
  title: string;
  favicon: string;
  faviconDataUri?: string;
  url: string;
}
```

> `faviconDataUri?` 可选：Tauri `browser_fetch_page_meta` 返回它；live meta 事件（COM/iframe）无此字段，前端按 `?? ''` 处理。

- [ ] **Step 2: 重写 `fetchPageMeta.ts`（移除全部缓存状态）**

整文件替换为（保留 `fetchPageMeta`/`prefetchPageMeta` 抓取逻辑，删掉 `metaCache/faviconUrlCache/faviconPinned/faviconListeners/localStorage 持久化/订阅/clear*`）：

```ts
import { isTauriShell } from '../../tauri-bridge';
import { invoke } from '@tauri-apps/api/core';
import type { PageMeta } from '../../shared/ipc/browser';

const PREFETCH_TIMEOUT = 5000;

async function fetchPageMetaHttp(url: string): Promise<PageMeta | null> {
  try {
    const res = await fetch(`/__adl_preview_api__/browser/page-meta?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as PageMeta & { faviconDataUri?: string };
    return { title: data.title ?? '', favicon: data.favicon ?? '', faviconDataUri: data.faviconDataUri ?? '', url: data.url ?? url };
  } catch {
    return null;
  }
}

export async function fetchPageMeta(url: string): Promise<PageMeta | null> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return null;
  }
  if (isTauriShell()) {
    try {
      const result = (await invoke('browser_fetch_page_meta', { url })) as {
        ok: boolean;
        data?: PageMeta;
      };
      if (result?.ok && result.data) return result.data;
    } catch {
      return null;
    }
    return null;
  }
  return fetchPageMetaHttp(url);
}

export async function prefetchPageMeta(
  url: string,
  options?: { force?: boolean },
): Promise<PageMeta | null> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return null;
  }
  if (isTauriShell()) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), PREFETCH_TIMEOUT),
      );
      const result = (await Promise.race([
        invoke('browser_fetch_page_meta', { url, force: options?.force ?? false }),
        timeoutPromise,
      ])) as { ok: boolean; data?: PageMeta };
      if (result?.ok && result.data) return result.data;
    } catch {
      return null;
    }
    return null;
  }
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), PREFETCH_TIMEOUT),
    );
    const meta = (await Promise.race([fetchPageMetaHttp(url), timeoutPromise])) as PageMeta | null;
    return meta;
  } catch {
    return null;
  }
}
```

> **注意**：`fetchPageMetaHttp` 的 `/__adl_preview_api__/browser/page-meta` 响应可能为 `{ ok: false }`（vite 中间件错误分支）——`data` 为 undefined 时返回 null。预览端点已含 `faviconDataUri`（Task 4 Step 6）。

- [ ] **Step 3: 更新 `__tests__/fetchPageMeta.test.ts`（移除 localStorage 缓存断言）**

原"favicon cache persistence"两个测试删除（缓存逻辑已移至 siteMetaCache）；"prefetchPageMeta purity"保留并简化。新测试：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('fetchPageMeta pure fetch', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('__TAURI_INTERNALS__', undefined);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  });

  it('returns null for non-http urls', async () => {
    const mod = await import('../fetchPageMeta');
    expect(await mod.fetchPageMeta('about:blank')).toBeNull();
    expect(await mod.prefetchPageMeta('file:///x')).toBeNull();
  });
});
```

- [ ] **Step 4: 运行前端测试确认通过**

Run: `pnpm --dir frontend run test -- fetchPageMeta`
Expected: PASS

- [ ] **Step 5: 类型检查 + 定位旧 API 调用点**

Run: `pnpm --dir frontend exec tsc --noEmit`
Expected: 报告 `getCachedFavicon/setCachedFavicon/clearFaviconCacheForUrl/clearPageMetaCacheForUrl/subscribeFavicon` 等未导出错误——这是 Task 7/8 的改造范围，逐一记录后进入 Task 7。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/ipc/browser.ts frontend/src/app/utils/fetchPageMeta.ts frontend/src/app/utils/__tests__/fetchPageMeta.test.ts
git commit -m "refactor(browser): fetchPageMeta to pure fetch, PageMeta gains faviconDataUri"
```

---

## Task 7: `favicon.ts` + `BrowserFavicon.tsx` 预载门控

**Files:**
- Modify: `frontend/src/app/utils/favicon.ts`
- Modify: `frontend/src/app/components/BrowserFavicon.tsx`
- Test: `frontend/src/app/components/BrowserFavicon.test.tsx`（新增，与组件同级）

**Interfaces:**
- Consumes: Task 5 的 `getCachedSiteMeta/getCachedFavicon/isSiteMetaCacheReady/subscribeSiteMeta/subscribeSiteMetaReady/initSiteMetaCache`
- Produces: `getFaviconUrl(url): string`（data-URI → 缓存 faviconUrl → Google S2 回退 → ''）

- [ ] **Step 1: 写失败测试（`BrowserFavicon.test.tsx`）**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { BrowserFavicon } from '../BrowserFavicon';

describe('BrowserFavicon gating', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('renders empty placeholder before cache ready (no fallback icon)', async () => {
    const mod = await import('../BrowserFavicon');
    const cache = await import('../../utils/siteMetaCache');
    cache.setSiteMetaBackendForTest(cache.createMockSiteMetaBackend());
    render(<mod.BrowserFavicon url="https://a.com" />);
    // before init: placeholder, no <img>
    expect(document.querySelector('.adl-browser-tree__favicon')).toBeNull();
    await act(async () => { await cache.initSiteMetaCache(); });
    // after init: still no cache -> Google fallback img appears
    expect(document.querySelector('.adl-browser-tree__favicon')).not.toBeNull();
  });
});
```

> 该测试需要 `@testing-library/react`（项目已用）。若 BrowserFavicon 依赖的 `IconLink` 无 DOM 依赖，可正常渲染。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- BrowserFavicon`
Expected: FAIL — 当前组件总是渲染 img（无门控）

- [ ] **Step 3: 更新 `favicon.ts`**

```ts
import { getCachedFavicon, getCachedSiteMeta } from './siteMetaCache';

const GOOGLE_FAVICON_API = 'https://www.google.com/s2/favicons';
const GOOGLE_FAVICON = `${GOOGLE_FAVICON_API}?domain={domain}&sz=64`;

export function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    const dataUri = getCachedFavicon(url);
    if (dataUri) return dataUri;

    const entry = getCachedSiteMeta(url);
    if (entry?.faviconUrl) return entry.faviconUrl;

    if (hostname === 'localhost' || /^127\./.test(hostname) || /^192\.168\./.test(hostname)) {
      return '';
    }
    return GOOGLE_FAVICON.replace('{domain}', hostname);
  } catch {
    return '';
  }
}

export function getGoogleFaviconUrl(url: string | undefined): string {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    if (hostname === 'localhost' || /^127\./.test(hostname) || /^192\.168\./.test(hostname)) {
      return '';
    }
    return GOOGLE_FAVICON.replace('{domain}', hostname);
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: 更新 `BrowserFavicon.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { getFaviconUrl, getGoogleFaviconUrl } from '../utils/favicon';
import {
  subscribeSiteMeta,
  subscribeSiteMetaReady,
  isSiteMetaCacheReady,
  initSiteMetaCache,
  removeCachedSiteMeta,
} from '../utils/siteMetaCache';
import { IconLink, type IconSize } from '../icons';

interface BrowserFaviconProps {
  url: string;
  size?: IconSize;
}

export function BrowserFavicon({ url, size = 14 }: BrowserFaviconProps) {
  const [ready, setReady] = useState<boolean>(isSiteMetaCacheReady());
  const [faviconUrl, setFaviconUrl] = useState<string>('');

  useEffect(() => {
    void initSiteMetaCache();
    if (isSiteMetaCacheReady()) {
      setReady(true);
    }
    const unsubReady = subscribeSiteMetaReady(() => setReady(true));
    return unsubReady;
  }, []);

  useEffect(() => {
    setFaviconUrl(url ? getFaviconUrl(url) : '');
    if (!url) return;
    const unsubscribe = subscribeSiteMeta(url, () => {
      setFaviconUrl(getFaviconUrl(url));
    });
    return unsubscribe;
  }, [url, ready]);

  if (!ready) {
    return (
      <span
        className="adl-filetree__file-icon"
        style={{ width: size, height: size, display: 'inline-flex' }}
      />
    );
  }

  return (
    <span
      className={`adl-filetree__file-icon ${faviconUrl ? 'adl-filetree__file-icon--favicon' : 'adl-filetree__file-icon--default'}`}
    >
      {faviconUrl && (
        <img
          src={faviconUrl}
          alt=""
          className="adl-browser-tree__favicon"
          style={{ width: size, height: size, transition: 'opacity 0.15s ease-in-out' }}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            if (!img.src.includes('google.com/s2/favicons')) {
              removeCachedSiteMeta(url);
              const fallback = getGoogleFaviconUrl(url);
              if (fallback) {
                img.src = fallback;
                return;
              }
            }
            img.style.display = 'none';
            const parent = img.parentElement;
            if (parent) {
              parent.classList.remove('adl-filetree__file-icon--favicon');
              parent.classList.add('adl-filetree__file-icon--default');
              const link = parent.querySelector('.adl-browser-tree__link-fallback');
              if (link) (link as HTMLElement).style.display = 'inline-flex';
            }
          }}
          onLoad={(e) => {
            const parent = (e.target as HTMLImageElement).parentElement;
            if (parent) {
              const link = parent.querySelector('.adl-browser-tree__link-fallback');
              if (link) (link as HTMLElement).style.display = 'none';
            }
          }}
        />
      )}
      <IconLink
        size={size}
        decorative
        className="adl-browser-tree__link-fallback"
        style={faviconUrl ? { display: 'none' } : undefined}
      />
    </span>
  );
}
```

> 图片 onError 用 `removeCachedSiteMeta` 替换旧 `clearFaviconCacheForUrl`（data-URI 损坏/失效时清缓存走回退；注意：失败保留旧缓存的规则针对"抓取失败"，此处为"渲染时图片加载失败"，清掉损坏条目是必要的）。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- BrowserFavicon`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/utils/favicon.ts frontend/src/app/components/BrowserFavicon.tsx frontend/src/app/components/__tests__/BrowserFavicon.test.tsx
git commit -m "feat(browser): favicon render via siteMetaCache data-URI with preload gating"
```

---

## Task 8: 写路径接线（useBrowserPageMeta + 抓取触发点）

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserPageMeta.ts`
- Modify: `frontend/src/app/features/browser/useBrowserUrlChange.ts`
- Modify: `frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts`
- Modify: `frontend/src/app/features/browser/useBrowserDialogs.ts`
- Modify: `frontend/src/app/features/browser/useBrowserPanelHandlers.ts`

**Interfaces:**
- Consumes: Task 5 的 `setCachedSiteMeta/getCachedFavicon/getCachedSiteMeta`
- Produces: 成功抓取后写入缓存的行为（含质量门控 `shouldReplaceFavicon` 保留）

- [ ] **Step 1: 更新 `useBrowserPageMeta.ts` 写缓存**

将 import `setCachedFavicon, getCachedFavicon`（自 fetchPageMeta）改为：

```ts
import { setCachedSiteMeta, getCachedFavicon, getCachedSiteMeta } from '@utils/siteMetaCache';
```

在 `handlePageMeta` 的 favicon 分支（第 211-229 行区域）改为：写入完整条目，`faviconDataUri` 取 meta 中的值（http 抓取路径提供），保留质量门控：

```ts
      if (meta.favicon) {
        const existingFavicon = getCachedFavicon(cleanUrl);
        if (shouldReplaceFavicon(existingFavicon, meta.favicon)) {
          const existing = getCachedSiteMeta(cleanUrl);
          const dataUri = (meta as { faviconDataUri?: string }).faviconDataUri ?? '';
          if (source === 'com') {
            const img = new Image();
            img.onload = () => {
              setCachedSiteMeta(cleanUrl, {
                title: meta.title || existing?.title || '',
                faviconUrl: meta.favicon,
                faviconDataUri: dataUri || existing?.faviconDataUri || '',
                fetchedAt: Date.now(),
              });
            };
            img.onerror = () => {
              setCachedSiteMeta(cleanUrl, {
                title: meta.title || existing?.title || '',
                faviconUrl: meta.favicon,
                faviconDataUri: dataUri || existing?.faviconDataUri || '',
                fetchedAt: Date.now(),
              });
            };
            img.src = meta.favicon;
          } else {
            setCachedSiteMeta(cleanUrl, {
              title: meta.title || existing?.title || '',
              faviconUrl: meta.favicon,
              faviconDataUri: dataUri || existing?.faviconDataUri || '',
              fetchedAt: Date.now(),
            });
          }
        }
      }
```

> **注意**：仅当 `meta.title` 或 `meta.faviconDataUri` 非空时该分支才会走到（上游 `if (!meta.title && !meta.favicon) return;` 已把关）。抓取失败返回 null → 不触发 handlePageMeta → 缓存不动，符合"失败保留旧缓存"。

- [ ] **Step 2: 更新 `useBrowserUrlChange.ts` 传递 `faviconDataUri`**

三处构造 `PageMeta`（第 86-90、108-115、151-158 行）与 prefetch 回调用 `onPageMeta` 处（第 303-306 行），补 `faviconDataUri: meta.faviconDataUri || ''`（prefetch 路径）或 `faviconDataUri: (meta as { faviconDataUri?: string }).faviconDataUri || ''`（fetchPageMeta 路径）。

- [ ] **Step 3: 更新 `useBrowserPanelAddressSubmit.ts` 传递 `faviconDataUri`**

第 110-117 行 `handlePageMeta` 调用对象补 `faviconDataUri: meta.faviconDataUri || ''`。

- [ ] **Step 4: 更新 `useBrowserDialogs.ts`**

import 改为 `import { setCachedSiteMeta, getCachedFavicon, prefetchPageMeta } from '@utils/siteMetaCache';`

`handleCreateTabConfirm`（第 79-97 行）中：

```ts
        const meta = await prefetchPageMeta(url);
        if (meta?.title?.trim() || meta?.faviconDataUri) {
          title = meta.title?.trim() || title;
          const existingFavicon = getCachedFavicon(url);
          if (meta.favicon && (!existingFavicon || meta.faviconDataUri)) {
            setCachedSiteMeta(url, {
              title: title,
              faviconUrl: meta.favicon,
              faviconDataUri: meta.faviconDataUri || '',
              fetchedAt: Date.now(),
            });
          }
        }
```

删除 `if (!getCachedFavicon(url)) { google 回退 }` 段（Google 回退不再写入缓存——由 `getFaviconUrl` 渲染时回退）。

- [ ] **Step 5: 更新 `useBrowserPanelHandlers.ts`**

`handleNavigationStart` 中删除 `setCachedFavicon(url, faviconUrl)` 调用，仅保留图片预加载：

```ts
    const faviconUrl = getGoogleFaviconUrl(url);
    if (faviconUrl) {
      new Image().src = faviconUrl;
    }
```

- [ ] **Step 6: 类型检查 + 测试**

Run: `pnpm --dir frontend exec tsc --noEmit`
Expected: 无类型错误（若仍有旧 API 引用，属 Task 9 删除路径，继续修正）

Run: `pnpm --dir frontend run test -- useBrowserPageMeta useBrowserUrlChange useBrowserPanelAddressSubmit useBrowserDialogs useBrowserPanelHandlers`
Expected: PASS（既有测试适配后通过）

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/browser/useBrowserPageMeta.ts frontend/src/app/features/browser/useBrowserUrlChange.ts frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts frontend/src/app/features/browser/useBrowserDialogs.ts frontend/src/app/features/browser/useBrowserPanelHandlers.ts
git commit -m "feat(browser): write siteMetaCache on successful fetch (url-change/address/dialogs)"
```

---

## Task 9: 删除路径引用计数清除

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserTagActions.ts`
- Modify: `frontend/src/app/features/browser/useBrowserMenuActions.ts`
- Modify: `frontend/src/app/features/browser/useBrowserFolderCrud.ts`
- Modify: `frontend/src/app/features/browser/useBrowserBookmarkActions.ts`
- Modify: `frontend/src/app/features/browser/useBrowserTabs.ts`
- Create: `frontend/src/app/features/browser/siteMetaCleanup.ts`
- Test: `frontend/src/app/features/browser/siteMetaCleanup.test.ts`（新增）

**Interfaces:**
- Consumes: Task 5 的 `removeCachedSiteMeta`
- Produces: `removeSiteMetaIfUnreferenced(url: string): void`（URL 仍被引用则保留，引用归零才删）

- [ ] **Step 1: 写失败测试（`siteMetaCleanup.test.ts`）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('removeSiteMetaIfUnreferenced', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('keeps cache when url still referenced by a tab', async () => {
    const cleanup = await import('./siteMetaCleanup');
    const cache = await import('../../utils/siteMetaCache');
    cache.setSiteMetaBackendForTest(cache.createMockSiteMetaBackend());
    await cache.initSiteMetaCache();
    cache.setCachedSiteMeta('https://a.com', { title: 'A', faviconUrl: '', faviconDataUri: '', fetchedAt: 1 });

    const store = await import('../../stores/slicedStore');
    // stub browserTabs via zustand state
    const state = store.useAppStore.getState();
    state.browserTabs = [
      { id: 't1', workspaceId: 'w', title: 'A', url: 'https://a.com', isPinned: false, sortOrder: 0, isPlayingAudio: false, isAudioMuted: false },
    ] as typeof state.browserTabs;

    cleanup.removeSiteMetaIfUnreferenced('https://a.com');
    expect(cache.getCachedSiteMeta('https://a.com')).toBeDefined();

    state.browserTabs = [] as typeof state.browserTabs;
    cleanup.removeSiteMetaIfUnreferenced('https://a.com');
    expect(cache.getCachedSiteMeta('https://a.com')).toBeUndefined();
  });
});
```

> 若直接改 zustand state 不可行（zustand 不允许外部赋值），改用 `useAppStore.setState(...)`。测试实现时按 store 实际 API 调整（`setState` 是公开的）。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- siteMetaCleanup`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 `siteMetaCleanup.ts`**

```ts
import { useAppStore } from '@stores/slicedStore';
import { removeCachedSiteMeta, normalizeUrlForCache } from '@utils/siteMetaCache';

function isUrlReferenced(url: string): boolean {
  const s = useAppStore.getState();
  const key = normalizeUrlForCache(url);
  const urlMatches = (u: string | undefined) => !!u && normalizeUrlForCache(u) === key;

  return (
    s.browserTabs.some((t) => urlMatches(t.url)) ||
    s.browserBookmarks.some((b) => urlMatches(b.url)) ||
    Object.values(s.browserWorkspaceBookmarks).some((entries) =>
      entries.some((e) => urlMatches(e.url)),
    ) ||
    s.browserTabFolders.some((f) => (f.tabs ?? []).some((item) => urlMatches(item.url))) ||
    s.browserHistory.some((h) => urlMatches(h.url))
  );
}

export function removeSiteMetaIfUnreferenced(url: string): void {
  if (!url) return;
  if (!isUrlReferenced(url)) {
    removeCachedSiteMeta(url);
  }
}
```

- [ ] **Step 4: 更新 5 个删除路径，把 `clearFaviconCacheForUrl(url); clearPageMetaCacheForUrl(url);` 替换为 `removeSiteMetaIfUnreferenced(url);`**

- `useBrowserTagActions.ts`：import 换为 `removeSiteMetaIfUnreferenced`；`handleDeleteTab` 中两处（history 分支、tab 分支）替换；**`handleRefreshTab` 中删除 `clearFaviconCacheForUrl/clearPageMetaCacheForUrl`**（刷新前不清缓存，改为 fetch 成功写——已由 Task 8 覆盖），成功后写：
  ```ts
  if (meta?.favicon || meta?.title) {
    setCachedSiteMeta(url, {
      title: meta.title || hostnameFromUrl(url),
      faviconUrl: meta.favicon || '',
      faviconDataUri: meta.faviconDataUri || '',
      fetchedAt: Date.now(),
    });
  }
  ```
  （`handleRefreshTab` 的 `setCachedFavicon(url, meta.favicon, true)` 行删除，替换为上述 `setCachedSiteMeta`。）
- `useBrowserMenuActions.ts`：`handleDeleteHistoryLevel` 的 `deletedEntries.forEach` 内替换为 `removeSiteMetaIfUnreferenced(entry.url)`（在 `browserDeleteHistoryByLevel` **之后**调用，确保状态已更新）。当前顺序是 clear 后再删 store——需改为先 `browserDeleteHistoryByLevel(level, nodePath)` 再 `deletedEntries.forEach((e) => removeSiteMetaIfUnreferenced(e.url))`。
- `useBrowserFolderCrud.ts`：4 处 clear 循环替换为 `removeSiteMetaIfUnreferenced`，并**确保在对应 store 删除操作之后**调用（`browserDeleteAllTabsInNode/browserDeleteOwnTabsInNode/browserDeleteTabFolder/browserRemoveTabBookmarks` 执行后再清理）。
- `useBrowserBookmarkActions.ts`：`handleRemoveBookmarkTab` 在 `browserRemoveTabBookmarks` 后替换为 `removeSiteMetaIfUnreferenced(url)`。
- `useBrowserTabs.ts`：`handleCloseTab`/`handleCloseAllTabs` 的 clear 替换为 `removeSiteMetaIfUnreferenced`，且在 `browserCloseTab/browserCloseAllTabs` **之后**执行。

> **顺序纪律**：所有删除路径必须"先删 store 数据，再检查引用并清缓存"，否则引用计数读到的是删除前状态，导致缓存被误清。每个文件修改时逐条核对调用顺序。

- [ ] **Step 5: 类型检查 + 测试**

Run: `pnpm --dir frontend exec tsc --noEmit`
Expected: 无类型错误（旧 `clearFaviconCacheForUrl` 等已全部替换）

Run: `pnpm --dir frontend run test -- siteMetaCleanup useBrowserFolderCrud useBrowserMenuActions useBrowserBookmarkActions useBrowserTabs useBrowserTagActions`
Expected: PASS（既有测试适配后通过；若某 hook 有测试依赖旧行为，按其断言更新）

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/browser/siteMetaCleanup.ts frontend/src/app/features/browser/siteMetaCleanup.test.ts frontend/src/app/features/browser/useBrowserTagActions.ts frontend/src/app/features/browser/useBrowserMenuActions.ts frontend/src/app/features/browser/useBrowserFolderCrud.ts frontend/src/app/features/browser/useBrowserBookmarkActions.ts frontend/src/app/features/browser/useBrowserTabs.ts
git commit -m "feat(browser): reference-counted site-meta cache cleanup on delete"
```

---

## Task 10: 启动预载 + 全量验证

**Files:**
- Modify: `frontend/src/app/hooks/useAppStartup.ts`
- Modify: `frontend/src/app/stores/slices/browserBookmarkSlice.ts`（若有残留 `browserRemoveOrphanedBookmarks` 关联旧缓存，仅验证不需要改）
- Test: `frontend/src/app/utils/siteMetaCache.test.ts`（补充启动合并用例）

**Interfaces:**
- Consumes: Task 5 的 `initSiteMetaCache`
- Produces: 应用启动即预载缓存

- [ ] **Step 1: 在 `useAppStartup.ts` 的 bootstrap effect 中启动预载**

```ts
import { initSiteMetaCache } from '@utils/siteMetaCache';
// 在 bootstrap effect 中：
  useEffect(() => {
    void actions.bootstrap();
    void initSiteMetaCache();
  }, [actions, actions.bootstrap]);
```

- [ ] **Step 2: 补充启动合并测试（`siteMetaCache.test.ts`）**

```ts
  it('preload merges persisted entries and keeps existing memory entries', async () => {
    const mod = await import('./siteMetaCache');
    const backend = mod.createMockSiteMetaBackend();
    await backend.upsert({
      'https://p.com/': { title: 'P', faviconUrl: '', faviconDataUri: 'data:x;base64,PP', fetchedAt: 2 },
    });
    mod.setSiteMetaBackendForTest(backend);
    mod.setCachedSiteMeta('https://m.com', { title: 'M', faviconUrl: '', faviconDataUri: '', fetchedAt: 1 });
    await mod.initSiteMetaCache();
    expect(mod.getCachedSiteMeta('https://p.com')?.title).toBe('P');
    expect(mod.getCachedSiteMeta('https://m.com')?.title).toBe('M');
  });
```

- [ ] **Step 3: 运行全量前端测试 + lint + typecheck**

Run: `pnpm --dir frontend run test`
Run: `pnpm --dir frontend run lint`
Run: `pnpm --dir frontend exec tsc --noEmit`
Expected: 全部通过；lint 0 errors（若遇 pre-existing prettier/curly 警告忽略）

- [ ] **Step 4: 运行全量 Rust 测试 + clippy**

Run: `cargo test --workspace`
Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 全部通过，clippy 0 警告

- [ ] **Step 5: 双端一致性自查清单**

- [ ] 已缓存条目重开应用 → `BrowserFavicon` 预载门控放行后直接渲染 data-URI，零网络（无 `prefetchPageMeta`/`getGoogleFaviconUrl` 调用）
- [ ] 打开/导航成功 → `setCachedSiteMeta` 写入；失败 → 缓存不动
- [ ] 删除最后一个引用 → `removeSiteMetaIfUnreferenced` 清缓存；仍被引用 → 保留
- [ ] 浏览器预览模式走 `previewSiteMetaBackend`，Tauri 走 `tauriSiteMetaBackend`
- [ ] `rg "clearFaviconCacheForUrl|clearPageMetaCacheForUrl|setCachedFavicon|subscribeFavicon" frontend/src` → 0 匹配（旧 API 清除干净）
- [ ] `rg "adl-ui:browser-favicon-cache" frontend/src` → 0 匹配（无迁移/兼容读取）

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/hooks/useAppStartup.ts frontend/src/app/utils/siteMetaCache.test.ts
git commit -m "feat(browser): init site-meta cache on app startup + full verification"
```

---
---

## Self-Review

### 1. Spec coverage

| Spec 需求 | 任务 |
|-----------|------|
| Tauri 后端 SQLite（`crates/browser`，WAL，行级写，无条数上限） | Task 1 |
| `PageMeta.favicon_data_uri` + 后端下载字节 | Task 2、Task 4 |
| 4 个 Tauri 命令 + capabilities + BrowserManager 接线 | Task 3 |
| preview 服务 JSON 文件 + 端点 + page-meta 字节 | Task 4 |
| 前端 `SiteMetaBackend` 三端 + 内存层 + 订阅 + 防抖 + 预载门控 + 尺寸上限 | Task 5 |
| `fetchPageMeta.ts` 纯抓取重构 + `PageMeta` 类型 | Task 6 |
| `favicon.ts` data-URI 优先 + `BrowserFavicon` 预载门控 | Task 7 |
| 成功才写缓存（打开/导航/对话框） | Task 8 |
| 引用计数删除清除 + 失败保留旧缓存 | Task 9 |
| 启动预载 + 双端一致 + 旧 API 清除 | Task 10 |
| 性能：限尺寸不限条数、防抖行级写、渲染零解析、订阅扇出 | Task 5/7 |

### 2. Placeholder scan

- 所有步骤含具体代码或明确命令，无 TBD/TODO。
- Task 9 测试中 zustand store stub 注明用 `setState`（按实际 API 调整），实现者以编译为准。

### 3. Type consistency

- `SiteMetaCacheEntry`：Rust（camelCase serde）与前端 TS 字段一致：`title/faviconUrl/faviconDataUri/fetchedAt` ✓
- `SiteMetaBackend` 四方法 `getAll/upsert/remove/clear` 在 tauri/preview/mock 三端一致 ✓
- `PageMeta` 前端（`faviconDataUri?`）与 Rust（`favicon_data_uri`，serde camelCase）IPC 契约一致 ✓
- `normalizeUrlForCache` 自 fetchPageMeta 移至 siteMetaCache，供 Task 9 复用；Task 6 不再导出缓存 API ✓
- `removeSiteMetaIfUnreferenced(url)` 在 Task 9 定义并被 5 个 hook 消费 ✓

### 4. 已知风险与约定

- Task 6 后 `tsc --noEmit` 会报旧 API 缺失——预期行为，Task 7/8/9 逐步消化；不要在任何任务中途"为了编译通过"临时保留旧导出（禁止兼容层）。
- Task 4 preview 端点 baseDir 默认 `process.cwd()`；若实测预览模式缓存目录不符预期，按 `index.ts` 中 `app-directory` 端点同款 `path.resolve(process.cwd(), '../../')` 调整。
- Task 9 顺序纪律（先删 store 再查引用）已在每文件说明，实现时逐条核对。
