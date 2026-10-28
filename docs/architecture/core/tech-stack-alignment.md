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
| 凭据存储      | `keyring` + 加密文件回退                    | 普通配置（不安全）                          |
| 进程执行      | `tokio::process` / `std::process::Command` | Node `child_process`               |
| 前端框架      | React 19 + Vite + Zustand + TypeScript     | （保留）                               |
| 桥接        | `#[tauri::command]` + `@tauri-apps/api`    | `ipcMain.handle` + `contextBridge` |
| 打包        | `cargo tauri build`                        | `electron-builder`                 |
| 包管理（Rust） | Cargo workspace                            | —                                  |
| 包管理（前端）   | npm / pnpm                                 | npm / pnpm（保留）                     |
| 单测        | `cargo test` + `vitest`（前端）                | `vitest`                           |
| E2E       | `@wdio/tauri-service`（embedded WebDriver，opt-in） | Playwright                  |


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

- 工作区主界面需要多面板共享状态
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

### keyring + credential fallback

已采用（`crates/credential/`）。理由：

- 双轨架构：优先使用 OS keyring（Windows Credential Manager / macOS Keychain / Linux Secret Service），失败时降级到加密文件（AES-256-GCM，密钥派生自机器指纹）
- 满足「密钥不进入普通配置或日志」的安全基线，同时保证 Linux 无 D-Bus 环境和 CI 下可用

### tauri-driver / WebDriver

已采用（桌面 E2E，opt-in）。理由：

- Tauri 官方推荐的 WebDriver 路线；本仓通过 `@wdio/tauri-service` 接入，使用其 **embedded provider**，因此不安装也不依赖外部 `tauri-driver` / `msedgedriver`。
- 只以 `--features e2e` 的 **debug** 产物运行（`pnpm run e2e:build`）；Rust 插件仅在 `TAURI_WEBDRIVER_PORT` 存在时注册，默认 feature 不编译、生产配置不开启 `withGlobalTauri`。
- 定位是桌面交互冒烟，**不进** `check:all`；入口与排障见技能 `desktop-e2e-wdio`，实测数据见 [wdio-tauri-desktop-e2e-eval-2026-10-28.md](../../knowledge-base/toolchain/wdio-tauri-desktop-e2e-eval-2026-10-28.md)。
- Playwright 仍用于纯前端 dev server 的浏览器调试（浏览器模式），两者分工不重叠。

## Migration Notes

相关迁移信息见 [system-overview.md](./system-overview.md)。