# Contributing

## Scope Discipline

- 先确认变更属于 `Phase 0` 还是后续阶段
- 不把模型路由、命令执行、补丁引擎、多智能体编排伪装成当前必需项
- 若变更扩大权限边界、IPC 暴露面或持久化真相源，必须先补文档再改代码

## Required Checks

提交前至少完成：

- `npm run typecheck`
- `npm run test`
- `npm run build`

涉及桌面启动链路、SQLite、恢复流程或 Worker 变更时，补一条启动烟测说明。

## Must-Sync Docs

以下变更必须同步 `docs/architecture/*` 和必要的规划文档：

- 技术栈变化
- BrowserWindow / IPC 安全基线变化
- SQLite schema、迁移或恢复策略变化
- Workspace / Retrieval 责任边界变化
- UI 主题、国际化、状态真相源变化

## Change Summary Template

提交说明至少覆盖：

- 变更内容
- 为什么改
- 验证方式
- 文档同步
- 残余风险
