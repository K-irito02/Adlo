# AI Digital Life Codebase Rules

本目录是 `AI Digital Life` 的真实实现工作区，继续受仓库根 [AGENTS.md](/E:/Programs/Obsidian/notes/AGENTS.md) 和 `docs/development/*` 约束。

## 当前阶段

- 当前实现属于 `Phase 0` 可运行薄切片
- 当前目标是桌面壳层、安全边界、状态恢复、工作区打开、SQLite 状态真相源和 Retrieval Worker
- 不在当前目录默认引入 Phase 1 以上的模型执行、命令执行、补丁引擎和复杂审批编排

## 本目录的额外要求

- 架构、技术栈、状态真相源变化必须同步 `docs/architecture/*`
- 与规划仓约束不一致时，先更新规划文档，再更新实现
- Renderer 不直接接触系统原语、SQL、文件写入或命令执行
- 新 IPC 通道必须白名单化、类型化，并返回结构化错误
- SQLite schema 变化必须附带迁移和测试
- Retrieval 相关改动必须保证状态外显、Worker 隔离和可恢复

## 设计系统约束

- 组件必须使用 CSS 自定义属性（`var(--…)`），禁止硬编码颜色值
- 图标必须使用 SVG 格式并继承 `currentColor`，禁止使用 emoji
- 所有交互控件必须提供完整的交互状态（default / hover / focus-visible / active / disabled / loading）
- Renderer 不得直接修改持久化的主题状态，必须通过 IPC 桥接（`window.digitalLife.app.updatePreferences`）
- 颜色方案（color scheme）是 Renderer 端偏好，存储在 `localStorage`
- 桌面端最小支持窗口宽度为 640px
- 所有公共设计系统辅助函数必须有测试覆盖

## 文档入口

### 架构文档

- [README.md](/E:/Programs/Obsidian/notes/ai-digital-life/README.md)
- [CONTRIBUTING.md](/E:/Programs/Obsidian/notes/ai-digital-life/CONTRIBUTING.md)
- [docs/architecture/system-overview.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/system-overview.md)
- [docs/architecture/tech-stack-alignment.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/tech-stack-alignment.md)
- [docs/architecture/internationalization.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/internationalization.md)
- [docs/architecture/recovery-and-migration.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/recovery-and-migration.md)
- [docs/architecture/task-governance.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/task-governance.md)
- [docs/architecture/theming.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/theming.md)
- [docs/architecture/workspace-and-retrieval.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/workspace-and-retrieval.md)
- [docs/architecture/stage-one-validation.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/stage-one-validation.md)

### 设计系统文档

- [docs/design-system/README.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/README.md) - 设计系统总览
- [docs/design-system/tokens.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/tokens.md) - 设计令牌
- [docs/design-system/themes.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/themes.md) - 主题系统
- [docs/design-system/components.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/components.md) - 组件规范
- [docs/design-system/accessibility.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/accessibility.md) - 无障碍指南
- [docs/design-system/responsive.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/responsive.md) - 响应式设计
- [docs/design-system/testing.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/testing.md) - 测试策略

## 项目结构

```
ai-digital-life/
├── apps/
│   └── desktop/           # Electron 桌面应用
│       ├── main/          # Main 进程
│       ├── preload/       # Preload 脚本
│       ├── renderer/      # Renderer 进程
│       │   └── src/
│       │       ├── design-system/  # 设计系统模块
│       │       ├── styles/         # CSS 样式系统
│       │       └── locales/        # 国际化资源
│       └── shared/        # 共享类型定义
├── packages/              # 共享包
│   ├── config/           # 配置管理
│   ├── errors/           # 错误处理
│   ├── events/           # 事件系统
│   ├── kernel/           # 内核模块
│   ├── logger/           # 日志系统
│   ├── migration/        # 迁移系统
│   ├── storage/          # 存储层
│   ├── task/             # 任务治理
│   └── workspace/        # 工作区管理
├── workers/
│   └── health/           # Retrieval Worker
├── docs/
│   ├── architecture/     # 架构文档
│   └── design-system/    # 设计系统文档
└── tests/
    ├── unit/             # 单元测试
    └── integration/      # 集成测试
```
