# Superpowers — 功能设计与实施计划

本目录归档按日期组织的功能规格与实施计划。所有文档均为**历史决策记录**，对应代码已实现在工作区中。

## 目录结构

| 目录 | 内容 | 数量 |
|------|------|------|
| [specs/browser/](./specs/browser/) | 浏览器功能规格设计 | 3 |
| [specs/git/](./specs/git/) | Git 可视化规格设计 | 3 |
| [specs/multi-workspace/](./specs/multi-workspace/) | 多工作区规格设计 | 6 |
| [specs/refactoring/](./specs/refactoring/) | 重构/功能规格（含 spec.md + checklist.md + tasks.md 完整式） | 4 |
| [specs/ui/](./specs/ui/) | UI/UX 通用规格设计（含 CI、启动、Provider 等） | 10 |
| [plans/browser/](./plans/browser/) | 浏览器功能实施计划 | 14 |
| [plans/git/](./plans/git/) | Git 可视化实施计划 | 3 |
| [plans/phase2/](./plans/phase2/) | Phase 2 实施计划（Agent 核心、Provider 生态等） | 8 |
| [plans/refactoring/](./plans/refactoring/) | 重构/代码质量/架构清理实施计划 | 34 |
| [plans/startup/](./plans/startup/) | 启动性能优化实施计划 | 4 |
| [plans/ui/](./plans/ui/) | UI/UX 实施计划（含 i18n、CI、通知、主题等） | 15 |

## 归档约定

- 文件名前缀 `yyyy-MM-dd-` 表示文档对应的工作日期
- 同一日期的 `plans/` 与 `specs/` 文件可能对应同一功能的不同阶段
- 子目录形式的 spec（含 `spec.md` + `checklist.md` + `tasks.md`）为完整式规格文档
- 单文件形式的 spec 为摘要式设计文档

## 相关文档

- [知识沉淀/](../../docs/知识沉淀/) — 实施过程中沉淀的经验教训（按领域分类）
- [refactoring-insight/](../../docs/refactoring-insight/) — 重构阶段总结与洞察报告
