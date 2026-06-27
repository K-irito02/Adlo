# 日志系统操作手册

## 概述

日志系统提供统一的终端 tracing 日志和前端调试日志管理，支持三种写入模式，可通过 CLI 参数、配置文件、运行时 IPC 三种方式控制。

## 架构

```
crates/adl-logging/       # 统一日志管理 crate
  └── src/
      ├── lib.rs           # 公共 API: init(), LogManager, LogConfig
      ├── manager.rs       # LogManager — 核心: init / write_debug / set_mode / prune
      ├── config.rs        # LogConfig — 模式配置
      ├── mode.rs          # LogMode(Overwrite/Append/Multi) + LogTarget(Terminal/Debug)
      ├── session.rs       # SessionTracker — 会话追踪 + 自动清理
      └── error.rs         # LogError 类型
```

**终端日志**：Rust 后端 `tracing::info!()` / `warn!()` / `error!()` 等日志
**调试日志**：前端浏览器/WebView 中所有 `console.log`/`error`/`warn`/`info`/`debug` 调用

## 日志目录

```
{workspace_root}/.adl-logs/
├── terminal-logs.txt               # 终端 tracing 日志（始终存在）
├── debug-logs.txt                  # 前端调试日志（始终存在）
├── terminal-logs-2026-06-27_191500.txt  # multi 模式下独立会话文件
└── debug-logs-2026-06-27_191500.txt     # multi 模式下独立会话文件
```

日志目录位于项目根目录下的 `.adl-logs/` 文件夹，自动创建。

## 三种日志模式

| 模式 | terminal-logs.txt 行为 | debug-logs.txt 行为 | 会话文件 |
|------|------------------------|---------------------|---------|
| `overwrite` (默认) | 每次启动覆盖 | 每次防抖写入覆盖 | 无 |
| `append` | 每次启动追加 | 每次防抖写入追加 | 无 |
| `multi` | 写入固定文件 + 独立会话文件 | 写入固定文件 + 独立会话文件 | 命名格式: `{prefix}-YYYY-MM-DD_HHMMSS.txt` |

## 三种控制方式

### 1. CLI 参数（最高优先级）

启动时通过 `--log-mode` 指定，同时设置 terminal 和 debug 模式：

```powershell
pnpm run dev:both --log-mode append
pnpm run dev:tauri --log-mode multi
pnpm run dev:browser --log-mode overwrite
```

### 2. 配置文件（config.json）

在 `{app_data_dir}/config/config.json` 中设置：

```json
{
  "terminal_log_mode": "append",
  "debug_log_mode": "overwrite",
  ...
}
```

字段默认值为 `"overwrite"`，通过 `AppPreferencePatch` 持久化。

### 3. 运行时 IPC（通过前端调用）

```typescript
// 切换终端日志模式为追加
await window.digitalLife.setLogMode('terminal', 'append');

// 切换调试日志模式为多文件
await window.digitalLife.setLogMode('debug', 'multi');
```

## 终端日志（Rust tracing）

由 `LogManager::init()` 在应用启动时初始化，通过自定义 `MakeWriter` 实现：

- 使用 `tracing_subscriber::fmt::Layer` + 自定义 `TerminalMakeWriter`
- 共享 `BufWriter<File>`（8KB 缓冲区）
- 每次 tracing 事件触发时检查当前模式，模式变更时自动切换文件
- 时间戳为中国标准时间 CST（UTC+8）

支持的日志级别（由 `EnvFilter` 控制）：`info`、`warn`、`error`

可通过 `RUST_LOG` 环境变量覆盖：
```powershell
set RUST_LOG=debug && pnpm run dev:both
```

## 调试日志（前端 console 拦截）

由 `debugLogCollector.ts` 自动拦截所有 `console.*` 调用：

- 在内存中保留最近 **1000 条** 日志
- 每 **3 秒** 防抖写入一次文件

### Tauri 模式

调用 IPC 命令 `write_debug_logs_to_project` → Rust `LogManager::write_debug_logs()`

### 浏览器模式

通过 HTTP POST 请求预览服务器的 `/__adl_preview_api__/workspace/write-debug-logs` 端点
请求体包含模式参数，从 localStorage 的 `adl_log_mode_debug` 读取。

## 会话管理（multi 模式专属）

`SessionTracker` 负责：

- **命名**：`{prefix}-YYYY-MM-DD_HHMMSS.txt`
- **清理**：每个目标保留最近 **30 个** 会话文件，超出时自动清理最旧的
- **触发时机**：初始化时 + 切换到 multi 模式时 + 手动调用 `prune_sessions()`

## 双端一致性

| 功能 | Tauri 桌面 | 浏览器预览 |
|------|-----------|-----------|
| rust tracing 到 terminal-logs.txt | ✅ LogManager MakeWriter | ❌ 无 Rust 后端 |
| console.* 拦截到 debug-logs.txt | ✅ IPC → LogManager | ✅ HTTP → previewWorkspaceService |
| 三种模式支持 | ✅ LogManager 处理 | ✅ localStorage + 请求体参数 |
| setLogMode IPC | ✅ invoke | ✅ localStorage + HTTP header |

## 常见问题

### Q: 日志文件包含 `[2m` `[32m` `[0m` 等乱码
这是 ANSI 转义序列（终端颜色码）。已在文件层禁用。若仍出现，确认 `fmt::layer()` 是否调用 `.with_ansi(false)`。

### Q: 时间戳是 UTC 而不是北京时间
已使用 `chrono::Local::now()` 输出 CST（UTC+8）。格式：`YYYY-MM-DDTHH:MM:SS.mmm`

### Q: terminal-logs.txt 为空
确认 `OpenOptions` 使用了 `.write(true)`（而非 `.append(false)`，后者不隐含写入权限）。

### Q: 日志目录不存在
应用启动时自动创建。若手动删除，重启后自动重建。

### Q: multi 模式下会话文件过多
自动保留最近 30 个，可在 `session.rs` 的 `MAX_SESSIONS` 常量调整。

### Q: 如何查看实时日志
- 终端：stdout 层持续输出（含 ANSI 颜色）
- 文件：`.adl-logs/terminal-logs.txt` 实时写入，`BufWriter` 在每次写入后 flush
- 调试日志：每 3 秒防抖写入 `.adl-logs/debug-logs.txt`
