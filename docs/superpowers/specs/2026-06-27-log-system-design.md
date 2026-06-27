# 日志系统统一设计规格

> 设计日期: 2026-06-27 | 方案: 统一 Crate（方案B）

## 目标

将当前分散的终端 tracing 日志和前端调试日志系统统一为一个 `adl-logging` crate，支持 overwrite / append / multi 三种写入模式，通过 CLI 参数 + config.json + 运行时 IPC 三种方式控制。

## 当前状态

| 组件 | 位置 | 行为 |
|------|------|------|
| terminal-logs.txt | `kernel::logger` → tracing-appender → File::create | 始终覆盖 |
| debug-logs.txt | Tauri `write_debug_logs_to_project` → fs::write | 始终覆盖 |
| debug-{ts}.log | Tauri `write_debug_logs` → fs::write | 时间戳单文件 |

问题:
- 无 CLI arg 解析
- 无 append 模式、无 multi 模式
- `std::mem::forget(guard)` 泄露 tracing-appender guard
- 终端/调试两套独立通路
- 浏览器模式单独处理

## 架构

```
crates/adl-logging/          # 新 crate
  └── LogManager             # 统一入口

src-tauri/
  ├── setup.rs               # LogManager::init()
  ├── commands/app.rs        # 委托 LogManager
  └── main.rs                # --log-mode CLI 解析

kernel/
  ├── types/config.rs        # 新增 LogMode 枚举
  └── config.rs              # AppConfig 新增 terminal_log_mode / debug_log_mode

frontend/
  └── debugLogCollector.ts   # 通过 IPC 获取模式
  └── shared/ipc.ts          # 新增 setLogMode()
  └── tauri-bridge.ts        # invoke("app_set_log_mode")
```

## LogMode 枚举

```rust
pub enum LogMode { Overwrite, Append, Multi }
```

## 文件布局

```
{workspace_root}/.adl-logs/
├── terminal-logs.txt               # 固定文件（始终存在）
├── debug-logs.txt                  # 固定文件（始终存在）
├── terminal-logs-2026-06-27_143015.txt  # multi 会话文件
└── debug-logs-2026-06-27_143015.txt     # multi 会话文件
```

## 控制流

```
优先级: CLI arg > config.json > default(Overwrite)
触发点:
  1. 应用启动: CLI arg + config.json → LogManager::init()
  2. 运行时: 前端调用 → app_set_log_mode IPC → LogManager::set_mode()
```

## 终端 tracing 写入

自定义 MakeWriter + Arc<Mutex<BufWriter<File>>> 共享文件句柄。
每次 tracing 事件触发时检查当前模式，模式变更时自动切换文件。
不再使用 tracing-appender → 无 guard 泄露问题。
BufWriter(8KB) 补偿同步写入开销。

## 调试日志写入

由前端 debugLogCollector 每 3 秒防抖调用 IPC → LogManager::write_debug_logs()。
多文件模式: 同时写入固定文件和会话文件。

## 约束

- 日志文件写入 `{workspace_root}/.adl-logs/`（E: 盘项目根目录）
- adl-logging 不依赖 tokio
- 保留 terminal-logs.txt 和 debug-logs.txt 两个固定文件
- multi 模式会话文件命名: `{prefix}-YYYY-MM-DD_HHmmss.txt`
- multi 模式默认保留最近 30 个会话文件
