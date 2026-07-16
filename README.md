# AI 数字生命

AI 数字生命桌面应用的规划与治理仓库。当前阶段聚焦**单 Agent 交互式 MVP**，远期规划支持**移动端远程控制**桌面端/服务器。

项目参考了 [OpenCode](https://github.com/anomalyco/opencode)（MIT 许可）开源项目，在架构设计、编码模式与功能实现上借鉴与复用。本地副本位于 `references/opencode/`。

## 仓库结构

| 目录 | 职责 |
|------|------|
| [ai-digital-life/](./ai-digital-life/) | 实现工作区：Rust + Tauri 2.x 桌面应用 |
| [docs/](./docs/) | 架构设计、开发约束、知识库 |
| [docs/analysis/opencode/](./docs/analysis/opencode/) | OpenCode 源码地图（渐进式索引） |
| [docs/analysis/ai-digital-life/](./docs/analysis/ai-digital-life/) | AI Digital Life 源码地图（渐进式索引） |
| [references/](./references/) | 外部参考源码（OpenCode 等） |
| [.agents/rules/](./.agents/rules/) | AI 代理规则源目录（同步到 `.trae/rules/`） |
| [.trae/rules/](./.trae/rules/) | AI 代理规则（IDE 加载，由 `.agents/rules/` 同步） |
| [.opencode/skills/](./.opencode/skills/) | AI 代理技能包（23 个，含 Superpowers 核心） |

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Tauri | 2.x |
| 后端 | Rust + tokio + rusqlite | Rust 1.85+ |
| 前端 | React + Vite + Zustand + TypeScript | React 19 |
| 包管理 | pnpm（前端）/ Cargo（Rust） | pnpm 10.x+ |

## 双端架构

| 模式 | 命令 | 说明 |
|------|------|------|
| Tauri 桌面 | `pnpm run dev:tauri` | 生产级桌面应用 |
| 浏览器预览 | `pnpm run dev:browser` | 快速开发迭代 |
| 双端同时 | `pnpm run dev:both` | 双端一致性验证 |

## 快速入口

- [AGENTS.md](./AGENTS.md) — 项目治理规则、Phase 划分、编码规范、禁止项、技能系统
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 贡献指南
- [CONTEXT.md](./CONTEXT.md) — 领域术语表
- [SECURITY.md](./SECURITY.md) — 安全策略
- [ai-digital-life/README.md](./ai-digital-life/README.md) — 实现工作区快速开始
- [ai-digital-life/AGENTS.md](./ai-digital-life/AGENTS.md) — 技术栈、功能清单、Store 架构
- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) — 远期规划
- [docs/knowledge-base/README.md](./docs/knowledge-base/README.md) — 经验教训索引
- [docs/analysis/opencode/README.md](./docs/analysis/opencode/README.md) — OpenCode 源码地图（渐进式索引）
- [docs/analysis/ai-digital-life/README.md](./docs/analysis/ai-digital-life/README.md) — ADL 源码地图（渐进式索引）
- [.opencode/skills/using-superpowers/SKILL.md](./.opencode/skills/using-superpowers/SKILL.md) — 技能系统入口