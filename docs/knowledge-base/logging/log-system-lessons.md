# 日志系统统一改造经验

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

**正确做法**：预览服务器维护同一份 `.adl-logs/` 日志目录，通过 localStorage 读取 `setLogMode` 设置的模式参数。

### 6. 双端一致性检查清单

| 检查项 | Tauri | Browser |
|--------|-------|---------|
| 调试日志写入 .adl-logs/ | IPC → LogManager | HTTP → previewServer |
| 模式参数传递 | 内部 config | localStorage + 请求体 |
| setLogMode 桥接 | Tauri invoke | localStorage 存储 |

## 架构变化

- **新增** `crates/adl-logging/` crate（~660 行）
- **修改** `kernel::types::config` 新增 `LogMode` 枚举
- **修改** `kernel::config::AppConfig` 新增 `terminal_log_mode` / `debug_log_mode` 字段
- **修改** `setup.rs` — 用 `LogManager::init()` 替代旧的 `adl_logger::init_with_log_dir()`
- **修改** `commands/app.rs` — 调试日志写入委托给 LogManager，新增 `app_set_log_mode` 命令
- **修改** `main.rs` — 新增 `--log-mode` CLI 解析
- **修改** `frontend/` — IPC 桥接新增 `setLogMode`
- **移除** `kernel::logger` 的实际使用（代码保留但不再调用）
- **移除** `std::mem::forget(guard)` 泄露出模式
