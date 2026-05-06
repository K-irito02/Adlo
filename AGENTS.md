# AI 数字生命 - 项目治理规则

## 项目定位

本仓库是 AI 数字生命项目的规划与治理工作区。根目录以文档和架构设计为主，`ai-digital-life/` 是基于 **Rust + Tauri 2.x** 的桌面应用实现工作区。

## 双根结构

| 目录 | 职责 |
|------|------|
| `notes/` | 规划与治理：文档、`AGENTS.md`、`docs/development/` |
| `ai-digital-life/` | 实现工作区：Rust + Tauri 桌面应用 + WebView 前端 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x |
| 后端 | Rust (stable) + tokio + rusqlite + serde + tracing |
| 前端 | React 19 + Vite + Zustand |
| 桥接 | `#[tauri::command]` + `@tauri-apps/api` |
| 持久化 | SQLite（`rusqlite`，后端） |

## 当前阶段

| Phase | 状态 | 范围 |
|-------|------|------|
| Phase 0 | ✅ 已完成 | 架构底座、桌面壳层、安全边界、基础设施 |
| Phase 1 | 🚧 进行中 | 交互式 MVP、模型接入、上下文、变更预览 |
| Phase 2 | ✅ 已完成切片 | 单 Agent 薄切片、终端流式输出 |

### 已实现功能

- 桌面壳（Tauri Backend / WebView）
- SQLite 状态持久化
- 工作区与对话管理
- 补丁预览/应用/回滚
- 模型网关（含流式与取消）
- 命令治理与终端流式输出
- 自定义 Tooltip 组件
- CodeMirror 编辑器系统

### 排除项

以下能力**禁止**在当前阶段引入：

| 排除项 | 原因 |
|--------|------|
| 多 Agent DAG | Phase 2+ |
| MCP 协议 | Phase 2+ |
| 插件市场 | Phase 2+ |
| 浏览器自动化运行时 | Phase 2+ |
| 复杂云协作 | Phase 3+ |

详见 [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md)

## 禁止项

- WebView 直接触达系统能力（必须通过 Tauri Command）
- 低层 crate 依赖高层 crate
- 凭据写入普通配置或日志（必须使用 OS keyring）
- 使用原生 HTML `title` 属性（必须使用 `TooltipSimple` 组件）
- UI/UX 或功能变更后跳过红绿测试
- 在 capability 文件中使用 `"all"` / `"**"` 通配权限

## 真源定位

| 内容 | 真源位置 |
|------|----------|
| 项目级治理 | `AGENTS.md` |
| 实现侧治理 | `ai-digital-life/AGENTS.md` |
| 架构文档 | `ai-digital-life/docs/architecture/` |
| 设计系统 | `ai-digital-life/docs/design-system/` |
| 开发约束 | `docs/development/` |
| IPC 契约 | `ai-digital-life/frontend/src/shared/ipc.ts` |
| 进程边界 | `ai-digital-life/src-tauri/`、`ai-digital-life/crates/` |

## 相关文档

- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) - 远期规划
- [docs/development/agent-routing.md](./docs/development/agent-routing.md) - Agent 路由
- [docs/development/hook-policy.md](./docs/development/hook-policy.md) - Hook 策略
- [docs/development/project-engineering-constraints.md](./docs/development/project-engineering-constraints.md) - 工程约束
