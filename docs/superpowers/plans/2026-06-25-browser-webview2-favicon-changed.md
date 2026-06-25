# WebView2 原生 FaviconChanged 事件实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用 WebView2 原生 `FaviconChanged` 事件 + `FaviconUri` 属性，实现亚毫秒级的 favicon 检测，使 favicon 与标题同步更新。

**Architecture:** 新建 `setup_favicon_changed_handler()` 函数，与现有 `setup_document_title_handler()` 共享一个线程安全的 favicon URL 缓存。`FaviconChanged` 事件触发时将 favicon URL 写入缓存；`DocumentTitleChanged` 事件触发时从缓存读取 favicon URL，将标题和 favicon 一起发射到前端。需要一个 `ICoreWebView2_15` 的 COM 接口 cast——如果 WebView2 运行时版本不支持，cast 失败，静默回退到现有 postMessage/轮询机制。

**Tech Stack:** Rust, Tauri 2.x, Windows WebView2 (ICoreWebView2_15), webview2-com v0.38, windows v0.61, `std::sync::Mutex`, `std::collections::HashMap`

---

## 先决条件

工程师需要理解：
1. `ICoreWebView2_15` 是 WebView2 SDK 1.0.2950+ 引入的版本化接口——不是所有用户系统都支持。通过 `.cast::<ICoreWebView2_15>()` 尝试获取，失败时优雅降级
2. `FaviconChanged` 事件在导航完成或 `<link rel="icon">` 变化时触发，不携带 favicon URL 本身，URL 需通过 `FaviconUri()` 方法获取
3. `FaviconUri()` 返回 favicon 的 URL 字符串（`PWSTR`），可直接用于前端的 `<img>` 标签
4. 与 `DocumentTitleChanged` 的交互：`FaviconChanged` 可能在 `DocumentTitleChanged` 之前或之后触发。通过共享缓存确保两者同步

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|-------|
| `crates/browser/src/webview2_message.rs` | 修改 | 添加 `setup_favicon_changed_handler()` + 共享 favicon 缓存 |
| `crates/browser/src/browser_webview.rs` | 修改 | 在 `create()` 方法中调用新函数 |

---

## 实现任务

### Task 1: 添加 favicon 缓存和 FaviconChanged 事件处理函数

**Files:**
- Modify: `crates/browser/src/webview2_message.rs` (Windows `imp` 模块)

**背景**：需要在模块级别添加一个线程安全的 favicon URL 缓存，一个供 `FaviconChanged` 写入、`DocumentTitleChanged` 读取。

- [ ] **Step 1: 添加新的导入**

在现有导入块中添加 `ICoreWebView2_15`：

```rust
use webview2_com::FaviconChangedEventHandler;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2, ICoreWebView2FaviconChangedEventHandler,
    ICoreWebView2WebMessageReceivedEventArgs, ICoreWebView2_15, ICoreWebView2_2,
};
```

注意：`ICoreWebView2FaviconChangedEventHandler` 是 `FaviconChangedEventHandler` 底层包装的 COM 接口，用于 `add_FaviconChanged` 的类型参数。

- [ ] **Step 2: 添加共享 favicon 缓存**

在 `DOCUMENT_TITLE_CHANGED_COUNT` 静态变量之后添加：

```rust
use std::collections::HashMap;
use std::sync::Mutex;

static FAVICON_CACHE: once_cell::sync::Lazy<Mutex<HashMap<String, String>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));
```

注意：需要 `once_cell` crate。在 `crates/browser/Cargo.toml` 中添加：

```toml
once_cell = "1"
```

或者使用 Rust nightly 的 `std::sync::LazyLock`，但 `once_cell` 兼容性更好。

- [ ] **Step 3: 添加 `FaviconChangedEventHandler` 静态计数器**

```rust
static FAVICON_CHANGED_COUNT: AtomicU64 = AtomicU64::new(0);
```

- [ ] **Step 4: 添加 `setup_favicon_changed_handler()` 函数**

在 `setup_document_title_handler()` 函数之后（仍在 `mod imp` 块内）添加：

```rust
pub fn setup_favicon_changed_handler(webview: Webview) -> Result<(), String> {
    let app = webview.app_handle().clone();
    info!("[ADL-META-RECV] Method 4 (FaviconChanged): setting up handler");

    let result = webview.with_webview(move |platform_wv| {
        unsafe {
            let controller = platform_wv.controller();

            let core = match controller.CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    error!(
                        "[ADL-META-RECV] Method 4 (FaviconChanged): FAILED to get CoreWebView2: {}",
                        e
                    );
                    return;
                }
            };

            // ICoreWebView2_15 is required for add_FaviconChanged + FaviconUri
            let core15: ICoreWebView2_15 = match core.cast() {
                Ok(c) => c,
                Err(e) => {
                    warn!(
                        "[ADL-META-RECV] Method 4 (FaviconChanged): ICoreWebView2_15 not available (need SDK 1.0.2950+): {}, falling back to postMessage/poll",
                        e
                    );
                    return;
                }
            };

            let app_for_handler = app.clone();
            let handler = FaviconChangedEventHandler::create(Box::new(
                move |sender: Option<ICoreWebView2>,
                      _args: Option<IUnknown>| {
                    let Some(sender) = sender else {
                        return Ok(());
                    };

                    // Cast sender to ICoreWebView2_15 for FaviconUri access
                    let core15: ICoreWebView2_15 = match sender.cast() {
                        Ok(c) => c,
                        Err(_) => return Ok(()),
                    };

                    // Get favicon URL
                    let mut favicon_pwstr = windows::core::PWSTR::null();
                    if let Err(e) = core15.FaviconUri(&mut favicon_pwstr) {
                        debug!(
                            "[ADL-META-RECV] Method 4 (FaviconChanged): FaviconUri() failed: {}",
                            e
                        );
                        return Ok(());
                    }
                    let favicon = if favicon_pwstr.is_null() {
                        String::new()
                    } else {
                        take_pwstr(favicon_pwstr)
                    };
                    if favicon.is_empty() {
                        return Ok(());
                    }

                    // Get current URL for cache key
                    let mut url_pwstr = windows::core::PWSTR::null();
                    if let Err(e) = sender.Source(&mut url_pwstr) {
                        debug!(
                            "[ADL-META-RECV] Method 4 (FaviconChanged): Source() failed: {}",
                            e
                        );
                        return Ok(());
                    }
                    let url = if url_pwstr.is_null() {
                        String::new()
                    } else {
                        take_pwstr(url_pwstr)
                    };

                    // Update favicon cache
                    if !url.is_empty() {
                        if let Ok(mut cache) = FAVICON_CACHE.lock() {
                            cache.insert(url.clone(), favicon.clone());
                        }
                    }

                    // Get current document title
                    let mut title_pwstr = windows::core::PWSTR::null();
                    let title = if sender.DocumentTitle(&mut title_pwstr).is_ok()
                        && !title_pwstr.is_null()
                    {
                        let t = take_pwstr(title_pwstr);
                        if t.is_empty() { String::new() } else { t }
                    } else {
                        String::new()
                    };

                    let count = FAVICON_CHANGED_COUNT
                        .fetch_add(1, Ordering::Relaxed)
                        + 1;
                    info!(
                        "[ADL-META-RECV] ◄ Method 4 (FaviconChanged): RECEIVED ✓ (#{}) | favicon: {} | title: {} | url: {}",
                        count,
                        favicon.chars().take(50).collect::<String>(),
                         if title.is_empty() { "(empty)" } else { title.chars().take(30).collect::<String>() },
                        url.chars().take(80).collect::<String>()
                    );

                    // Emit onMetaChanged: include title if available, favicon always
                    if !title.is_empty() {
                        let _ = app_for_handler.emit(
                            "digital-life://browser-meta-changed",
                            serde_json::json!({
                                "title": title,
                                "favicon": favicon,
                                "url": url
                            }),
                        );
                    }

                    Ok(())
                },
            ));

            let mut token: EventRegistrationToken = 0;
            match core15.add_FaviconChanged(&handler, &mut token as *mut _ as *mut _) {
                Ok(_) => {
                    info!(
                        "[ADL-META-RECV] Method 4 (FaviconChanged): handler REGISTERED ✓ (token={}), NATIVE FAVICON DETECTION ENABLED",
                        token
                    );
                }
                Err(e) => {
                    warn!(
                        "[ADL-META-RECV] Method 4 (FaviconChanged): FAILED to register handler: {}, falling back",
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
                "[ADL-META-RECV] Method 4 (FaviconChanged): with_webview FAILED: {}, falling back",
                e
            );
            Err(format!("favicon changed handler setup failed: {}", e))
        }
    }
}
```

- [ ] **Step 5: 修改 `setup_document_title_handler()` 读取 favicon 缓存**

将现有 `setup_document_title_handler` 中的 `"favicon": ""` 替换为 favicon 缓存查询：

在 `setup_document_title_handler` 中，获取 URL 之后添加：

```rust
                        // Look up cached favicon for this URL
                        let favicon = if !url.is_empty() {
                            if let Ok(cache) = FAVICON_CACHE.lock() {
                                cache.get(&url).cloned().unwrap_or_default()
                            } else {
                                String::new()
                            }
                        } else {
                            String::new()
                        };
```

然后将 emit 块从：
```rust
                        let _ = app_for_handler.emit(
                            "digital-life://browser-meta-changed",
                            serde_json::json!({
                                "title": title,
                                "favicon": "",
                                "url": url
                            }),
                        );
```

改为：
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

同时修改日志行，在 title 和 url 之间添加 favicon 信息：

```rust
                        info!(
                            "[ADL-META-RECV] ◄ Method 3 (DocumentTitleChanged): RECEIVED ✓ (#{}) | title: {} | favicon: {} | url: {}",
                            count,
                            title.chars().take(50).collect::<String>(),
                            if favicon.is_empty() { "(empty)" } else { "✓" },
                            url.chars().take(80).collect::<String>()
                        );
```

- [ ] **Step 6: 验证编译**

Run: `cd ai-digital-life && cargo check -p adl-browser 2>&1 | tail -10`
Expected: 编译通过

### Task 2: 在 browser_webview.rs 中集成 FaviconChanged 处理程序

**Files:**
- Modify: `crates/browser/src/browser_webview.rs`

- [ ] **Step 1: 阅读现有集成点**

在 `create()` 方法中，第 105-112 行：

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

- [ ] **Step 2: 添加新调用**

需要引入 `setup_favicon_changed_handler` 函数。由于 `webview` 在 `setup_document_title_handler` 中被消费（move），需要调整 clone 策略：

```rust
if let Some(webview) = window.get_webview(BROWSER_WEBVIEW_LABEL) {
    if let Err(e) = crate::webview2_message::setup_webview2_messaging(webview.clone()) {
        tracing::warn!(error = %e, "webview2 messaging setup failed, using fallback");
    }
    if let Err(e) = crate::webview2_message::setup_document_title_handler(webview.clone()) {
        tracing::warn!(error = %e, "document title handler setup failed, using fallback");
    }
    if let Err(e) = crate::webview2_message::setup_favicon_changed_handler(webview) {
        tracing::warn!(error = %e, "favicon changed handler setup failed, using fallback");
    }
}
```

注意：`setup_document_title_handler` 现在使用 `webview.clone()` 而不是移动原始变量，以便 `setup_favicon_changed_handler` 能继续使用。

- [ ] **Step 3: 验证编译**

Run: `cd ai-digital-life && cargo check -p adl-browser 2>&1 | tail -5`
Expected: 编译通过

### Task 3: 在非 Windows 模块添加桩函数和导出

**Files:**
- Modify: `crates/browser/src/webview2_message.rs`

- [ ] **Step 1: 在非 Windows 模块添加桩函数**

在 `#[cfg(not(windows))]` 模块中添加：

```rust
pub fn setup_favicon_changed_handler(_webview: Webview) -> Result<(), String> {
    debug!("favicon changed handler not available on this platform (non-Windows), using fallback");
    Ok(())
}
```

- [ ] **Step 2: 更新导出**

```rust
pub use imp::{
    setup_document_title_handler, setup_favicon_changed_handler, setup_webview2_messaging,
};
```

- [ ] **Step 3: 验证编译**

Run: `cd ai-digital-life && cargo check -p adl-browser 2>&1 | tail -5`
Expected: 编译通过

### Task 4: 添加 `once_cell` 依赖

**Files:**
- Modify: `crates/browser/Cargo.toml`

- [ ] **Step 1: 阅读当前 Cargo.toml**

```toml
[dependencies]
adl-errors = { path = "../errors" }
serde.workspace = true
serde_json.workspace = true
tracing.workspace = true
tauri = { workspace = true, features = ["unstable"] }
url.workspace = true
urlencoding = "2.1"

[target.'cfg(windows)'.dependencies]
webview2-com = "0.38"
windows = "0.61"
windows-core = "0.61"
```

- [ ] **Step 2: 添加 `once_cell` 依赖**

在 `[dependencies]` 部分添加：

```toml
once_cell = "1"
```

- [ ] **Step 3: 验证编译**

Run: `cd ai-digital-life && cargo check -p adl-browser 2>&1 | tail -5`
Expected: 编译通过

### Task 5: 最终验证

- [ ] **Step 1: 完整的 clippy 检查**

Run: `cd ai-digital-life && cargo clippy -p adl-browser 2>&1 | tail -5`
Expected: 无错误，无警告

- [ ] **Step 2: 检查前端编译（未改动前端，但确认不会因编译缓存等原因出问题）**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1 | head -5`
Expected: 无输出（编译通过）

- [ ] **Step 3: 提交**

```bash
git add crates/browser/Cargo.toml crates/browser/src/webview2_message.rs crates/browser/src/browser_webview.rs
git commit -m "feat(browser): add WebView2 native FaviconChanged event handler

- Add setup_favicon_changed_handler() that subscribes to ICoreWebView2_15's
  native FaviconChanged event for zero-latency favicon detection
- Share a favicon URL cache between FaviconChanged and DocumentTitleChanged
  handlers so both title and favicon arrive in the same onMetaChanged event
- Requires ICoreWebView2_15 (SDK 1.0.2950+); falls back gracefully when
  the WebView2 runtime version is too old"
```

## 事件流程图

```
[导航到新页面]
    │
    ├── FaviconChanged 触发（新页面 favicon 不同时）
    │   └── FaviconUri() → 获取 favicon URL
    │       ├── 写入 FAVICON_CACHE[url]
    │       ├── DocumentTitle() → 获取标题
    │       └── 发射 onMetaChanged {title, favicon, url}
    │
    └── DocumentTitleChanged 触发（HTML <title> 解析完成或 JS 修改标题）
        ├── DocumentTitle() → 获取标题
        ├── Source() → 获取 URL
        ├── FAVICON_CACHE.get(url) → 读取缓存的 favicon
        └── 发射 onMetaChanged {title, favicon_or_empty, url}

[现有回退路径]
    Method 1 (postMessage): 继续运行，同时发射 title+favicon（前端有 2s 去重）
    Method 2 (Rust poll): 继续运行，作为跨平台备份
```

## 版本兼容性

| WebView2 运行时版本 | ICoreWebView2_15 cast | Method 4 状态 |
|---------------------|----------------------|--------------|
| < 1.0.2950（2024 年末） | 失败 | 回退到 postMessage/轮询 |
| ≥ 1.0.2950 | 成功 | 原生 favicon 事件启用 |

## 需要修改的 ICoreWebView2 接口

在 `setup_favicon_changed_handler` 中需要两个 cast：
1. `core.cast::<ICoreWebView2_15>()` — 初始注册时，获取高级接口来调用 `add_FaviconChanged`
2. `sender.cast::<ICoreWebView2_15>()` — 事件回调内部，获取高级接口来调用 `FaviconUri()`

第一个如果失败，整个 handler 跳过（提供警告日志）。
第二个如果失败，该次回调静默返回（日志记录 debug 级别）。

## 自检清单

**1. Spec coverage:**
- Task 1: 实现 `setup_favicon_changed_handler` + favicon cache ✓
- Task 1 Step 5: 修改 `setup_document_title_handler` 使用缓存 ✓
- Task 2: 在 `browser_webview.rs` 中集成 ✓
- Task 3: 非 Windows 桩函数 ✓
- Task 4: once_cell 依赖 ✓
- Task 5: 最终验证 ✓

**2. Placeholder scan:**
- 所有步骤包含完整代码 ✓
- 无 TBD/TODO ✓
- 文件路径准确 ✓
- 命令和预期输出明确 ✓

**3. Type consistency:**
- `setup_favicon_changed_handler(webview: Webview) -> Result<(), String>` — 与其他 handler 签名一致 ✓
- `FAVICON_CACHE: Lazy<Mutex<HashMap<String, String>>>` — URL → favicon URL ✓
- `FaviconChangedEventHandler::create(Box::new(move |sender: Option<ICoreWebView2>, _args: Option<IUnknown>| -> Result<()> { ... }))` — 匹配 callback.rs 中定义 ✓
- 导入 `ICoreWebView2_15` 和 `ICoreWebView2FaviconChangedEventHandler` 来自正确路径 ✓
