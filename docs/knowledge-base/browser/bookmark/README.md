# Browser / Bookmark

浏览器书签功能实现与修复经验：收藏对话框、展平视图、命名与默认值、文件夹/标签删除清理、去重语义与标题隔离。

## 文件

| 文件 | 说明 |
|------|------|
| [browser-bookmark-dialog-and-flat-view-2026-06-15.md](./browser-bookmark-dialog-and-flat-view-2026-06-15.md) | 收藏标签对话框 + 展平列表视图（树展平算法、Hint CSS specificity） |
| [browser-bookmark-tab-naming-folder-tab-fixes-2026-06-21.md](./browser-bookmark-tab-naming-folder-tab-fixes-2026-06-21.md) | 书签默认值 hostname 降级、标签命名修复、文件夹标签原子插入 |
| [browser-bookmark-dialog-store-pattern-audio-fix-2026-06-28.md](./browser-bookmark-dialog-store-pattern-audio-fix-2026-06-28.md) | 书签对话框 store-based 模式替代 callback chain、音频调试端到端追踪 |
| [browser-folder-delete-bookmark-cleanup-2026-06-30.md](./browser-folder-delete-bookmark-cleanup-2026-06-30.md) | 文件夹删除书签清理修复（17 问题：工作区过滤、scopeFolderId、tabId 分离、时序） |
| [browser-bookmark-click-handler-fix-2026-07-02.md](./browser-bookmark-click-handler-fix-2026-07-02.md) | 浏览器书签点击处理器修复 |
| [browser-bookmark-tuple-dedup-and-title-isolation-2026-08-15.md](./browser-bookmark-tuple-dedup-and-title-isolation-2026-08-15.md) | 书签去重 (网址,标题) 元组语义 + 标题隔离（store 与 UI 同步、统一去重规则） |
