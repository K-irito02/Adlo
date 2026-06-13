# AI 数字生命 - 项目治理规则

## 项目定位

本仓库是 AI 数字生命项目的规划与治理工作区。根目录以文档和架构设计为主，`ai-digital-life/` 是基于 **Rust + Tauri 2.x** 的桌面应用实现工作区。

## 双根结构

| 目录 | 职责 |
|------|------|
| 仓库根目录 | 规划与治理：`AGENTS.md`、`docs/`、`.agents/` |
| `ai-digital-life/` | 实现工作区：Rust + Tauri 桌面应用 + WebView 前端 |

## 当前阶段

| Phase | 状态 | 范围 |
|-------|------|------|
| Phase 0 | ✅ 已完成 | 架构底座、桌面壳层、安全边界、基础设施 |
| Phase 1 | 🚧 进行中 | 交互式 MVP、模型接入、上下文、变更预览 |
| Phase 2 | ✅ 已完成切片 | 单 Agent 薄切片、终端流式输出 |

技术栈详情与已实现功能清单见 [ai-digital-life/AGENTS.md](./ai-digital-life/AGENTS.md)。

## 重构历史

共完成 **63 轮**迭代重构，完整记录见 [REFACTORING_PROGRESS_REPORT.md](./docs/重构洞察/REFACTORING_PROGRESS_REPORT.md)。

## 代理开发规则

规则文件位于 `.trae/rules/`（自动从 `.agents/rules/` 同步），全部规则索引见 [README.md](./.trae/rules/README.md)。必须遵守的规则：

- [dev-rules.md](.trae/rules/dev-rules.md) — 交互与执行规则（询问卡片、终端命令、代码修改）
- [mandatory-testing.md](.trae/rules/mandatory-testing.md) — 强制红绿测试
- [quality-gates.md](.trae/rules/quality-gates.md) — 质量门禁
- [error-handling.md](.trae/rules/error-handling.md) — 错误处理规范

## 调试工具

**调试日志收起器是最高优先级的调试手段**，遇到 UI/交互问题时优先使用。详见 [AGENTS.md#调试工具](./ai-digital-life/AGENTS.md#调试工具)（实现在 `frontend/src/app/utils/debugLogCollector.ts`）。

## 禁止项

- WebView 直接触达系统能力（必须通过 Tauri Command）
- 低层 crate 依赖高层 crate
- 凭据写入普通配置或日志（必须通过 `crates/credential/` 存储）
- 混合使用多种 Tooltip 方案
- UI/UX 或功能变更后跳过红绿测试
- 在 capability 文件中使用 `"all"` / `"**"` 通配权限
- 功能或显示效果仅在 Tauri 或浏览器单一模式下可用（必须双端一致）

## 双端一致性

所有功能必须在 **Tauri 桌面应用** 和 **浏览器模式** 中保持一致。新增 IPC 方法必须同步实现 `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts`。

## 真源定位

| 内容 | 真源位置 |
|------|----------|
| 项目治理规则 | `AGENTS.md`（本项目）、`.agents/rules/` |
| 实现侧治理 | `ai-digital-life/AGENTS.md` |
| 架构文档 | `docs/architecture/` |
| 设计系统 | `docs/design-system/` |
| 开发约束 | `docs/development/` |
| IPC 契约 | `ai-digital-life/frontend/src/shared/ipc.ts` |
| UI 测试 | `UIOperationManual/` |
| 重构进度 | `docs/重构洞察/REFACTORING_PROGRESS_REPORT.md` |
| 知识沉淀 | `docs/知识沉淀/` |
| CI/CD | `.github/workflows/` |
| 凭据存储 | `ai-digital-life/crates/credential/` |

## 相关文档

- [ai-digital-life/AGENTS.md](./ai-digital-life/AGENTS.md) — 实现工作区治理（技术栈、功能清单、Stores 架构）
- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) — 远期规划
- [docs/development/project-engineering-constraints.md](./docs/development/project-engineering-constraints.md) — 工程约束
- [docs/知识沉淀/README.md](./docs/知识沉淀/README.md) — 经验教训与总结索引