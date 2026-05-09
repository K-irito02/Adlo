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
├── .mcp.json               # MCP server config (Chrome DevTools for browser testing)
├── src-tauri/              # Tauri Rust 入口（main、commands、capabilities）
│   └── tauri.conf.json
├── crates/                 # 业务 crate（kernel、storage、workspace、…）
├── frontend/               # WebView 前端（React + Vite）
├── scripts/                # 开发脚本（动态端口选择、多表面启动）
├── docs/                   # architecture / design-system
└── tests/                  # integration / e2e
```

详见 [AGENTS.md](./AGENTS.md) 中的完整目录树。

**前端目录要点（与 Electron 时代路径不同）**：完整 UI 在 `frontend/src/app/`（含 CodeMirror 编辑器、Diff 视图与多格式预览）；共享类型在 `frontend/src/kernel`（import 别名 `@ai-digital-life/kernel`）；IPC 契约为 `frontend/src/shared/ipc.ts`；桌面壳通过 `frontend/src/tauri-bridge.ts` 调 Tauri 命令，纯浏览器开发态通过 `frontend/src/preview-bridge.ts` 调本地 Vite 工作区接口（由 `frontend/dev/previewWorkspaceService.ts` 提供服务端 API，含原生目录选择器）；两者保持同一 `DigitalLifeBridge` 契约，并都支持真实文件树刷新、基础文件/目录创建与原生目录选择。

## Current Scope

### Tauri Desktop Shell

- Tauri 2.x 桌面壳（Rust Backend + WebView）
- 类型化、capability 白名单的 Tauri Command 桥
- 默认 CSP、scope-限制的插件、无 `withGlobalTauri`

### Workspace & Retrieval

- SQLite-backed 最近工作区打开与恢复
- 支持“仅对话模式”全局会话；无活动工作区时，会话以内部 `__global__` 作用域持久化
- 状态栏支持切换已有工作区、预绑定新工作区，并在首次发送消息时延迟创建对应工作区会话
- `tokio` 任务驱动的工作区扫描与状态回报（不开独立 Node Worker）
- Retrieval snapshot 会生成 repo-map 等结构化元数据（默认不在 UI 直接展示，主要用于模型消费与后台诊断日志）
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
- 工作区状态栏支持列出本地分支、切换分支、创建新分支；跨基底或脏树场景要求显式 stash 确认

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
npm run dev            # Tauri 桌面应用
npm run dev:browser    # 仅浏览器预览
npm run dev:tauri      # Tauri 桌面应用（同 dev）
npm run dev:both       # 同时启动浏览器预览 + Tauri 桌面应用

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
- [Run Activity and Run Summary](./docs/architecture/run-activity-and-run-summary.md)

### Design System

- [Design System Overview](./docs/design-system/README.md)
- [Tokens](./docs/design-system/tokens.md)
- [Themes](./docs/design-system/themes.md)
- [Components](./docs/design-system/components.md)
- [Accessibility](./docs/design-system/accessibility.md)
- [Responsive Design](./docs/design-system/responsive.md)
- [Testing Strategy](./docs/design-system/testing.md)

## Browser Testing

项目支持两类浏览器测试：

- **手工 / in-app browser 验证**：适合交互调试、截图、DOM 检查
- **Playwright 真实浏览器测试**：适合隔离会话、可重复回归、CI

### 启动浏览器预览

```bash
npm run dev:browser    # 仅浏览器
npm run dev:both       # 浏览器 + Tauri 桌面应用
```

### Playwright 真实浏览器回归

前端 Playwright 配置默认会：

1. 通过根级 `npm run dev:browser` 启动真实浏览器预览
2. 使用独立 Chromium 会话访问 `preview-bridge.ts`
3. 通过 `adl.preview.active-workspace.v1` 恢复目标工作区
4. 复用 `frontend/e2e/support/previewWorkspace.ts` 打开真实 workspace，而不是依赖手工准备的 in-app 状态

常用命令：

```bash
npm --prefix frontend run test:e2e:workspace   # 仅验证独立浏览器会话可恢复真实 workspace
npm --prefix frontend run test:e2e             # 全量 Playwright 浏览器测试
```

可选环境变量：

```bash
ADL_E2E_HOST=127.0.0.1
ADL_E2E_PORT=5173
ADL_E2E_BASE_URL=http://127.0.0.1:5173
ADL_E2E_WORKSPACE=E:/Programs/Obsidian/notes/ai-digital-life
```

约束：

- 需要工作区上下文的浏览器测试，必须显式恢复或打开 workspace
- 不要依赖某个已经打开的 in-app browser 标签页状态
- 优先通过 `openPreviewWorkspace()` 建立前置条件，再进入具体断言

### MCP 配置（可选）

项目根目录 `.mcp.json` 配置了 Chrome DevTools MCP 服务器，用于 AI 辅助浏览器测试（截图、DOM 检查、控制台日志、性能分析等）。

确保已安装 `browser-testing-with-devtools` 技能：

```bash
npx skills add addyosmani/agent-skills@browser-testing-with-devtools -g -y
```

详见 [browser-testing-with-devtools](https://skills.sh/addyosmani/agent-skills/browser-testing-with-devtools)。
