---
description: Phase boundaries, scope limits, and exclusion items
alwaysApply: true
---

# 阶段边界

## 当前阶段

| Phase | 状态 | 范围 |
|-------|------|------|
| Phase 0 | ✅ 已完成 | 架构底座、桌面壳层、安全边界、基础设施 |
| Phase 1 | 🚧 进行中 | 交互式 MVP、模型接入、上下文、变更预览 |
| Phase 2 | ✅ 已完成切片 | 单 Agent 薄切片、终端流式输出 |

## 排除项

| 排除项 | 原因 |
|--------|------|
| 多 Agent DAG | Phase 2+ |
| MCP 协议 | Phase 2+ |
| 插件市场 | Phase 2+ |
| 浏览器自动化运行时 | Phase 2+ |
| 复杂云协作 | Phase 3+ |
| Zustand 状态管理变更 | 需遵循 `zustand-patterns.md` |
| Rust 后端模式变更 | 需遵循 `rust-patterns.md` |

## 新功能评估

引入新功能前必须确认：

- [ ] 是否在当前 Phase 范围内？
- [ ] 是否需要新增 Tauri Command / capability / 事件通道？
- [ ] 是否涉及 WebView 直接访问系统资源？
- [ ] 是否需要新增持久化存储？
- [ ] 是否需要同步文档更新？

详见 [FUTURE-ROADMAP.md](../../FUTURE-ROADMAP.md)

## 相关文件

- [AGENTS.md](../../AGENTS.md)
- [FUTURE-ROADMAP.md](../../FUTURE-ROADMAP.md)
