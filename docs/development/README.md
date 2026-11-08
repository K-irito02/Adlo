# Development

> **定位**：工程约束与操作手册。其中 `project-engineering-constraints.md` 为治理级约束，与 `.agents/rules/` 重叠处以规则文件为准（治理审计见 [SKILLS.md](../../SKILLS.md) 中的 `governance-audit` 技能）。

工程约束、日志系统手册、新增 IPC 域清单与上下文预算治理。

## 文件索引

| 文件 | 内容 |
|------|------|
| [project-engineering-constraints.md](./project-engineering-constraints.md) | 核心工程约束（技术栈、构建、双端、安全、Store、i18n） |
| [log-system-manual.md](./log-system-manual.md) | 日志系统操作手册（CLI 命令、级别/模式语义、文件落点、面向用户与 agent 的核实配方） |
| [adding-an-ipc-domain.md](./adding-an-ipc-domain.md) | 新增 IPC 域端到端清单（Rust handler/路由 → 四端桥接 → store → UI → i18n → 契约测试） |
| [context-budget.md](./context-budget.md) | agent 启动上下文构成 / 实测体积 / 预算门禁（`check:context-budget`） |

## 相关文档

- [项目工程约束](./project-engineering-constraints.md) — 核心约束入口
- [日志系统经验](../knowledge-base/logging/log-system-lessons.md) — 实施经验
- [Agent 规则](../../.agents/rules/dev-rules.md) — 代理交互与执行规则
