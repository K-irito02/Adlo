# Browser / WebView Embed

WebView 嵌入经验：iframe 嵌入检查与双模式隔离、Shadow DOM 沙箱、WebView 池 LRU、主题同步、覆盖层级与 WebView2 渲染特性。

## 文件

| 文件 | 说明 |
|------|------|
| [browser-embed-check-fix-2026-06-17.md](./browser-embed-check-fix-2026-06-17.md) | iframe 嵌入崩溃 + 双模式隔离 + 路由竞态 + PTY 错误 + 指数退避 |
| [safe-iframe-shadow-dom-fix-2026-06-17.md](./safe-iframe-shadow-dom-fix-2026-06-17.md) | Shadow DOM 修复跨域 iframe SecurityError（attachShadow mode:closed 终极方案） |
| [panel-resize-handle-webview-2026-06-18.md](./panel-resize-handle-webview-2026-06-18.md) | 面板拖拽线被 WebView 覆盖：区域逃逸方案（handle 左扩至中心区） |
| [tauri-webview-overlay-hide-2026-06-18.md](./tauri-webview-overlay-hide-2026-06-18.md) | Tauri 原生子 WebView 层级覆盖问题（含 updateWebViewBounds 覆盖层守卫） |
| [browser-text-overflow-webview2-clip-2026-06-22.md](./browser-text-overflow-webview2-clip-2026-06-22.md) | 快捷卡片省略号 WebView2 点击闪烁（Chromium clip-on-interaction，`-webkit-line-clamp` 替代） |
| [browser-webview-pool-lru-2026-06-26.md](./browser-webview-pool-lru-2026-06-26.md) | WebView 池 LRU 缓存策略实现 |
| [browser-theme-sync-final-2026-06-29.md](./browser-theme-sync-final-2026-06-29.md) | 浏览器主题同步最终修复 |
| [divider-strip-dual-host-2026-10-02.md](./divider-strip-dual-host-2026-10-02.md) | 桥接条双宿主化：显隐判据（几何代理 + 池成员复合）、排序指纹去 URL、Rust 全局互斥清除、tooltip 贴边容差 |
| [webview2-profile-colorscheme-udf-isolation-2026-10-06.md](./webview2-profile-colorscheme-udf-isolation-2026-10-06.md) | PreferredColorScheme 同 UDF 实际全局（#4920）→ 按 UDF 会话隔离 + 后端主题初始化状态位 + 命令入口归一化 |
