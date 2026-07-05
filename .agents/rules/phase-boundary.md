---
description: Phase boundaries, scope limits, and exclusion items
alwaysApply: true
---

# 阶段边界

## 当前阶段

| Phase | 状态 | 范围 |
|-------|------|------|
| Phase 0 | ✅ 已完成 | 架构底座、桌面壳层、安全边界、基础设施 |
| Phase 1 | ✅ 已完成 | 交互式 MVP、模型接入、上下文、变更预览 |
| Phase 2 | ✅ 已完成 | 完整 18 项缺失能力：多 Agent / MCP / 多 Provider / Compaction / Snapshot-Revert / WebFetch-WebSearch / 自定义命令 / 权限 Ruleset / Session Fork / LSP / Plugin / Reference / Custom Agent / Hot Reload / Durable Session / ACP/HTTP API/CodeMode 预留 |

## 排除项（当前阶段不实现）

| 排除项 | 计划阶段 |
|--------|----------|
| 插件市场（第三方插件加载） | Phase 3+ |
| 浏览器自动化运行时 | Phase 3+ |
| 复杂云协作 | Phase 3+ |
| ACP / HTTP API / CodeMode（接口已预留，实现待后续） | Phase 3+ |

## 受控变更（须遵循对应规则）

| 变更类型 | 必须遵循 |
|----------|----------|
| Zustand 状态管理 | `zustand-patterns.md` |
| Rust 后端模式 | `rust-patterns.md` |

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
