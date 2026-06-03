# Tech Stack Alignment

## Summary

项目已迁移到 **Rust + Tauri 2.x** 技术栈。本文件记录主栈、依赖选型理由以及取代旧 Electron 栈的逐项对应。

### 已采用的主栈


| 层         | 选型                                         | 替代了                                |
| --------- | ------------------------------------------ | ---------------------------------- |
| 桌面框架      | Tauri 2.x                                  | Electron                           |
| 后端语言      | Rust (stable)                              | Node.js / TypeScript（Main 进程）      |
| 异步运行时     | tokio                                      | Node event loop                    |
| 持久化       | SQLite via `rusqlite`                      | `better-sqlite3`                   |
| 序列化       | `serde` / `serde_json`                     | 手写 JSON                            |
| 日志        | `tracing` + `tracing-subscriber`           | `pino`                             |
| 错误处理      | `thiserror`（库）+ `anyhow`（应用层）              | 自定义 TS Error                       |
| 文件监听      | `notify`                                   | `chokidar`                         |
| HTTP 客户端  | `reqwest`                                  | Node `fetch`                       |
| 凭据存储      | `keyring`                                  | 普通配置（不安全）                          |
| 进程执行      | `tokio::process` / `std::process::Command` | Node `child_process`               |
| 前端框架      | React 19 + Vite + Zustand + TypeScript     | （保留）                               |
| 桥接        | `#[tauri::command]` + `@tauri-apps/api`    | `ipcMain.handle` + `contextBridge` |
| 打包        | `cargo tauri build`                        | `electron-builder`                 |
| 包管理（Rust） | Cargo workspace                            | —                                  |
| 包管理（前端）   | npm / pnpm                                 | npm / pnpm（保留）                     |
| 单测        | `cargo test` + `vitest`（前端）                | `vitest`                           |
| E2E       | `tauri-driver` (WebDriver)                 | Playwright                         |


### 已废弃的栈项

- Electron / `electron-rebuild`
- `better-sqlite3`（Node binding）
- `chokidar`
- `pino`
- `electron-builder`
- Node Worker Thread（被 `tokio::spawn` 取代）
- Preload 脚本（Tauri 原生隔离不需要）

## Why Rust + Tauri

迁移到 Rust + Tauri 的核心驱动：

- **更小的安装包与运行时占用**：Tauri 利用 OS 自带 WebView，安装包从数十 MB 降至个位数 MB
- **内存安全**：Rust 借用检查器消除大类内存安全问题，对长期运行的桌面应用尤为关键
- **能力模型更细粒度**：Tauri 2.x Capability + Permission 系统天然落实最小权限
- **统一类型契约**：Rust struct + `serde` 在 backend 与 WebView 之间天然类型化，无需手维 IPC d.ts
- **无 Node 原生模块兼容噩梦**：`better-sqlite3` 等 native module 对 Electron 版本敏感，Rust crate 通过 Cargo 解决
- **更强的并发模型**：`tokio` + 通道 + 借用检查 替代 EventEmitter + Promise 编排

## Alignment Decision By Item

### Tauri 2.x

已采用。理由：

- 当前目标本身就是桌面壳层、Backend、WebView 边界与权限治理
- Capability + Permission 模型直接落实「最小暴露面」

### Rust (stable)

已采用。理由：

- 类型化 IPC、SQLite 状态结构、后台任务消息契约都直接受益
- 无 GC、无运行时依赖，启动与稳态都更可控

### Vite

已采用（前端）。理由：

- 前端 dev/build 工具链稳定，无需更换

### React 19 + Zustand

已采用（前端）。理由：

- 阶段二工作区主界面需要多面板共享状态
- 无需重写已经稳定的 UI 层

### rusqlite

已采用。理由：

- 桌面应用本地 SQLite 通常无需异步 DB 复杂度
- 同步 API 在 `tokio::task::spawn_blocking` 中调用即可
- 比 `sqlx` 更轻量，编译时间更短，无需运行 macro/migration 工具

### tokio

已采用。理由：

- 模型流、文件监听、命令执行、HTTP、检索任务都天然异步
- Tauri 自身基于 tokio runtime

### tracing

已采用。理由：

- 结构化日志 + span 比 `pino` 更强的上下文传递
- 与 `tracing-subscriber` 生态对齐（控制台、文件、JSON、OTLP）

### notify

已采用。理由：

- 跨平台文件监听，是 Rust 生态对 `chokidar` 的标准替代
- 与 `tokio` 配合可以做事件去抖与批处理

### keyring

已采用。理由：

- 跨平台访问 OS 凭据存储（Windows Credential Manager / macOS Keychain / Linux Secret Service）
- 满足「密钥不进入普通配置或日志」的安全基线

### tauri-driver / WebDriver

已采用（E2E）。理由：

- Tauri 官方推荐 E2E 工具
- Playwright 仍可用于纯前端 dev server 调试，但生产 E2E 走 WebDriver

## Migration Notes

详见 [rust-migration-plan.md](./rust-migration-plan.md)：分阶段实施路线、Cargo workspace 目标结构、Electron -> Tauri 安全模型映射、关键技术决策表。