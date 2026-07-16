# 浏览器元数据闪烁和延迟优化计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解决 favicon 闪烁、自动连播时旧标题闪现、多源重复事件、FaviconChanged 回调 `DocumentTitle()` 为空等问题。

**Architecture:** Rust 侧处理去重、旧标题检测、FaviconChanged 逻辑简化；前端侧处理 favicon 预加载顺序和过渡动画。四个独立问题各自修改对应文件，互不依赖。

**Tech Stack:** Rust (webview2_message.rs), TypeScript+React (BrowserFavicon.tsx, fetchPageMeta.ts, handlePageMeta)

---

## 问题清单

| # | 问题 | 根因 | 影响 |
|---|------|------|------|
| 1 | FaviconChanged 回调 `DocumentTitle()` 为空 | WebView2 行为：FaviconChanged 时 DocumentTitle 属性可能尚未填充 | Method 4 不发射，favicon 靠 postMessage 补上（~100ms 延迟） |
| 2 | 自动连播旧标题闪现 564ms | pushState 后 `document.title` 仍为旧页面标题，Rust 端直接发射 | 用户看到 564ms 的错误标题 |
| 3 | 多源重复事件 | Method 1/3/4 对同一数据独立发射 | 无额外处理开销，但日志冗余 |
| 4 | favicon 闪烁 | `setCachedFavicon` 在图片预加载之前更新缓存，导致 `BrowserFavicon` 立刻用新 URL 渲染 | 用户看到 <img> src 切换时的短暂空白/闪烁 |

---

## 文件结构

| 文件 | 操作 | 解决的问题 |
|------|------|------------|
| `crates/browser/src/webview2_message.rs` | 修改 | #1, #2, #3 |
| `frontend/src/app/utils/fetchPageMeta.ts` | 修改 | #4 |
| `frontend/src/app/features/browser/BrowserFavicon.tsx` | 修改 | #4 |
| `frontend/src/app/features/browser/BrowserTabBar.tsx` | 修改 | #4 |

---

## 实现任务

### Task 1: FaviconChanged 处理函数简化 + 共享去重状态

**Files:**
- Modify: `crates/browser/src/webview2_message.rs` (Windows `imp` 模块)

**背景**: 当前 `setup_favicon_changed_handler()` 在回调中尝试 `sender.DocumentTitle()` 并发射事件。但 WebView2 的 FaviconChanged 回调中 `DocumentTitle` 经常返回空，导致发射被跳过。更好的设计：**只做缓存，不发射**。标题由 DocumentTitleChanged 回调负责发射（它已经能从 `FAVICON_CACHE` 读取 favicon）。

同时，为问题 #2 和 #3 添加：追踪 `(URL, title)` 对用于旧标题检测和重复发射抑制。

- [ ] **Step 1: 添加新的去重状态变量**

在 `FAVICON_CHANGED_COUNT` 之后添加：

```rust
use std::time::Instant;

/// 去重：追踪最近一次发射的 (url, title) 和时间戳
static LAST_EMIT_URL: Mutex<String> = Mutex::new(String::new());
static LAST_EMIT_TITLE: Mutex<String> = Mutex::new(String::new());
static LAST_EMIT_TIME: Mutex<Instant> = Mutex::new(Instant::now());

/// 去重窗口：相同 (url, title) 在 N 毫秒内不重复发射
const EMIT_DEDUP_MS: u64 = 1000;
```

- [ ] **Step 2: 添加去重辅助函数**

```rust
/// 检查是否应该发射。三种情况跳过：
/// 1. 重复发射：同 url+title 在 EMIT_DEDUP_MS 内
/// 2. 旧标题：URL 变了但 title 与上次相同（pushState 旧标题残留）
/// 3. 空标题
fn should_emit_and_update(url: &str, title: &str) -> bool {
    if title.is_empty() {
        return false;
    }

    let now = Instant::now();

    if let Ok(last_url) = LAST_EMIT_URL.lock() {
        if let Ok(last_title) = LAST_EMIT_TITLE.lock() {
            if let Ok(last_time) = LAST_EMIT_TIME.lock() {
                // Case 1: 重复发射抑制（同 url + title）
                if *last_url == url && *last_title == title && now.duration_since(*last_time).as_millis() as u64 < EMIT_DEDUP_MS {
                    return false;
                }
                // Case 2: 旧标题检测（URL 变了但 title 没变）
                if *last_url != url && *last_title == title {
                    return false;
                }
            }
        }
    }

    // 更新状态
    if let Ok(mut last_url) = LAST_EMIT_URL.lock() {
        *last_url = url.to_string();
    }
    if let Ok(mut last_title) = LAST_EMIT_TITLE.lock() {
        *last_title = title.to_string();
    }
    if let Ok(mut last_time) = LAST_EMIT_TIME.lock() {
        *last_time = now;
    }

    true
}
```

- [ ] **Step 3: 简化 FaviconChanged 处理函数**

将 `setup_favicon_changed_handler` 回调简化为：只缓存 favicon，不获取标题，不发射事件。

替换回调闭包内容（从 `move |sender: Option<ICoreWebView2>, _args: Option<IUnknown>|` 开始）：

```rust
move |sender: Option<ICoreWebView2>,
      _args: Option<IUnknown>| {
    let Some(sender) = sender else {
        return Ok(());
    };

    let core15: ICoreWebView2_15 = match sender.cast() {
        Ok(c) => c,
        Err(_) => return Ok(()),
    };

    // 获取 favicon URL
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

    // 获取当前 URL 作为缓存键
    let mut url_pwstr = windows::core::PWSTR::null();
    if let Err(e) = sender.Source(&mut url_pwstr) {
        return Ok(());
    }
    let url = if url_pwstr.is_null() {
        String::new()
    } else {
        take_pwstr(url_pwstr)
    };

    // 写入 favicon 缓存（不发射事件，标题由 DocumentTitleChanged 负责）
    if !url.is_empty() {
        if let Ok(mut cache) = FAVICON_CACHE.lock() {
            cache.insert(url.clone(), favicon.clone());
        }
    }

    let count = FAVICON_CHANGED_COUNT
        .fetch_add(1, Ordering::Relaxed)
        + 1;
    debug!(
        "[ADL-META-RECV] ◄ Method 4 (FaviconChanged): CACHED ✓ (#{}) | favicon: {} | url: {}",
        count,
        favicon.chars().take(50).collect::<String>(),
        url.chars().take(80).collect::<String>()
    );

    Ok(())
}
```

同时应将 info 日志改为 debug 级别（因为不再发射事件，属于内部机制）。

- [ ] **Step 4: 修改 `setup_document_title_handler` 使用去重检查**

在 `setup_document_title_handler` 的闭包中，获取 title、url 和 favicon 之后，发射事件之前，添加：

```rust
// 去重 + 旧标题检测
if !should_emit_and_update(&url, &title) {
    debug!(
        "[ADL-META-RECV] Method 3 (DocumentTitleChanged): SKIPPED (stale/duplicate) | title: {} | url: {}",
        title.chars().take(50).collect::<String>(),
        url.chars().take(80).collect::<String>()
    );
    return Ok(());
}
```

- [ ] **Step 5: 同样的去重检查应用到 postMessage 处理函数**

在 `setup_webview2_messaging` 的 postMessage 闭包中，解析到 title 和 url 后，发射事件之前添加：

```rust
// 去重 + 旧标题检测
if !should_emit_and_update(&url, &title) {
    debug!(
        "[ADL-META-RECV] Method 1 (postMessage): SKIPPED (stale/duplicate) | title: {} | url: {}",
        title.chars().take(50).collect::<String>(),
        url.chars().take(80).collect::<String>()
    );
    return Ok(());
}
```

注意：需要将 postMessage 的 title/favicon/url 提取移到这个检查之前。

- [ ] **Step 6: 验证编译**

Run: `cd ai-digital-life && cargo check -p adl-browser 2>&1 | tail -5`
Expected: 编译通过

### Task 2: Frontend favicon 预加载顺序修复

**Files:**
- Modify: `frontend/src/app/utils/fetchPageMeta.ts`

- [ ] **Step 1: 阅读现有代码**

读取 `frontend/src/app/utils/fetchPageMeta.ts`，找到 `setCachedFavicon` 函数。

```ts
export function setCachedFavicon(url: string, favicon: string, pin?: boolean): void {
```

- [ ] **Step 2: 阅读 `useBrowserPageMeta.ts` 中 `handlePageMeta` 的 favicon 处理**

关键部分：
```ts
if (meta.favicon) {
    const existingFavicon = getCachedFavicon(cleanUrl);
    if (shouldReplaceFavicon(existingFavicon, meta.favicon)) {
        setCachedFavicon(cleanUrl, meta.favicon);
        new Image().src = meta.favicon;
    }
}
```

当前顺序：先更新缓存，再开始加载图片。这导致缓存一旦更新，UI 立即用新 URL 渲染 `<img>`，但图片尚未加载，产生闪烁。

- [ ] **Step 3: 修改为预加载后更新缓存**

```ts
if (meta.favicon) {
    const existingFavicon = getCachedFavicon(cleanUrl);
    if (shouldReplaceFavicon(existingFavicon, meta.favicon)) {
        // 先预加载图片，加载成功后再更新缓存
        const img = new Image();
        img.onload = () => {
            setCachedFavicon(cleanUrl, meta.favicon);
        };
        img.onerror = () => {
            // 即使加载失败也更新缓存（URL 可能在其他上下文中有效）
            setCachedFavicon(cleanUrl, meta.favicon);
        };
        img.src = meta.favicon;
    }
}
```

- [ ] **Step 4: 验证前端编译**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1 | head -5 && npx eslint . 2>&1 | head -5`
Expected: 编译通过，无 ESLint 错误

### Task 3: Frontend favicon 图片过渡动画

**Files:**
- Modify: `frontend/src/app/components/BrowserFavicon.tsx`
- Modify: `frontend/src/app/features/browser/BrowserTabBar.tsx`

- [ ] **Step 1: 在 BrowserFavicon.tsx 的 `<img>` 上添加 CSS 过渡**

将 `<img>` 元素的渲染改为：

```tsx
<img
  src={faviconUrl}
  alt=""
  className="adl-browser-tree__favicon"
  style={{
    width: size,
    height: size,
    transition: 'opacity 0.15s ease-in-out',
  }}
  // ... existing onError, onLoad handlers
/>
```

- [ ] **Step 2: 在 BrowserTabBar.tsx 的 favicon `<img>` 上添加 CSS 过渡**

```tsx
<img
  src={faviconUrl}
  alt=""
  className="adl-tool-list__favicon"
  style={{ transition: 'opacity 0.15s ease-in-out' }}
  // ... existing onError handler
/>
```

- [ ] **Step 3: 验证前端编译**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1 | head -5 && npx eslint . 2>&1 | head -5`
Expected: 编译通过

### Task 4: 最终验证

- [ ] **Step 1: Rust 最终检查**

Run: `cd ai-digital-life && cargo check -p adl-browser 2>&1 | tail -5 && cargo clippy -p adl-browser 2>&1 | tail -5`
Expected: 编译通过，无警告

- [ ] **Step 2: Frontend 最终检查**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit 2>&1 | head -5 && npx eslint . 2>&1 | head -5`
Expected: 编译通过，无 ESLint 警告

- [ ] **Step 3: 提交**

```bash
git add crates/browser/src/webview2_message.rs frontend/src/app/utils/fetchPageMeta.ts frontend/src/app/components/BrowserFavicon.tsx frontend/src/app/features/browser/BrowserTabBar.tsx
git commit -m "fix(browser): fix favicon flicker, stale title on pushState, and meta dedup

- Simplify FaviconChanged handler: only cache favicon, don't emit
- Add shared dedup tracker to suppress duplicate and stale title events
- Preload favicon image before updating cache to prevent flicker
- Add CSS opacity transition to favicon img elements"
```

## 自检清单

**1. Spec coverage:**
- Task 1 Step 1-2: 去重状态和 `should_emit_and_update` 函数 ✓
- Task 1 Step 3: FaviconChanged 简化（只缓存） ✓
- Task 1 Step 4: DocumentTitleChanged 使用去重 ✓
- Task 1 Step 5: postMessage 使用去重 ✓
- Task 2: favicon 预加载顺序修复 ✓
- Task 3: CSS 过渡动画 ✓

**2. Placeholder scan:**
- 所有步骤包含完整代码 ✓
- 所有命令和预期输出明确 ✓
- 文件路径准确 ✓

**3. Type consistency:**
- `should_emit_and_update(url: &str, title: &str) -> bool` — 签名明确 ✓
- `LAST_EMIT_URL`, `LAST_EMIT_TITLE`, `LAST_EMIT_TIME` — 类型为 `Mutex<T>` ✓
- `EMIT_DEDUP_MS: u64 = 1000` — 常量 ✓
- `new Image()` 和 `img.onload` — 标准浏览器 API ✓
