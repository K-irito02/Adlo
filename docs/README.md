# 文档索引

## 目录结构

| 目录 | 内容 |
|------|------|
| [architecture/](./architecture/) | 系统架构、技术栈对齐、国际化、主题、工作区与检索 |
| [adr/](./adr/) | 架构决策记录（ADR，按序号归档） |
| [design-system/](./design-system/) | 设计 Token、主题、组件规范、可访问性、响应式、测试 |
| [development/](./development/) | 工程约束（技术栈、双端、安全、Store、i18n）与日志系统操作手册 |
| [plans/agent/](./plans/agent/) | Agent 系统实施计划（核心引擎、SSE 服务器、Tauri 接线、会话页面等） |
| [plans/infrastructure/](./plans/infrastructure/) | 基础设施实施计划（磁盘清理、构建优化等） |
| [specs/agent/](./specs/agent/) | Agent 系统功能规格设计 |
| [knowledge-base/](./knowledge-base/) | 经验教训与总结（按领域分类：重构、浏览器、交互优化、代码质量、CI 监控、多工作区、Tauri 后端） |
| [maoxiong-vpn/](./maoxiong-vpn/) | maoxiong-vpn 订阅规则源配置（sub_rules.toml：规则集与代理组生成逻辑） |
| [analysis/adlo/](./analysis/adlo/) | Adlo 源码地图 — 渐进式索引（快查/总览/架构/包索引/10 功能深度/4 编码模式） |
| [plans/](./plans/) | 功能实施计划（按领域与月份归档：browser/git/ui/refactoring/workspace 等） |
| [specs/](./specs/) | 功能规格设计（与 plans/ 对应） |
| [operations/](./operations/) | 操作手册与 UI 使用说明（ui-manual） |
| [runbooks/](./runbooks/) | 环境依赖 runbook 索引（正文在前端源码目录，随诊断载荷复制） |
| [root-cause-to-close/](./root-cause-to-close/) | 根因排查 → 收尾归档全流程的进度记录（按月归档） |
| [superpowers/](./superpowers/) | Superpowers 技能产出的实施计划（plans）与规格设计（specs） |

## 基础设施配置

| 位置 | 内容 |
|------|------|
| [.editorconfig](../.editorconfig) | 编辑器格式配置（缩进、换行符、编码） |
| [.prettierrc](../adlo/frontend/.prettierrc) | Prettier 格式化配置（前端工作区） |
| [.prettierignore](../.prettierignore) | Prettier 忽略规则 |

## 快速导航

- 系统架构总览 → [architecture/core/system-overview.md](./architecture/core/system-overview.md)
- 并行分支开发技能（唯一真源）→ [parallel-branch-development](../.agents/skills/parallel-branch-development/SKILL.md)
- 设计系统入口 → [design-system/README.md](./design-system/README.md)
- 工程约束 → [development/project-engineering-constraints.md](./development/project-engineering-constraints.md)
- 日志系统手册 → [development/log-system-manual.md](./development/log-system-manual.md)
- 经验教训索引 → [knowledge-base/README.md](./knowledge-base/README.md)
- ADL 源码地图 → [analysis/adlo/README.md](./analysis/adlo/README.md)
- 贡献指南 → [CONTRIBUTING.md](../CONTRIBUTING.md)
- 安全策略 → [SECURITY.md](../SECURITY.md)
- 领域术语表 → [GLOSSARY.md](../GLOSSARY.md)
- 架构与实现说明 → [CONTEXT.md](../CONTEXT.md)