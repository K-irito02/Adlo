# AI 数字生命

AI 数字生命桌面应用的规划与治理仓库。

## 仓库结构

| 目录 | 职责 |
|------|------|
| [ai-digital-life/](./ai-digital-life/) | 实现工作区：Rust + Tauri 2.x 桌面应用 |
| [docs/](./docs/) | 架构设计、开发约束、知识沉淀 |
| [.trae/rules/](./.trae/rules/) | AI 代理规则（IDE 加载，由 `.agents/rules/` 同步） |
| [UIOperationManual/](./UIOperationManual/) | UI 元素定位手册（浏览器自动化测试用） |
| [.opencode/skills/](./.opencode/skills/) | AI 代理技能包 |

## 快速入口

- [AGENTS.md](./AGENTS.md) — 项目治理规则、Phase 划分、禁止项、真源定位
- [ai-digital-life/README.md](./ai-digital-life/README.md) — 实现工作区快速开始
- [ai-digital-life/AGENTS.md](./ai-digital-life/AGENTS.md) — 技术栈、功能清单、Store 架构
- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) — 远期规划
- [docs/知识沉淀/README.md](./docs/知识沉淀/README.md) — 经验教训索引

## 技术栈摘要

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x |
| 后端 | Rust + tokio + rusqlite |
| 前端 | React 19 + Vite + Zustand + TypeScript |
| 包管理 | pnpm（前端）/ Cargo（Rust） |

详情见 [ai-digital-life/AGENTS.md](./ai-digital-life/AGENTS.md)。