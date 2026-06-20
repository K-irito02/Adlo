---
description: Project rules index, maintenance protocol, and how to add new rules
alwaysApply: true
---

# 项目规则索引

## 规则文件

| 文件 | 职责 | 触发条件 |
|------|------|----------|
| `project-overview.md` | 项目总览、双根结构、技术栈、双端架构 | 始终应用 |
| `phase-boundary.md` | 阶段边界、范围限制、排除项 | 新功能规划 |
| `codebase-map.md` | 代码地图、包列表、目录结构 | 涉及实现 |
| `tauri-shell.md` | Tauri Command / capability 边界、安全基线、IPC/Bridge 架构 | 桌面应用 / IPC 变更 |
| `rust-patterns.md` | Rust 性能模式、Crate 治理、数据库规范 | Rust 代码变更 |
| `zustand-patterns.md` | Zustand 状态管理、选择器、Slice 设计、localStorage 持久化 | Store / 状态变更 |
| `component-architecture.md` | 组件拆分阈值、Hook 设计、目录组织、Barrel 策略 | 新增/修改组件 |
| `css-architecture.md` | CSS 拆分阈值、死 CSS 预防、布局稳定性、变量规范 | CSS/样式变更 |
| `error-handling.md` | 错误处理、加载状态、Promise 规范、前后端统一模式 | 全局适用 |
| `design-system.md` | 设计系统约束、主题、组件规范、CSS 架构引用 | UI/样式 |
| `quality-gates.md` | 测试、类型检查、合并前检查、重构门禁 | 测试/构建/重构 |
| `commands.md` | 常用命令速查、脚本入口、环境设置 | 执行命令 |
| `browser-automation.md` | 浏览器自动化工具选择、经验教训、操作规范 | 浏览器自动化/测试 |
| `desktop-ui-verification.md` | 桌面端 UI 验证流程、双端验证清单 | 修改 UI |
| `dev-rules.md` | 代理交互与执行规则（询问卡片、终端命令、代码修改原则） | 始终应用 |
| `mandatory-testing.md` | 强制红绿测试规则、TDD 要求、测试范围 | 始终应用 |
| `ui-patterns.md` | UI 模式速查：对话框、菜单、悬停、点击、颜色、Hint Card、按钮、文件树、Tooltip、Toast 等 20 类模式 | 始终应用（UI/UX 开发） |

## 新增规则

1. 在 `.agents/rules/` 新增 `*.md` 文件
2. YAML 头部必填：`description`（英文）、`alwaysApply` 或 `globs`
3. 在上表增加一行

## 更新触发

| 变更类型 | 更新文件 |
|----------|----------|
| 新增/重命名 package | `codebase-map.md` |
| Tauri Command 变更 | `tauri-shell.md` |
| 测试命令变更 | `quality-gates.md`、`commands.md` |
| 设计系统变更 | `design-system.md` |
| UI 模式变更 | `ui-patterns.md` |
| Phase 范围变更 | `phase-boundary.md` |
| 双端一致性变更 | `tauri-shell.md`、`project-overview.md`、`desktop-ui-verification.md` |
| 浏览器自动化工具/脚本变更 | `browser-automation.md`、`browser-automation` 技能 |
| Trae 内置浏览器（integrated_browser）工具变更 | `browser-automation.md`、`browser-automation` 技能 |
| Store / 状态变更 | `zustand-patterns.md` |
| Rust 模式/架构变更 | `rust-patterns.md` |
| 组件拆分/架构变更 | `component-architecture.md` |
| CSS 架构变更 | `css-architecture.md` + `design-system.md` |
| 错误处理/Loading 变更 | `error-handling.md` |
| 重构验证 | `quality-gates.md`（重构门禁） |

## MCP 服务器说明

### integrated_browser

- **路径**: `c:\Users\31432\.trae-cn\mcps\s_notes-df2a1686\solo_agent_lite\integrated_browser\`
- **服务器名称**: `integrated_browser`
- **工具数量**: 18 个浏览器自动化工具
- **用途**: 操控 Trae IDE 内置浏览器
- **文档**: [integrated-browser.md](../skills/browser-automation/references/integrated-browser.md)

详细说明见 [browser-automation.md](./browser-automation.md)

## 规则层级

| 层级 | 覆盖范围 | 规则文件 |
|------|----------|----------|
| 项目总览 | 全局架构 | `project-overview.md`, `phase-boundary.md`, `codebase-map.md` |
| 语言/Framework | 特定技术栈 | `rust-patterns.md`, `zustand-patterns.md`, `component-architecture.md`, `css-architecture.md` |
| 质量保障 | 测试/门禁 | `quality-gates.md`, `mandatory-testing.md`, `error-handling.md` |
| 操作指南 | 命令/工具 | `commands.md`, `browser-automation.md`, `desktop-ui-verification.md` |
| 专项领域 | 安全/设计 | `tauri-shell.md`, `design-system.md`, `ui-patterns.md` |

## 相关文件

- [AGENTS.md](../../AGENTS.md)
- [FUTURE-ROADMAP.md](../../FUTURE-ROADMAP.md)
