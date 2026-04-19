---
description: Phase boundaries, scope limits, and exclusion items
alwaysApply: true
---

# 阶段边界

## 当前阶段

| 阶段 | 状态 | 范围 |
|------|------|------|
| Phase 0 | 已完成 | 架构底座、桌面壳层、安全边界、基础设施 |
| Phase 1 | 进行中 | 交互式 MVP、模型接入、上下文、变更预览 |
| Phase 2 | 已完成切片 | 单 Agent 薄切片、终端流式输出 |

## 当前已实现

- 桌面壳（Main/Preload/Renderer）
- SQLite 状态持久化
- 工作区与对话管理
- 补丁预览/应用/回滚
- 模型网关（含流式与取消）
- 命令治理与终端流式输出

## 排除项（不在当前范围）

以下能力**禁止**在当前阶段默认引入：

| 排除项 | 原因 |
|--------|------|
| 多 Agent DAG | Phase 2+ 能力 |
| MCP 协议 | Phase 2+ 能力 |
| 插件市场 | Phase 2+ 能力 |
| 浏览器自动化运行时 | Phase 2+ 能力 |
| 复杂云协作 | Phase 2+ 能力 |

## 新功能评估清单

引入新功能前必须确认：

- [ ] 是否在当前 Phase 范围内？
- [ ] 是否需要新增 IPC 通道？
- [ ] 是否涉及 Renderer 直接访问系统资源？
- [ ] 是否需要新增持久化存储？
- [ ] 是否需要同步文档更新？

## 随项目演进

- Phase 状态变化：更新当前阶段表格
- 新增已实现功能：更新当前已实现列表
- 排除项变化：更新排除项表格

## 相关文件

- [AGENTS.md](/E:/Programs/Obsidian/notes/AGENTS.md)
- [ai-digital-life/AGENTS.md](/E:/Programs/Obsidian/notes/ai-digital-life/AGENTS.md)
- [docs/architecture/system-overview.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/system-overview.md)
