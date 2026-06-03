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

### 1. Rust 端 (`crates/browser/src/lib.rs`)

#### 初始化脚本 (`INIT_SCRIPT`)

```javascript
// 全面的链接拦截机制，包括：
// - 点击事件拦截（捕获阶段）
// - 键盘事件拦截（Enter/Space）
// - window.open 重写
// - location.href/assign/replace 监听
// - MutationObserver 监听动态内容
// - 表单提交监听
```

#### on_new_window 回调

```rust
.on_new_window(move |url, _window_features| {
    if let Some(window) = app_handle.get_window("main") {
        if let Some(webview) = window.get_webview(BROWSER_WEBVIEW_LABEL) {
            if let Ok(parsed_url) = resolve_url(url.as_str()) {
                let _ = webview.navigate(parsed_url);
            }
        }
    }
    tauri::webview::NewWindowResponse::Deny
})
```

### 2. JavaScript 端拦截点

| 拦截方式 | 说明 |
|---------|------|
| 点击事件 (`click`) | 在捕获阶段拦截，向上遍历查找 `<a>` 和 `<area>` 标签 |
| 键盘事件 (`keydown`) | 拦截 Enter/Space 键激活链接 |
| `window.open` 重写 | 重写全局方法，拦截弹窗请求 |
| `location.assign`/`replace` | 重写 Location 原型方法 |
| MutationObserver | 监听动态添加的链接和属性变化 |

### 3. 拦截的链接类型

✅ 传统 `<a href="...">` 标签  
✅ 图片映射 `<area>` 标签  
✅ `window.open()` 打开的链接  
✅ JavaScript 直接赋值 `location.href`  
✅ 键盘（Enter/Space）激活的链接  
✅ 动态添加的链接（通过 MutationObserver）  
✅ 新窗口请求拦截（通过 `on_new_window`）  

## 关键技术要点

### Tauri 2.x 子 WebView 限制

1. **`webview.eval()` 返回值限制**：子 WebView 的 `eval()` 仅返回 `()`，无法获取执行结果
2. **不注入 `window.__TAURI__`**：子 WebView 默认不注入 Tauri API
3. **`initialization_script` 是最佳实践**：使用初始化脚本而非动态注入

### 事件捕获阶段优先级

```javascript
document.addEventListener('click', handler, true); // true = 捕获阶段
```

在捕获阶段拦截可以防止页面 JavaScript 的 `preventDefault()` 影响我们的逻辑。

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

## 相关文档

- [builtin-browser.md](./builtin-browser.md) - 内置浏览器实现
- [browser-subdirectory-fix.md](./browser-subdirectory-fix.md) - 子目录修复
- [browser-tree-fix.md](./browser-tree-fix.md) - 浏览器树修复
