# AI Digital Life Codebase Rules

本目录是 `AI Digital Life` 的真实实现工作区，继续受仓库根 [AGENTS.md](/E:/Programs/Obsidian/notes/AGENTS.md) 和 `docs/development/*` 约束。

## 当前阶段

- 当前实现属于 `Phase 0` 可运行薄切片
- 当前目标是桌面壳层、安全边界、状态恢复、工作区打开、SQLite 状态真相源和 Retrieval Worker
- 不在当前目录默认引入 Phase 1 以上的模型执行、命令执行、补丁引擎和复杂审批编排

## 本目录的额外要求

- 架构、技术栈、状态真相源变化必须同步 `docs/architecture/*`
- 与规划仓约束不一致时，先更新规划文档，再更新实现
- Renderer 不直接接触系统原语、SQL、文件写入或命令执行
- 新 IPC 通道必须白名单化、类型化，并返回结构化错误
- SQLite schema 变化必须附带迁移和测试
- Retrieval 相关改动必须保证状态外显、Worker 隔离和可恢复

## 文档入口

- [README.md](/E:/Programs/Obsidian/notes/ai-digital-life/README.md)
- [CONTRIBUTING.md](/E:/Programs/Obsidian/notes/ai-digital-life/CONTRIBUTING.md)
- [docs/architecture/system-overview.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/system-overview.md)
- [docs/architecture/tech-stack-alignment.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/tech-stack-alignment.md)
- [docs/architecture/internationalization.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/internationalization.md)
- [docs/architecture/theming.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/theming.md)
