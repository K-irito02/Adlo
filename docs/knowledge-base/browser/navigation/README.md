# Browser / Navigation

浏览器导航相关经验：URL 加载与同步、地址栏、空标签引导页、导航模式切换、SPA 标题同步与后退、以及显式 navigateTab 重构。

## 文件

| 文件 | 说明 |
|------|------|
| [browser-navigate-fix-2026-06-04.md](./browser-navigate-fix-2026-06-04.md) | 浏览器模式下 URL 无法加载修复（无活动标签页创建逻辑） |
| [browser-url-sync-fix-2026-06-04.md](./browser-url-sync-fix-2026-06-04.md) | 浏览器功能面板 URL 同步修复经验 |
| [browser-landing-page-2026-06-08.md](./browser-landing-page-2026-06-08.md) | 空标签引导页实现（端口扫描、UI 标准、组件架构）+ 虚线占位符一致性修复 |
| [browser-copy-button-animation-2026-06-18.md](./browser-copy-button-animation-2026-06-18.md) | 地址栏复制按钮动画化（lucide-animated CopyIcon 弹簧动画） |
| [browser-navigation-mode-toggle-2026-06-20.md](./browser-navigation-mode-toggle-2026-06-20.md) | 导航模式切换（in-place/new-tab）+ 链接点击后自动刷新修复 |
| [browser-url-input-landing-page-bookmark-fixes-2026-06-21.md](./browser-url-input-landing-page-bookmark-fixes-2026-06-21.md) | 地址栏失焦/ESC 恢复 URL、空 URL 着陆页、书签星号点亮等修复 |
| [browser-navigator-4-mode-2026-06-24.md](./browser-navigator-4-mode-2026-06-24.md) | 4 模式扁平导航栏重构（Flash 消除、搜索外部点击、Flat 模式溢出渐变蒙版） |
| [browser-spa-navigation-title-sync-fix-2026-06-28.md](./browser-spa-navigation-title-sync-fix-2026-06-28.md) | SPA 导航标题同步双重 Bug 修复（URL 归一化覆盖 + INIT_SCRIPT 强制整页导航） |
| [browser-navigate-tab-explicit-2026-06-29.md](./browser-navigate-tab-explicit-2026-06-29.md) | navigateTab 反馈循环修复：被动触发→前端显式调用，来源分离原则 |
| [spa-history-back-double-click-2026-06-30.md](./spa-history-back-double-click-2026-06-30.md) | SPA 后退需双击问题：eval("history.back()") 与多层 pushState 历史栈，非应用 bug |
| [browser-bilibili-double-reload-fix-2026-07-15.md](./browser-bilibili-double-reload-fix-2026-07-15.md) | Bilibili 页面双重重载问题修复 |
