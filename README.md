# AI 数字生命

AI 数字生命桌面应用的规划与治理仓库。远期规划支持**移动端远程控制**桌面端/服务器。

## 仓库结构

| 目录 | 职责 |
|------|------|
| [ai-digital-life/](./ai-digital-life/) | 实现工作区：Rust + Tauri 2.x 桌面应用 |
| [docs/](./docs/) | 架构设计、开发约束、知识库 |
| [docs/analysis/ai-digital-life/](./docs/analysis/ai-digital-life/) | AI Digital Life 源码地图（渐进式索引） |
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
- [RULES.md](./RULES.md) — 规则系统（分层与优先级、三目录同步、文件规范、规则清单）
- [SKILLS.md](./SKILLS.md) — 技能系统（来源分类、三技能目录、同步规则、技能摘要）
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 贡献指南
- [CONTEXT.md](./CONTEXT.md) — 领域术语表
- [SECURITY.md](./SECURITY.md) — 安全策略
- [ai-digital-life/README.md](./ai-digital-life/README.md) — 实现工作区快速开始
- [ai-digital-life/AGENTS.md](./ai-digital-life/AGENTS.md) — 技术栈、功能清单、Store 架构
- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) — 远期规划
- [docs/knowledge-base/README.md](./docs/knowledge-base/README.md) — 经验教训索引
- [docs/analysis/ai-digital-life/README.md](./docs/analysis/ai-digital-life/README.md) — ADL 源码地图（渐进式索引）