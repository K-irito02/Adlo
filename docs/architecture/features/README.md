# 功能架构

Adlo 项目各具体功能的架构设计文档。

## Files

- [builtin-browser.md](./builtin-browser.md) — 内置浏览器实现总结（WebView2、书签、历史记录、导航）
- [terminal.md](./terminal.md) — 终端子系统文件地图、PTY 生命周期、布局持久化与调试入口
- [run-activity-and-run-summary.md](./run-activity-and-run-summary.md) — Run Activity & Run Summary（运行透明度表面）
- [workspace-and-retrieval.md](./workspace-and-retrieval.md) — 工作区与检索（workspace 状态与检索能力）
- [storage-settings.md](./storage-settings.md) — 存储设置与数据迁移（10 类路径自定义、迁移引擎、IPC 三端桥接 + server 路由）
- [env-dependency-management.md](./env-dependency-management.md) — 环境依赖管理（六依赖检测/宿主安装/来源模型、`/env/*` 路由、设置组与向导、runbook、sidecar 打包）
