# 日志系统统一改造经验

> **时效声明（2026-10-12 更新）**
> 本文记录 2026-09 的统一改造经验，其中 §1–§4、§7 等**底层经验仍然有效**。
> 但下面的机制**已被后续改动取代**，当前做法请看 [日志系统操作手册](../../development/log-system-manual.md)：
> - `setLogMode` 桥接命令与 `localStorage['adl_log_mode_debug']` —— **已删除**（死 API / 幻影 key）
> - 浏览器调试日志模式 → 改为解析链 `VITE_ADL_DEBUG_LOG_MODE` → `appInfo.config.debugLogMode` → 默认
> - `app_set_log_mode` 命令 —— 已删除；改设置统一走 `app_update_preferences` / `POST /app/preferences`
> - 新增：`LogLevel` 强类型与运行时级别热切换、`--log-level` 等 CLI 覆盖、按进程前缀分文件

## 概述

将分散的终端 tracing 日志（`kernel::logger` + `tracing-appender`）和前端调试日志（`debugLogCollector.ts` + `previewWorkspaceService.ts`）统一为 `adl-logging` crate，支持 overwrite/append/multi 三种模式。

## 关键经验

### 1. Rust `OpenOptions::append(false)` 不隐含写入权限

**问题**：`OpenOptions::new().append(mode == LogMode::Append)` 在 `Overwrite` 模式下等于 `.append(false)`，这不会设置 `.write(true)`，导致文件以只读方式打开，`BufWriter` 写入静默失败。

**正确做法**：
- Overwrite：`OpenOptions::new().write(true).create(true).truncate(true)`
- Append：`OpenOptions::new().append(true).create(true)`

### 2. `tracing_subscriber::fmt::Layer` 的 ANSI 控制

**问题**：`fmt::layer()` 默认启用 ANSI 颜色转义。写入文件时，ANSI 码（`[2m`、`[32m`、`[0m` 等）被写入文件，造成乱码。

**正确做法**：文件层调用 `.with_ansi(false)`，stdout 层保留默认值以支持终端彩色输出。

### 3. 自定义时间格式用 `FormatTime` trait

**问题**：默认 timer 输出 UTC，需要 CST（UTC+8）。

**正确做法**：实现 `tracing_subscriber::fmt::time::FormatTime` trait，使用 `chrono::Local::now()`。

```rust
struct CstTime;
impl FormatTime for CstTime {
    fn format_time(&self, w: &mut Writer<'_>) -> fmt::Result {
        write!(w, "{}", chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f"))
    }
}
```

注意 trait 的方法参数类型是 `tracing_subscriber::fmt::format::Writer<'_>`（不是 `impl std::io::Write`）。

### 4. `MakeWriter` trait 版本兼容

tracing-subscriber 0.3.23 使用 `MakeWriter<'a>`（带生命周期参数）。实现时必须匹配版本。

### 5. 浏览器模式日志路径需独立维护

**问题**：浏览器模式下 Tauri Rust 后端不存在，日志走预览服务器 HTTP API。预览服务器的 `writeDebugLogs` 是独立实现，需与 Rust 端保持行为一致。

**正确做法（2026-10-12 起）**：预览服务器写 `<仓库根>/.adl-logs/debug-logs-browser*.txt`（与 Tauri 壳的 `debug-logs*.txt` **分名**，避免 `dev:both` 下互相覆盖）；模式来源为解析链 `VITE_ADL_DEBUG_LOG_MODE`（CLI/env 注入）→ `appInfo.config.debugLogMode`（用户设置）→ `'overwrite'`。详见 [操作手册](../../development/log-system-manual.md)。

### 6. 双端一致性检查清单

| 检查项 | Tauri | Browser |
|--------|-------|---------|
| 调试日志写入 `.adl-logs/` | IPC → LogManager（`debug-logs*.txt`） | HTTP → previewServer（`debug-logs-browser*.txt`） |
| 模式参数传递 | 内部 config / `--debug-log-mode` | 解析链：`VITE_ADL_DEBUG_LOG_MODE` → `appInfo.config.debugLogMode` → 默认 |
| 改日志设置 | `app_update_preferences`（+ 转发 `/app/log-settings`） | `POST /app/preferences`（落盘）/ `/app/log-settings`（仅运行时） |

## 架构变化

- **新增** `crates/adl-logging/` crate（~660 行）
- **修改** `kernel::types::config` 新增 `LogMode` 枚举
- **修改** `kernel::config::AppConfig` 新增 `terminal_log_mode` / `debug_log_mode` 字段
- **修改** `setup.rs` — 用 `LogManager::init()` 替代旧的 `adl_logger::init_with_log_dir()`
- **修改** `commands/app.rs` — 调试日志写入委托给 LogManager（原新增的 `app_set_log_mode` 已于 2026-10-12 删除）
- **修改** `main.rs` — 新增 `--log-mode` CLI 解析（2026-10-12 扩展为 `--log-level` 等四项）
- **修改** `frontend/` — IPC 桥接新增 `setLogMode`（**已于 2026-10-12 删除**：无调用方）
- **移除** `kernel::logger` 的实际使用（代码保留但不再调用）
- **移除** `std::mem::forget(guard)` 泄露出模式

### 7. 持锁期间禁止打 tracing 日志（自死锁）

**问题**：`LogManager::set_mode` 在持有配置 `RwLock` 写守卫期间调 `tracing::info!`，
文件层 `TerminalWriter::write` 在同线程读同一把非重入锁 → 永久 park 并泄漏写锁，
毒化后所有 tracing 事件卡死线程（设置面板下拉/复选框无响应直至崩溃，2026-09-29 实测）。
同类：`prune_old_sessions` 在持有 sessions `Mutex` 期间的失败路径 `warn!`。

**正确做法**：守卫作用域收窄到只覆盖字段变更，日志移到守卫 drop 之后；
prune 类函数只收集失败（`PruneReport`/`PruneFailure`），由调用方在锁外统一打日志。
回归测试用同构 writer（落盘前先读/锁同一把锁）+ `recv_timeout` 把死锁转为可断言的超时失败。
