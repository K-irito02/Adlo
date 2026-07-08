# Rust 后端编码模式

> 源码路径：`ai-digital-life/crates/` + `ai-digital-life/src-tauri/`

## Crate 依赖方向

```
kernel (核心类型)
  ← errors (AppError)
  ← adl-logging (tracing)
  ← storage / migration (SQLite)
  ← 领域服务层: workspace / conversation / command / pty / fs-ops / task / context / outline / credential / ci-status
  ← AI 层: agent-runtime / model-gateway / subagent / change-engine / mcp-client / lsp-client
  ← Tauri 壳: src-tauri (commands/ + events/ + capabilities/)
```

方向约束：上层可依赖下层，下层绝不依赖上层。kernel 被所有 crate 依赖，是唯一零依赖的底层。

## AppError 枚举模式

定义于 `crates/errors/src/lib.rs`，约 30 个变体。使用 `thiserror` 派生。

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFoundError(String),
    #[error("Invalid input: {0}")]
    InvalidInputError(String),
    #[error("Storage error: {0}")]
    StorageError(String),
    #[error("Workspace error: {0}")]
    WorkspaceError(String),
    #[error("Config error: {0}")]
    ConfigError(String),
    #[error("IO error: {0}")]
    IOError(#[from] std::io::Error),
    #[error("Terminal error: {0}")]
    TerminalError(String),
    #[error("Model error: {0}")]
    ModelError(String),
    #[error("Network error: {0}")]
    NetworkError(String),
    #[error("Internal error: {0}")]
    InternalError(String),
    // ... ~20 更多变体
}
```

规则：
- 禁止 `Result<_, String>` 裸字符串，必须使用 `AppError`
- 禁止在后端 panic 而不返回结构化错误
- 关键错误使用 `tracing::error!` / `tracing::warn!` 记录

## #[tauri::command] 模式

所有 Command 定义在 `src-tauri/src/commands/` 下，返回 `Result<T, AppError>`。

```rust
#[tauri::command]
async fn list_workspaces(state: tauri::State<'_, AppState>) -> Result<Vec<WorkspaceSummary>, AppError> {
    let workspaces = state.storage.list_workspaces()?;
    Ok(workspaces)
}
```

- 33 个 Command 模块，每个对应一个前端功能域
- 参数通过 `tauri::State` 注入 `AppState`
- 前端 IPC 三桥接层签名必须与后端 Command 签名一致

## SQLite 连接池 + 迁移模式

### 连接池 (`crates/storage/src/`)

使用 `rusqlite::Connection` + 连接池封装。通过 `AppState` 注入到 Tauri Command。

```rust
pub struct Storage {
    conn: Connection,
}

impl Storage {
    pub fn new(db_path: &str) -> Result<Self, AppError> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        Ok(Self { conn })
    }
}
```

### 迁移 (`crates/migration/src/`)

版本化迁移，支持增量 schema 变更。

```rust
pub fn run_migrations(conn: &Connection) -> Result<(), AppError> {
    let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    match version {
        0 => {
            conn.execute_batch(SCHEMA_V1)?;
            conn.pragma_update(None, "user_version", 1)?;
        }
        // 后续迁移...
        _ => {}
    }
    Ok(())
}
```

## Async 模式

- 异步运行时：`tokio`（Tauri 内置）
- Tauri Command 直接声明 `async fn`
- 流式处理使用 `tokio-stream` + Tauri Event
- 长连接/轮询使用 `tokio::spawn` + 通道

流式路径：
```
Rust agent_pipeline_stream → Tauri Event emit → 前端 onEvent → Store 增量更新 → UI 渲染
```

## Tracing/Logging 模式

定义于 `crates/adl-logging/src/`。

```rust
use tracing::{info, warn, error, debug};

// 配置
tracing_subscriber::fmt()
    .with_env_filter(EnvFilter::from_default_env())
    .with_writer(tracing_appender::rolling::never("logs", "debug-logs.txt"))
    .init();
```

- 使用 `tracing` + `tracing-subscriber` + `tracing-appender`
- 文件 appender 输出到 `debug-logs.txt`
- 命令行输出到 stderr（Tauri 自动捕获）

## Capability 安全模式

定义于 `src-tauri/capabilities/`。

```
src-tauri/capabilities/
├── default.json       # 基础权限（窗口、文件系统）
└── plugin-*.json      # 插件附加权限
```

- 白名单模式：只有 capability 中显式声明的权限才可用
- 每个 Command 对应一个 capability entry
- 禁止通配符权限

## 关键文件参考

| 路径 | 职责 |
|------|------|
| `crates/kernel/src/` | 共享核心类型（agent/ci/command/config/model/workspace/hotkeys） |
| `crates/errors/src/lib.rs` | AppError 枚举定义 |
| `crates/storage/src/` | SQLite 连接池 + CRUD |
| `crates/migration/src/` | 数据库 schema 迁移 |
| `crates/adl-logging/src/` | tracing 日志初始化 |
| `src-tauri/src/lib.rs` | Tauri 应用入口（AppState 构建 + 插件注册 + Command 注册） |
| `src-tauri/src/commands/` | 33 个 Tauri Command 模块 |
| `src-tauri/src/events/` | Tauri 事件定义 |
| `src-tauri/src/capabilities/` | 权限能力白名单 |
| `src-tauri/tauri.conf.json` | Tauri 配置 |
| `Cargo.toml` | Rust 工作区配置（22 crate） |
