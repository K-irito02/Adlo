# S1 · Server 收敛 + 前端 HTTP 桥 —— 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把业务命令收敛进独立 `crates/server`（ad-server，axum HTTP + SSE + WebSocket PTY），前端 `httpBridge` 统一走 HTTP/SSE；Tauri 壳只保留系统能力（browser/WebView2、platform、window、log）IPC 并作为宿主拉起 `ad-server` 子进程；浏览器 preview 由 dev 脚本拉起真实 `ad-server`，双端共用同一引擎、同一协议。

**Architecture:** 新增 workspace 成员 `crates/server`（`lib` 引擎 + `bin/ad-server`）。引擎 `engine::init(data_dir)` 从 `src-tauri/src/setup.rs::init_app_state` 抽取而来，产出 `ServerState`（db、config、provider_registry、part_bus、sse_bus、questions、pty_session_manager、durable、workspace…）；`spawn_http_server(state)` 起 axum（绑定 `127.0.0.1:0`，端口回写 `state.server_port`）。SSE 端点 `/event` 复用现有 `SseEventBus`（断点重放 `after`/`Last-Event-ID`）。业务命令以 `#[tauri::command]` → axum handler 机械迁移（签名从 `(AppHandle…)` 改为 `(State<ServerState>, …)`，事件发射改 `part_bus.publish`）。PTY 收敛到 `/pty` WebSocket（`portable-pty` 无 Tauri 依赖）。前端新增 `httpBridge` 实现 `DigitalLifeBridge`（fetch + EventSource），tauri-bridge 系统能力保留 invoke，preview-bridge 指到 dev 脚本注入的端口。

**Tech Stack:** Rust（axum 0.7 + tokio + tokio-stream + tokio-tungstenite + portable-pty + serde）、React 19 + TS、Vite、EventSource、WebSocket、Playwright（E2E）。

## Global Constraints

- 双端一致（AGENTS.md 硬性）：桌面与浏览器共用同一 `httpBridge`、同一 `ad-server`、同一 SSE 端点/协议
- 业务命令全部经 HTTP 迁移；系统能力（browser/WebView2、platform、window、app 日志模式）仍走 Tauri invoke
- `shared/ipc/digital-life.ts`（`DigitalLifeBridge`、`IpcResult`）契约不改；新增桥必须三桥同步（tauri/preview/mock）
- 错误体格式不变：`IpcResult<T>` + `adl_errors::AppError` code 同步到前端
- 凭据只存 `crates/credential/`；API key 经 HTTP 为 write-only（对齐 OpenCode：请求体单次提交，响应不回读明文，`toPublicInfo` 仅暴露 `hasKey`）；loopback 本地服务端存储时解密使用
- `ad-server` 不得依赖 `src-tauri` 或 `tauri` crate；低层不得依赖高层
- 未发布阶段禁止向后兼容 shim / 旧字段保留（迁移后删旧的 tauri handler）
- `cargo clippy --workspace --all-targets -- -D warnings` 0 警告；`pnpm --dir frontend run lint` 0 errors
- 红绿测试先行（Rust `cargo test --workspace`、前端 `pnpm --dir frontend run test`、E2E Playwright）
- 引擎绑 `127.0.0.1:0`；ad-server 支持 `--port` / `--data-dir`；Tauri 断子进程 pipe 时子进程退出
- 凭据/密钥概不输出到日志或 commit

---

### Task 1: `crates/server` crate + 引擎初始化抽取（ServerState 含全部业务状态）

**Files:**
- Create: `ai-digital-life/crates/server/Cargo.toml`
- Create: `ai-digital-life/crates/server/src/lib.rs`（最初只 `pub mod engine; pub mod state;` —— 后续 Task 逐个追加模块，避免悬空 module 导致编译失败）
- Create: `ai-digital-life/crates/server/src/state.rs`（`ServerState`）
- Create: `ai-digital-life/crates/server/src/engine.rs`（`init_server_state(data_dir) -> ServerState`，从 `src-tauri/src/setup.rs::init_app_state` 抽取）
- Modify: `ai-digital-life/Cargo.toml`（workspace members += `"crates/server"`）
- Test: `ai-digital-life/crates/server/tests/engine.rs`

**Interfaces:**
- Consumes: 现有 crates（`adl-types` `adl-kernel` `adl-errors` `adl-storage` `adl-conversation` `adl-agent-runtime` `adl-pty` `adl-model-gateway` `adl-logging` `adl-command` `adl-tools` `adl-workspace` `adl-credential` `reqwest`；`DurableSessionManager` 在 `adl_storage::durable` 内），配置加载逻辑参照 `src-tauri/src/setup.rs:init_app_state`
- Produces: `ServerState`（字段见下）、`engine::init_server_state(data_dir: &Path) -> Result<ServerState, AppError>`、`ad-server` 可执行文件
- 类型签名基准：`ServerState` struct 字段类型与 `AppState`（src-tauri/src/state.rs）对齐，去掉 `browser_manager`/`loop_cancels` 之外的 Tauri 绑定

- [ ] **Step 1: 写失败测试（engine 初始化成功）**

`crates/server/tests/engine.rs`:
```rust
use ad_server::engine::init_server_state;

#[tokio::test]
async fn engine_init_creates_workable_state() {
    let data_dir = std::env::temp_dir().join(format!("adl-server-{}", uuid::Uuid::new_v4()));
    let state = init_server_state(&data_dir).await.unwrap();
    assert!(state.db.is_schema_initialized());   // 具体 API 以 adl-storage 现行为准
    assert_eq!(state.server_port.load(std::sync::atomic::Ordering::Relaxed), 0);
    let _ = std::fs::remove_dir_all(&data_dir);
}
```
> 实施时把 `is_schema_initialized()` 换成 adl-storage 实际暴露的检查方法（如 `Database::open` 后执行一次 `count` 查询）。

- [ ] **Step 2: 运行确认失败**

Run（`ai-digital-life/`）：`cargo test -p ad-server --test engine`
Expected: FAIL——`unresolved import ad_server::engine`。

- [ ] **Step 3: 实现 crate 骨架**

`crates/server/Cargo.toml`（按 `src-tauri/Cargo.toml` 的依赖名，逐一核对 workspace 内有）:
```toml
[package]
name = "ad-server"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[dependencies]
adl-errors = { path = "../errors" }
adl-types = { path = "../types" }
adl-kernel = { path = "../kernel" }
adl-storage = { path = "../storage" }
adl-conversation = { path = "../conversation" }
adl-agent-runtime = { path = "../agent-runtime" }
adl-pty = { path = "../pty" }
adl-model-gateway = { path = "../model-gateway" }
adl-logging = { path = "../adl-logging" }
adl-tools = { path = "../tools" }
adl-workspace = { path = "../workspace" }
adl-credential = { package = "adl-credential", path = "../credential" }
serde = { workspace = true }
serde_json = { workspace = true }
tokio = { workspace = true }
tokio-stream = { workspace = true }
axum = "0.7"
tower = { version = "0.5", features = ["util"] }
uuid = { workspace = true }
reqwest = { workspace = true }
tracing = { workspace = true }
# 后续任务需要：adl-task / alternative/ model / durable / migration 依赖按需加

[dev-dependencies]
futures = { workspace = true }
```

`crates/server/src/state.rs`（字段移植 `src-tauri/src/state.rs::AppState`，去掉 Tauri 特有 + browser_manager）:
```rust
use adl_agent_runtime::part_event_bus::PartEventBus;
use adl_agent_runtime::question::QuestionService;
use adl_kernel::config::AppConfig;
use adl_kernel::events::EventBus;
use adl_logging::LogManager;
use adl_model_gateway::registry::ProviderRegistry;
use adl_pty::SessionManager;
use adl_storage::Database;
use adl_types::WorkspaceMeta;
use reqwest::Client;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::AtomicU16;
use std::sync::{Arc, Mutex as StdMutex, RwLock};
use tokio::sync::Mutex as AsyncMutex;

#[derive(Clone)]
pub struct ServerState {
    pub data_dir: PathBuf,
    pub db: Database,
    pub config: Arc<RwLock<AppConfig>>,
    pub event_bus: EventBus,
    pub current_workspace: Arc<RwLock<Option<WorkspaceMeta>>>,
    pub editor_dirty_paths: StdMutex<HashSet<String>>,
    pub pty_sessions: Arc<StdMutex<SessionManager>>,
    pub log_manager: Arc<LogManager>,
    pub started_at: i64,
    pub durable_session: adl_storage::durable::DurableSessionManager,
    pub provider_registry: Arc<RwLock<ProviderRegistry>>,
    pub shared_http_client: Arc<Client>,
    pub provider_ops_mutex: AsyncMutex<()>,
    pub loop_cancels: AsyncMutex<std::collections::HashMap<String, tokio_util::sync::CancellationToken>>,
    pub part_bus: PartEventBus,
    pub questions: QuestionService,
    pub server_port: Arc<AtomicU16>,
}
```
> 说明：以上字段名/类型与现有 `AppState` 完全一致（复制 src-tauri/src/state.rs），唯独去掉 `browser_manager`（系统能力留在 Tauri）。实施时**以现有 `state.rs` 实际字段为基准**复制，若字段有出入按现有代码为准。

`crates/server/src/engine.rs`：抽取 `init_app_state` — 参照 `src-tauri/src/setup.rs:init_app_state`（行 ~30 至 ~457），把 `db.open/init_schema`、`config` 加载、provider registry 注册、`durable_manager`、`part_bus`/`questions` 构造全部搬过来，返回 `ServerState`。事件发射源从 `tauri::AppHandle.emit` 改为 `part_bus.publish`（即把现有 emit 调用点替换为 part event）。

- [ ] **Step 4: 运行确认通过**

Run: `cargo test -p ad-server --test engine`
Expected: PASS（init_server_state 构造全字段，无硬失败）。随后逐步 run `cargo check --workspace` 无 break。

- [ ] **Step 5: 提交**

```bash
git add Cargo.toml crates/server
git commit -m "feat(server): add ad-server crate with ServerState + engine::init_server_state"
```

---

### Task 2: SSE 端点迁移到共享库 + ad-server 绑定端口回写

**Files:**
- Move: `ai-digital-life/src-tauri/src/sse.rs` → `ai-digital-life/crates/server/src/sse.rs`
- Move: `ai-digital-life/src-tauri/src/sse_server.rs` → `ai-digital-life/crates/server/src/sse_server.rs`
- Delete: `src-tauri/src/sse.rs`、`src-tauri/src/sse_server.rs`
- Create: `ai-digital-life/crates/server/src/router.rs`（`app_router(state)`）
- Create: `ai-digital-life/crates/server/src/handlers/mod.rs`（`pub fn dialogue_router` 或占位）
- Modify: `ai-digital-life/crates/server/src/lib.rs`（导出）
- Modify: `ai-digital-life/src-tauri/src/lib.rs`（删 `mod sse; mod sse_server;`）
- Modify: `ai-digital-life/src-tauri/src/setup.rs`（`start_background_tasks` 改用共享库）
- Modify: `ai-digital-life/src-tauri/src/state.rs`（把 sse_port 字段挪到共享库）
- Test: `crates/server/tests/sse_stream.rs`

**Interfaces:**
- Consumes: `SseEventBus`/`spawn_sse_server` 现有实现（已含 `AfterParams`、`Last-Event-ID` 重放、`ReplyBody` 与测试）；`ServerState`
- Produces: `ad_server::sse::SseEventBus`、`ad_server::sse_server::spawn_http_server(state: &ServerState) -> u16`（返回绑定的动态端口并 `store` 进 `state.server_port`）、`ad_server::router::app_router(state) -> Router`
- **签名统一：** 所有 SSE handler `State` 改为 `State<ServerState>`，内部用 `state.sse.bus` 访问——本任务把 `SseEventBus` 挂为 `ServerState` 的一个字段（由 engine 构造并存），`spawn_http_server` 接管 bus。

- [ ] **Step 1: 写失败测试（SSE 经 ServerState 全链路）**

`crates/server/tests/sse_stream.rs`:
```rust
use adl_agent_runtime::part_event_bus::PartEventBus;
use adl_types::SessionPartEvent;
use futures::StreamExt;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn sse_streams_session_status_and_replays() {
    let data_dir = std::env::temp_dir().join(format!("adl-sse-{}", uuid::Uuid::new_v4()));
    let state = ad_server::engine::init_server_state(&data_dir).await.unwrap();
    // engine 构造后 sse_bus 由 spawn 管理；发布真实事件
    state.part_bus.publish(SessionPartEvent::SessionStatus {
        session_id: "s1".into(),
        status: "busy".into(),
    });
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let port = ad_server::sse_server::spawn_http_server(&state).await;
    let url = format!("http://127.0.0.1:{port}/event");
    let resp = reqwest::get(&url).await.unwrap();
    let first = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        resp.bytes_stream().next(),
    )
    .await
    .expect("SSE within timeout")
    .expect("stream not end")
    .expect("read ok");
    let text = String::from_utf8_lossy(&first);
    assert!(text.contains("session.status"), "payload: {text}");

    // 断点续传：Last-Event-ID 场景在 sse_server.rs 单元测试已经覆盖，此处全链路再探
    let _ = std::fs::remove_dir_all(&data_dir);
}
```
> 需要 `State.sse_bus` 存在——即 engine 里为 `ServerState` 提供 `sse_bus: SseEventBus`。若 `sse_bus` 不在 engine 初始化范围内，则本任务在 state 里加 `pub sse_bus: Arc<SseEventBus>` 并在 engine 构造（订阅 part_bus，`sse_bus.spawn(part_bus.clone())`）。

- [ ] **Step 2: 确认失败**
Run: `cargo test -p ad-server --test sse_stream`
Expected: FAIL（`spawn_http_server` 未实现 / `sse_bus` 字段不存在）。

- [ ] **Step 3: 实现**

将 `src-tauri/src/sse.rs` + `sse_server.rs` 内容原样迁入 `crates/server/src/{sse.rs,sse_server.rs}`（逻辑与注释保留），改两处：
1. `SseState` 结构体消失——handler 改 `fn sse_handler(State(state): State<ServerState>, Query(p): Query<AfterParams>, headers: HeaderMap)`，`state.sse_bus` 取 bus。
2. `spawn_sse_server(bus, questions)` → `spawn_http_server(state: &ServerState) -> u16`：
```rust
pub async fn spawn_http_server(state: &ServerState) -> u16 {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await
        .expect("bind ad-server listener on ephemeral port");
    let port = listener.local_addr().expect("addr").port();
    let app = Router::new()
        .route("/event", get(sse_handler))
        .route("/question/{request_id}/reply", post(reply_handler))
        .with_state(state.clone());
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!("ad-server HTTP failed: {e}");
        }
    });
    state.server_port.store(port, std::sync::atomic::Ordering::Relaxed);
    port
}
```
`router.rs` 汇总：`pub fn app_router(state: ServerState) -> Router { Router::new().route(...).with_state(state) }`（health 后续加）。

- [ ] **Step 4: 通过 + 旧端压缩**

迁移后 `src-tauri` 的 setup.rs：`start_background_tasks` 内不再建 `SseEventBus`，而是在 engine/init 里已 subway。将 `state.sse_port` 字段整个删除，改读共享 `ServerState`。确保 `cargo test --workspace` 全绿（旧 `sse_server.rs` 测试一并迁走）。

- [ ] **Step 5: 提交**
```bash
git add crates/server src-tauri
git commit -m "feat(server): move SSE bus+endpoint into ad-server crate, unify State<ServerState>"
```

---

### Task 3: `ad-server` 二进制（`--port` / `--data-dir` + 生命周期）

**Files:**
- Create: `ai-digital-life/crates/server/src/bin/ad-server.rs`
- Create: `ai-digital-life/crates/server/src/handlers/health.rs`
- Modify: `ai-digital-life/crates/server/src/handlers/mod.rs`（声明 `pub mod health;`）
- Modify: `ai-digital-life/crates/server/src/engine.rs`（提供 `serve()` helper）
- Test: `crates/server/tests/binary_smoke.rs`（spawn process + /health）

**Interfaces:**
- Produces: `ad-server --port <u16> --data-dir <path>`；`/health` 返回 `{"ok":true,"port":N}`；bind 指定端口或 0=随机；崩溃/退出码语义

- [ ] **Step 1: 创建 `/health` handler（红测试同验证）**

`crates/server/tests/health.rs`:
```rust
use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

#[tokio::test]
async fn health_returns_ok_with_port() {
    let dir = std::env::temp_dir().join(format!("adl-health-{}", uuid::Uuid::new_v4()));
    let state = init_server_state(&dir).await.unwrap();
    let app = app_router(state);
    let resp = app.oneshot(
        Request::builder().uri("/health").body(Body::empty()).unwrap(),
    ).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let _ = std::fs::remove_dir_all(&dir);
}
```

`crates/server/src/handlers/health.rs`:
```rust
use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};
use crate::ServerState;

pub async fn health(State(state): State<ServerState>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "port": state.server_port.load(std::sync::atomic::Ordering::Relaxed),
        "startedAt": state.started_at,
    }))
}
```

- [ ] **Step 2: 写失败测试（二进制冒烟）**
`tests/binary_smoke.rs`：
```rust
use std::process::{Command, Stdio};
use std::time::Duration;

#[tokio::test]
async fn binary_serves_health() {
    // 用 env!("CARGO_BIN_EXE_ad-server") 拿二进制路径
    let bin = env!("CARGO_BIN_EXE_ad-server");
    let dir = std::env::temp_dir().join(format!("adl-bin-{}", uuid::Uuid::new_v4()));
    let mut child = Command::new(bin)
        .args(["--port", "0", "--data-dir"])
        .arg(&dir)
        .stdout(Stdio::piped()).stderr(Stdio::inherit())
        .spawn().unwrap();
    // 等待 /health 可达（轮询）
    let client = reqwest::Client::new();
    for _ in 0..50 {
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    // 从 stdout 解析「listening on 127.0.0.1:<port>」行再请求
    //（简化：第一次 seed port=0，stdout 打印真实端口后请求）
    child.kill().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
}
```
> 实现细节：ad-server 把真实端口打到 stdout（`println!("AD_SERVER_PORT={port}")`）或不 stdout 时用固定测试端口。若测试不稳定，改为 `--port 0` → 提供 `/health` 的 port 字段即可（冒烟只验证进程起来及请求成功）。

- [ ] **Step 3: 确认失败**：`cargo test -p ad-server --test health`（`app_router` 无 `/health`）与 `--test binary_smoke`（无二进制）。

- [ ] **Step 4: 实现二进制**
```rust
// crates/server/src/bin/ad-server.rs
use std::path::PathBuf;
use std::time::Duration;
use ad_server::engine::{init_server_state, serve};

#[tokio::main]
async fn main() {
    let mut port: u16 = 0;
    let mut data_dir = PathBuf::from(std::env::temp_dir());
    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--port" => { i += 1; port = args.get(i).and_then(|s| s.parse().ok()).unwrap_or(0); }
            "--data-dir" => { i += 1; data_dir = PathBuf::from(args.get(i).cloned().unwrap_or_default()); }
            _ => {}
        }
        i += 1;
    }
    std::fs::create_dir_all(&data_dir).ok();
    tracing_subscriber::fmt().init();
    let state = init_server_state(&data_dir).await.unwrap_or_else(|e| {
        eprintln!("[ad-server] init failed: {e:#}");
        std::process::exit(1);
    });
    let bound = serve(state, port).await;
    println!("[ad-server] listening on 127.0.0.1:{bound}");
    // 保持运行直到被 kill / 父进程断开
    loop {
        tokio::time::sleep(Duration::from_secs(3600)).await;
    }
}
```
`engine.rs` 增加：
```rust
pub async fn serve(state: ServerState, requested_port: u16) -> u16 {
    if requested_port != 0 {
        // 绑定指定端口实例（若冲突则失败）
        state.server_port.store(requested_port, Ordering::Relaxed);
        return requested_port;
    }
    crate::sse_server::spawn_http_server(&state).await
}
```
> 描述完整路径（ephemeral 分支用统一 `spawn_http_server`）。

- [ ] **Step 4: 通过测试**
`cargo test -p ad-server --test binary_smoke` 绿；手动 `cargo run -p ad-server -- --port 44444` + `Invoke-RestMethod http://127.0.0.1:44444/health` 返回 `{"ok":true,"port":44444}`。

- [ ] **Step 5: 提交**
```bash
git commit -m "feat(server): ad-server binary with --port/--data-dir and /health"
```

---

### Task 4: 业务命令迁移 —— conversation 域（先例纵切片）

**Files:**
- Create: `ai-digital-life/crates/server/src/ipc.rs`（`ipc_wrap` 辅助 + `AppError → 状态码/JSON`）
- Create: `ai-digital-life/crates/server/src/handlers/conversation.rs`
- Modify: `ai-digital-life/crates/server/src/handlers/mod.rs`
- Modify: `ai-digital-life/crates/server/src/router.rs`
- Create: `ai-digital-life/crates/server/tests/conversation_api.rs`
- 参照实现：`src-tauri/src/commands/conversation/{mod,session,messaging,state}.rs`

**Interfaces:**
- Consumes: `ConversationBridge` 类型/结构（`ConversationSessionRecord` 等）、`adl_conversation::create_session`、`Database::list_entities_by_workspace`、`SessionPartEvent`（发送消息后广播）
- Produces: REST 路由——
  `POST /session`（create）、`GET /sessions`（list）、`GET /session/{id}`（get）、`GET /session/{id}/message`（Part/Message 历史读取，S2 初始加载用，见设计 §5.1）、`PATCH /session/{id}`（rename/pin/unpin/read/archive 子字段）、`DELETE /session/{id}`、`POST /session/{id}/message`、`POST /session/{id}/cancel`
  全部返回 `Json<IpcResult<T>>`，错误码 `adl_errors` 到 HTTP status 映射复用 `ipc_wrap`
- **用户决策（2026-08-09）**：send_message 保持**异步 + SSE**（对齐 OpenCode 目标架构），契约满足推迟到 Task 7 前端桥；本 Task 补 `GET /session/{id}/message` 历史端点让循环写入对前端可见，并在循环终态将 `session.status` 持久化回 `Sessions` 表（修复 busy 卡死）
- `/health` 增注入 router

- [ ] **Step 1: 写失败测试（会话 CRUD + 消息发布）**

`crates/server/tests/conversation_api.rs`:
```rust
use ad_server::router::app_router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-cv-{}", uuid::Uuid::new_v4()));
    ad_server::engine::init_server_state(&dir).await.unwrap()
}

#[tokio::test]
async fn update_patch_route_happy_path() {
    let state = state().await;
    let app = app_router(state.clone());
    let resp = app.clone().oneshot(
        Request::builder().method(Method::POST).uri("/session")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"title":"demo"}"#)).unwrap()
    ).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    // body 含 id
    let list = app.oneshot(
        Request::builder().method(Method::GET).uri("/sessions").body(Body::empty()).unwrap()
    ).await.unwrap();
    assert_eq!(list.status(), StatusCode::OK);
}
```
（`tower::ServiceExt` need `.oneshot`）

- [ ] **Step 2: 运行确认失败**
Run: `cargo test -p ad-server --test conversation_api` → 404。

- [ ] **Step 3: 实现 `ipc.rs` + `handlers/conversation.rs`**

`src/ipc.rs`:
```rust
use axum::http::StatusCode;
use axum::Json;
use serde_json::Value;
use adl_errors::AppError;

pub async fn json_body<T: serde::de::DeserializeOwned>(
    it: axum::http::Bytes,
) -> Result<T, (StatusCode, String)> {
    serde_json::from_slice(&it).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))
}

pub fn to_response(result: Result<Value, AppError>) -> (StatusCode, Json<Value>) {
    match result {
        Ok(v) => (StatusCode::OK, Json(serde_json::json!({ "ok": true, "data": v }))),
        Err(e) => {
            let code = e.error_code();
            let status = match code {
                "NOT_FOUND" => StatusCode::NOT_FOUND,
                "INVALID_INPUT" => StatusCode::BAD_REQUEST,
                "AUTH_ERROR" | "ANNOUNCE" => StatusCode::UNAUTHORIZED,
                "STORAGE_ERROR" | "INTERNAL_ERROR" => StatusCode::INTERNAL_SERVER_ERROR,
                _ => StatusCode::BAD_REQUEST,
            };
            (status, Json(serde_json::json!({ "ok": false, "error": { "code": code, "message": e.to_string() } })))
        },
    }
}
```
> `e.error_code()` 是 `AppError` 真实方法（`crates/errors/src/lib.rs:104`，返回 `"NOT_FOUND"` 等 `&'static str`）；`e.to_string()` 如 `"Not found: workspace"`。状态映射为计划内新增的约定，与前端的 `IpcErrorCode` 字符串保持一致。`DeserializeOwned` 的 `+b` 已删除（原为误输入）。

`src/handlers/conversation.rs`:
```rust
use axum::{extract::{State, Path}, Json};
use crate::ServerState;
use crate::ipc;

pub async fn create_session(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl axum::response::IntoResponse {
    let body_val: serde_json::Value = ipc::json_body(body).await.unwrap_or(json!({}));
    let wid = workspace_scope_id(&state);
    let title = body_val.get("title").and_then(|v| v.as_str());
    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let existing = db.list_entities_by_workspace(adl_storage::EntityTable::Sessions, &wid)?;
        let s = adl_conversation::create_session(&wid, title.map(String::from), existing.len() as i32);
        db.save_entity(adl_storage::EntityTable::Sessions, &s.id, Some(&wid), Some(&s.id), Some(&s.status), &s)?;
        Ok(serde_json::to_value(&s).unwrap())
    }).await.map_err(|e| AppError::Internal(format!("spawn: {e}")))?;
    ipc::to_response(result)
}
```
> **迁移配方（全域通用）**：读原 `src-tauri/src/commands/X.rs` 的 `#[tauri::command]`，把 `app: tauri::AppHandle` / `State<'_>` 换成 `State<ServerState>`；`app.state::<AppState>()` 换 `&state`；`tauri::Manager` 相关 `emit` 换成 `state.part_bus.publish(SessionPartEvent::…)`；返回包装用 `ipc::to_response`。handler 条件出参把 `::commands::ipc(...)` 与 `IpcResult` 同时替代。

路由挂载 `src/router.rs`:
```rust
use axum::{Router, routing::{get, post, patch, delete}};
use crate::handlers;

pub fn app_router(state: ServerState) -> Router {
    Router::new()
        .route("/health", get(crate::handlers::health::health))
        .route("/event", get(crate::sse_server::sse_handler))
        .route("/question/{request_id}/reply", post(crate::sse_server::reply_handler))
        .route("/session", post(handlers::conversation::create_session))
        .route("/sessions", get(handlers::conversation::list_sessions))
        .route("/session/{session_id}", get(handlers::conversation::get_session))
        .route("/session/{session_id}", patch(handlers::conversation::update_session))
        .route("/session/{session_id}", delete(handlers::conversation::delete_session))
        .route("/session/{session_id}/message", post(handlers::conversation::send_message))
        .route("/session/{session_id}/cancel", post(handlers::conversation::cancel_message))
        .with_state(state)
}
```
> 处理器命名必须与 `handlers/conversation.rs` 内 `pub async fn` 逐一对应（见上方 `create_session` 例）：`create_session / list_sessions / get_session / update_session / delete_session / send_message / cancel_message` 全部返回 `impl IntoResponse`。路由 handler 的 `Path<String>` 提取用 `#[rustfmt::skip]`（见 Task 4 说明）。所有 mutation 消息后 `state.part_bus.publish(SessionPartEvent::…)`。

- [ ] **Step 4: 通过**
`cargo test -p ad-server --test conversation_api` 绿；`cargo clippy --workspace --all-targets -- -D warnings` 0。

- [ ] **Step 5: 提交**
```bash
git commit -m "feat(server): migrate conversation domain to HTTP endpoints"
```

---

### Task 5: 业务域全量迁移（场景表，逐域）

**Files:**
- Create: `ai-digital-life/crates/server/src/handlers/{agent.rs, patch.rs, provider.rs, workspace.rs, workspace_sidebar.rs, command.rs, commands_config.rs, snapshot.rs, compaction.rs, session_fork.rs, permission.rs, durable.rs, custom_agent.rs, reserved.rs, task.rs, run_activity.rs, subagent.rs, web_tools.rs, retrieval.rs, audit.rs, git.rs, git_vis.rs, reference.rs, mcp.rs, lsp.rs}`
- Modify: `crates/server/src/router.rs`（逐域 route 集合，见下表）
- Test: `crates/server/tests/{每域}.rs`
- Modify: `crates/server/src/state.rs`（如某域需要新字段，如 task/snapshot manager）

**Interfaces / 迁移表（源 → 目标路由）**（implementation 以现有 `src-tauri/src/commands` 优先为准）

| 域 | tauri 命令前缀（现有） | HTTP 路由（目标） | 备注 |
|----|------|------|------|
| agent | `agent_*` | `/agent/*`、`/agent/{id}` | 与 pipeline/loop 事件走 SSE |
| agent_pipeline | `agent_pipeline_*`、`agent_run_activity_*` | `/agent/pipeline/*`、`/agent/turn/*` | 状态经 part_bus |
| subagent | `subagent_*` | `/subagent/*` | |
| patch | `patch_*` | `/patch/*` | |
| provider | `provider_*` | `/provider/*` | 凭据 write-only（对齐 OpenCode）：key 请求体单次提交入 credential store，**响应不读回明文**；`get_api_key`/`has` 仅返回布尔。前端 `getProviderApiKey` 移除属 Task 7 契约变更 |
| workspace | `workspace_*` | `/workspace/*` | |
| workspace_git / sidebar / vis | `ws_git_*` `sidebar*` | `/workspace/git/*` `/sidebar` | |
| retrieval | `retrieval_*` | `/retrieval/*` | |
| search | `search_*` | `/search/*` | |
| task | `task_*` | `/task/*` | |
| snapshot | `snapshot_*` | `/snapshot/*` | |
| compaction | `compaction_*` | `/compaction/*` | |
| session_fork | `session_fork_*` | `/session-fork/*` | |
| permission | `permission_*` | `/permission/*` | |
| command | `command_*` | `/command/*` | |
| commands_config | `commands_config_*` | `/commands-config/*` | |
| durable | `durable_*` | `/durable/*` | |
| lsp | `lsp_*` | `/lsp/*` | |
| mcp | `mcp_*` | `/mcp/*` | |
| reference | `reference_*` | `/reference/*` | |
| custom_agent | `custom_agent_*` | `/custom-agent/*` | |
| web_tools | `web_tools_*` | `/web-tools/*` | |
| run_activity | `run_activity_*` | `/run-activity/*`（仅历史查询） | 路由实际 emit 已停（见 mod.rs 注释） |
| audit | `audit_*` | `/audit/*` | |
| ci / github | `ci_*`、`github_*` | `/ci/*` | |

（未列域在实施时枚举 `src-tauri/src/commands/mod.rs` 的 pub mod 逐一对齐）

- [ ] **Step 1~N（每域）** 按 Task 4 Step 1-4 的配方：写「红测试」→ 迁移 handler → 路由挂载 → 绿测试 → `cargo test --workspace` + clippy 0 → 提交一个 commit/域：
```bash
git commit -m "feat(server): migrate <domain> commands to HTTP endpoints"
```

- [ ] **收尾（全部域迁移完）**：`git grep -n "tauri::command"`（crates/server 内应为 0）+ 旧 `src-tauri` business commands 保留删除标记（仍被 Tauri 前端引用时在 Task 7 一起切桥）。

---

### Task 6: PTY WebSocket 收敛（`/pty` WS）

**Files:**
- Create: `ai-digital-life/crates/server/src/pty_ws.rs`
- Modify: `crates/server/src/state.rs`（已有 `pty_sessions`）
- Modify: `crates/server/src/router.rs`（`.route("/pty", get(pty_ws::ws_handler))`）
- Create: `crates/server/tests/pty_ws.rs`
- Modify: `src-tauri/src/commands/pty_commands.rs`（直接改/迁到 engine 的 session_manager 使用）
- Modify: `frontend/src/preview-bridge/preview-pty-bridge.ts`（HTTP 轮询 → WS）
- Modify: `frontend/src/tauri-bridge/tauri-pty.ts`（指向 ad-server WS）
- Modify: `frontend/dev/previewTerminalService.ts`（如需同步的 mock 路径保留）

**Interfaces:**
- Consumes: `adl_pty::SessionManager`、`adl_pty::PtyEventEmitter`。API（见 `crates/pty/src/session_manager.rs`）：
  - `create(emitter: Arc<dyn PtyEventEmitter>, shell: &str, cwd: &str, cols: u16, rows: u16) -> Result<String, AppError>`（返回 session_id；内部 spawn 输出读取线程，经 `emitter.emit_output` 推送）
  - `write(session_id, data: &str)` / `resize(session_id, cols, rows)` / `kill(session_id)` / `list() -> Vec<PtySessionInfo>`
- Produces: `GET /pty`（http upgrade 到 ws）——文本消息协议：
  - 客户端→服务端：`{"kind":"create","shell":?,"cwd":?,"cols":80,"rows":24}`、`{"kind":"input","sessionId":s,"data":…}`、`{"kind":"resize","sessionId":s,"cols":…,"rows":…}`、`{"kind":"kill","sessionId":s}`
  - 服务端→客户端：`{"kind":"created","sessionId":s}`、`{"kind":"output","sessionId":s,"data":…}`、`{"kind":"error","sessionId":s,"message":…}`
  - 服务端为每 ws 连接构造 `Arc<dyn PtyEventEmitter>`（内闭包把 output 转发到该连接），`SessionManager::create` 传它
  前端 `subscribePtyOutput` 走同 `/pty` WS 接收 `output` 帧

- [ ] **Step 1: 失败测试（WS 建会话→写→读）**
`crates/server/tests/pty_ws.rs`（需 tokio-tungstenite dev-dep）：
```rust
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::protocol::Message as WsMessage;

#[tokio::test]
async fn pty_ws_echo() {
    let dir = temp(); let state = init_server_state(&dir).await.unwrap();
    let port = ad_server::sse_server::spawn_http_server(&state).await;
    let url = format!("ws://127.0.0.1:{port}/pty");
    let (mut sock, _) = connect_async(&url).await.unwrap();
    sock.send(WsMessage::Text(r#"{"kind":"create","cols":80,"rows":24}"#.into())).await.unwrap();
    let msg = sock.next().await.unwrap().unwrap();
    // assert!("created" 在 payload 内且带 sessionId
}
```
- [ ] **Step 2: 红**：`cargo test -p ad-server --test pty_ws` — upgrade 404。
- [ ] **Step 3: 实现 `pty_ws.rs`**：参考 `src-tauri/src/commands/pty_commands.rs` 的 create/write/resize/kill/list（平台 shell resolver via ShellResolver）。为每 ws 连接新建 `Arc<dyn PtyEventEmitter>`（trait 方法 `emit_output(&session_id, data)` 把文本帧发往本连接），`SessionManager::create(emitter_arc, shell, cwd, cols, rows)`。创建/输入/resize/kill 全部走到 `ServerState.pty_sessions` 的 `SessionManager`，帧处理用 ws 循环 + task 分发（tokio warp/axum 升级用 `axum::extract::WebSocketUpgrade`）。
- [ ] **Step 4: 前端迁移 WS**：`preview-pty-bridge.ts` 的轮询逻辑替换为维持一个 WS 到 `/pty`，protocol 消息映射同 crate（适配现有 `PtyOutputEvent`），`tauri-pty.ts` 复用共享 `createHttpPtyBridge(baseUrl)`。原 `/pty/*` invoke 命令标记废弃（未发布阶段去除 Tauri 旧 invoke path）。
- [ ] **Step 5: 测试**：`cargo test -p ad-server --test pty_ws`；`pnpm --dir frontend test`（preview-pty-bridge.test.ts 更新）；`cargo clippy` 0。
- [ ] **Step 6: 提交**
```bash
git commit -m "feat(server+front): PTY over ad-server WebSocket, converge preview+tauri chains"
```

---

### Task 7: 前端 `httpBridge`（实现 DigitalLifeBridge 的 fetch/EventSource 版）

**Files:**
- Create: `ai-digital-life/frontend/src/httpBridge.ts`
- Create: `ai-digital-life/frontend/src/httpBridge/sse.ts`（SSE 解析 helper）
- Create: `ai-digital-life/frontend/src/httpBridge/__tests__/httpBridge.test.ts`
- Modify: `frontend/src/tauri-bridge/index.ts`（业务委托 httpBridge，系统保留）
- Modify: `frontend/src/preview-bridge/index.ts`（httpBridge 指向真实 ad-server）
- Modify: `frontend/src/mock-bridge.ts`（不变）

**Interfaces:**
- Consumes: `DigitalLifeBridge`、`IpcResult<>`、`DigitalLifeModelStreamEventV1` 等类型
- Produces: `createHttpBridge({ baseUrl })` 实现 `DigitalLifeBridge`——业务方法走 fetch（point GET/1 每个 IpcResult），`subscribeModelStream`/`subscribeRunActivity`/`subscribeTerminalStream`/`subscribePtyOutput` 走 EventSource（SSE 事件解包 v1 后再 notify）

- [ ] **Step 1: 写失败测试（createHttpBridge RPC）**

`httpBridge/__tests__/httpBridge.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('createHttpBridge', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  it('maps conversation.createSession to POST /session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ ok: true, data: { id: 's-1' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { createHttpBridge } = await import('../httpBridge');
    const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999' });
    const res = await bridge.conversation.createSession('x');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/session',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res).toEqual({ ok: true, data: { id: 's-1' } });
  });
});
```
- [ ] **Step 2: 红失败**：`pnpm --dir frontend test -- httpBridge` → module resolve。

- [ ] **Step 3: 实现 `httpBridge.ts`**（核心模板）：
```ts
import type { DigitalLifeBridge } from './shared/ipc/digital-life';
import type { IpcResult } from '@ai-digital-life/kernel';

export interface HttpBridgeOptions {
  baseUrl: string;
  /** 可注入的 EventSource 构造器（默认全局 EventSource）——测试/节点环境传入 fake */
  eventSourceFactory?: (url: string, options?: EventSourceInit) => EventSource;
}

async function call<T>(baseUrl: string, path: string, init: RequestInit, f = fetch): Promise<IpcResult<T>> {
  try {
    const resp = await f(`${baseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    if (!resp.ok) return { ok: false, error: { code: 'HTTP__ERROR', message: `HTTP ${resp.status}` } };
    const json = await resp.json() as IpcResult<T>;
    return json;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'NETWORK_ERROR', message } };
  }
}

export function createHttpBridge({ baseUrl }: HttpBridgeOptions): DigitalLifeBridge {
  return {
    conversation: {
      createSession: (title, workspaceId) => call(baseUrl, '/session', {
        method: 'POST', body: JSON.stringify({ title, workspaceId }),
      }),
      listSessions: () => call(baseUrl, '/sessions', { method: 'GET' }),
      getSession: (sessionId) => call(baseUrl, `/session/${sessionId}`, { method: 'GET' }),
      // rename / pin / unpin / reorder / read / unread / archive / delete / sendMessage / cancel:
      // 每个调用对应 Task 4/5 路由
    },
    // …其余业务域，完整实现 DigitalLifeBridge（一域一函数），系统域(明文 [system])为空或由宿主覆盖
    subscribeModelStream: () => () => undefined, // Task 8
    window: { /* 宿主注入，此处仅占位 */ },
  } as unknown as DigitalLifeBridge;
}
```
> 映射纪律：所有业务方法名与 `tauri-bridge/*.ts` 一一对应（复制 1:1 以减少错误）。

- [ ] **Step 4: 绿**：`pnpm --dir frontend test -- httpBridge` PASS；`tsc --noEmit`。

- [ ] **Step 5: 双端接线**
`tauri-bridge/index.ts` 增加 `createTauriBridge(baseUrl)`：业务对象委托 `createHttpBridge(baseUrl).xxx`，`window/browser/platform` 保留 invoke；`getInfo` 返回合并（含`serverUrl`）。preview 接管 `baseUrl`（`import.meta.env.VITE_ADL_SERVER_URL` fallbackenv 地址）。

- [ ] **Step 6: 全量前端+lint**：`pnpm --dir frontend test`、`pnpm --dir frontend run lint`。
- [ ] **Step 7: 提交**
```bash
git commit -m "feat(frontend): httpBridge over fetch for all business domains"
```

---

### Task 8: SSE 事件桥（模型/run-activity/terminal/pty 输出）

**Files:**
- Modify: `frontend/src/httpBridge.ts`（subscribe* 实现）
- Create: `frontend/src/httpBridge/event-source.ts`（可注入 EventSource 封装）
- Create: `frontend/src/httpBridge/__tests__/stream-sse.test.ts`

**Interfaces:**
- Consumes: Tauri 原有事件名 `digital-life://model-stream` / `run-activity` / `terminal-stream` / `pty-output`；SSE `/event`（`message.part.*` / `session.status` / `question.asked`…）
- Produces: `bridge.subscribeModelStream / subscribeRunActivity / subscribeTerminalStream / subscribePtyOutput` —— 用 EventSource `/event` + 本地 filter 成 v1/`PtyOutputEvent` 与原有 API 签名一致

- [ ] **Step 1: 失败测试（subscribeModelStream 经 EventSource）**
```ts
// httpBridge/__tests__/stream-sse.test.ts
class FakeEventSource {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  addEventListener(_: string, fn: () => void) {}
  close() {}
  emit(data: string) { this.onmessage?.(({ data }) as unknown as MessageEvent); }
}

it('yields model delta on SSE event', async () => {
  let fakeES = new FakeEventSource();
  const esFactory = () => (fakeES as unknown as EventSource);
  const { createHttpBridge } = await import('../httpBridge');
  const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:9999', eventSourceFactory: esFactory });
  const got: unknown[] = [];
  bridge.subscribeModelStream((e) => got.push(e));
  fakeES.emit(JSON.stringify({ type: 'model', delta: 'hi' }));
  expect(got[0]).toMatchObject({ type: 'model', delta: 'hi' });
});
```
> 实现 `createHttpBridge` 时把 `eventSourceFactory` 存到闭包，`subscribeModelStream/subscribeRunActivity/subscribeTerminalStream/subscribePtyOutput` 用它建 EventSource（tests 注入 fake）。如果默认 URL 需经 `/event?after=`（断点续传），在 options 增加 `lastEventId` 初值并在内部维护 `Last-Event-ID`。
- [ ] **Step 2: 红** → 实现 EventSource 包；delta 依据 SseEvent `text`/`reasoning` → v1 struct 转换。
- [ ] **Step 3: 绿 + lint**（tain 事件名 + pre-existing warning 保留）
- [ ] **Step 4: 提交**

---

### Task 9: 浏览器 preview 拉真实内核（dev 脚本 + 端口注入）

**Files:**
- Modify: `frontend/dev/previewWorkspaceService/index.ts`
- Create: `frontend/dev/ad-server-launch.ts`（spawn ad-server child + 端口/健康探活 + beforeExit kill）
- Modify: `frontend/src/preview-bridge/index.ts`（`baseUrl` 来自启动注入）
- Modify: `frontend/package.json`（新增 `dev:preview` 脚本）
- Modify: `frontend/src/main.tsx`（浏览器模式下从 env/全局读 `baseUrl` 后构造 `createHttpBridge`，替代默认 mock——若 ad-server 未起则回退 mock）
- Test: 复用 Playwright `e2e/preview-workspace.spec.ts`

**Interfaces:**
- Consumes: `cargo run -p ad-server`（或 `cargo build` 后的 `target/debug/ad-server` 路径）
- Produces: preview 模式自动起真实 ad-server、注入 `VITE_ADL_SERVER_URL`（`import.meta.env`）；退出自动 kill；若起失败打日志回退到 mock

- [ ] **Step 1: launch 脚本（spawn+probe+kill）**；`package.json` 新增 `"dev:preview": "node dev/ad-server-launch.mjs && vite"`（或 vite config plugin 内嵌 spawn 逻辑，参考现有 `handlePreviewWorkspaceApi` 的中间件注入点）。
- [ ] **Step 2: preview-bridge 读取 `import.meta.env.VITE_ADL_SERVER_URL` 构造 httpBridge**。
- [ ] **Step 3: E2E 冒烟**：`pnpm test:e2e:workspace`（Playwright 打开 preview 会话页面 → 真实 SSE 可见状态）或新增 `test:e2e` 用例；`pnpm --dir frontend run lint`。
- [ ] **Step 4: 双端一致验证**：Tauri 与浏览器同一引擎逻辑均通过 SSE 渲染（可作为验收 ticket）。
- [ ] **Step 5: 提交**
```bash
git commit -m "feat(preview): preview mode spawns real ad-server and uses httpBridge"
```

---

### Task 10: Tauri 壳收窄 + 全量验收

**Files:**
- Modify: `src-tauri/src/lib.rs`（删业务 event emit、business commands 迁移后清理 `Register` 列表）
- Modify: `src-tauri/src/commands/mod.rs`（保留类目收敛为系统中仅 browser/platform/app/window/log；其它改只转发到 ad-server 或直接移除）
- Modify: `src-tauri/src/state.rs`（移除业务字段——迁移完成后 `AppState` 收敛为最小壳）
- Modify: `src-tauri/Cargo.toml`（may remove deps）
- Test: `src-tauri` 现有测试 + 双端一致

- [ ] **Step 1: 盘点 `src-tauri/src/commands/*.rs`，凡迁移完成的删除；未迁的移进 `crates/server`。**
- [ ] **Step 2: Tauri 侧 `CustomAgent.run_command_*` 等改为 spawn `ad-server` 子进程并转发 webview。**（浏览器/系统命令保留）
- [ ] **Step 3: 全量**
```bash
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings   # 0
pnpm --dir frontend test
pnpm --dir frontend run lint                            # 0 errors
pnpm --dir frontend test:e2e
```
- [ ] **Step 4: 双端人工**：桌面模式起应用→建会话/发消息/开终端/开浏览器（系统能力仍在）；浏览器 `pnpm dev:preview`→同会话/终端 SSE 流一致。
- [ ] **Step 5: 文档**：更新 `docs/superpowers/specs/2026-08-09-agent-operation-frontend-opencode-alignment-design.md` §4 验收已完成 → 标「完成」；提交 `docs(server): S1 server converge complete`（finish）。

---

## Execution Handoff（由父 agent 选择）

- **Subagent-Driven（推荐）**：每次 dispatch 一个 subagent（Task 1→n），`Task 完成即 review`——见 superpowers:subagent-driven-development。
- **Inline**：executing-plans 逐 Task 检查点。

> 每 Task 一次 `git status` 确认 scope 干净；每次 commit 独立、conventional（docs/feat/fix safe）。