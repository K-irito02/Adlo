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
| `tauri-shell.md` | Tauri Command / capability 边界、安全基线、双端一致性 | 桌面应用 |
| `quality-gates.md` | 测试、类型检查、合并前检查 | 测试/构建 |
| `design-system.md` | 设计系统约束、主题、组件规范 | UI/样式 |
| `commands.md` | 常用命令速查、脚本入口 | 执行命令 |
| `browser-automation.md` | 浏览器自动化工具选择、经验教训、操作规范 | 浏览器自动化/测试 |
| `desktop-ui-verification.md` | 桌面端 UI 验证流程、双端验证清单 | 修改 UI |
| `mandatory-testing.md` | 强制红绿测试规则 | 始终应用 |
| `codebase-map.md` | 代码地图、包列表、目录结构 | 涉及实现 |

## 新增规则

1. 在 `.trae/rules/` 新增 `*.md` 文件
2. YAML 头部必填：`description`（英文）、`alwaysApply` 或 `globs`
3. 在上表增加一行

## 更新触发

| 变更类型 | 更新文件 |
|----------|----------|
| 新增/重命名 package | `codebase-map.md` |
| Tauri Command 变更 | `tauri-shell.md` |
| 测试命令变更 | `quality-gates.md`、`commands.md` |
| 设计系统变更 | `design-system.md` |
| Phase 范围变更 | `phase-boundary.md` |
| 双端一致性变更 | `tauri-shell.md`、`project-overview.md`、`desktop-ui-verification.md` |
| 浏览器自动化工具/脚本变更 | `browser-automation.md`、`browser-automation` 技能 |

## 相关文件

- [AGENTS.md](../../AGENTS.md)
- [FUTURE-ROADMAP.md](../../FUTURE-ROADMAP.md)
