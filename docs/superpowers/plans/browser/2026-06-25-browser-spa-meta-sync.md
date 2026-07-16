# SPA 导航 Meta 同步改进实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 确保 SPA 网站（如 YouTube）在自动连播/`pushState` 导航时，标题和 favicon 能可靠同步到前端。

**Architecture:** 新增 Method 5（HistoryChanged COM 事件）捕获 SPA pushState 导航，即时通知 Rust 轮询线程进入快速轮询模式。扩展轮询窗口（10s 快速 + 20s 中速）覆盖延迟标题更新。简化 `fetch_script` 直接读 `document.title`并添加 `og:title` 兜底。前端 HTTP prefetch 失败后自动重试。

**Tech Stack:** Rust (Tauri 2.x, WebView2 COM), TypeScript (React 19 + Zustand)

---

## File Structure

| 文件 | 变更类型 | 职责 |
|------|----------|------|
| `crates/browser/src/browser_events.rs` | 修改 | 新增 `POLL_FAST_NOW` 原子标志 |
| `crates/browser/src/webview2_message.rs` | 修改 | 新增 `setup_history_changed_handler` (Method 5) |
| `crates/browser/src/browser_webview.rs` | 修改 | 扩展轮询窗口、简化 `fetch_script`、接入 HistoryChanged + `POLL_FAST_NOW` |
| `crates/browser/src/browser_navigation.rs` | 修改 | 在 init script 的 `__adlGetMeta` 中修复 `hasTitle` 强制 bug、添加 `og:title` 兜底 |
| `frontend/src/.../useBrowserUrlChange.ts` | 修改 | `prefetchPageMeta` 失败后自动重试 |

---

### Task 1: `POLL_FAST_NOW` 共享标志

**File:** `crates/browser/src/browser_events.rs:24-25`

- [ ] **Step 1: 添加 `AtomicBool` 引用**

```rust
use std::sync::atomic::{AtomicBool, Ordering};
```

Add after the existing `use` block (line 1-2):

```rust
use std::sync::atomic::AtomicBool;
```

- [ ] **Step 2: 定义静态标志**

Add after line 25 (`EMIT_DEDUP_WINDOW`):

```rust
/// 信号：通知轮询线程立即进入快速轮询模式（由 HistoryChanged handler 设置）
pub(crate) static POLL_FAST_NOW: AtomicBool = AtomicBool::new(false);
```

- [ ] **Step 3: 验证编译**

Run: `cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life" && cargo check -p adl-browser 2>&1`
Expected: `Compiling adl-browser ... Finished`

---

### Task 2: HistoryChanged COM Handler (Method 5)

**File:** `crates/browser/src/webview2_message.rs`

- [ ] **Step 1: 添加 `HistoryChangedEventHandler` import**

在 line 21 附近，在现有 import 旁添加：

```rust
use webview2_com::HistoryChangedEventHandler;
```

- [ ] **Step 2: 添加统计计数器**

在 line 34 (`FAVICON_CHANGED_COUNT`) 后：

```rust
static HISTORY_CHANGED_COUNT: AtomicU64 = AtomicU64::new(0);
```

- [ ] **Step 3: 实现 `setup_history_changed_handler`**

在 `setup_favicon_changed_handler` 后（line 461 前）：

```rust
pub fn setup_history_changed_handler(webview: Webview) -> Result<(), String> {
    let app = webview.app_handle().clone();
    info!("[ADL-META-RECV] Method 5 (HistoryChanged): setting up handler");

    let result = webview.with_webview(move |platform_wv| {
        unsafe {
            let controller = platform_wv.controller();
            let core = match controller.CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    error!(
                        "[ADL-META-RECV] Method 5: FAILED to get CoreWebView2: {}",
                        e
                    );
                    return;
                }
            };

            let app_for_handler = app.clone();
            let handler = HistoryChangedEventHandler::create(Box::new(
                move |sender: Option<ICoreWebView2>,
                      _args: Option<IUnknown>| {
                    let Some(sender) = sender else {
                        return Ok(());
                    };

                    let mut url_pwstr = windows::core::PWSTR::null();
                    if let Err(_e) = sender.Source(&mut url_pwstr) {
                        return Ok(());
                    }
                    let url = if url_pwstr.is_null() {
                        String::new()
                    } else {
                        take_pwstr(url_pwstr)
                    };

                    // Only handle http/https URLs
                    if url.is_empty() || !(url.starts_with("http://") || url.starts_with("https://")) {
                        return Ok(());
                    }

                    // Signal poll loop to enter fast poll mode immediately
                    crate::browser_events::POLL_FAST_NOW.store(true, Ordering::Release);

                    // Emit URL-changed so frontend can start navigation handling
                    let _ = app_for_handler.emit(
                        "digital-life://browser-url-changed",
                        serde_json::json!({ "url": url }),
                    );

                    let count = HISTORY_CHANGED_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                    info!(
                        "[ADL-META-RECV] ◄ Method 5 (HistoryChanged): RECEIVED ✓ (#{}) | url: {}",
                        count,
                        url.chars().take(80).collect::<String>()
                    );

                    Ok(())
                },
            ));

            let mut token: EventRegistrationToken = 0;
            match core.add_HistoryChanged(&handler, &mut token as *mut _ as *mut _) {
                Ok(_) => {
                    info!(
                        "[ADL-META-RECV] Method 5 (HistoryChanged): handler REGISTERED ✓ (token={}), SPA NAVIGATION DETECTION ENABLED",
                        token
                    );
                }
                Err(e) => {
                    warn!(
                        "[ADL-META-RECV] Method 5 (HistoryChanged): FAILED to register handler: {}, falling back",
                        e
                    );
                }
            }
        }
    });

    match result {
        Ok(_) => Ok(()),
        Err(e) => {
            warn!(
                "[ADL-META-RECV] Method 5 (HistoryChanged): with_webview FAILED: {}, falling back",
                e
            );
            Err(format!("history changed handler setup failed: {}", e))
        }
    }
}
```

- [ ] **Step 4: 导出新函数**

在 line 489-491 的 `pub use imp::{...}` 中，添加 `setup_history_changed_handler`：

```rust
pub use imp::{
    setup_document_title_handler, setup_favicon_changed_handler,
    setup_history_changed_handler, setup_webview2_messaging,
};
```

- [ ] **Step 5: 非 windows 桩函数**

在 line 481-487 (`#[cfg(not(windows))]`) 中添加：

```rust
pub fn setup_history_changed_handler(_webview: Webview) -> Result<(), String> {
    debug!("history changed handler not available on this platform (non-Windows), using fallback");
    Ok(())
}
```

- [ ] **Step 6: 验证编译**

Run: `cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life" && cargo check -p adl-browser 2>&1`
Expected: `Compiling adl-browser ... Finished`

---

### Task 3: browser_webview.rs — 接入 HistoryChanged + 扩展轮询 + 简化 fetch_script

**File:** `crates/browser/src/browser_webview.rs`

- [ ] **Step 1: 添加 import**

在 line 8 的 `use crate::browser_events::{EMIT_DEDUP_WINDOW, LAST_EMIT};` 旁：

```rust
use crate::browser_events::{EMIT_DEDUP_WINDOW, LAST_EMIT, POLL_FAST_NOW};
use std::sync::atomic::Ordering;
```

- [ ] **Step 2: 新增常量**

修改 line 21-23：

```rust
const POLL_INTERVAL_MS: u64 = 5000;
const FAST_POLL_INTERVAL_MS: u64 = 100;
const FAST_POLL_DURATION_MS: u64 = 10000;
const MEDIUM_POLL_INTERVAL_MS: u64 = 1000;
const MEDIUM_POLL_DURATION_MS: u64 = 20000;
```

- [ ] **Step 3: `BrowserManager::create` 中注册 HistoryChanged handler**

在 `setup_favicon_changed_handler` 调用后（line 112-114 后）添加：

```rust
if let Err(e) = crate::webview2_message::setup_history_changed_handler(webview.clone()) {
    tracing::warn!(error = %e, "history changed handler setup failed, using fallback");
}
```

- [ ] **Step 4: 轮询循环——添加 `POLL_FAST_NOW` 检查和 medium_poll_deadline**

修改 `start_polling` 函数（line 134 起）：

将 `let mut fast_poll_deadline` 那一行改为：

```rust
let mut fast_poll_deadline: Option<std::time::Instant> = None;
let mut medium_poll_deadline: Option<std::time::Instant> = None;
```

在 loop 开头、stop_flag 检查后（line 144 后）添加：

```rust
// 检查外部快速轮询信号（来自 HistoryChanged handler）
if POLL_FAST_NOW.swap(false, Ordering::AcqRel) {
    let now = std::time::Instant::now();
    fast_poll_deadline = Some(now + std::time::Duration::from_millis(FAST_POLL_DURATION_MS));
    medium_poll_deadline = None;
    tracing::info!("[ADL-META-RECV] POLL_FAST_NOW: fast poll triggered by HistoryChanged");
}
```

- [ ] **Step 5: 三阶段轮询睡眠逻辑**

将 `let sleep_ms = if let Some(deadline) = fast_poll_deadline { ... }` 整个块（line 145-156）替换为：

```rust
let now = std::time::Instant::now();
let sleep_ms = if let Some(deadline) = fast_poll_deadline {
    if now < deadline {
        FAST_POLL_INTERVAL_MS
    } else {
        // Fast poll expired → enter medium polling phase
        tracing::info!(
            "[ADL-META-RECV] fast poll expired after {}ms, switching to medium poll ({}ms interval for {}ms)",
            FAST_POLL_DURATION_MS, MEDIUM_POLL_INTERVAL_MS, MEDIUM_POLL_DURATION_MS
        );
        medium_poll_deadline = Some(now + std::time::Duration::from_millis(MEDIUM_POLL_DURATION_MS));
        fast_poll_deadline = None;
        MEDIUM_POLL_INTERVAL_MS
    }
} else if let Some(deadline) = medium_poll_deadline {
    if now < deadline {
        MEDIUM_POLL_INTERVAL_MS
    } else {
        tracing::info!(
            "[ADL-META-RECV] medium poll expired after {}ms, switching to normal poll ({}ms)",
            MEDIUM_POLL_DURATION_MS, POLL_INTERVAL_MS
        );
        medium_poll_deadline = None;
        POLL_INTERVAL_MS
    }
} else {
    POLL_INTERVAL_MS
};
```

- [ ] **Step 6: 简化 `fetch_script`**

将 `fetch_script` 变量定义（line 324-390）替换为：

```rust
let fetch_script = r#"
(function() {
    try {
        if (location.hash.indexOf('#adl-meta=') === 0) return;
        var t = document.title ? document.title.trim() : '';
        if (!t || t === location.hostname || t === 'www.' + location.hostname) {
            var ogMeta = document.querySelector('meta[property="og:title"]');
            if (ogMeta && ogMeta.content) {
                t = ogMeta.content.trim();
            }
        }
        if (!t) return;
        var f = '';
        var links = document.querySelectorAll('link[rel*="icon"]');
        for (var i = 0; i < links.length; i++) {
            if (!links[i].href) continue;
            var rel = (links[i].getAttribute('rel') || '').toLowerCase();
            if (rel.indexOf('icon') === -1) continue;
            f = links[i].href;
            break;
        }
        if (!f) {
            var shortcut = document.querySelector('link[rel="shortcut icon"]');
            if (shortcut && shortcut.href) f = shortcut.href;
        }
        var payload = 'title=' + encodeURIComponent(t) +
                      '&favicon=' + encodeURIComponent(f) +
                      '&url=' + encodeURIComponent(location.href.split('#')[0]);
        history.replaceState(null, '', '#adl-meta=' + encodeURIComponent(payload));
    } catch(e) {}
})();
"#;
```

- [ ] **Step 7: 让 `fetch_script` 始终运行（不只在 fast poll 期间）**

将 `if fast_poll_deadline.is_some() { ... let fetch_script = ...; ... }` 整个块（line 321-392）替换为无条件执行，并改用 `fast_poll_deadline.is_some() || medium_poll_deadline.is_some() || true` — 实际上直接去掉 if 守卫，让 eval 始终执行：

```rust
// Always try to fetch meta on every poll cycle to catch delayed SPA title changes
let _ = webview.eval(fetch_script);
```

注意：这里需要用 `webview.eval`（而非 `eval`）——该变量已在作用域中。

- [ ] **Step 8: 验证编译**

Run: `cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life" && cargo check -p adl-browser 2>&1`
Expected: `Compiling adl-browser ... Finished`

---

### Task 4: init script — `__adlGetMeta` 修复 + `og:title` 兜底

**File:** `crates/browser/src/browser_navigation.rs`

- [ ] **Step 1: `__adlGetMeta` 修复 `hasTitle` 强制 bug + og:title 兜底**

找到 `window.__adlGetMeta` 函数体（约 line 470-504）。替换为：

```javascript
window.__adlGetMeta = function() {
    var t = document.title ? document.title.trim() : '';

    // Fallback to og:title if document.title is empty or just hostname
    if (!isTitleMeaningful(t)) {
        var ogMeta = document.querySelector('meta[property="og:title"]');
        if (ogMeta && ogMeta.content) {
            t = ogMeta.content.trim();
        }
    }

    var f = getFavicon();
    var u = location.href.split('#')[0];

    if (u !== lastUrl) {
        return JSON.stringify({ title: '', favicon: f || '', url: u, pending: true });
    }

    var outTitle = '';
    var outFavicon = '';

    // Branch 1: already have a real title, confirm it matches
    if (hasTitle && lastTitle && isTitleMeaningful(t) && t === lastTitle) {
        outTitle = t;
    }
    // Branch 2: don't have a real title yet, and a meaningful one just appeared
    else if (!hasTitle && isTitleMeaningful(t) && t !== preNavTitle) {
        outTitle = t;
        lastTitle = t;
        hasTitle = true;
    }
    // Branch 3: hasTitle was forced true by nav polling timeout but lastTitle is empty,
    // and a meaningful title just appeared — accept it
    else if (hasTitle && !lastTitle && isTitleMeaningful(t) && t !== preNavTitle) {
        outTitle = t;
        lastTitle = t;
    }

    if (hasFavicon && f) {
        outFavicon = f;
        if (f !== lastFavicon) lastFavicon = f;
    } else if (!hasFavicon && f) {
        outFavicon = f;
        lastFavicon = f;
        hasFavicon = true;
    }

    return JSON.stringify({
        title: outTitle,
        favicon: outFavicon,
        url: u
    });
};
```

关键变更：
1. 在函数开头添加 `og:title` 兜底检查
2. Branch 1 增加 `lastTitle` 非空检查（避免 `hasTitle` 强制 bug 时错误匹配空字符串）
3. 新增 Branch 3：当 `hasTitle` 为 true 但 `lastTitle` 为空（由 nav polling 强制），且新标题到来时——接受它

- [ ] **Step 2: 验证编译**

Run: `cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life" && cargo check -p adl-browser 2>&1`
Expected: `Compiling adl-browser ... Finished`

---

### Task 5: 前端 HTTP prefetch 重试

**File:** `frontend/src/app/features/browser/useBrowserUrlChange.ts`

- [ ] **Step 1: 添加重试逻辑**

找到 `prefetchPageMeta(normalizedUrl).then(...)` 调用块（line 282-330）。在 `.then` 内部，当 `!meta?.title` 时添加重试：

```typescript
// Fetch real page title and favicon together via HTTP
const MAX_RETRIES = 3;
const RETRY_INTERVAL = 5000;
let retryCount = 0;

const tryPrefetch = (): void => {
  prefetchPageMeta(normalizedUrl).then((meta) => {
    const existingTimer = fallbackTimeoutsRef.current.get(normalizedUrl);
    if (existingTimer) {
      clearTimeout(existingTimer);
      fallbackTimeoutsRef.current.delete(normalizedUrl);
    }
    if (!meta?.title) {
      console.info(
        '[browser-debug] prefetchPageMeta: no title in result (attempt ' +
          (retryCount + 1) +
          '/' +
          MAX_RETRIES +
          ')'
      );
      retryCount++;
      if (retryCount < MAX_RETRIES) {
        console.info(
          '[browser-debug] prefetchPageMeta: retrying in ' + RETRY_INTERVAL + 'ms'
        );
        setTimeout(tryPrefetch, RETRY_INTERVAL);
      }
      return;
    }
    console.info(
      '[browser-debug] prefetchPageMeta: title received (elapsed=' +
        Math.round(performance.now() - _urlChangeTs) +
        'ms):',
      meta.title
    );
    const s = useAppStore.getState();
    const activeTabId = s.browserActiveTabId;
    const tab = activeTabId
      ? s.browserTabs.find((t: BrowserTabState) => t.id === activeTabId)
      : undefined;

    if (tab && normalizeUrlForCompare(tab.url) === normalizedUrl) {
      console.info(
        '[browser-debug] prefetchPageMeta: tab.title:',
        tab.title,
        'meta.title:',
        meta.title,
        'same:',
        tab.title === meta.title
      );
      if (meta.favicon) {
        setCachedFavicon(normalizedUrl, meta.favicon);
      }
      if (tab.title !== meta.title) {
        s.browserUpdateTab(tab.id, { title: meta.title });
      }
      s.browserAddToHistory(normalizedUrl, meta.title);
      s.browserUpdateHistoryTitle(normalizedUrl, meta.title);
    } else if (!tab) {
      if (meta.favicon) {
        setCachedFavicon(normalizedUrl, meta.favicon);
      }
      s.browserNavigateActiveTab(normalizedUrl, meta.title);
    }
  });
};

tryPrefetch();
```

将原有的 `prefetchPageMeta(normalizedUrl).then(...)` 整个块（line 282-330）替换为上述代码。

- [ ] **Step 2: TypeScript 类型检查**

Run: `cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend" && npx tsc --noEmit 2>&1`
Expected: 无输出（通过）

- [ ] **Step 3: ESLint 检查**

Run: `cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend" && npx eslint . 2>&1`
Expected: 无错误输出

---

### Task 6: 最终验证

- [ ] **Step 1: Rust 完整检查**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life" && cargo check --workspace 2>&1
```

Expected: `Compiling ... Finished`

- [ ] **Step 2: Clippy**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life" && cargo clippy -p adl-browser 2>&1
```

Expected: `Checking adl-browser ... Finished`（无 warning）

- [ ] **Step 3: Rustfmt**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life" && cargo fmt --check 2>&1
```

Expected: 无 diff 输出

- [ ] **Step 4: 前端类型检查**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend" && npx tsc --noEmit 2>&1
```

Expected: 无输出

- [ ] **Step 5: 前端 ESLint**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend" && npx eslint . 2>&1
```

Expected: 无错误

- [ ] **Step 6: Prettier**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend" && npx prettier --write . 2>&1
```

Expected: 格式化完成
