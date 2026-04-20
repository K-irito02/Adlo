---
description: Project rules index, maintenance protocol, and how to add new rules
alwaysApply: true
---

# 项目规则索引

## 规则文件列表

| 文件 | 职责 | 触发条件 |
|------|------|----------|
| `README.md` | 本文件：规则索引、维护协议、新增指南 | 始终应用 |
| `project-overview.md` | 项目总览、双根结构、技术栈、真源定位 | 始终应用 |
| `codebase-map.md` | 代码地图、包列表、目录结构、索引策略 | 涉及 ai-digital-life/ 时 |
| `electron-shell.md` | Electron/IPC 边界、安全基线、通道白名单 | 涉及桌面应用时 |
| `quality-gates.md` | 测试、类型检查、迁移、合并前检查 | 涉及测试/构建时 |
| `design-system.md` | 设计系统约束、主题、组件规范 | 涉及 UI/样式时 |
| `phase-boundary.md` | 阶段边界、范围限制、排除项 | 涉及新功能规划时 |
| `commands.md` | 常用命令速查、脚本入口 | 执行命令时 |
| `desktop-ui-verification.md` | 桌面端 UI 验证流程、修改后必须重启应用 | 修改 renderer UI 时 |
| `mandatory-testing.md` | UI/UX 或功能变更后强制红绿测试 | 始终应用 |

## 新增规则文件

1. 在 `.trae/rules/` 新增 `*.md` 文件
2. YAML 头部必填：`description`（英文）、`alwaysApply` 或 `globs`
3. **必须**在上表增加一行，避免孤儿规则
4. 若涉及阶段边界、安全基线或 IPC 契约：同步根 `AGENTS.md` 与 `ai-digital-life/AGENTS.md`

## 规则更新触发条件

| 变更类型 | 需更新的规则文件 |
|----------|------------------|
| 新增/重命名 package | `codebase-map.md` |
| IPC 通道变更 | `electron-shell.md` |
| 测试命令变更 | `quality-gates.md` |
| 设计系统变更 | `design-system.md` |
| Phase 范围变更 | `phase-boundary.md` |
| 新增脚本命令 | `commands.md` |
| 技术栈变更 | `project-overview.md` |

## 规则文件格式规范

```markdown
---
description: 英文描述（用于 IDE 展示）
alwaysApply: true | false
globs: path/pattern/**  # 当 alwaysApply 为 false 时使用
---

# 规则标题

## 核心内容

规则主体内容...

## 随项目演进

- 触发条件 1：更新动作 1
- 触发条件 2：更新动作 2

## 相关文件

- 相关文件路径列表
```
