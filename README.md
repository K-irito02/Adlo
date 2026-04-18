# AI 数字生命

这是 `AI数字生命` 的规划与治理工作区，根目录以架构约束、阶段边界、协作规则和文档同步为主。

## 当前状态

- `ai-digital-life/` 是当前实际的 Phase 0 代码工作区
- `digitalLife/` 保留功能规格和阶段规划
- `.agents/` 维护项目级 Agent、skills、hooks 与 manifests
- `docs/development/` 维护开发协作与治理说明

## 实现工作区

`ai-digital-life/` 当前包含：

- Electron 桌面应用
- `packages/` 共享包
- `workers/` 后台 worker
- `tests/` 测试目录
- `docs/architecture/` 与 `docs/design-system/` 实现文档

详细约束见 [AI Digital Life README](/E:/Programs/Obsidian/notes/ai-digital-life/README.md)。

## 技术方向

- TypeScript
- Electron
- Vite
- SQLite
- pnpm workspace

实现工作区的技术对齐与阶段细节见：

- [Tech Stack Alignment](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/tech-stack-alignment.md)

## 开发协作

仓库已引入项目级 `AGENTS.md` 与 `.agents/` 体系，用于约束协作边界：

- 子Agent 分工
- 项目级 skills
- 分级治理 hooks
- 路由与文档收口规则
