# 浏览器链接拦截机制 - 知识沉淀

## 问题背景

在 Tauri 2.x 开发的 AI 数字生命应用中，浏览器功能存在链接点击不触发导航的问题，特别是复杂网站（如 Bilibili）的 JavaScript 处理的链接。

## 解决方案演进

### 方案 1：尝试 SPA 路由检测（失败）
- **思路**：在子 WebView 中注入脚本，拦截 `history.pushState`、`hashchange` 等事件
- **问题**：`webview.eval()` 在 Tauri 2.x 子 WebView 中返回 `()`，无法获取值；注入脚本导致超时

### 方案 2：独立 WebviewWindow（失败）
- **思路**：使用 `WebviewWindowBuilder` 创建独立窗口
- **问题**：独立窗口无法嵌入到浏览器面板区域，UI 体验不佳

### 方案 3：子 WebView + 全面拦截机制（成功）
- **实现文件**：[crates/browser/src/lib.rs](file:///e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\browser\src\lib.rs)
- **核心思路**：
  - 使用 `initialization_script` 在 WebView 初始化时注入拦截脚本
  - 在 Rust 端通过 `on_new_window` 拦截新窗口请求
  - 全面的 JavaScript 层面拦截

## 最终实现的拦截机制

### 1. Rust 端 (`crates/browser/src/browser_navigation.rs` + `crates/browser/src/browser_events.rs`)

#### 初始化脚本 (`INIT_SCRIPT`)

```javascript
// 链接拦截机制（捕获阶段），包括：
// - 点击事件拦截（捕获阶段 + microtask 回退）
// - window.open 重写
// - location.assign/replace 拦截
// - 页面元数据实时上报（postMessage + MutationObserver）
```

#### Rust 端处理

| 处理器 | 文件 | 说明 |
|--------|------|------|
| `navigation_handler` | `browser_events.rs` | 捕获所有 WebView 导航事件，4s URL 去重 |
| `new_window_handler` | `browser_events.rs` | 拦截新窗口请求，在当前 WebView 中导航 |
| `setup_history_changed_handler` | `webview2_message.rs` | COM HistoryChanged 事件，SPA pushState 检测 |

### 2. JavaScript 端拦截点

| 拦截方式 | 说明 |
|---------|------|
| 点击事件 (`click`) | 捕获阶段 `preventDefault()`，**不** `stopPropagation()`，microtask 检查 SPA 是否已处理 |
| `window.open` 重写 | 重写全局方法，拦截弹窗请求 |
| `location.assign`/`replace` | 重写 Location 原型方法 |

### 3. 拦截的链接类型

✅ 传统 `<a href="...">` 标签 — 捕获阶段 `preventDefault` + SPA 优先 + microtask 回退  
✅ 图片映射 `<area>` 标签  
✅ `window.open()` 打开的链接  
✅ JavaScript 直接赋值 `location.href`  
✅ 新窗口请求拦截（通过 `new_window_handler`）  

### 4. SPA 优先的导航策略（2026-06-28 引入）

**问题**：早期版本在捕获阶段调用 `stopPropagation()` + `navigateToUrl(href)`（= `window.location.href`），强制整页刷新。SPA 站点标题和标签需等待整页加载后才能显示，延迟 ~500ms。

**方案**：捕获阶段 `preventDefault()` 阻止 `<a>` 默认导航（target 阶段），但**不** `stopPropagation()`，让事件传播到 SPA 的 Vue/React 路由处理器。使用 **microtask** 检查 URL 是否已通过 `history.pushState` 变化：

```javascript
document.addEventListener('click', function(event) {
    // ...遍历找到 <a> 标签...
    event.preventDefault();          // 阻止默认导航
    // 不调用 stopPropagation()     // SPA 路由处理器可接收事件
    Promise.resolve().then(function() {
        if (!isSamePage(location.href, href)) {
            // SPA 未处理 → 回退整页导航
            navigateToUrl(href);
        }
    });
}, true);
```

**`isSamePage`** 比较 `origin + pathname` 忽略 query params/hash，避免 SPA 添加的 `?vd_source=` 等参数导致误判。

**效果**：
- SPA 推送 `pushState` → microtask 不触发 → 标题即时可用
- 非 SPA 未处理 → URL 不变 → microtask 触发整页导航（同原有行为）
- 新窗口点击 → `new_window_handler` 处理  

## 关键技术要点

### Tauri 2.x 子 WebView 限制

1. **`webview.eval()` 返回值限制**：子 WebView 的 `eval()` 仅返回 `()`，无法获取执行结果
2. **不注入 `window.__TAURI__`**：子 WebView 默认不注入 Tauri API
3. **`initialization_script` 是最佳实践**：使用初始化脚本而非动态注入

### 捕获阶段 + Microtask 回退策略

```javascript
document.addEventListener('click', handler, true); // true = 捕获阶段
```

**关键规则**：
1. **必须 `preventDefault()`**：阻止 `<a>` 元素在 target 阶段的默认导航，否则浏览器会在 SPA 的 bubble 阶段处理前跳转页面
2. **绝对不能 `stopPropagation()`**：SPA 的路由处理器（Vue/React 事件委托，通常在 bubble 阶段）需要收到事件才能通过 `pushState` 处理导航
3. **Microtask 回退**：使用 `Promise.resolve().then()` 在下一事件循环检查 URL 是否已变；未变则回退 `window.location.href` 整页导航

### 向上遍历 DOM 的重要性

```javascript
let target = event.target;
while (target) {
    if (target.tagName === 'A') {
        // 找到链接了
        break;
    }
    target = target.parentElement;
}
```

因为点击事件的 `target` 可能是链接内部的子元素（如 `<span>`、`<img>`）。

## 文件变更记录

### 删除的文件/代码

1. **`src-tauri/src/commands/browser.rs`**：删除 `browser_open_standalone` 命令
2. **`src-tauri/src/main.rs`**：删除命令注册
3. **`frontend/src/shared/ipc.ts`**：删除 `openStandaloneWindow` 接口
4. **`frontend/src/tauri-bridge.ts`**：删除实现
5. **`frontend/src/mock-bridge.ts`** 和 **`preview-bridge/index.ts`**：删除 mock 实现

### 修改的文件

- **[crates/browser/src/lib.rs](file:///e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates\browser\src\lib.rs)**：增强 `INIT_SCRIPT`，优化 `on_new_window`

## 经验教训

1. **不要轻易回退**：在找到真正的解决方案前，不要轻易否定前期工作
2. **分层防御**：拦截机制需要多层覆盖（JavaScript 层 + Rust 层）
3. **初始化优于动态**：`initialization_script` 比运行时 `eval()` 更可靠
4. **调试日志很重要**：添加足够的 console.log 可以帮助理解拦截情况
5. **测试复杂网站**：Bilibili 等复杂网站是很好的测试用例
6. **`stopPropagation` 阻断 SPA 标题同步**：捕获阶段调用 `stopPropagation()` 会阻止 SPA 路由处理器接收事件，导致推流式导航失效。必须让事件传播到 SPA 的 bubble 阶段处理器
7. **`preventDefault` 必须在捕获阶段**：阻止 `<a>` 默认导航必须在捕获阶段完成，否则 target 阶段浏览器已开始导航，bubble 阶段的 SPA 处理器为时已晚
8. **Microtask 是最佳回退时机**：`Promise.resolve().then()` 恰好在一个事件循环结束后、下一个事件循环开始前执行，此时 SPA 的同步 `pushState` 调用已完成

## 相关文档

- [builtin-browser.md](./builtin-browser.md) - 内置浏览器实现
- [browser-subdirectory-fix.md](./browser-subdirectory-fix.md) - 子目录修复
- [browser-tree-fix.md](./browser-tree-fix.md) - 浏览器树修复
- [browser-spa-navigation-title-sync-fix-2026-06-28.md](./browser-spa-navigation-title-sync-fix-2026-06-28.md) - SPA 导航标题同步修复
