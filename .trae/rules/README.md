---
description: Project rules index, maintenance protocol, and how to add new rules
alwaysApply: true
---

# 项目规则索引

## 规则文件

| 文件 | 职责 | 触发条件 |
|------|------|----------|
| `project-overview.md` | 项目总览、双根结构、技术栈、双端架构 | 始终应用 |
| `phase-boundary.md` | 项目形态、范围边界、排除项 | 新功能规划 |
| `codebase-map.md` | 代码地图、包列表、目录结构 | 涉及实现 |
| `tauri-shell.md` | Tauri Command / capability 边界、安全基线、IPC/Bridge 架构 | 桌面应用 / IPC 变更 |
| `rust-patterns.md` | Rust 性能模式、Crate 治理、数据库规范 | Rust 代码变更 |
| `zustand-patterns.md` | Zustand 状态管理、选择器、Slice 设计、localStorage 持久化 | Store / 状态变更 |
| `component-architecture.md` | 组件拆分阈值、Hook 设计、目录组织、Barrel 策略 | 新增/修改组件 |
| `css-architecture.md` | CSS 拆分阈值、死 CSS 预防、布局稳定性、变量规范 | CSS/样式变更 |
| `error-handling.md` | 错误处理、加载状态、Promise 规范、前后端统一模式 | 全局适用 |
| `design-system.md` | 设计系统约束、主题、组件规范、CSS 架构引用 | UI/样式 |
| `hint-color-usage.md` | 提示色使用规范（拖拽手柄/分界线悬停中性色，禁用 accent 蓝） | UI/样式 |
| `quality-gates.md` | 测试、类型检查、合并前检查、重构门禁 | 测试/构建/重构 |
| `commands.md` | 常用命令速查、脚本入口、环境设置 | 执行命令 |
| `desktop-ui-verification.md` | 桌面端 UI 验证流程、双端验证清单 | 修改 UI |
| `dev-rules.md` | 代理交互与执行规则（询问卡片、终端命令、代码修改、问题排查、编码风格） | 始终应用 |
| `mandatory-testing.md` | 结束验收流程、强制红绿测试、测试材料管理 | 始终应用 |
| `ui-patterns.md` | UI 模式速查：对话框、菜单、悬停、点击、颜色、Hint Card、按钮、文件树、Tooltip、Toast 等 22 类模式 | 始终应用 |
| `tauri-command-ipc-wrapper-pattern.md` | Tauri 命令统一使用 ipc()/ipc_try() 包装器 | Tauri Command 变更 |
| `tagged-enum-camelcase-serde-pattern.md` | Rust↔TS 共享类型 serde 序列化规范 | 新增共享类型 |
| `usetcopy-i18n-context-pattern.md` | 前端 i18n useTCopy() 上下文模式实现 | 前端 UI 开发 |
| `localstorage-central-registry-persistence-architecture.md` | localStorage 中心登记表持久化架构（registry + 唯一写盘入口 + 构造期同步水合，取代惰性水合） | Store / 状态变更 |
| `multi-dimensional-architecture-design.md` | 多维度架构设计总览（代码/数据/安全/部署/接口/性能） | 架构变更 |
| `branded-nominal-type-id.md` | Branded<T,B> 名义类型保护领域 ID | 新增共享类型 |
| `createlazyloader-factory-pattern.md` | createLazyLoader 惰性数据加载工厂模式（按工作区 ID 分片懒加载） | Store / 状态变更 |
| `bridge-three-implementation-pattern.md` | 前端 Bridge 接口三实现架构（Tauri/Preview/Mock 对齐） | IPC / Bridge 变更 |
| `frontend-at-alias-convention.md` | 前端 `@` 路径别名导入约定，禁止相对路径深层嵌套 | 前端导入变更 |
| `frontend-test-tests-co-location.md` | 前端测试文件放置于待测模块同级 `__tests__/` 目录 | 新增前端测试 |
| `i18n-dictionary-domain-split-organization.md` | i18n 字典按语言包/领域文件拆分，barrel 合并 | i18n 字典变更 |
| `region-layout-shell-architecture.md` | Region 布局壳架构（shell 布局与领域功能分离） | Region 布局变更 |
| `rust-command-domain-action-naming.md` | Tauri Command 函数 `{domain}_{action}` 蛇形命名 | 新增 Tauri Command |
| `rust-crate-adl-prefix-convention.md` | Rust 内部 crate 统一 `adl-` 前缀命名 | 新增 crate |
| `rust-crate-lib-barrel-export-pattern.md` | Rust crate lib.rs 公共 API 桶导出模式（模块声明 + pub use 重导出） | 新增 crate / Rust 代码变更 |
| `rust-inline-cfg-test-pattern.md` | Rust 内联 `#[cfg(test)]` 单元测试组织（内联于源文件末尾） | Rust 代码变更 |
| `rust-use-statement-ordering-convention.md` | Rust use 语句三段式排序（std → 外部 crate → adl_* 内部 crate） | Rust 代码变更 |
| `serde-default-rename-all-convention.md` | 跨 IPC 边界 Rust 类型的 serde 双注解约定 | 新增共享类型 |
| `cross-language-constant-contract.md` | 跨语言常量契约：TS/Rust 双写常量两侧钉值测试 + 交叉引用注释 | 涉及双端共享数值常量 |
| `ts-rs-type-generation-barrel-import.md` | Rust→TypeScript 自动类型生成及 kernel 桶导入规范 | 类型生成变更 |

## 新增规则

> 真源目录为 `.agents/rules/`，同步到 `.opencode/rules/` 和 `.trae/rules/`。新增/修改规则在 `.agents/rules/` 操作，再同步。

1. 在 `.agents/rules/` 新增 `*.md` 文件
2. YAML 头部必填：`description`（英文）+ 触发方式（二选一）：
   - `alwaysApply: true` — 始终应用（全局规则）
   - `globs: <path-pattern>` — 仅匹配路径时应用（作用域规则，同时设 `alwaysApply: false`）
3. 在上表「规则文件」增加一行
4. 同步到 `.opencode/rules/` 和 `.trae/rules/`

## 更新触发

| 变更类型 | 更新文件 |
|----------|----------|
| 新增/重命名 package | `codebase-map.md` |
| Tauri Command 变更 | `tauri-shell.md` |
| 测试命令变更 | `quality-gates.md`、`commands.md` |
| 设计系统变更 | `design-system.md` |
| 提示色规范变更 | `hint-color-usage.md`、`design-system.md` |
| UI 模式变更 | `ui-patterns.md` |
| 项目形态/范围边界变更 | `phase-boundary.md` |
| 双端一致性变更 | `tauri-shell.md`、`project-overview.md`、`desktop-ui-verification.md` |
| Store / 状态变更 | `zustand-patterns.md` |
| Rust 模式/架构变更 | `rust-patterns.md` |
| 组件拆分/架构变更 | `component-architecture.md` |
| CSS 架构变更 | `css-architecture.md` + `design-system.md` |
| 错误处理/Loading 变更 | `error-handling.md` |
| 重构验证 | `quality-gates.md`（重构门禁） |
| 外部参考源码（references/）变更 | `project-overview.md`、`AGENTS.md` |
| IPC 包装模式变更 | `tauri-command-ipc-wrapper-pattern.md` |
| Serde 序列化规范变更 | `tagged-enum-camelcase-serde-pattern.md` |
| i18n 实现模式变更 | `usetcopy-i18n-context-pattern.md` |
| localStorage 持久化架构变更 | `localstorage-central-registry-persistence-architecture.md` |
| 惰性加载工厂模式变更 | `createlazyloader-factory-pattern.md` |
| Bridge 三实现架构变更 | `bridge-three-implementation-pattern.md` |
| 前端 `@` 别名/导入约定变更 | `frontend-at-alias-convention.md` |
| 前端测试组织方式变更 | `frontend-test-tests-co-location.md` |
| i18n 字典组织结构变更 | `i18n-dictionary-domain-split-organization.md` |
| Region 布局架构变更 | `region-layout-shell-architecture.md` |
| Tauri Command 命名规范变更 | `rust-command-domain-action-naming.md` |
| crate 命名/新增变更 | `rust-crate-adl-prefix-convention.md` |
| serde 序列化约定变更 | `serde-default-rename-all-convention.md` |
| 类型生成/桶导入规范变更 | `ts-rs-type-generation-barrel-import.md` |
| 多维度架构变更 | `multi-dimensional-architecture-design.md` |
| 领域 ID 名义类型变更 | `branded-nominal-type-id.md` |

## 规则层级

| 层级 | 覆盖范围 | 规则文件 |
|------|----------|----------|
| 项目总览 | 全局架构 | `multi-dimensional-architecture-design.md`, `project-overview.md`, `phase-boundary.md`, `codebase-map.md` |
| 语言/Framework | 特定技术栈 | `rust-patterns.md`, `zustand-patterns.md`, `component-architecture.md`, `css-architecture.md` |
| 质量保障 | 测试/门禁 | `quality-gates.md`, `mandatory-testing.md`, `error-handling.md` |
| 操作指南 | 命令/工具 | `commands.md`, `desktop-ui-verification.md` |
| 专项领域 | 安全/设计 | `tauri-shell.md`, `design-system.md`, `ui-patterns.md` |

## 技能系统

本项目使用 **Superpowers 技能系统** 增强 AI 代理能力，共 27 个技能（含项目定制 13 个）。

| 项目 | 说明 |
|------|------|
| 入口技能 | `using-superpowers` — 对话开始时自动触发，建立技能使用规范 |
| 技能目录 | `.opencode/skills/`（真源）、`.agents/skills/`（同步备份）、`.trae/skills/`（同步备份） |
| 同步规则 | 三个目录必须保持一致，每次更新/修改/创建技能时需同步到其他两个目录 |
| 调用方式 | `Skill` 工具，按技能名称调用 |
| 详细文档 | 见根目录 [AGENTS.md](../../AGENTS.md#superpowers-技能系统) |

**核心原则**：收到用户请求后，先判断是否有相关技能可用，有则优先调用技能再行动。

## 相关文件

- [AGENTS.md](../../AGENTS.md)
- [FUTURE-ROADMAP.md](../../FUTURE-ROADMAP.md)