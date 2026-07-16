# Phase D 性能与渲染修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拆分 `commands/browser.rs` God Module（709 行）为三个职责单一的文件，并修复 FileTree 虚拟化列表的 memoization 破坏问题，消除虚拟行在每次父渲染时的全量重渲染。

**Architecture:** H7 采用"行为不变的纯重构"策略——将 WebView2 平台设置辅助函数移到 `commands/browser_webview_setup.rs`，将 HTML 解析纯函数下沉到 `crates/browser/src/html_meta.rs`（与 `PageMeta` 同 crate），`commands/browser.rs` 仅保留 14 个 `#[tauri::command]` 函数与 HTTP fetch 逻辑。H10 通过"原始类型 prop 替代对象 prop + `useMemo`/`useCallback` 稳定引用"策略，使 `MemoizedVirtualNode` 与 `TreeNodeRow` 两层 `React.memo` 真正生效。

**Tech Stack:** Rust + Tauri 2.x（后端）；React 19 + TypeScript + Zustand（前端）；Vitest（前端测试）；`cargo test`（Rust 测试）

## Global Constraints

- **不得破坏现有功能与 UI/UX**：所有重构为行为不变的纯重构，IPC 命令签名、Tauri 事件、React 组件 props 契约保持不变
- **Rust 编译器版本**：1.85+（workspace 锁定）
- **Node.js 版本**：24.15+
- **包管理器**：pnpm 10.x（前端）/ Cargo（Rust）
- **Rust 代码风格**：遵循 `rustfmt` 默认配置；禁止 `unwrap()`，使用 `?` 或模式匹配；错误类型使用 `thiserror` + `AppError`
- **TypeScript 代码风格**：禁止 `any`；类型推断优先；禁止 `else`（用提前返回）；`const` 优先；禁止 import 别名；禁止 star import；`useCallback`/`useMemo` 依赖数组必须完整
- **i18n**：本次不涉及 UI 文本变更，无需 i18n 改动
- **提交规范**：`type(scope): summary`，scope 限定为 `core`/`frontend`/`rust`
- **双端一致性**：本次改动不涉及 IPC 契约变更，三桥接层（tauri/preview/mock）无需同步
- **测试要求**：每个 Task 完成后必须运行对应层级的测试，全绿后方可提交
- **环境变量**：执行 Rust 命令前必须设置 `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`；执行 npm/pnpm 命令前必须设置 `$env:Path = "D:\Program Files\nodejs;$env:Path"`
- **代理**：系统配置了 Clash 代理 (`127.0.0.1:7890`)，Rust 编译前确保代理已开启

---

## 文件结构总览

### H7 — browser.rs 拆分（3 个文件）

| 文件 | 职责 | 行数预估 |
|------|------|----------|
| `ai-digital-life/crates/browser/src/html_meta.rs`（新建） | HTML 解析纯函数：`extract_title`、`extract_favicon`、`html_entity_decode` 等 11 个函数 + 单元测试 | ~280 行 |
| `ai-digital-life/src-tauri/src/commands/browser_webview_setup.rs`（新建） | WebView2 平台设置：`new_window_handler`、`build_webview_builder`、`apply_theme_and_navigate_for_platform` 等 6 个函数 | ~180 行 |
| `ai-digital-life/src-tauri/src/commands/browser.rs`（修改） | 仅保留 14 个 `#[tauri::command]` 函数 + `fetch_page_meta_inner` HTTP 逻辑 | ~230 行 |

辅助修改文件：
- `ai-digital-life/crates/browser/src/lib.rs`（注册 `html_meta` 模块并 re-export 公共函数）
- `ai-digital-life/src-tauri/src/commands/mod.rs`（注册 `browser_webview_setup` 模块）

### H10 — FileTree memoization 修复（1 个文件）

| 文件 | 职责 |
|------|------|
| `ai-digital-life/frontend/src/app/features/file-tree/fileTree.tsx`（修改） | `VirtualNodeProps` 接口用 `top: number` 替代 `style: React.CSSProperties`；`VirtualNodeComponent` 内用 `useMemo` 缓存 style、`useCallback`/`useMemo` 稳定三个回调引用 |

---

## Task 1: 创建 `html_meta.rs` 模块（HTML 解析纯函数下沉）

**Files:**
- Create: `ai-digital-life/crates/browser/src/html_meta.rs`
- Modify: `ai-digital-life/crates/browser/src/lib.rs:1-31`

**Interfaces:**
- Consumes: `url::Url`（workspace 依赖，已在 `crates/browser/Cargo.toml` 声明）
- Produces: 公共函数 `extract_title(html: &str) -> Option<String>`、`extract_favicon(html: &str, base_url: &str) -> Option<String>`、`google_favicon_url(url: &str) -> String`、`origin_favicon_fallback(url: &str) -> String`、`html_entity_decode(s: &str) -> String`；私有函数 `extract_meta_content`、`extract_attr_value`、`extract_href`、`resolve_href`、`extract_attr`、`favicon_score`
- **命名注意**：原 `commands/browser.rs:578` 的私有函数 `resolve_url` 与 `adl_browser::resolve_url`（来自 `browser_navigation.rs`）重名，下沉后改名为 `resolve_href` 以避免歧义

**设计决策：**
1. 仅移动纯函数（无 `reqwest` 依赖）。`fetch_page_meta_inner` 因为依赖 `reqwest` 留在 `commands/browser.rs`
2. `resolve_url` → `resolve_href`：避免与 `adl_browser::resolve_url` 重名，且语义更精确（解析的是 href，不是页面 URL）
3. `extract_attr_value` 与 `extract_attr` 功能相似但实现不同（前者处理原始 HTML，后者处理已小写的 snippet），保留两者不合并——合并会改变行为，超出本次纯重构范围
4. 所有 11 个函数的函数体**逐字复制**自原 `commands/browser.rs:498-709`，仅调整可见性（`pub`/私有）和 `resolve_url` 改名

- [ ] **Step 1: 创建 `html_meta.rs` 文件，写入 11 个函数 + 单元测试**

写入 `ai-digital-life/crates/browser/src/html_meta.rs`：

```rust
//! HTML meta extraction utilities — pure functions for parsing
//! `<title>`, `<link rel="icon">` favicons, and HTML entities from
//! raw HTML responses. These functions perform no I/O and have no
//! dependencies on `reqwest` or platform-specific APIs.

use url::Url;

/// Decode the most common HTML entities (`&amp;`, `&lt;`, `&gt;`,
/// `&quot;`, `&#39;`, `&#x27;`, `&#x2F;`, `&nbsp;`) into their
/// character equivalents.
pub fn html_entity_decode(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&#x2F;", "/")
        .replace("&nbsp;", " ")
}

/// Extract the value of an attribute from an HTML tag (original case).
/// Searches both `attr="..."` and `attr='...'` forms. Used by
/// `extract_meta_content` to read the `content` attribute of `<meta>`
/// tags from the original-case HTML snippet.
fn extract_attr_value(html: &str, attr: &str) -> Option<String> {
    for marker in &[format!("{}=\"", attr), format!("{}='", attr)] {
        if let Some(start) = html.to_lowercase().find(marker) {
            let value_start = start + marker.len();
            let quote = &html.to_lowercase()[value_start - 1..value_start];
            let end =
                html.to_lowercase()[value_start..].find(if quote == "\"" { "\"" } else { "'" })?;
            let raw = &html[value_start..value_start + end];
            if !raw.is_empty() {
                return Some(raw.to_string());
            }
        }
    }
    None
}

/// Extract a `<meta>` tag's `content` attribute by its `property`
/// value (e.g. `og:title`). Performs case-insensitive matching on a
/// lowercased copy of the HTML.
fn extract_meta_content<'a>(lower: &'a str, html: &'a str, property: &str) -> Option<String> {
    let prop_lower = property.to_lowercase();
    let markers = [
        format!("property=\"{}\"", &prop_lower),
        format!("property='{}'", &prop_lower),
        format!("property = \"{}\"", &prop_lower),
        format!("property = '{}'", &prop_lower),
    ];
    for marker in &markers {
        if let Some(start) = lower.find(marker) {
            let snippet = &lower[..start];
            let tag_start = snippet.rfind("<meta")?;
            let tag_end = lower[tag_start..].find('>')?;
            let tag = &html[tag_start..tag_start + tag_end];
            if let Some(content) = extract_attr_value(tag, "content") {
                return Some(content);
            }
        }
    }
    None
}

/// Extract the page title from HTML. Tries `<title>` first, then
/// falls back to `<meta property="og:title">`. Returns `None` if
/// neither is present or non-empty. HTML entities in the result are
/// decoded.
pub fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();

    // Try <title> first
    if let Some(t_start) = lower.find("<title") {
        if let Some(t_tag_end) = html[t_start..].find('>') {
            let content_start = t_start + t_tag_end + 1;
            if let Some(t_end) = lower[content_start..].find("</title>") {
                let raw = html[content_start..content_start + t_end].trim();
                if !raw.is_empty() {
                    return Some(html_entity_decode(raw));
                }
            }
        }
    }

    // Fall back to og:title
    if let Some(content) = extract_meta_content(&lower, html, "og:title") {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            return Some(html_entity_decode(trimmed));
        }
    }

    None
}

/// Extract the `href` value from a `<link>` snippet, handling both
/// double and single quotes. Returns `None` if the href is empty or
/// contains whitespace (invalid URL).
fn extract_href(snippet: &str, snippet_lower: &str) -> Option<String> {
    for marker in [r#"href=""#, "href='"] {
        if let Some(start) = snippet_lower.find(marker) {
            let value_start = start + marker.len();
            let quote = &snippet_lower[value_start - 1..value_start];
            let end = snippet_lower[value_start..].find(if quote == "\"" { "\"" } else { "'" })?;
            let raw = snippet[value_start..value_start + end].trim();
            if !raw.is_empty() && !raw.contains(' ') {
                return Some(raw.to_string());
            }
        }
    }
    None
}

/// Resolve a possibly-relative href against a base URL. Handles
/// absolute URLs (`http://`/`https://`), protocol-relative URLs
/// (`//...`), and relative paths via `url::Url::join`.
///
/// Renamed from `resolve_url` (in the original `commands/browser.rs`)
/// to avoid collision with `adl_browser::resolve_url` and to clarify
/// that this resolves `<link href>` values, not page navigation URLs.
fn resolve_href(href: &str, base_url: &str) -> Option<String> {
    if href.starts_with("http://") || href.starts_with("https://") {
        return Some(href.to_string());
    }
    if href.starts_with("//") {
        return Some(format!("https:{}", href));
    }
    let base = Url::parse(base_url).ok()?;
    base.join(href).ok().map(|u| u.to_string())
}

/// Extract the best-matching favicon URL from HTML `<link rel="*icon*">`
/// tags. Scores candidates by rel type, file extension, and `sizes`
/// attribute, returning the highest-scoring resolved href.
pub fn extract_favicon(html: &str, base_url: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let mut best_href = String::new();
    let mut best_score = 0i32;
    let mut search_start = 0usize;

    while let Some(link_pos) = lower[search_start..].find("<link") {
        let abs_link = search_start + link_pos;
        let tag_end = match html[abs_link..].find('>') {
            Some(e) => e,
            None => break,
        };
        let snippet = &html[abs_link..abs_link + tag_end];
        let snippet_lower = &lower[abs_link..abs_link + tag_end];

        let rel = extract_attr(snippet_lower, "rel").unwrap_or_default();
        let rel_lower = rel.to_lowercase();
        if rel_lower.contains("icon") {
            if let Some(href) = extract_href(snippet, snippet_lower) {
                if let Some(resolved) = resolve_href(&href, base_url) {
                    let sizes = extract_attr(snippet_lower, "sizes").unwrap_or_default();
                    let score = favicon_score(&resolved, &rel_lower, &sizes);
                    if score > best_score {
                        best_score = score;
                        best_href = resolved;
                    }
                }
            }
        }
        search_start = abs_link + tag_end;
    }

    if best_href.is_empty() {
        None
    } else {
        Some(best_href)
    }
}

/// Extract an attribute's value from a lowercased HTML tag snippet.
/// Searches both `attr="..."` and `attr='...'` forms.
fn extract_attr(snippet_lower: &str, attr: &str) -> Option<String> {
    for marker in [format!("{}=\"", attr), format!("{}='", attr)] {
        if let Some(start) = snippet_lower.find(&marker) {
            let value_start = start + marker.len();
            let quote = &snippet_lower[value_start - 1..value_start];
            if let Some(end) =
                snippet_lower[value_start..].find(if quote == "\"" { "\"" } else { "'" })
            {
                return Some(snippet_lower[value_start..value_start + end].to_string());
            }
        }
    }
    None
}

/// Score a favicon candidate by rel type, file extension, and size.
/// Higher scores indicate better-quality icons:
/// SVG (+200) > large PNG (+30 +100) > apple-touch-icon (+50) >
/// generic .ico (+5) > favicon.ico (+1) > other (+10).
fn favicon_score(href: &str, rel: &str, sizes: &str) -> i32 {
    let href_lower = href.to_lowercase();
    let mut score = 0i32;

    if rel.contains("apple-touch-icon") {
        score += 50;
    }

    if let Some(size_match) = sizes.split('x').next() {
        if let Ok(size) = size_match.trim().parse::<i32>() {
            score += size;
        }
    }

    if href_lower.ends_with(".svg") {
        score += 200;
    } else if href_lower.ends_with(".png") {
        score += 30;
        if href_lower.contains("512")
            || href_lower.contains("256")
            || href_lower.contains("192")
            || href_lower.contains("180")
        {
            score += 100;
        }
    } else if href_lower.ends_with("favicon.ico") {
        score += 1;
    } else if href_lower.ends_with(".ico") {
        score += 5;
    } else {
        score += 10;
    }

    score
}

/// Build a Google S2 favicon URL for the given page URL. Returns an
/// empty string for localhost / private addresses (no external
/// favicon lookup for local dev servers).
pub fn google_favicon_url(url: &str) -> String {
    if let Ok(parsed) = Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            if host == "localhost" || host.starts_with("127.") || host.starts_with("192.168.") {
                return String::new();
            }
            return format!("https://www.google.com/s2/favicons?domain={host}&sz=64");
        }
    }
    String::new()
}

/// Fallback to `{origin}/favicon.ico` when no favicon link was found
/// in the HTML. Falls back further to `google_favicon_url` if the
/// URL cannot be parsed.
pub fn origin_favicon_fallback(url: &str) -> String {
    if let Ok(parsed) = Url::parse(url) {
        let origin = parsed.origin().ascii_serialization();
        let ico_url = format!("{origin}/favicon.ico");
        return ico_url;
    }
    google_favicon_url(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_entity_decode_handles_common_entities() {
        assert_eq!(html_entity_decode("a&amp;b"), "a&b");
        assert_eq!(html_entity_decode("a&lt;b&gt;c"), "a<b>c");
        assert_eq!(html_entity_decode("&quot;hi&quot;"), "\"hi\"");
        assert_eq!(html_entity_decode("&#39;x&#x27;"), "'x'");
        assert_eq!(html_entity_decode("&#x2F;path"), "/path");
        assert_eq!(html_entity_decode("a&nbsp;b"), "a b");
    }

    #[test]
    fn html_entity_decode_preserves_plain_text() {
        assert_eq!(html_entity_decode("plain text"), "plain text");
        assert_eq!(html_entity_decode(""), "");
    }

    #[test]
    fn extract_title_from_title_tag() {
        let html = "<html><head><title>My Page</title></head></html>";
        assert_eq!(extract_title(html), Some("My Page".to_string()));
    }

    #[test]
    fn extract_title_falls_back_to_og_title() {
        let html =
            "<html><head><meta property=\"og:title\" content=\"OG Title\"></head></html>";
        assert_eq!(extract_title(html), Some("OG Title".to_string()));
    }

    #[test]
    fn extract_title_prefers_title_tag_over_og_title() {
        let html = "<head><title>Title Tag</title><meta property=\"og:title\" content=\"OG Title\"></head>";
        assert_eq!(extract_title(html), Some("Title Tag".to_string()));
    }

    #[test]
    fn extract_title_returns_none_when_missing() {
        let html = "<html><head></head></html>";
        assert_eq!(extract_title(html), None);
    }

    #[test]
    fn extract_title_returns_none_for_empty_title() {
        let html = "<title>   </title>";
        assert_eq!(extract_title(html), None);
    }

    #[test]
    fn extract_title_decodes_entities() {
        let html = "<title>A &amp; B</title>";
        assert_eq!(extract_title(html), Some("A & B".to_string()));
    }

    #[test]
    fn extract_favicon_from_link_tag() {
        let html = "<link rel=\"icon\" href=\"/favicon.ico\">";
        assert_eq!(
            extract_favicon(html, "https://example.com/page"),
            Some("https://example.com/favicon.ico".to_string())
        );
    }

    #[test]
    fn extract_favicon_prefers_svg_over_ico() {
        let html = "<link rel=\"icon\" href=\"/favicon.ico\">"
            .to_string()
            + "<link rel=\"icon\" href=\"/icon.svg\">";
        let result = extract_favicon(&html, "https://example.com");
        assert_eq!(result, Some("https://example.com/icon.svg".to_string()));
    }

    #[test]
    fn extract_favicon_returns_none_when_missing() {
        let html = "<html><head></head></html>";
        assert_eq!(extract_favicon(html, "https://example.com"), None);
    }

    #[test]
    fn extract_favicon_returns_none_when_no_icon_rel() {
        let html = "<link rel=\"stylesheet\" href=\"/style.css\">";
        assert_eq!(extract_favicon(html, "https://example.com"), None);
    }

    #[test]
    fn extract_favicon_handles_protocol_relative_href() {
        let html = "<link rel=\"icon\" href=\"//cdn.example.com/icon.png\">";
        assert_eq!(
            extract_favicon(html, "https://example.com"),
            Some("https://cdn.example.com/icon.png".to_string())
        );
    }

    #[test]
    fn google_favicon_url_returns_empty_for_localhost() {
        assert_eq!(google_favicon_url("http://localhost:3000"), "");
        assert_eq!(google_favicon_url("http://127.0.0.1:3000"), "");
        assert_eq!(google_favicon_url("http://192.168.1.1"), "");
    }

    #[test]
    fn google_favicon_url_returns_s2_for_public_host() {
        let result = google_favicon_url("https://example.com/page");
        assert_eq!(
            result,
            "https://www.google.com/s2/favicons?domain=example.com&sz=64"
        );
    }

    #[test]
    fn google_favicon_url_returns_empty_for_invalid_url() {
        assert_eq!(google_favicon_url("not-a-url"), "");
    }

    #[test]
    fn origin_favicon_fallback_returns_origin_ico() {
        let result = origin_favicon_fallback("https://example.com/page");
        assert_eq!(result, "https://example.com/favicon.ico");
    }

    #[test]
    fn origin_favicon_fallback_falls_back_to_google_for_invalid_url() {
        let result = origin_favicon_fallback("not-a-url");
        assert_eq!(result, "");
    }

    #[test]
    fn resolve_href_handles_absolute_url() {
        let result = resolve_href("https://foo.com/icon.png", "https://example.com");
        assert_eq!(result, Some("https://foo.com/icon.png".to_string()));
    }

    #[test]
    fn resolve_href_handles_protocol_relative() {
        let result = resolve_href("//cdn.example.com/icon.png", "https://example.com");
        assert_eq!(result, Some("https://cdn.example.com/icon.png".to_string()));
    }

    #[test]
    fn resolve_href_handles_relative_path() {
        let result = resolve_href("/favicon.ico", "https://example.com/page");
        assert_eq!(result, Some("https://example.com/favicon.ico".to_string()));
    }

    #[test]
    fn resolve_href_returns_none_for_invalid_base() {
        let result = resolve_href("/icon.png", "not-a-url");
        assert_eq!(result, None);
    }
}
```

- [ ] **Step 2: 在 `crates/browser/src/lib.rs` 注册 `html_meta` 模块并 re-export 公共函数**

修改 `ai-digital-life/crates/browser/src/lib.rs`。在现有 `mod` 声明块（L1-15）末尾添加 `html_meta` 模块声明，并在 `pub use` 块中导出公共函数。

将 L1-31 整体替换为：

```rust
mod browser_events;
mod browser_meta;
mod browser_navigation;
mod browser_pool;
mod browser_webview;
mod html_meta;
mod webview2_audio;
mod webview2_background;
mod webview2_cleanup;
mod webview2_favicon;
mod webview2_history;
mod webview2_message;
mod webview2_postmessage;
mod webview2_profile;
mod webview2_title;
pub mod webview_handle;

pub use browser_events::navigation_handler;
pub use browser_meta::PageMeta;
pub use browser_navigation::{init_script_with_background, resolve_url, INIT_SCRIPT};
pub use browser_pool::BrowserPool;
pub use browser_webview::{webview_label, BrowserManager, BROWSER_WEBVIEW_LABEL};
pub use html_meta::{
    extract_favicon, extract_title, google_favicon_url, html_entity_decode,
    origin_favicon_fallback,
};
pub use webview2_audio::{mute_tab, setup_audio_changed_handler};
pub use webview2_background::theme_to_rgb;
pub use webview2_cleanup::{clear_cache, clear_cookies};
pub use webview2_profile::set_profile_color_scheme as webview2_set_profile_color_scheme;
pub use webview_handle::{Bounds, EventBridgeRef, WebView2EventBridge, WebViewHandle};

pub use browser_webview::setup_webview2_handlers;

#[cfg(windows)]
pub use webview2_background::{navigate_core, set_default_background_color};
```

- [ ] **Step 3: 运行 `cargo check` 验证 `html_meta` 模块编译通过**

Run（在 `ai-digital-life/` 目录下，先设置 PATH）：
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check -p adl-browser
```
Expected: 编译成功，无错误。可能有未使用函数的 warning（`extract_attr_value`、`extract_meta_content` 等私有函数仅在内部使用），这是正常的。

- [ ] **Step 4: 运行 `html_meta` 模块的单元测试**

Run：
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test -p adl-browser html_meta
```
Expected: 22 个测试全部 PASS。

- [ ] **Step 5: 运行 clippy 检查**

Run：
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo clippy -p adl-browser -- -D warnings
```
Expected: 无 warning。如果有 `unused` warning，确认是 `pub` 函数尚未被外部使用（Task 3 会消费它们），可暂不处理；但私有函数的 warning 必须修复。

- [ ] **Step 6: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add crates/browser/src/html_meta.rs crates/browser/src/lib.rs
git commit -m "refactor(rust): extract HTML meta parsing pure functions to html_meta module

Move 11 pure HTML parsing functions (extract_title, extract_favicon,
html_entity_decode, google_favicon_url, origin_favicon_fallback, etc.)
from commands/browser.rs to crates/browser/src/html_meta.rs.

- Rename private resolve_url -> resolve_href to avoid collision with
  adl_browser::resolve_url
- Add 22 unit tests covering title/favicon extraction, entity decode,
  URL resolution, and edge cases (empty/invalid input)
- Update lib.rs to register module and re-export public functions

Part of Phase D H7: browser.rs God Module split."
```

---

## Task 2: 创建 `browser_webview_setup.rs` 模块（WebView2 平台设置）

**Files:**
- Create: `ai-digital-life/src-tauri/src/commands/browser_webview_setup.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/mod.rs:7`（添加 `pub mod browser_webview_setup;`）

**Interfaces:**
- Consumes: `crate::state::AppState`、`crate::tauri_webview_handle::TauriWebViewHandle`、`crate::webview_event_bridge::TauriWebView2EventBridge`、`adl_browser` 的多个公共 API（`webview_label`、`BROWSER_WEBVIEW_LABEL`、`resolve_url`、`init_script_with_background`、`navigation_handler`、`setup_webview2_handlers`、`theme_to_rgb`、`set_default_background_color`、`navigate_core`、`webview2_set_profile_color_scheme`、`webview_handle::{EventBridgeRef, WebViewHandle}`）
- Produces: 6 个 `pub(super)` 函数——`new_window_handler`、`resolve_window_and_url`、`build_webview_builder`、`setup_webview2_handlers_for_platform`、`apply_theme_and_navigate_for_platform`、`register_webview_with_manager`。这些函数仅供 `commands::browser` 模块消费

**设计决策：**
1. 可见性用 `pub(super)`：这 6 个函数只被 `commands/browser.rs` 使用，不需要对 `commands` 模块外暴露。`pub(super)` = 对父模块 `commands` 可见，但 `commands::browser` 是 `commands` 的子模块，可以访问父模块可见的项
2. 函数体**逐字复制**自原 `commands/browser.rs:14-195`，仅调整可见性（`fn` → `pub(super) fn`）
3. `apply_theme_and_navigate_for_platform` 保留了完整的 race-condition 处理注释（L98-115），这是重要的领域知识

- [ ] **Step 1: 创建 `browser_webview_setup.rs` 文件**

写入 `ai-digital-life/src-tauri/src/commands/browser_webview_setup.rs`：

```rust
//! WebView2 platform setup helpers for the browser commands.
//!
//! Contains the new-window handler, webview builder factory, theme
//! application logic, and BrowserManager registration. These functions
//! are specific to Tauri's webview integration (as opposed to the
//! cross-platform `adl_browser` crate) and are used only by
//! `browser_create_for_tab`.

use std::sync::Arc;

use crate::state::AppState;
use crate::tauri_webview_handle::TauriWebViewHandle;
use crate::webview_event_bridge::TauriWebView2EventBridge;
use adl_browser::webview_handle::{EventBridgeRef, WebViewHandle};
use adl_browser::BROWSER_WEBVIEW_LABEL;
use adl_errors::AppError;
use tauri::{Emitter, Manager};

fn new_window_handler(
    app: &tauri::AppHandle,
    url: &url::Url,
) -> tauri::webview::NewWindowResponse<tauri::Wry> {
    if url.scheme() == "http" || url.scheme() == "https" {
        if let Some(window) = app.get_window("main") {
            if let Some(webview) = window.get_webview(BROWSER_WEBVIEW_LABEL) {
                if let Ok(parsed_url) = adl_browser::resolve_url(url.as_str()) {
                    let _ = webview.navigate(parsed_url);
                }
            }
        }
    }
    tauri::webview::NewWindowResponse::Deny
}

pub(super) fn resolve_window_and_url(
    app: &tauri::AppHandle,
    url: &str,
) -> Result<(tauri::Window<tauri::Wry>, url::Url), AppError> {
    let window =
        app.get_window("main").ok_or_else(|| AppError::Internal("main window not found".into()))?;
    let target = adl_browser::resolve_url(url)
        .map_err(|e| AppError::Internal(format!("failed to resolve URL: {e}")))?;
    Ok((window, target))
}

pub(super) fn build_webview_builder(
    label: &str,
    tab_id: &str,
    target: url::Url,
    app_handle: tauri::AppHandle,
    color_scheme: &str,
) -> tauri::webview::WebviewBuilder<tauri::Wry> {
    let app_nav = app_handle.clone();
    let tab_id_owned = tab_id.to_string();
    let init_script = adl_browser::init_script_with_background(color_scheme);
    tracing::debug!(color_scheme, "build_webview_builder: generated init_script with background");
    tauri::webview::WebviewBuilder::new(label, tauri::WebviewUrl::External(target))
        .initialization_script(init_script)
        .on_navigation(move |url| {
            // Skip about:blank — used as the initial URL during WebView creation
            // to allow background color and CDP color scheme to be applied before
            // the real page's first paint. See browser_create_for_tab.
            if url.as_str().starts_with("about:blank") {
                tracing::debug!(raw_url = %url.as_str(), "on_navigation: skipped about:blank");
                return true;
            }
            tracing::debug!(raw_url = %url.as_str(), "on_navigation: ENTER");
            adl_browser::navigation_handler(url, &|normalized| {
                tracing::debug!(normalized_url = %normalized, "on_navigation: emitting browser-url-changed");
                let _ = app_nav.emit(
                    "digital-life://browser-url-changed",
                    serde_json::json!({ "tabId": tab_id_owned, "url": normalized }),
                );
            })
        })
        .on_new_window(move |url, _window_features| new_window_handler(&app_handle, &url))
}

pub(super) fn setup_webview2_handlers_for_platform(
    webview: &tauri::Webview<tauri::Wry>,
    tab_id: &str,
    label: &str,
    bridge: EventBridgeRef,
) {
    #[cfg(windows)]
    {
        let bridge = bridge.clone();
        let tab_id = tab_id.to_string();
        let label = label.to_string();
        let _ = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();
            if let Ok(core) = controller.CoreWebView2() {
                adl_browser::setup_webview2_handlers(&core, &tab_id, &label, &bridge);
            }
        });
    }
    #[cfg(not(windows))]
    {
        adl_browser::setup_webview2_handlers(tab_id, label);
    }
}

/// Apply the color scheme (background color + Profile PreferredColorScheme) and
/// then navigate the WebView from the initial `about:blank` to the real target URL.
///
/// On Windows, all three operations happen inside `with_webview` to guarantee
/// ordering: background color is set and Profile color scheme is applied BEFORE
/// the real page's first paint, eliminating the white flash and theme flicker.
///
/// **Race condition handling**: `with_webview` is asynchronous — the closure is
/// queued and executed on the next message-loop iteration. If the user switches
/// theme between `browser_create_for_tab` and the closure's execution, the
/// originally captured `color_scheme` would be stale. To fix this, the closure
/// re-reads `BrowserManager::current_color_scheme()` at execution time, ensuring
/// it always uses the latest theme. This prevents the scenario where:
///   1. closure_A (from create) sets Profile=light + Navigate
///   2. closure_B (from set_color_scheme_for_all) sets Profile=dark
///   3. YouTube detects the change and triggers ?themeRefresh=1 (flicker)
///
/// On non-Windows, there is no WebView2 flash issue, so we simply navigate.
pub(super) fn apply_theme_and_navigate_for_platform(
    webview: &tauri::Webview<tauri::Wry>,
    app_handle: tauri::AppHandle,
    real_url: &str,
) {
    #[cfg(windows)]
    {
        let url_owned = real_url.to_string();
        let app_for_closure = app_handle.clone();
        tracing::debug!(url = &url_owned, "apply_theme_and_navigate_for_platform: ENTER (windows)");
        let _ = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();

            // Re-read the latest color scheme from BrowserManager at closure
            // execution time. `with_webview` is async, so the theme may have
            // changed since browser_create_for_tab was called. Using the latest
            // value ensures the Profile and Navigate use the same theme, avoiding
            // a stale-theme -> new-theme transition that triggers YouTube's
            // ?themeRefresh=1 flicker.
            let cs = match app_for_closure.try_state::<AppState>() {
                Some(state) => state.browser_manager.current_color_scheme(),
                None => {
                    tracing::warn!("apply_theme: AppState not found, falling back to dark");
                    "dark".to_string()
                }
            };
            tracing::debug!(
                latest_cs = &cs,
                url = &url_owned,
                "apply_theme: closure executing with latest color scheme"
            );

            // 1. Set background color via ICoreWebView2Controller2
            let (r, g, b) = adl_browser::theme_to_rgb(&cs);
            tracing::debug!(color_scheme = &cs, r, g, b, "apply_theme: set_default_background_color");
            if let Err(e) = adl_browser::set_default_background_color(&controller, r, g, b) {
                tracing::warn!(error = %e, "failed to set WebView2 default background color");
            }

            // 2. Set Profile PreferredColorScheme (synchronous, native WebView2 API)
            //    This takes effect before any page load, so the page's first paint
            //    always sees the correct prefers-color-scheme.
            if let Ok(core) = controller.CoreWebView2() {
                tracing::debug!(color_scheme = &cs, "apply_theme: calling set_profile_color_scheme");
                adl_browser::webview2_set_profile_color_scheme(&core, &cs);

                // 3. Navigate immediately — no need to wait for any callback
                tracing::debug!(url = &url_owned, "apply_theme: navigate_core");
                if let Err(e) = adl_browser::navigate_core(&core, &url_owned) {
                    tracing::warn!(error = %e, url = %url_owned, "failed to navigate WebView2 to real URL");
                }
            } else {
                tracing::warn!("apply_theme: failed to get CoreWebView2");
            }
        });
    }
    #[cfg(not(windows))]
    {
        // On non-Windows, navigate to the real URL via Tauri's cross-platform API.
        // No WebView2 background color / Profile color scheme flash issue exists
        // on these platforms.
        if let Ok(parsed) = url::Url::parse(real_url) {
            let _ = webview.navigate(parsed);
        }
        let _ = app_handle;
    }
}

pub(super) fn register_webview_with_manager(
    state: &AppState,
    app_handle: tauri::AppHandle,
    label: String,
    tab_id: &str,
) -> Result<Option<String>, AppError> {
    let handle: Arc<dyn WebViewHandle> = Arc::new(TauriWebViewHandle::new(app_handle, label));
    state
        .browser_manager
        .create_for_tab(handle, tab_id)
        .map_err(|e| AppError::Internal(format!("failed to register browser: {e}")))
}
```

**注意**：`new_window_handler` 保持私有（`fn`，无 `pub`），因为它仅在 `build_webview_builder` 内部作为闭包传递，不被外部调用。其他 5 个函数用 `pub(super)`。

- [ ] **Step 2: 在 `commands/mod.rs` 注册新模块**

修改 `ai-digital-life/src-tauri/src/commands/mod.rs`。在 L7 `pub mod browser;` 之后添加一行：

将 L7：
```rust
pub mod browser;
```
替换为：
```rust
pub mod browser;
pub(crate) mod browser_webview_setup;
```

**可见性说明**：使用 `pub(crate)` 而非 `pub`，因为此模块仅供 `crate::commands::browser` 消费，不需要对外暴露。`pub(crate)` 允许同 crate 内访问，配合函数级的 `pub(super)` 形成两层约束。

- [ ] **Step 3: 运行 `cargo check` 验证新模块编译通过**

Run：
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check
```
Expected: 编译可能失败，因为 `commands/browser.rs` 仍定义了同名函数（重复定义）。这是预期行为——Task 3 会移除 `browser.rs` 中的重复定义。**此步骤仅确认 `browser_webview_setup.rs` 本身语法正确**：如果错误仅为"function defined multiple times"或"unused function"，则继续 Task 3；如果是 `browser_webview_setup.rs` 内部的语法/类型错误，必须先修复。

- [ ] **Step 4: Commit（暂不验证完整编译，Task 3 完成后统一验证）**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add src-tauri/src/commands/browser_webview_setup.rs src-tauri/src/commands/mod.rs
git commit -m "refactor(rust): extract WebView2 platform setup to browser_webview_setup module

Move 6 WebView2 platform setup functions (new_window_handler,
resolve_window_and_url, build_webview_builder,
setup_webview2_handlers_for_platform,
apply_theme_and_navigate_for_platform,
register_webview_with_manager) from commands/browser.rs to
commands/browser_webview_setup.rs.

Functions use pub(super) visibility: only consumed by browser module.
Preserves full race-condition handling comments in
apply_theme_and_navigate_for_platform.

Part of Phase D H7: browser.rs God Module split."
```

---

## Task 3: 精简 `browser.rs`（仅保留 14 个命令 + fetch 逻辑）

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/browser.rs`（完整重写 L1-709）

**Interfaces:**
- Consumes: Task 1 的 `adl_browser::html_meta::{extract_title, extract_favicon, google_favicon_url, origin_favicon_fallback}`；Task 2 的 `super::browser_webview_setup::{resolve_window_and_url, build_webview_builder, setup_webview2_handlers_for_platform, apply_theme_and_navigate_for_platform, register_webview_with_manager}`
- Produces: 14 个 `#[tauri::command]` 公共函数（签名不变）+ `fetch_page_meta_inner` 私有异步函数 + `with_fetch_cache` 私有函数 + `USER_AGENT`/`FETCH_DEDUP_WINDOW_MS` 常量

**设计决策：**
1. 移除 17 个已迁移的函数定义（6 个 WebView2 设置 + 11 个 HTML 解析）
2. 更新 import 块：移除 `tauri::{Emitter, Manager, State}` 中的 `Emitter`（不再直接使用），保留 `Manager`（`browser_create_for_tab` 中 `app_inner.state::<AppState>()` 需要）和 `State`（其他 13 个命令需要）
3. 移除 `use crate::tauri_webview_handle::TauriWebViewHandle;`（已迁移到 `browser_webview_setup.rs`）
4. 移除 `use adl_browser::webview_handle::WebViewHandle;`（已迁移，仅保留 `Bounds` 和 `EventBridgeRef`）
5. `fetch_page_meta_inner` 的函数体不变，但其调用的 `extract_title`/`extract_favicon`/`google_favicon_url`/`origin_favicon_fallback` 现在通过 `use adl_browser::html_meta::{...}` 导入

- [ ] **Step 1: 重写 `browser.rs`，移除已迁移函数并更新 imports**

将 `ai-digital-life/src-tauri/src/commands/browser.rs` **完整内容**替换为：

```rust
use std::sync::Arc;

use crate::commands::browser_webview_setup::{
    apply_theme_and_navigate_for_platform, build_webview_builder,
    register_webview_with_manager, resolve_window_and_url,
    setup_webview2_handlers_for_platform,
};
use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use crate::webview_event_bridge::TauriWebView2EventBridge;
use adl_browser::html_meta::{
    extract_favicon, extract_title, google_favicon_url, origin_favicon_fallback,
};
use adl_browser::webview_handle::{Bounds, EventBridgeRef};
use adl_browser::{webview_label, PageMeta};
use adl_errors::AppError;
use adl_types::IpcResult;
use tauri::{Manager, State};

#[tauri::command]
pub async fn browser_create_for_tab(
    app: tauri::AppHandle,
    tab_id: String,
    url: String,
    color_scheme: Option<String>,
) -> Result<IpcResult<Option<String>>, CommandError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let app_inner = app.clone();

    app.run_on_main_thread(move || {
        let state = app_inner.state::<AppState>();
        let label = webview_label(&tab_id);
        tracing::debug!(tab_id = &tab_id, url = &url, color_scheme = ?&color_scheme, "browser_create_for_tab: ENTER");

        let result = (|| -> Result<Option<String>, AppError> {
            let (window, _target) = resolve_window_and_url(&app_inner, &url)?;

            // Resolve the color scheme early — it's needed for the init script
            // (hardcoded background color in INIT_SCRIPT). The init script uses
            // this value to set document.documentElement.style.backgroundColor
            // before page CSS loads. apply_theme_and_navigate_for_platform will
            // re-read the latest color scheme at closure execution time, so this
            // value only affects the INIT_SCRIPT background color.
            let cs = color_scheme.unwrap_or_else(|| state.browser_manager.current_color_scheme());

            // Create the WebView with about:blank as the initial URL to prevent
            // the real page from loading before the background color and Profile
            // color scheme are applied. The real URL is navigated to after theme
            // setup in apply_theme_and_navigate_for_platform.
            let blank_url = url::Url::parse("about:blank")
                .map_err(|e| AppError::Internal(format!("failed to parse about:blank: {e}")))?;
            let webview_builder = build_webview_builder(&label, &tab_id, blank_url, app_inner.clone(), &cs);

            window
                .add_child(
                    webview_builder,
                    tauri::LogicalPosition::new(-10000.0, -10000.0),
                    tauri::LogicalSize::new(800.0, 600.0),
                )
                .map_err(|e| {
                    AppError::Internal(format!("failed to create webview for tab {tab_id}: {e}"))
                })?;

            tracing::info!(tab_id = &tab_id, url = &url, "browser webview created for tab");

            if let Some(webview) = window.get_webview(&label) {
                let bridge: EventBridgeRef =
                    Arc::new(TauriWebView2EventBridge::new(app_inner.clone()));
                setup_webview2_handlers_for_platform(&webview, &tab_id, &label, bridge.clone());
            }

            // Register the webview with BrowserManager BEFORE calling
            // apply_theme_and_navigate_for_platform. This ensures the webview is
            // in the manager's map when set_color_scheme_for_all runs, so any
            // pending theme change can update it. apply_theme_and_navigate_for_platform
            // will also re-read the latest color scheme at closure execution time,
            // handling the race where the theme was changed between
            // browser_create_for_tab and the with_webview closure execution.
            let register_result = register_webview_with_manager(
                &state,
                app_inner.clone(),
                label.clone(),
                &tab_id,
            );

            match register_result {
                Ok(result) => {
                    if let Some(webview) = window.get_webview(&label) {
                        apply_theme_and_navigate_for_platform(&webview, app_inner.clone(), &url);
                    }
                    Ok(result)
                }
                Err(e) => {
                    // Clean up the orphan WebView to prevent resource leaks
                    if let Some(webview) = window.get_webview(&label) {
                        let _ = webview.close();
                    }
                    Err(e)
                }
            }
        })();

        let _ = tx.send(result);
    })
    .map_err(|e| AppError::Internal(format!("main thread dispatch: {e}")))?;

    Ok(ipc(rx.await.map_err(|e| AppError::Internal(format!("creation channel: {e}")))?))
}

#[tauri::command]
pub fn browser_activate_tab(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.activate_tab(&tab_id)))
}

#[tauri::command]
pub fn browser_destroy_tab(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.destroy_tab(&tab_id)))
}

#[tauri::command]
pub fn browser_navigate_tab(
    state: State<'_, AppState>,
    tab_id: String,
    url: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.navigate_tab(&tab_id, &url)))
}

#[tauri::command]
pub fn browser_set_tab_bounds(
    state: State<'_, AppState>,
    tab_id: String,
    bounds: Bounds,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.set_tab_bounds(&tab_id, bounds)))
}

#[tauri::command]
pub fn browser_go_back_tab(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<bool>, CommandError> {
    Ok(ipc(state.browser_manager.go_back_tab(&tab_id)))
}

#[tauri::command]
pub fn browser_go_forward_tab(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<bool>, CommandError> {
    Ok(ipc(state.browser_manager.go_forward_tab(&tab_id)))
}

#[tauri::command]
pub fn browser_reload_tab(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.reload_tab(&tab_id)))
}

#[tauri::command]
pub async fn browser_fetch_page_meta(
    url: String,
    force: Option<bool>,
) -> Result<IpcResult<PageMeta>, CommandError> {
    let skip_dedup = force.unwrap_or(false);
    let meta = fetch_page_meta_inner(&url, skip_dedup).await?;
    Ok(ipc(Ok(meta)))
}

#[tauri::command]
pub fn browser_mute_tab(
    state: State<'_, AppState>,
    tab_id: String,
    muted: bool,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.mute_tab(&tab_id, muted)))
}

#[tauri::command]
pub fn browser_set_color_scheme(
    state: State<'_, AppState>,
    color_scheme: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::info!(color_scheme, "browser_set_color_scheme command invoked");
    Ok(ipc(state.browser_manager.set_color_scheme_for_all(&color_scheme)))
}

#[tauri::command]
pub fn browser_set_zoom(
    state: State<'_, AppState>,
    tab_id: String,
    zoom_factor: f64,
) -> Result<IpcResult<()>, CommandError> {
    tracing::info!(tab_id = %tab_id, zoom_factor = zoom_factor, "browser_set_zoom command invoked");
    Ok(ipc(state.browser_manager.set_zoom(&tab_id, zoom_factor)))
}

#[tauri::command]
pub fn browser_clear_cookies(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::info!(tab_id = %tab_id, "browser_clear_cookies command invoked");
    Ok(ipc(state.browser_manager.clear_cookies_for_tab(&tab_id)))
}

#[tauri::command]
pub fn browser_clear_cache(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::info!(tab_id = %tab_id, "browser_clear_cache command invoked");
    Ok(ipc(state.browser_manager.clear_cache_for_tab(&tab_id)))
}

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

fn with_fetch_cache<F, R>(f: F) -> R
where
    F: FnOnce(&mut HashMap<String, Instant>) -> R,
{
    static CACHE: std::sync::OnceLock<Mutex<HashMap<String, Instant>>> = std::sync::OnceLock::new();
    let mutex = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = mutex.lock().unwrap_or_else(|e| e.into_inner());
    f(&mut guard)
}

const FETCH_DEDUP_WINDOW_MS: u64 = 3000;

async fn fetch_page_meta_inner(url: &str, skip_dedup: bool) -> Result<PageMeta, AppError> {
    if !skip_dedup {
        let is_dupe = with_fetch_cache(|cache| {
            let now = Instant::now();
            match cache.get(url) {
                Some(last)
                    if now.duration_since(*last)
                        < std::time::Duration::from_millis(FETCH_DEDUP_WINDOW_MS) =>
                {
                    true
                },
                _ => {
                    cache.insert(url.to_string(), now);
                    false
                },
            }
        });
        if is_dupe {
            tracing::info!(url = %url, "fetch_page_meta_inner: skipped (dedup within {}ms)", FETCH_DEDUP_WINDOW_MS);
            return Ok(PageMeta {
                title: String::new(),
                favicon: String::new(),
                url: url.to_string(),
            });
        }
    }

    tracing::info!(url = %url, "fetch_page_meta_inner: start");

    if !url.starts_with("http://") && !url.starts_with("https://") {
        tracing::warn!(url = %url, "fetch_page_meta_inner: non-http URL, returning empty");
        return Ok(PageMeta { title: String::new(), favicon: String::new(), url: url.to_string() });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| AppError::Internal(format!("failed to build http client: {e}")))?;

    let response = client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .await;

    let body = match response {
        Ok(resp) => {
            let body = resp.text().await.unwrap_or_default();
            tracing::info!(url = %url, body_len = body.len(), "fetch_page_meta_inner: HTTP success");
            body
        },
        Err(e) => {
            tracing::info!(url = %url, err = %e, "fetch_page_meta_inner: HTTP failed, returning empty title");
            return Ok(PageMeta {
                title: String::new(),
                favicon: google_favicon_url(url),
                url: url.to_string(),
            });
        },
    };

    let body = body.chars().take(65536).collect::<String>();
    let title = extract_title(&body);
    let favicon = extract_favicon(&body, url);

    let final_title = title.unwrap_or_else(|| {
        tracing::warn!(url = %url, "fetch_page_meta_inner: <title> not found, returning empty title");
        String::new()
    });

    let final_favicon = favicon.unwrap_or_else(|| origin_favicon_fallback(url));

    tracing::info!(url = %url, title = %final_title, favicon_len = final_favicon.len(), "fetch_page_meta_inner: result");
    Ok(PageMeta { title: final_title, favicon: final_favicon, url: url.to_string() })
}
```

- [ ] **Step 2: 运行 `cargo check` 验证完整编译**

Run：
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check
```
Expected: 编译成功，无错误。如果出现"unused import" warning，记录具体 warning 内容，下一步用 clippy 修复。

- [ ] **Step 3: 运行 `cargo clippy` 自动修复 + 严格检查**

Run：
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo clippy --workspace --all-targets --fix -- -D warnings
```
Expected: 自动修复 unused import 等 lint 问题。修复后再次运行 `cargo check` 确认无错误。

- [ ] **Step 4: 运行 `cargo fmt` 格式化**

Run：
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo fmt --all
```
Expected: 格式化所有 Rust 文件。

- [ ] **Step 5: 运行 `cargo test` 确保无回归**

Run：
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test --workspace
```
Expected: 所有测试通过，包括 Task 1 新增的 22 个 `html_meta` 测试 + 现有的 `commands::tests`、`browser_webview_tests`、`browser_pool_tests`、`webview_handle_tests` 等。

- [ ] **Step 6: 验证 Tauri 命令注册未受影响**

Run：
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check --bin ai-digital-life
```
Expected: Tauri 二进制编译成功，确认 14 个 `#[tauri::command]` 函数仍被 `tauri::generate_handler!` 正确引用（注册逻辑在 `src-tauri/src/lib.rs` 或 `main.rs`，本次未修改）。

- [ ] **Step 7: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add src-tauri/src/commands/browser.rs
git commit -m "refactor(rust): slim browser.rs to 14 commands + fetch logic only

Remove 17 functions migrated to html_meta.rs and
browser_webview_setup.rs. Update imports to consume them from
new locations. browser.rs now ~230 lines (down from 709), with a
single responsibility: Tauri command handlers + HTTP fetch dedup.

No behavior change — all 14 #[tauri::command] signatures and
fetch_page_meta_inner logic are preserved verbatim.

Part of Phase D H7: browser.rs God Module split. Closes H7."
```

---

## Task 4: 修复 FileTree memoization（style 缓存 + useCallback 提升回调）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/file-tree/fileTree.tsx`（L16-38 接口、L40-140 组件、L288-322 渲染）

**Interfaces:**
- Consumes: `useMemo`、`useCallback`（已在 L1 import）、`VIRTUAL_ITEM_HEIGHT`（L13 import）、`TreeNodeRow`（L5 import，`React.memo` 包裹）
- Produces: 修改后的 `VirtualNodeProps<T>` 接口（`style` → `top: number`）、修改后的 `VirtualNodeComponent<T>`（内部用 `useMemo`/`useCallback` 稳定引用）、修改后的 `FileTree` 渲染（传 `top` 而非 `style`）

**问题根因分析：**

1. **style 对象字面量**（原 L313-319）：每次 `FileTree` 重渲染时，`visibleNodes.map(...)` 为每个可见行创建新的 `style={{ position: 'absolute', top: ..., ... }}` 对象。`MemoizedVirtualNode`（L142 `memo()` 包裹）的默认浅比较看到 `style` prop 引用变化，导致**所有可见行**都重渲染，即使该行的 `top` 值并未改变。
2. **内联回调**（原 L94、L95-101、L136）：`VirtualNodeComponent` 内部为 `TreeNodeRow`（`React.memo` 包裹）生成 3 个内联箭头函数（`onToggle`、`onActivate`、`onContextMenu`）。即使 `node.path` 不变，每次 `VirtualNodeComponent` 渲染都创建新函数引用，使 `TreeNodeRow` 的 memo 失效。

**修复策略：**

1. **style → top**：将 `style: React.CSSProperties` prop 替换为 `top: number`（原始类型）。`VirtualNodeComponent` 内部用 `useMemo` 基于 `[top, trunkHeight]` 构造稳定的 `itemStyle` 对象。当 `top` 和 `trunkHeight` 不变时，`itemStyle` 引用稳定，`TreeNodeRow` memo 生效。
2. **useCallback 提升回调**：在 `VirtualNodeComponent` 内用 `useCallback` 包裹 `handleToggle`、`handleActivate`，用 `useMemo` 生成 `handleContextMenu`（因为可能为 `undefined`，`useCallback` 不适合返回 `undefined`）。依赖数组包含 `node.path` 等，确保 `node.path` 变化时回调正确更新。

- [ ] **Step 1: 修改 `VirtualNodeProps` 接口，将 `style` 替换为 `top`**

修改 `ai-digital-life/frontend/src/app/features/file-tree/fileTree.tsx`。

将 L16-38 的 `VirtualNodeProps` 接口中的 `style: React.CSSProperties;`（L35）替换为 `top: number;`。

原 L33-37：
```tsx
  expandLabel: string;
  collapseLabel: string;
  flat?: boolean;
  style: React.CSSProperties;
  trunkHeight?: number;
```

替换为：
```tsx
  expandLabel: string;
  collapseLabel: string;
  flat?: boolean;
  top: number;
  trunkHeight?: number;
```

- [ ] **Step 2: 修改 `VirtualNodeComponent`，解构 `top` 替代 `style`，并添加 `useMemo`/`useCallback` 稳定引用**

修改 L40-140 的 `VirtualNodeComponent` 函数。

将 L40-62 的函数签名与解构块：
```tsx
function VirtualNodeComponent<T extends FileTreeRenderableNode>({
  flatNode,
  expandedPaths,
  activePath,
  selectedPaths,
  highlightedPath,
  hoveredPath,
  dirtyPaths,
  externalChangePath,
  onToggle,
  onOpenFile,
  renderMeta,
  renderCount,
  renderIconBefore,
  getNodeClassName,
  onShowContextMenu,
  expandLabel,
  collapseLabel,
  flat,
  style,
  trunkHeight,
  hoveredDescendantPaths,
}: VirtualNodeProps<T>) {
```

替换为：
```tsx
function VirtualNodeComponent<T extends FileTreeRenderableNode>({
  flatNode,
  expandedPaths,
  activePath,
  selectedPaths,
  highlightedPath,
  hoveredPath,
  dirtyPaths,
  externalChangePath,
  onToggle,
  onOpenFile,
  renderMeta,
  renderCount,
  renderIconBefore,
  getNodeClassName,
  onShowContextMenu,
  expandLabel,
  collapseLabel,
  flat,
  top,
  trunkHeight,
  hoveredDescendantPaths,
}: VirtualNodeProps<T>) {
```

- [ ] **Step 3: 替换 `itemStyle` 构造逻辑，用 `useMemo` 缓存**

原 L79-81：
```tsx
  const itemStyle: React.CSSProperties = trunkHeight
    ? ({ ...style, '--adl-trunk-height': `${trunkHeight}px` } as React.CSSProperties)
    : style;
```

替换为：
```tsx
  // Cache the style object so TreeNodeRow's React.memo sees a stable
  // reference when `top` and `trunkHeight` are unchanged. Previously a
  // new object literal was created on every parent render, defeating
  // memoization for every visible row.
  const itemStyle = useMemo<React.CSSProperties>(
    () => {
      const base: React.CSSProperties = {
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height: VIRTUAL_ITEM_HEIGHT,
      };
      return trunkHeight
        ? ({ ...base, '--adl-trunk-height': `${trunkHeight}px` } as React.CSSProperties)
        : base;
    },
    [top, trunkHeight]
  );
```

- [ ] **Step 4: 用 `useCallback`/`useMemo` 提升三个回调**

在 `itemStyle` 的 `useMemo` 之后、`return (` 之前（原 L82 位置），插入三个稳定化回调。

原 L82-83 之间（`const itemStyle...` 之后直接 `return (`）插入：
```tsx
  // Stabilize callbacks passed to TreeNodeRow (React.memo). Previously
  // three inline arrow functions were created on every render, defeating
  // TreeNodeRow's memo even when node.path was unchanged.
  const handleToggle = useCallback(() => onToggle(node.path), [onToggle, node.path]);

  const handleActivate = useCallback(() => {
    if (isDirectory) {
      onToggle(node.path);
    } else {
      onOpenFile(node.path);
    }
  }, [isDirectory, onToggle, onOpenFile, node.path]);

  // useMemo (not useCallback) because the result can be `undefined`
  // when onShowContextMenu is not provided. useCallback always returns
  // a function, which would break the `undefined` contract.
  const handleContextMenu = useMemo(
    () =>
      onShowContextMenu
        ? (event: React.MouseEvent<HTMLDivElement>) => onShowContextMenu(event, node)
        : undefined,
    [onShowContextMenu, node]
  );
```

- [ ] **Step 5: 更新 `<TreeNodeRow>` JSX，使用稳定化回调**

原 L84-138 的 `<TreeNodeRow>` JSX 中，替换 3 个内联回调。

原 L94：
```tsx
      onToggle={isDirectory ? () => onToggle(node.path) : undefined}
```
替换为：
```tsx
      onToggle={isDirectory ? handleToggle : undefined}
```

原 L95-101：
```tsx
      onActivate={() => {
        if (isDirectory) {
          onToggle(node.path);
        } else {
          onOpenFile(node.path);
        }
      }}
```
替换为：
```tsx
      onActivate={handleActivate}
```

原 L136：
```tsx
      onContextMenu={onShowContextMenu ? (event) => onShowContextMenu(event, node) : undefined}
```
替换为：
```tsx
      onContextMenu={handleContextMenu}
```

- [ ] **Step 6: 更新 `FileTree` 渲染，传 `top` 而非 `style`**

原 L288-322 的 `visibleNodes.map(...)` 块中，替换 `<MemoizedVirtualNode>` 的 props。

原 L313-319：
```tsx
                style={{
                  position: 'absolute',
                  top: absoluteIndex * VIRTUAL_ITEM_HEIGHT,
                  left: 0,
                  right: 0,
                  height: VIRTUAL_ITEM_HEIGHT,
                }}
```
替换为：
```tsx
                top={absoluteIndex * VIRTUAL_ITEM_HEIGHT}
```

- [ ] **Step 7: 运行 TypeScript 类型检查**

Run：
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run typecheck
```
Expected: 类型检查通过，无错误。`VirtualNodeProps` 接口、`VirtualNodeComponent` 解构、`TreeNodeRow` props 类型应全部对齐。

- [ ] **Step 8: 运行 ESLint 自动修复**

Run：
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint:fix
```
Expected: ESLint 自动修复任何 `react-hooks/exhaustive-deps` 等问题。`useCallback`/`useMemo` 的依赖数组已在 Step 4 完整声明（`[onToggle, node.path]`、`[isDirectory, onToggle, onOpenFile, node.path]`、`[onShowContextMenu, node]`、`[top, trunkHeight]`），不应有 warning。

- [ ] **Step 9: 运行 Prettier 格式化**

Run：
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run format
```
Expected: 格式化所有前端文件。

- [ ] **Step 10: 运行前端测试**

Run：
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run test
```
Expected: 所有 Vitest 测试通过，包括 `fileTree.test.tsx`。如果 `fileTree.test.tsx` 因 props 变更失败，检查测试是否直接断言了 `style` prop——如果是，更新测试断言为 `top` prop。

- [ ] **Step 11: 检查 `fileTree.test.tsx` 是否需要更新**

如果 Step 10 报告 `fileTree.test.tsx` 失败，读取失败信息。常见情况：
- 测试直接渲染 `VirtualNodeComponent` 并断言 `style` prop → 更新为断言 `top` prop
- 测试通过 `FileTree` 间接渲染 → 通常无需改动（`FileTree` 的公开 props 未变）

如果测试通过，跳过此步。

- [ ] **Step 12: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/file-tree/fileTree.tsx
git commit -m "fix(frontend): stabilize FileTree virtual node memoization

Fix H10: virtualized rows re-rendered on every parent render because
MemoizedVirtualNode received a new style object literal and
TreeNodeRow received three inline arrow functions.

- Replace style: React.CSSProperties prop with top: number (primitive)
  on VirtualNodeProps, breaking the object-identity memo busting
- Add useMemo for itemStyle inside VirtualNodeComponent keyed on
  [top, trunkHeight] so TreeNodeRow sees a stable style reference
- Wrap onToggle/onActivate in useCallback, derive onContextMenu via
  useMemo (handles undefined case), so TreeNodeRow's React.memo
  survives unchanged node.path

No public API change: FileTree props are unchanged. Closes H10."
```

---

## Task 5: 全量验收（L3 全量级）

**Files:**
- 无文件修改，仅运行验收命令

**变更层级评估：**
- H7 涉及 Rust crate 结构变更（`adl-browser` 新增模块）+ `src-tauri` 命令模块拆分 → L3
- H10 涉及前端组件 props 契约变更（`VirtualNodeProps`）→ L2，但因可能影响 `fileTree.test.tsx`，升级为 L3
- 综合：L3 全量级

- [ ] **Step 1: 前端格式检查 + Lint + 类型检查（并行）**

Run（三个命令并行）：
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint:fix
```
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run format
```
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run typecheck
```
Expected: 三个命令均成功。Lint 修复后如有代码变更，重新运行 typecheck。

- [ ] **Step 2: Rust 格式检查 + Clippy + 编译检查（并行）**

Run（三个命令顺序执行，因为 clippy --fix 会修改文件）：
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo fmt --all ; cargo clippy --workspace --all-targets --fix -- -D warnings ; cargo check --workspace
```
Expected: 三个命令均成功。Clippy 修复后如有代码变更，重新运行 `cargo check`。

- [ ] **Step 3: 前端测试 + Rust 测试（并行）**

Run（两个命令并行）：
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run test
```
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test --workspace
```
Expected: 所有测试通过。前端 Vitest 全绿，Rust 测试全绿（含 22 个新增 `html_meta` 测试）。

- [ ] **Step 4: 验收结果记录**

如果所有步骤通过，Phase D 验收完成。
如果有失败：
1. 记录失败的步骤、错误信息
2. 区分"实现 bug"与"测试过时"
3. 修复后从 Step 1 重新执行
4. 修复尝试 3 次仍失败 → 向用户报告并等待指示

- [ ] **Step 5: 最终 Commit（如有 fix 产生的变更）**

如果 Step 1-3 产生了额外的 lint/clippy 修复变更：
```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add -A
git commit -m "chore(core): Phase D acceptance fixes — lint/clippy auto-fix"
```

如果无额外变更，跳过此步。

---

## Self-Review

### 1. Spec 覆盖检查

| 发现 | 覆盖 Task | 状态 |
|------|-----------|------|
| **H7**: `browser.rs` (709 行) 拆分为 3 个文件 | Task 1 (html_meta.rs) + Task 2 (browser_webview_setup.rs) + Task 3 (browser.rs 精简) | ✅ |
| H7-a: `commands/browser.rs` 仅保留 14 个 `#[tauri::command]` | Task 3 — 保留 14 个命令 + `fetch_page_meta_inner`（因依赖 reqwest） | ✅ |
| H7-b: `commands/browser_webview_setup.rs` 移动 `new_window_handler` 到 `register_webview_with_manager` | Task 2 — 6 个函数全部迁移 | ✅ |
| H7-c: `crates/browser/src/html_meta.rs` 移动 HTML 解析纯函数 | Task 1 — 11 个纯函数迁移 | ✅ |
| H7-d: 更新 mod.rs 模块声明 | Task 2 Step 2 — `commands/mod.rs` 添加 `pub(crate) mod browser_webview_setup;` | ✅ |
| H7-e: 更新 Cargo.toml 如需要 | 无需更新——`crates/browser/Cargo.toml` 已有 `url.workspace = true` 依赖，`html_meta.rs` 仅用 `url::Url` | ✅（无需改动） |
| **H10**: FileTree memoization 破坏 | Task 4 | ✅ |
| H10-a: 缓存 style map 或传 `top` 作为原始类型 prop | Task 4 — 采用 `top: number` 原始类型 + `useMemo` 缓存 `itemStyle` | ✅ |
| H10-b: `useCallback` 提升回调 | Task 4 Step 4 — `handleToggle`/`handleActivate` 用 `useCallback`，`handleContextMenu` 用 `useMemo`（处理 undefined） | ✅ |
| H10 位置: `fileTree.tsx:313-319` style 对象 | Task 4 Step 6 — 替换为 `top={absoluteIndex * VIRTUAL_ITEM_HEIGHT}` | ✅ |
| H10 位置: `fileTree.tsx:94-101, 136` 内联回调 | Task 4 Step 4-5 — 三个回调稳定化 | ✅ |

### 2. 占位符扫描

- ✅ 无 "TBD"/"TODO"/"implement later"
- ✅ 无 "add appropriate error handling" 等模糊描述
- ✅ 无 "similar to Task N"（每个 Task 代码独立完整）
- ✅ 每个 Step 的代码块均为可直接复制的完整代码
- ✅ 验证命令均包含 Expected 输出说明

### 3. 类型一致性检查

| 函数/类型 | 定义位置 | 消费位置 | 一致性 |
|-----------|----------|----------|--------|
| `extract_title(html: &str) -> Option<String>` | Task 1 `html_meta.rs` | Task 3 `browser.rs` via `use adl_browser::html_meta::extract_title` | ✅ |
| `extract_favicon(html: &str, base_url: &str) -> Option<String>` | Task 1 `html_meta.rs` | Task 3 `browser.rs` via `use adl_browser::html_meta::extract_favicon` | ✅ |
| `google_favicon_url(url: &str) -> String` | Task 1 `html_meta.rs` | Task 3 `browser.rs` via `use adl_browser::html_meta::google_favicon_url` | ✅ |
| `origin_favicon_fallback(url: &str) -> String` | Task 1 `html_meta.rs` | Task 3 `browser.rs` via `use adl_browser::html_meta::origin_favicon_fallback` | ✅ |
| `resolve_window_and_url(app, url) -> Result<(Window, Url), AppError>` | Task 2 `browser_webview_setup.rs` (`pub(super)`) | Task 3 `browser.rs` via `use super::browser_webview_setup::resolve_window_and_url` → 实际写法 `use crate::commands::browser_webview_setup::...` | ✅ |
| `build_webview_builder(label, tab_id, target, app_handle, color_scheme) -> WebviewBuilder` | Task 2 | Task 3 `browser_create_for_tab` | ✅ |
| `setup_webview2_handlers_for_platform(webview, tab_id, label, bridge)` | Task 2 | Task 3 `browser_create_for_tab` | ✅ |
| `apply_theme_and_navigate_for_platform(webview, app_handle, real_url)` | Task 2 | Task 3 `browser_create_for_tab` | ✅ |
| `register_webview_with_manager(state, app_handle, label, tab_id) -> Result<Option<String>, AppError>` | Task 2 | Task 3 `browser_create_for_tab` | ✅ |
| `VirtualNodeProps.top: number` | Task 4 Step 1 | Task 4 Step 2 解构、Step 6 渲染传值 | ✅ |
| `handleToggle: () => void` | Task 4 Step 4 `useCallback` | Task 4 Step 5 `onToggle={isDirectory ? handleToggle : undefined}` | ✅ |
| `handleActivate: () => void` | Task 4 Step 4 `useCallback` | Task 4 Step 5 `onActivate={handleActivate}` | ✅ |
| `handleContextMenu: ((event) => void) | undefined` | Task 4 Step 4 `useMemo` | Task 4 Step 5 `onContextMenu={handleContextMenu}` | ✅ |

### 4. 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| `browser_webview_setup.rs` 的 `pub(super)` 可见性不足以让 `browser.rs` 访问 | 低 | 编译失败 | Task 3 Step 2 的 `cargo check` 会立即捕获；如失败，改为 `pub(crate)` |
| `resolve_href` 改名导致行为差异 | 极低 | HTML 解析结果变化 | Task 1 测试覆盖 4 个 `resolve_href` 场景；函数体与原 `resolve_url` 逐字相同 |
| `fileTree.test.tsx` 直接断言 `style` prop | 中 | 测试失败 | Task 4 Step 11 明确处理此情况 |
| `useCallback` 依赖数组遗漏 | 低 | ESLint warning | Task 4 Step 8 ESLint `react-hooks/exhaustive-deps` 会捕获 |
| Tauri 命令注册丢失 | 极低 | 命令无法调用 | Task 3 Step 6 验证 `cargo check --bin` 确认二进制编译 |

### 5. 未覆盖项说明

- **UI 视觉验证**：本计划仅涉及内部代码正确性，UI 视觉验证由用户在 Tauri 桌面应用或浏览器预览中手动确认（FileTree 渲染、浏览器标签页创建、favicon 显示）
- **性能基准测试**：H10 的 memoization 修复效果（减少重渲染）可通过 React DevTools Profiler 验证，但不在本计划范围内
- **H7 的 `extract_attr` 与 `extract_attr_value` 合并**：两个函数功能相似但实现不同，合并会改变行为，超出纯重构范围，留待后续优化
