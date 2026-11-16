# 架构文档

> **定位**：设计决策（记录"应该是什么"）。实现现状以源码为准，实现快照见 `../analysis/adlo/`。

本目录包含 Adlo项目的架构设计文档。

## 文档索引

### core/ — 核心架构

| 文档 | 内容 |
|------|------|
| [system-overview.md](./core/system-overview.md) | 系统整体架构概览（桌面宿主 + dsh harness 集成） |
| [tech-stack-alignment.md](./core/tech-stack-alignment.md) | 技术栈对齐方案 |
| [storage-locations.md](./core/storage-locations.md) | 存储路径解析与存储设置组实现参考（locator / Plan B 迁移 / Plan C 分组） |

### features/ — 功能实现

| 文档 | 内容 |
|------|------|
| [builtin-browser.md](./features/builtin-browser.md) | 内置浏览器实现方案 |
| [workspace-and-retrieval.md](./features/workspace-and-retrieval.md) | 工作区与检索架构 |
| [run-activity-and-run-summary.md](./features/run-activity-and-run-summary.md) | 运行活动与运行摘要 |
| [storage-settings.md](./features/storage-settings.md) | 存储设置与数据迁移 |

### cross-cutting/ — 横向治理

| 文档 | 内容 |
|------|------|
| [task-governance.md](./cross-cutting/task-governance.md) | 任务治理架构 |
| [theming.md](./cross-cutting/theming.md) | 主题系统架构 |
| [internationalization.md](./cross-cutting/internationalization.md) | 国际化架构设计 |

## 相关文档

- [设计系统](../design-system/) — UI 设计系统规范
- [开发规范](../development/) — 工程约束与治理规则
- [知识沉淀](../knowledge-base/) — 实施过程中的经验教训
- [adlo/AGENTS.md](../../adlo/AGENTS.md) — 实现工作区治理（技术栈、边界与约束；功能清单见 [core/system-overview.md](./core/system-overview.md)）
- [phase-boundary.md](../../.agents/rules/phase-boundary.md) — 项目形态与范围边界
- [FUTURE-ROADMAP.md](../../FUTURE-ROADMAP.md) — 未来工作