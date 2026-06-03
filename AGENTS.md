# AI 数字生命 - 项目治理规则

## 项目定位

本仓库是 AI 数字生命项目的规划与治理工作区。根目录以文档和架构设计为主，`ai-digital-life/` 是基于 **Rust + Tauri 2.x** 的桌面应用实现工作区。

## 双根结构

| 目录 | 职责 |
|------|------|
| 仓库根目录 | 规划与治理：`AGENTS.md`、`docs/`、`.agents/` |
| `ai-digital-life/` | 实现工作区：Rust + Tauri 桌面应用 + WebView 前端 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x |
| 后端 | Rust (stable) + tokio + rusqlite + serde + tracing |
| 前端 | React 19 + Vite + Zustand + TypeScript + xterm.js |
| 桥接 | `#[tauri::command]` + `@tauri-apps/api` |
| 持久化 | SQLite（`rusqlite`，后端） |

## 当前阶段

| Phase | 状态 | 范围 |
|-------|------|------|
| Phase 0 | ✅ 已完成 | 架构底座、桌面壳层、安全边界、基础设施 |
| Phase 1 | 🚧 进行中 | 交互式 MVP、模型接入、上下文、变更预览 |
| Phase 2 | ✅ 已完成切片 | 单 Agent 薄切片、终端流式输出 |

## 已实现功能

- 桌面壳（Tauri Backend / WebView）+ SQLite 状态持久化
- 工作区与对话管理 + 补丁预览/应用/回滚
- 模型网关（含流式与取消）+ 命令治理与终端流式输出
- CodeMirror 编辑器系统 + xterm.js 交互式终端（多会话 PTY）
- Zustand 切片模式（12 切片 + 11 action 模块）+ 模块化分层（features/ + regions/）
- 内置浏览器（Tauri WebView / iframe 双模式 + 标签树形目录三分类）
- 统一 IPC 错误通道（`IpcErrorCode` → `AppError` → `IpcResult`）
- CSS 设计 Token 亮暗主题 + 自定义 Tooltip 组件

## 重构历史

共完成 **30 轮**迭代重构，详情见 [REFACTORING_PROGRESS_REPORT.md](./docs/重构洞察/REFACTORING_PROGRESS_REPORT.md)。

## AI 代理开发规则

项目规则文件位于 `.agents/rules/`，AI 代理在操作本项目时必须遵守：
- [project-overview.md](.agents/rules/project-overview.md) — 项目总览、双根结构
- [phase-boundary.md](.agents/rules/phase-boundary.md) — 阶段边界与排除项
- [mandatory-testing.md](.agents/rules/mandatory-testing.md) — 强制红绿测试
- [quality-gates.md](.agents/rules/quality-gates.md) — 质量门禁
- [error-handling.md](.agents/rules/error-handling.md) — 错误处理规范
- [dev-rules.md](.agents/rules/dev-rules.md) — 交互与执行规则（询问卡片、终端命令、代码修改）

## 禁止项

- WebView 直接触达系统能力（必须通过 Tauri Command）
- 低层 crate 依赖高层 crate
- 凭据写入普通配置或日志（必须使用 OS keyring）
- 使用原生 HTML `title` 属性（必须使用 `TooltipSimple` 组件）
- UI/UX 或功能变更后跳过红绿测试
- 在 capability 文件中使用 `"all"` / `"**"` 通配权限
- 功能或显示效果仅在 Tauri 或浏览器单一模式下可用（必须双端一致）

## 双端一致性

所有功能必须在 **Tauri 桌面应用** 和 **浏览器模式** 中保持一致。

| 机制 | 说明 |
|------|------|
| `DigitalLifeBridge` | 统一 IPC 抽象层（Tauri ↔ 浏览器） |
| `isTauriShell()` | 运行时环境检测 |
| `data-shell="tauri|browser"` | HTML 根元素属性，CSS 适配 |

新增 IPC 方法必须同步实现 `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts`。

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

## 相关文档

- [ai-digital-life/AGENTS.md](ai-digital-life/AGENTS.md) — 实现工作区治理
- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) — 远期规划
- [docs/development/project-engineering-constraints.md](./docs/development/project-engineering-constraints.md) — 工程约束
- [docs/重构洞察/REFACTORING_PROGRESS_REPORT.md](./docs/重构洞察/REFACTORING_PROGRESS_REPORT.md) — 30 轮重构完整记录
- [docs/知识沉淀/README.md](./docs/知识沉淀/README.md) — 经验教训与总结索引
