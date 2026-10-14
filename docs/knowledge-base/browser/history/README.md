# Browser / History

浏览器历史记录经验：记录写入修复、标签删除、URL 归一化与历史导航回退，以及标题来源门控。

## 文件

| 文件 | 说明 |
|------|------|
| [browser-history-recording-fix-2026-06-26.md](./browser-history-recording-fix-2026-06-26.md) | 历史记录修复（6 Bug：title===hostname 误跳过、SPA 无历史、iframe 丢失、prefetch 竞态） |
| [browser-history-tag-delete-fix-2026-06-26.md](./browser-history-tag-delete-fix-2026-06-26.md) | 历史标签删除修复（4 问题：右键删除、刷新 Logo/标题、目录菜单、三种删除路径覆盖） |
| [browser-history-navigation-2026-08-14.md](./browser-history-navigation-2026-08-14.md) | 历史 URL 归一化 + 前端智能回退 + 标题来源门控 + can_go_back 原生 IPC |
| [url-changed-tabid-prefix-mismatch-2026-10-15.md](./url-changed-tabid-prefix-mismatch-2026-10-15.md) | url-changed 过滤器 tabId 口径误判吞掉全部池事件（label 前缀≠事件 id） |
