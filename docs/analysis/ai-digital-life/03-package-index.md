# AI Digital Life 包索引

> 每个 crate/包/目录的职责、关键文件、依赖。
> 快照数字以源码为准（本页数字已按实测 22 crate / 13 命令文件 / 25 功能域 / 32 切片 / 25 IPC 文件核对）;
> 规范约束见 `.agents/rules/`。

## Rust 后端 Crates（22 个）

### 基础设施层

#### `kernel` — 共享内核
- **路径**：`crates/kernel/src/`
- **职责**：共享内核（app_info/config/events/storage/types 子模块；`storage::StoragePaths` 统一解析全部应用数据路径）
- **依赖**：`serde`, `serde_json`, `thiserror`

#### `types` — 共享类型
- **路径**：`crates/types/src/`
- **职责**：前后端公共类型契约层

#### `errors` — 统一错误类型
- **路径**：`crates/errors/src/lib.rs`
- **职责**：`AppError` 枚举（thiserror 派生），禁止 `Result<_, String>` 裸字符串
- **依赖**：`thiserror`

#### `storage` — SQLite 持久化
- **路径**：`crates/storage/src/`
- **职责**：SQLite 连接池 + CRUD（WAL 模式，阻塞 IO 包 `spawn_blocking`）
- **依赖**：`rusqlite`, `kernel`, `migration`

#### `migration` — 数据库迁移
- **路径**：`crates/migration/src/`
- **职责**：SQLite schema 版本化迁移
- **依赖**：`rusqlite`, `kernel`

#### `adl-logging` — 日志系统
- **路径**：`crates/adl-logging/src/`
- **职责**：tracing 日志配置 + 文件 appender + 日志会话管理
- **依赖**：`tracing`, `tracing-subscriber`, `tracing-appender`

### 领域服务层

#### `workspace` — 工作区管理
- **路径**：`crates/workspace/src/`
- **职责**：文件系统/Git/搜索/树/预览，多工作区管理
- **依赖**：`kernel`, `storage`, `git2`, `ignore`

#### `pty` — 伪终端
- **路径**：`crates/pty/src/`（traits.rs/rust_pty_impl.rs/session_manager/shell_resolver.rs）
- **职责**：Rust 侧 PTY 进程管理
- **依赖**：`kernel`, `tokio`

#### `fs-ops` — 文件系统操作
- **路径**：`crates/fs-ops/src/`
- **职责**：文件读写/监听/元数据
- **依赖**：`kernel`, `notify`

#### `outline` — 大纲解析
- **路径**：`crates/outline/src/`
- **职责**：源码大纲解析（function/class/symbol 提取）
- **依赖**：`kernel`, `tree-sitter`

#### `credential` — 凭据存储
- **路径**：`crates/credential/src/`
- **职责**：API Key 安全存储（keyring + 加密文件降级），禁入普通配置/日志
- **依赖**：`kernel`, `keyring`

#### `ci-status` — CI 状态
- **路径**：`crates/ci-status/src/`
- **职责**：GitHub Actions CI 状态轮询
- **依赖**：`kernel`, `reqwest`

#### `clipboard` — 剪贴板历史
- **路径**：`crates/clipboard/src/`
- **职责**：剪贴板历史持久化

#### `sysmon` — 系统监视器
- **路径**：`crates/sysmon/src/`
- **职责**：系统状态监控

#### `change-engine` — 变更引擎
- **路径**：`crates/change-engine/src/`
- **职责**：Patch 预览/应用/回滚 + Snapshot + checkpoint
- **依赖**：`kernel`, `fs-ops`, `git2`

#### `server` — adl-server 后端引擎
- **路径**：`crates/server/src/`
- **职责**：浏览器模式真实后端（HTTP API + WebSocket），与 Tauri 壳共用领域逻辑

### dsh 宿主集成层

#### `webapp-host` — dsh 进程托管
- **路径**：`crates/webapp-host/src/`
- **职责**：第三方 harness（deepseek dsh）进程拉起与托管

#### `dsh-bundle` — 内置 dsh 包
- **路径**：`crates/dsh-bundle/src/`
- **职责**：内置 dsh 预安装包（manifest + package 目录）

#### `dsh-version` — dsh 版本管理
- **路径**：`crates/dsh-version/src/`
- **职责**：已安装版本列表/切换/npm 仓库查询/智能源选择/真安装引擎（`install.rs`）/任务进度与取消（`task.rs`）

#### `download-source` — 下载源
- **路径**：`crates/download-source/src/`
- **职责**：npm 仓库地址/镜像源/代理配置

#### `browser` — 内置浏览器
- **路径**：`crates/browser/src/`
- **职责**：Tauri 子 WebView 生命周期管理（创建/导航/销毁/嵌入）

#### `tauri-runtime-wry-patched` — Tauri 运行时补丁
- **路径**：`crates/tauri-runtime-wry-patched/`
- **职责**：Tauri 运行时补丁（wry 相关）

> Agent 对话、模型接入与编排由第三方 harness（deepseek dsh）提供，本仓库不设 agent-runtime/model-gateway/mcp-client/lsp-client 等 crate。

## Tauri 入口（src-tauri，13 个命令文件）

| 文件 | 职责 |
|------|------|
| `app.rs` | 应用信息/调试日志落盘（write_debug_logs_to_project）/偏好 |
| `browser.rs` | 浏览器命令 |
| `browser_memory.rs` | 浏览器内存相关 |
| `browser_webview_setup.rs` | WebView 初始化 |
| `clipboard.rs` | 剪贴板 |
| `divider_strip.rs` | 分隔线透明桥接条 |
| `download_commands.rs` | 下载 |
| `platform.rs` | 平台信息 |
| `port_scan.rs` | 本地端口扫描 |
| `reserved.rs` | 保留接口 |
| `storage.rs` | 存储（locator/migration/preflight） |
| `workspace.rs` | 工作区 |
| `mod.rs` | 模块注册 |

## 前端包

### Features（25 功能域）

| 功能域 | 目录 |
|--------|------|
| 内置浏览器 | `features/browser/` |
| 浏览器设置 | `features/browser-settings/` |
| 浏览器树 | `features/browser-tree/` |
| 中间区宿主 | `features/center/`（CenterEntryPage：dsh/浏览器/终端三入口） |
| 剪贴板历史 | `features/clipboard-history/` |
| 差异查看 | `features/diff-viewer/` |
| 分隔线桥接条 | `features/divider-strip/` |
| dsh 宿主 | `features/dsh/` |
| 编辑器 | `features/editor/`（CodeMirror + FoldTooltipOverlay） |
| 文件树 | `features/file-tree/` |
| Git 可视化 | `features/git-visualization/` |
| 多工作区 | `features/multi-workspace/` |
| 大纲 | `features/outline/` |
| 补丁审查 | `features/patch-review/` |
| 文件预览 | `features/preview/` |
| 存储设置 | `features/storage-settings/` |
| 系统监视器 | `features/system-monitor/` |
| 终端 | `features/terminal/`（xterm.js + 多窗格） |
| 通用树 | `features/tree/` |
| 工作区浏览器 | `features/workspace-browser/` |
| 工作区变更树 | `features/workspace-changes-tree/` |
| 工作区文件树 | `features/workspace-file-tree/` |
| 工作区设置 | `features/workspace-settings/` |
| 工作区终端 | `features/workspace-terminal/` |

### Zustand Store（slicedStore.ts 实测 32 切片，AGENTS.md 已同步）

| 切片 | 文件 |
|------|------|
| `uiSlice` | `slices/uiSlice.ts`（+ uiSliceExpansion/uiSliceWidths/uiSliceTypes） |
| `workspaceSlice` | `slices/workspaceSlice.ts` |
| `editorSlice` | `slices/editorSlice.ts` |
| `gitSlice` 系列 | `slices/gitSlice.ts`（+ gitVisSlice） |
| `patchSlice` | `slices/patchSlice.ts` |
| `searchSlice` | `slices/searchSlice.ts` |
| `diagnosticSlice` | `slices/diagnosticSlice.ts` |
| `terminalSlice` 系列 | `slices/terminalSlice.ts`（+ terminalSliceTypes） |
| `clipboardSlice` 系列 | `slices/clipboardSlice.ts`（+ clipboardHistorySlice） |
| `browserSlice` 系列 | `slices/browserSlice.ts`（+ browserTabs/bookmark/history/folders/landing/searchEngines/downloads；browserSliceShared/browserTypes） |
| `browserFoldersSlice` 系列 | `slices/browserFoldersSlice.ts`（+ browserFoldersDeletion/Types/Utils） |
| `centerTabsSlice` 系列 | `slices/centerTabsSlice.ts`（+ centerTabsTypes/tabLocation） |
| `dshSlice` | `slices/dshSlice.ts` |
| `referenceSlice` | `slices/referenceSlice.ts` |
| `systemMonitorSlice` | `slices/systemMonitorSlice.ts` |
| `notificationSlice` | `slices/notificationSlice.ts` |
| `errorToastSlice` | `slices/errorToastSlice.ts` |
| `fileOpNoticeSlice` | `slices/fileOpNoticeSlice.ts` |
| `toastSlice` | `slices/toastSlice.ts` |

> 计数以 `slicedStore.ts` 实测为准（32 切片 / 18 action，AGENTS.md 已同步）。

### IPC 接口域（`shared/ipc/` 25 个文件）

```
shared/ipc/app.ts            shared/ipc/browser.ts
shared/ipc/clipboard.ts      shared/ipc/digital-life.ts
shared/ipc/download.ts       shared/ipc/dsh.ts
shared/ipc/durable.ts        shared/ipc/github.ts
shared/ipc/index.ts          shared/ipc/patch.ts
shared/ipc/preview-api.ts    shared/ipc/pty-ws.ts
shared/ipc/pty.ts            shared/ipc/reference.ts
shared/ipc/reserved.ts       shared/ipc/retrieval.ts
shared/ipc/searchIgnore.ts   shared/ipc/searchWindow.ts
shared/ipc/shared.ts         shared/ipc/snapshot.ts
shared/ipc/storage.ts        shared/ipc/system_monitor.ts
shared/ipc/window.ts         shared/ipc/workspace-events-ws.ts
shared/ipc/workspace.ts
```
