# 2026-08 Browser Knowledge

## Entries

- [浏览器面板网站元数据持久化缓存](./browser-site-meta-cache-2026-08-13.md) — favicon data-URI + 标题持久化缓存（三层架构），经验教训：三端语义一致、质量门控输入漂移、失败路径不能伪造成功值
- [浏览器面板历史导航与标题提取修复](./browser-history-navigation-2026-08-14.md) — C1 注入脚本历史 URL 归一化 + C2 前端智能回退 + 标题来源门控（provenance）+ can_go_back 原生 IPC。经验教训：HistoryChanged 去重窗口需按 ms 级、with_webview 异步投递需同步通道等待、注入脚本 IIFE 隔离、localStorage 持久化测试竞态
