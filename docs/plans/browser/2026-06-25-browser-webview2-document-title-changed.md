# WebView2 原生 DocumentTitleChanged 事件实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用 WebView2 原生 `DocumentTitleChanged` 事件替代/补充现有的 JS postMessage + Rust 轮询的标题检测机制，将 SPA 页面标题变更的检测延迟从 3.9 秒降低到亚毫秒级。

**Architecture:** 在现有 `webview2_message.rs` 的 Windows 模块中添加一个新的 `setup_document_title_handler()` 函数。该函数在 WebView2 控制器初始化后获取 `ICoreWebView2` 接口，通过其原生 COM API 订阅 `DocumentTitleChanged` 事件。事件触发时通过 `sender.DocumentTitle()` 和 `sender.Source()` 获取标题和 URL，通过 Tauri event 发射到前端。macOS/Linux 上该模块为 no-op，回退到现有的 postMessage/轮询机制。

**Tech Stack:** Rust, Tauri 2.x, Windows WebView2 (ICoreWebView2), webview2-com v0.38, windows v0.61

---

## 先决条件

在开始前，工程师需要理解：
1. `crates/browser/src/webview2_message.rs` 现有的 `setup_webview2_messaging()` 函数模式——它通过 `webview.with_webview()` 的闭包获取平台 WebView 控制器，获取 `ICoreWebView2`，注册 COM 事件处理程序
2. WebView2 COM API 的 `DocumentTitleChanged` 事件：当 `document.title` 变化时由 WebView2 原生触发，不依赖任何 JS 注入
3. `#[cfg(windows)]` 条件编译模式——整个模块在非 Windows 平台上是 no-op

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|-------|
| `crates/browser/src/webview2_message.rs` | 修改 | 添加 `setup_document_title_handler()` 函数，在现有 Windows `imp` 模块内部 |
| `crates/browser/src/browser_webview.rs` | 修改 | 在 `create()` 方法中调用 `setup_document_title_handler()` |

无需新建文件——所有改动集中在现有模块中。

---

## 实现任务

### Task 1: 在 webview2_message.rs 中添加 DocumentTitleChanged 事件处理函数

**Files:**
- Modify: `crates/browser/src/webview2_message.rs` (在现有的 Windows imp 模块内部)

- [ ] **Step 1: 在 Windows imp 模块中阅读现有导入和类型别名**

当前文件结构：
```rust
#[cfg(windows)]
mod imp {
    use std::sync::atomic::{AtomicU64, Ordering};
    use tauri::{Emitter, Manager, Webview};
    use tracing::{debug, error, info, warn};
    use webview2_com::take_pwstr;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2WebMessageReceivedEventArgs, ICoreWebView2_2,
    };
    use windows::core::Interface;

    type EventRegistrationToken = i64;

    // ... existing functions ...
}
```

验证：
- `webview2_com::take_pwstr` 已导入（用于将 `PWSTR` 转为 `String`）
- `ICoreWebView2` 已导入（`DocumentTitle` 和 `Source` 方法在此接口上）
- `EventRegistrationToken` 类型别名为 `i64`
- `windows::core::Interface` 已导入（用于 `.cast()`）

- [ ] **Step 2: 添加新的导入**

在 `webview2_com::Microsoft::Web::WebView2::Win32::` 导入块中添加：
- 无需添加——`add_DocumentTitleChanged`, `DocumentTitle`, `Source` 已经在 `ICoreWebView2` 上可用

在 `use webview2_com::` 导入中添加：
```rust
use webview2_com::DocumentTitleChangedEventHandler;
```

同时需要添加 `use windows::core::IUnknown;`——因为 `DocumentTitleChanged` 事件的 args 参数是 `IUnknown` 类型：
```rust
use windows::core::{Interface, IUnknown};
```

运行 `cargo check -p adl-browser` 确认编译通过。

预期：提示 `unused import` 警告因为还没使用这些导入——这是正常的。

- [ ] **Step 3: 添加 `setup_document_title_handler()` 函数**

在现有的 `setup_webview2_messaging()` 函数之后，添加新函数：

```rust
/// 注册 WebView2 原生 DocumentTitleChanged 事件处理程序。
///
/// 当 document.title 变化时，WebView2 以亚毫秒延迟触发此事件。
/// 这是检测页面标题变化的最可靠和最快的方法。
///
/// 在 WebView2 runtime 版本较旧时不注册（静默回退到 postMessage/轮询）。
pub fn setup_document_title_handler(webview: Webview) -> Result<(), String> {
    let app = webview.app_handle().clone();
    info!("[ADL-META-RECV] Method 3 (DocumentTitleChanged): setting up handler");

    let result = webview.with_webview(move |platform_wv| {
        unsafe {
            let controller = platform_wv.controller();

            let core = match controller.CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    error!(
                        "[ADL-META-RECV] Method 3 (DocumentTitleChanged): FAILED to get CoreWebView2: {}",
                        e
                    );
                    return;
                }
            };

            let app_for_handler = app.clone();
            let handler = DocumentTitleChangedEventHandler::create(Box::new(
                move |sender: Option<ICoreWebView2>,
                      _args: Option<IUnknown>| {
                    let Some(sender) = sender else {
                        return Ok(());
                    };

                    // 获取文档标题
                    let mut title_pwstr = windows::core::PWSTR::null();
                    if let Err(e) = sender.DocumentTitle(&mut title_pwstr) {
                        debug!(
                            "[ADL-META-RECV] Method 3 (DocumentTitleChanged): DocumentTitle() failed: {}",
                            e
                        );
                        return Ok(());
                    }
                    if title_pwstr.is_null() {
                        return Ok(());
                    }
                    let title = take_pwstr(title_pwstr);
                    if title.is_empty() {
                        return Ok(());
                    }

                    // 获取当前 URL
                    let mut url_pwstr = windows::core::PWSTR::null();
                    if let Err(e) = sender.Source(&mut url_pwstr) {
                        debug!(
                            "[ADL-META-RECV] Method 3 (DocumentTitleChanged): Source() failed: {}",
                            e
                        );
                        return Ok(());
                    }
                    let url = if url_pwstr.is_null() {
                        String::new()
                    } else {
                        take_pwstr(url_pwstr)
                    };

                    let count = DOCUMENT_TITLE_CHANGED_COUNT
                        .fetch_add(1, Ordering::Relaxed)
                        + 1;
                    info!(
                        "[ADL-META-RECV] ◄ Method 3 (DocumentTitleChanged): RECEIVED ✓ (#{}) | title: {} | url: {}",
                        count,
                        title.chars().take(50).collect::<String>(),
                        url.chars().take(80).collect::<String>()
                    );

                    let _ = app_for_handler.emit(
                        "digital-life://browser-meta-changed",
                        serde_json::json!({
                            "title": title,
                            "favicon": "",
                            "url": url
                        }),
                    );

                    Ok(())
                },
            ));

            let mut token: EventRegistrationToken = 0;
            match core.add_DocumentTitleChanged(&handler, &mut token as *mut _ as *mut _) {
                Ok(_) => {
                    info!(
                        "[ADL-META-RECV] Method 3 (DocumentTitleChanged): handler REGISTERED ✓ (token={}), NATIVE TITLE DETECTION ENABLED",
                        token
                    );
                }
                Err(e) => {
                    warn!(
                        "[ADL-META-RECV] Method 3 (DocumentTitleChanged): FAILED to register handler: {}, WebView2 runtime may be too old",
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
                "[ADL-META-RECV] Method 3 (DocumentTitleChanged): with_webview FAILED: {}, falling back",
                e
            );
            Err(format!("document title handler setup failed: {}", e))
        }
    }
}
```

- [ ] **Step 4: 添加静态计数器**

在模块顶部（`POSTMESSAGE_RECEIVED_COUNT` 之后）添加：

```rust
static DOCUMENT_TITLE_CHANGED_COUNT: AtomicU64 = AtomicU64::new(0);
```

- [ ] **Step 5: 验证编译**

Run: `cd ai-digital-life && cargo check -p adl-browser 2>&1 | tail -5`
Expected: 编译通过，无错误

### Task 2: 在 browser_webview.rs 中集成 DocumentTitleChanged 处理程序

**Files:**
- Modify: `crates/browser/src/browser_webview.rs` (第 105-108 行附近)

- [ ] **Step 1: 理解现有集成点**

当前在 `browser_webview.rs:create()` 方法中，第 105-108 行：
```rust
if let Some(webview) = window.get_webview(BROWSER_WEBVIEW_LABEL) {
    if let Err(e) = crate::webview2_message::setup_webview2_messaging(webview.clone()) {
        tracing::warn!(error = %e, "webview2 messaging setup failed, using fallback");
    }
}
```

新函数 `setup_document_title_handler` 也接受 `Webview` 参数，使用同一个 `webview` 引用。

- [ ] **Step 2: 添加新调用**

在 `setup_webview2_messaging` 调用之后添加：

```rust
if let Some(webview) = window.get_webview(BROWSER_WEBVIEW_LABEL) {
    if let Err(e) = crate::webview2_message::setup_webview2_messaging(webview.clone()) {
        tracing::warn!(error = %e, "webview2 messaging setup failed, using fallback");
    }
    if let Err(e) = crate::webview2_message::setup_document_title_handler(webview.clone()) {
        tracing::warn!(error = %e, "document title handler setup failed, using fallback");
    }
}
```

注意：两个调用使用同一个 `webview` 变量（先 `clone` 再传给 `setup_webview2_messaging`，然后 `setup_document_title_handler` 用原始变量或再次 clone 后的变量）。

最佳写法（避免 clone 两次）：
```rust
if let Some(webview) = window.get_webview(BROWSER_WEBVIEW_LABEL) {
    if let Err(e) = crate::webview2_message::setup_webview2_messaging(webview.clone()) {
        tracing::warn!(error = %e, "webview2 messaging setup failed, using fallback");
    }
    if let Err(e) = crate::webview2_message::setup_document_title_handler(webview) {
        tracing::warn!(error = %e, "document title handler setup failed, using fallback");
    }
}
```

- [ ] **Step 3: 验证编译**

Run: `cd ai-digital-life && cargo check -p adl-browser 2>&1 | tail -5`
Expected: 编译通过

### Task 3: 添加 `IUnknown` 导入到 webview2_message.rs

**Files:**
- Modify: `crates/browser/src/webview2_message.rs`

- [ ] **Step 1: 确认导入完整**

如果 Task 1 步骤 2 中的 `IUnknown` 导入导致编译错误，检查 `windows` crate 中 `IUnknown` 的正确导入路径。

在 `windows v0.61` 中，`IUnknown` 位于 `windows::core::IUnknown`。

修改导入行：
```rust
use windows::core::{Interface, IUnknown};
```

- [ ] **Step 2: 确认编译**

Run: `cd ai-digital-life && cargo check -p adl-browser 2>&1 | tail -5`
Expected: 编译通过

### Task 4: 添加 favicon 支持（可选增强）

**Files:**
- Modify: `crates/browser/src/webview2_message.rs`

**背景**：`DocumentTitleChanged` 事件只提供标题，不提供 favicon。目前 `onMetaChanged` 的 payload 包含 `favicon` 字段（空字符串）。为了使 `handlePageMeta` 能同时更新 favicon，我们可以从缓存中获取 favicon。

- [ ] **Step 1: 理解 favicon 缓存机制**

现有的 favicon 缓存位于 `frontend/src/app/utils/fetchPageMeta.ts` 中的 `faviconUrlCache` Map。这是一个前端侧的缓存。

Rust 侧目前没有 favicon 缓存。所有 favicon 相关逻辑都在前端处理。

- [ ] **Step 2: 决定 favicon 策略**

方案 A（推荐，更简单）：Rust 侧发射 `favicon: ""`，让前端 `handlePageMeta` 正常处理——它只更新标题和历史记录，favicon 由 postMessage/轮询路径在未来到达时更新。

方案 B：在 Rust 侧维护一个轻量级 favicon 缓存（`HashMap<String, String>`），当 `setup_webview2_messaging` 的 postMessage 处理程序收到 favicon 后缓存，`DocumentTitleChanged` 事件中读取该缓存。

**选择方案 A**。理由：
- 保持 `DocumentTitleChanged` 事件处理程序轻量、无状态
- favicon 延迟到达对用户体验影响远小于标题延迟
- 方案 B 引入共享状态，增加复杂度

无需代码改动。

### Task 5: Rust 端元数据路径去重

**Files:**
- Modify: `crates/browser/src/webview2_message.rs`
- Modify: `crates/browser/src/browser_webview.rs`（轮询部分）

**背景**：现在有三个并发源发射 `onMetaChanged` 事件：
1. Method 1: postMessage（init script 检测到 document.title 变化后通过 chrome.webview.postMessage 发送）
2. Method 2: Rust 轮询（fetch_script 评估 + hash 解析）
3. Method 3: DocumentTitleChanged（原生 COM 事件）

前端的 `useBrowserPageMeta.ts` 已经有 2 秒去重窗口（`META_DEDUP_TTL`），但在高并发下仍可能触发不必要的渲染。

- [ ] **Step 1: 确认前端去重足够**

查看 `useBrowserPageMeta.ts` 中的 `META_DEDUP_TTL = 2000`（毫秒）。三个路径发射同一 URL 的标题变化时：
- Method 3（最快）：title 变化后立即发射
- Method 1（稍慢）：~0-10ms 延迟（取决于 postMessage 队列）
- Method 2（最慢）：~100ms - 5s 延迟（取决于轮询模式）

前端的 `isMetaRecentlyProcessed()` 使用 `hostnamePathKey()` 进行路径级去重。即使三个事件都在 2s 内到达，前端只处理第一个，忽略后续重复。

**无需 Rust 侧去重。** 前端去重已足够。

### Task 6: 完整集成测试

- [ ] **Step 1: 清理之前的增量编译缓存**

Run: `cd ai-digital-life && cargo check -p adl-browser 2>&1 | tail -5`
Expected: 编译通过，无 warning

- [ ] **Step 2: 验证所有三个路径的日志**

启动 Tauri 应用后，打开浏览器面板，导航到任意网站。在控制台/日志中确认看到：

```
[ADL-META-RECV] Method 3 (DocumentTitleChanged): handler REGISTERED ✓
```

导航到 bilibili 视频页，确认看到：

```
[ADL-META-RECV] ◄ Method 3 (DocumentTitleChanged): RECEIVED ✓ (#1) | title: 汀兰欲飞 ... | url: https://www.bilibili.com/video/BV1xxx
```

确认前端标签标题被及时更新（延迟应 < 100ms 而非 3.9s）。

- [ ] **Step 3: 回退路径验证**

在非 Windows 平台（或禁用 WebView2 时），确认：
```
[ADL-META-RECV] Method 3 (DocumentTitleChanged): with_webview FAILED: ..., falling back
```
或（非 Windows）无日志（`#[cfg(not(windows))]` no-op）。

- [ ] **Step 4: 提交**

```bash
git add crates/browser/src/webview2_message.rs crates/browser/src/browser_webview.rs
git commit -m "feat(browser): add WebView2 native DocumentTitleChanged event handler

- Add setup_document_title_handler() that subscribes to ICoreWebView2's
  native DocumentTitleChanged event for zero-latency title detection
- Register the handler alongside existing postMessage and poll mechanisms
- The native event fires immediately when document.title changes,
  bypassing SPA JS execution delay for browser tab title updates"
```

### Task 7: favicon 增强（可选，根据测试结果决定是否实施）

**如果测试发现**：标题更新延迟到亚毫秒级，但 favicon 仍然延迟（因为 Method 3 发射空 `favicon`），而用户期望 favicon 和标题同时更新，则实施此任务。

- [ ] **Step 1: 在 webview2_message.rs 中添加轻量级 favicon 缓存**

在 `setup_webview2_messaging` 的 postMessage 处理程序中，当收到 favicon 时存入线程安全的缓存：

```rust
use std::sync::Mutex;
use std::collections::HashMap;

static FAVICON_CACHE: once_cell::sync::Lazy<Mutex<HashMap<String, String>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

pub fn cache_favicon(url: &str, favicon: &str) {
    if let Ok(mut cache) = FAVICON_CACHE.lock() {
        cache.insert(url.to_string(), favicon.to_string());
    }
}

pub fn get_cached_favicon(url: &str) -> Option<String> {
    if let Ok(cache) = FAVICON_CACHE.lock() {
        cache.get(url).cloned()
    } else {
        None
    }
}
```

注意：需要添加 `once_cell` 依赖（如果尚未在 `Cargo.toml` 中）。或者在 `adl-browser` crate 的 `Cargo.toml` 中添加：

```toml
once_cell = "1"
```

或者使用 Rust 标准库（v1.80+）的 `std::sync::LazyLock`，但为了兼容性推荐 `once_cell`。

- [ ] **Step 2: 在 postMessage 处理程序中添加 favicon 缓存**

在 `webview2_message.rs` 的 postMessage 处理程序中，当解析到 favicon 时，调用 `cache_favicon(url, favicon)`。

- [ ] **Step 3: 在 DocumentTitleChanged 处理程序中查询 favicon 缓存**

在 `setup_document_title_handler` 中，获取标题和 URL 后，查询缓存：

```rust
let favicon = get_cached_favicon(&url).unwrap_or_default();
```

并在 emit 中使用：
```rust
let _ = app_for_handler.emit(
    "digital-life://browser-meta-changed",
    serde_json::json!({
        "title": title,
        "favicon": favicon,
        "url": url
    }),
);
```

- [ ] **Step 4: 验证编译**

Run: `cd ai-digital-life && cargo check -p adl-browser 2>&1 | tail -5`

- [ ] **Step 5: 提交**

```bash
git add crates/browser/Cargo.toml crates/browser/src/webview2_message.rs
git commit -m "feat(browser): add favicon cache for DocumentTitleChanged handler

- Cache favicons received via postMessage in a thread-safe HashMap
- Read cached favicon in DocumentTitleChanged handler to emit both
  title and favicon simultaneously"
```

## 自检清单

**1. Spec coverage:**
- Task 1: 实现 `setup_document_title_handler` 函数 ✓
- Task 2: 在 `browser_webview.rs` 中集成 ✓
- Task 3: 导入 `IUnknown` ✓
- Task 4: favicon 策略决策 ✓
- Task 5: 去重分析 ✓
- Task 7: favicon 增强（可选） ✓

无遗漏需求。

**2. Placeholder scan:**
- 所有步骤包含完整代码 ✓
- 无 "TBD"、"TODO"、"implement later" ✓
- 测试步骤包含具体命令和预期输出 ✓
- 所有文件路径准确 ✓

**3. Type consistency:**
- `setup_document_title_handler(webview: Webview) -> Result<(), String>` — 与 `setup_webview2_messaging` 签名完全一致 ✓
- 闭包参数 `(sender: Option<ICoreWebView2>, _args: Option<IUnknown>)` — 匹配 `ICoreWebView2DocumentTitleChangedEventHandler::Invoke` 签名 ✓
- `EventRegistrationToken = i64` — 与现有类型一致 ✓
- `take_pwstr` — 已在模块中导入 ✓
