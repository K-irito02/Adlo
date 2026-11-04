# Adlo

Adlo 是一个本地桌面工作台：工作区、编辑器、终端与浏览器收在同一个窗口里，DSH、OpenCode 等第三方 Agent harness 由它托管。对话与编排由 harness 提供，Adlo 只负责承载它们。

本仓库是 Adlo 的单一仓库，采用双根结构：根目录负责规划与治理（规则、架构、术语、决策），`adlo/` 负责应用实现。

## 仓库结构

| 目录 | 职责 |
|------|------|
| [adlo/](./adlo/) | 实现工作区：Rust + Tauri 2.x 桌面应用 |
| [docs/](./docs/) | 架构设计、开发约束、知识库 |
| [docs/analysis/adlo/](./docs/analysis/adlo/) | Adlo 源码地图（渐进式索引） |
| [references/](./references/) | 外部参考源码（本地拉取的开源项目） |

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Tauri | 2.x |
| 后端 | Rust + tokio + rusqlite | Rust 1.85+ |
| 前端 | React + Vite + Zustand + TypeScript | React 19 |
| 包管理 | pnpm（前端）/ Cargo（Rust） | pnpm 11.x+ |

## 双端架构

| 模式 | 命令 | 说明 |
|------|------|------|
| Tauri 桌面 | `pnpm run dev:tauri` | 生产级桌面应用 |
| 浏览器预览 | `pnpm run dev:browser` | 快速开发迭代 |
| 双端同时 | `pnpm run dev:both` | 双端一致性验证 |

## 快速入口

- [AGENTS.md](./AGENTS.md) — 项目治理规则、编码规范
- [parallel-branch-development](.agents/skills/parallel-branch-development/SKILL.md) — 并行分支开发技能（唯一真源；多会话 / 多 agent 工作树隔离）
- [RULES.md](./RULES.md) — 规则系统（分层与优先级、三目录同步、文件规范、规则清单）
- [SKILLS.md](./SKILLS.md) — 技能系统（来源分类、三技能目录、同步规则、技能摘要）
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 贡献指南
- [GLOSSARY.md](./GLOSSARY.md) — 领域术语表
- [CONTEXT.md](./CONTEXT.md) — 架构与实现说明
- [SECURITY.md](./SECURITY.md) — 安全策略
- [adlo/README.md](./adlo/README.md) — 实现工作区快速开始
- [adlo/AGENTS.md](./adlo/AGENTS.md) — 技术栈、功能清单、Store 架构
- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) — 远期规划
- [docs/knowledge-base/README.md](./docs/knowledge-base/README.md) — 经验教训索引
- [docs/analysis/adlo/README.md](./docs/analysis/adlo/README.md) — ADL 源码地图（渐进式索引）