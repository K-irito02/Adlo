# Browser / Download

浏览器面板下载链路经验：统一原生下载管线、三端下载 URL 检测语义统一，以及 WebView2 临时文件残留与下载大小同步问题。

## 文件

| 文件 | 说明 |
|------|------|
| [browser-download-unified-native-pipeline-2026-08-27.md](./browser-download-unified-native-pipeline-2026-08-27.md) | 浏览器面板资源下载统一原生管线（对齐 Chrome/Edge） |
| [browser-download-url-detection-unify-2026-08-29.md](./browser-download-url-detection-unify-2026-08-29.md) | 三端 isDownloadUrl 扩展名/检测语义统一 + query-key 解析 + fragment 隔离 |
| [browser-download-tmp-orphan-and-size-sync-2026-08-31.md](./browser-download-tmp-orphan-and-size-sync-2026-08-31.md) | WebView2 `.tmp` 暂存残留 + 下载完成大小同步经验教训 |
| [download-card-file-state-2026-11-27.md](./download-card-file-state-2026-11-27.md) | 下载卡片瞬时文件状态、记录复用与 tracked-only 迁移经验（WebView2 同文档下载、pending 守卫、IPC 哨兵） |
