# React 编码模式（索引）

> **体裁变更**：本文件原为实现快照，现已精简为索引。规范性约束以 `.agents/rules/` 为准。
> 源码路径：`adlo/frontend/src/`

## 阅读地图

| 想了解 | 去哪里 |
|--------|--------|
| 组件拆分阈值、Hook 设计、目录组织、Barrel 策略 | `.agents/rules/component-architecture.md` |
| 对话框/菜单/悬停/Toast 等 UI 模式 | `.agents/rules/ui-patterns.md` |
| 前端 `@` 别名导入约定 | `.agents/rules/frontend-at-alias-convention.md` |
| i18n 上下文模式（`useTCopy`） | `.agents/rules/usetcopy-i18n-context-pattern.md` |
| i18n 字典领域拆分 | `.agents/rules/i18n-dictionary-domain-split-organization.md` |
| Region 布局壳架构 | `.agents/rules/region-layout-shell-architecture.md` |
| CSS 架构与设计约束 | `.agents/rules/css-architecture.md`、`.agents/rules/design-system.md` |
| 提示色规范 | `.agents/rules/hint-color-usage.md` |

## 实现备注（快照摘录，细节以源码为准）

- 功能域：`features/{domain}/`（约 25 个，见源码），通用组件 `components/{category}/`；根级错误边界 + `React.lazy` 延迟加载大功能域。
- Hook：单一职责，不直接访问 Store（参数注入）；`use{Feature}{Action}` 命名，返回类型显式。
- i18n：所有展示文本走 i18n key（`useTCopy()`），禁硬编码；语言切换渲染条件加稳定性 fallback。
- 导入：`@` 别名（`@features`/`@stores`/`@shared`…），禁深层相对路径嵌套。
