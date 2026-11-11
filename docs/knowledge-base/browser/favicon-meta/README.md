# Browser / Favicon & Meta

浏览器标签页 favicon、标题与站点元数据的同步、缓存与时序问题：并发去重、延迟创建/更新、多层缓存架构、代理兜底移除及时序竞争防御。

## 文件

| 文件 | 说明 |
|------|------|
| [browser-handle-page-meta-concurrent-dedup-2026-06-21.md](./browser-handle-page-meta-concurrent-dedup-2026-06-21.md) | handlePageMeta 并发回调去重（两路径竞态导致重复标签/历史 + 刷新循环） |
| [browser-prefetch-title-lock-favicon-pin-2026-06-21.md](./browser-prefetch-title-lock-favicon-pin-2026-06-21.md) | 预取 + 标题锁定 + Favicon Pin 重构（共享工具提取、显式 pin 机制） |
| [browser-refresh-meta-optimization-2026-06-23.md](./browser-refresh-meta-optimization-2026-06-23.md) | 浏览器刷新元数据优化 |
| [browser-meta-sync-mechanism-2026-06-25.md](./browser-meta-sync-mechanism-2026-06-25.md) | 标题/favicon 双层同步机制（WebView2 postMessage + Rust 轮询、延迟创建、质量评分） |
| [browser-tab-meta-deferred-creation-2026-06-25.md](./browser-tab-meta-deferred-creation-2026-06-25.md) | 标签元数据延迟创建与同步更新（无占位标题、path 历史去重、favicon 仅与标题同时缓存） |
| [browser-tab-title-deferred-update-2026-06-26.md](./browser-tab-title-deferred-update-2026-06-26.md) | 标签标题延迟更新与通用 prefetch（标题闪烁/SPA 回退标题根因分析） |
| [browser-audio-indicator-favicon-stability-2026-06-27.md](./browser-audio-indicator-favicon-stability-2026-06-27.md) | 音频指示器 Favicon 位置稳定性（条件性 DOM 结构）+ Rust 端静音状态覆盖 |
| [browser-favicon-title-sync-2026-07-01.md](./browser-favicon-title-sync-2026-07-01.md) | Favicon/Title 同步 5 个根因修复（缓存未持久化、多源争用、源优先级、订阅、驱逐） |
| [browser-site-meta-cache-2026-08-13.md](./browser-site-meta-cache-2026-08-13.md) | 网站元数据持久化缓存三层架构（Rust SQLite / preview JSON / 前端镜像） |
| [browser-favicon-proxy-removal-and-merge-guard-2026-08-18.md](./browser-favicon-proxy-removal-and-merge-guard-2026-08-18.md) | DDG/Google 代理图标移除 + 镜像合并守卫（外部兜底"合法但错误"图标） |
| [browser-favicon-timing-race-2026-08-22.md](./browser-favicon-timing-race-2026-08-22.md) | 静默抓取 title-only 时序竞争根因与双层防御修复（waitForFavicon 事件监听） |
| [browser-tab-loading-redirect-favicon-2026-08-24.md](./browser-tab-loading-redirect-favicon-2026-08-24.md) | 浏览器面板标签加载状态与跨域重定向 favicon 处理 |
| [browser-bookmark-favicon-snapshot-2026-11-12.md](./browser-bookmark-favicon-snapshot-2026-11-12.md) | 书签 favicon 重复转圈与导入图标快照：占位语义由调用方声明、快照只进镜像不写后端 |
