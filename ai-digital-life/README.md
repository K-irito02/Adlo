# AI Digital Life (Rust + Tauri)

This workspace hosts the `AI Digital Life` desktop app, rebuilt on **Rust + Tauri 2.x**.

> The previous Electron / TypeScript implementation is deprecated. See [docs/architecture/rust-migration-plan.md](./docs/architecture/rust-migration-plan.md) for the migration plan.

## Governance

- [AGENTS.md](./AGENTS.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [System Overview](./docs/architecture/system-overview.md)
- [Tech Stack Alignment](./docs/architecture/tech-stack-alignment.md)
- [Rust Migration Plan](./docs/architecture/rust-migration-plan.md)

## Tech Stack

| 层 | 选型 |
|---|---|
| 桌面框架 | Tauri 2.x |
| 后端语言 | Rust (stable) |
| 异步运行时 | tokio |
| 持久化 | SQLite via `rusqlite` |
| 序列化 | `serde` / `serde_json` |
| 日志 | `tracing` + `tracing-subscriber` |
| 错误 | `thiserror`（库 crate） / `anyhow`（应用层） |
| 文件监听 | `notify` |
| HTTP 客户端 | `reqwest` |
| 凭据存储 | `keyring` |
| 前端 UI | React 19 + Vite + Zustand + TypeScript |
| 桥接 | `#[tauri::command]` + `@tauri-apps/api` |
| 打包 | `cargo tauri build` |
| 测试 | `cargo test`、`vitest`（前端）、`tauri-driver`（E2E） |

## Project Structure

```
ai-digital-life/
├── Cargo.toml              # Workspace root
├── src-tauri/              # Tauri Rust 入口（main、commands、capabilities）
│   └── tauri.conf.json
├── crates/                 # 业务 crate（kernel、storage、workspace、…）
├── frontend/               # WebView 前端（React + Vite）
├── docs/                   # architecture / design-system
└── tests/                  # integration / e2e
```

详见 [AGENTS.md](./AGENTS.md) 中的完整目录树。

**前端目录要点（与 Electron 时代路径不同）**：完整 UI 在 `frontend/src/app/`（含 Monaco 编辑器）；共享类型在 `frontend/src/kernel`（import 别名 `@ai-digital-life/kernel`）；IPC 契约为 `frontend/src/shared/ipc.ts`；开发态数据与 `window.digitalLife` 由 `frontend/src/mock-bridge.ts` 提供，接入真实 Tauri 命令时保持同一接口即可。

## Current Scope

### Tauri Desktop Shell

- Tauri 2.x 桌面壳（Rust Backend + WebView）
- 类型化、capability 白名单的 Tauri Command 桥
- 默认 CSP、scope-限制的插件、无 `withGlobalTauri`

### Workspace & Retrieval

- SQLite-backed 最近工作区打开与恢复
- `tokio` 任务驱动的工作区扫描与状态回报（不开独立 Node Worker）
- 持久化 workspace / session / task / approval / audit 元数据

### Health & Diagnostics

- Health 状态与日志摘要
- 启动恢复标记、迁移评估与诊断
- 注册的迁移脚本带备份路径与执行状态诊断

### Task Governance

- 手动审批壳与任务队列
- 跨模块运行时事件总线（app / workspace / retrieval / task / approval）
- 审批决策回写与 checkpoint 元数据锚点
- Checkpoint payload 与恢复执行
- 基础 Git 脏树快照与审批触发

### Preferences

- 运行时语言切换（`zh-CN` / `en-US`）
- 运行时主题切换（`light` / `dark` / `system`）
- 五种语义一致的色彩方案

### Design System

- 分层 CSS：tokens / themes / base / layout / components / utilities
- TypeScript 设计系统模块
- WCAG AA 对比度
- 键盘可达 / 屏幕阅读器友好
- 响应式（>= 640px）
- 设计系统辅助函数全测试覆盖

### Infrastructure Crates

- `events`：跨模块事件
- `task`：Phase 0 治理原语
- `migration`：版本检测、备份与执行骨架
- `config` / `logger` / `errors` / `storage` / `workspace` / `kernel`

## Out Of Scope For This Slice

- 多 Agent 自治网络
- 插件市场
- 浏览器自动化运行时
- 远端协作

## Commands

> 当前实现处于 Rust + Tauri 重构阶段，命令以最终 Cargo workspace 为准。

```bash
# Rust 端
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo fmt --all

# 前端
npm --prefix frontend install
npm --prefix frontend run dev
npm --prefix frontend test

# 联合开发（Tauri + 前端 dev server）
cargo tauri dev

# 生产打包
cargo tauri build
```

## Documentation

### Architecture

- [System Overview](./docs/architecture/system-overview.md)
- [Tech Stack Alignment](./docs/architecture/tech-stack-alignment.md)
- [Rust Migration Plan](./docs/architecture/rust-migration-plan.md)
- [Internationalization](./docs/architecture/internationalization.md)
- [Theming](./docs/architecture/theming.md)
- [Recovery and Migration](./docs/architecture/recovery-and-migration.md)
- [Task Governance](./docs/architecture/task-governance.md)
- [Workspace and Retrieval](./docs/architecture/workspace-and-retrieval.md)

### Design System

- [Design System Overview](./docs/design-system/README.md)
- [Tokens](./docs/design-system/tokens.md)
- [Themes](./docs/design-system/themes.md)
- [Components](./docs/design-system/components.md)
- [Accessibility](./docs/design-system/accessibility.md)
- [Responsive Design](./docs/design-system/responsive.md)
- [Testing Strategy](./docs/design-system/testing.md)
