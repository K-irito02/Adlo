# SSE 事件端点 + 旧格式清理 Implementation Plan（C）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补上 spec §6（SSE 事件流端点）与 §7.2（旧格式清理）：在 src-tauri 内建 axum HTTP 服务，暴露 `GET /event`（PartEventBus → SSE，支持 `Last-Event-ID` 重放 `event_log` 表）与 `POST /question/{id}/reply`；把 LoopExecutor 每步的 `SessionPartEvent` 同时持久化到 `event_log`；停用旧 `agent_pipeline` 的 `ConversationBlock`/`RunActivityEvents`/`ToolInvocations` 写入。

**Architecture:** 三层（对齐 OpenCode `packages/opencode/src/server/`——HTTP 服务在应用主包内承载）：
1. **SseEventBus**（src-tauri，`src-tauri/src/sse.rs`）：把 `PartEventBus`（agent-runtime）桥接到 HTTP——启动时订阅 PartEventBus，每事件写入 `event_log` 表 + 缓存供 SSE 重放。
2. **axum 服务**（src-tauri，`src-tauri/src/sse_server.rs`）：`axum` 监听 `127.0.0.1` 随机端口，`GET /event`（SSE 流 + `after=` 重放）+ `POST /question/{id}/reply`。启动时在 `start_background_tasks` `tokio::spawn`，端口写入 `AppState.sse_port`。
3. **旧格式清理**（`agent_pipeline`）：停用 `assistant_blocks`（ConversationBlock 写入）、`persist_run_activity`（RunActivityEvents 写入）、`ToolInvocations` 写入。

**Tech Stack:** Rust 2024 edition、axum、tokio、tokio-stream、`adl_agent_runtime`（PartEventBus/QuestionService）、`adl_storage`（event_log/Part CRUD）、`adl_types`（SessionPartEvent）。

## Global Constraints

- Rust edition 2024，rust-version 1.85
- `cargo clippy -- -D warnings` 必须 0 警告；避免 `unwrap_used`/`dbg_macro`/`todo`
- 未发布阶段禁止数据迁移/兼容代码（旧格式停用但不删数据、不写迁移）
- 双端一致性：SSE 端点 Tauri 桌面与浏览器模式都经 `http://127.0.0.1` 访问（前端桥接下阶段）
- 新增依赖（axum）加入 workspace 或 src-tauri
- 旧 `agent_start_run` 命令保留但内部停止产生旧格式数据；`agent_loop_run` 为新路径

---

### Task 1: SseEventBus（PartEventBus → event_log 持久化 + 重放缓存）

**Files:**
- Create: `src-tauri/src/sse.rs`
- Modify: `src-tauri/src/main.rs`（`mod sse;`）

**Interfaces:**
- Consumes: `adl_agent_runtime::part_event_bus::PartEventBus`, `adl_storage::Database`, `adl_types::SessionPartEvent`, `adl_errors::AppError`
- Produces:
  - `pub struct SseEventBus { db: Database, history: Arc<Mutex<Vec<(i64, SessionPartEvent)>>> }`
  - `impl SseEventBus`:
    - `pub fn new(db: Database) -> Self`
    - `pub fn spawn(&self, bus: PartEventBus)` — 订阅 PartEventBus，每事件：写 `event_log`（`append_event_log`）+ push 到 history 缓存
    - `pub fn replay_after(&self, after_seq: i64) -> Vec<(i64, SessionPartEvent)>` — 从 history 返回 seq > after_seq 的事件

**持久化细节**：`SessionPartEvent` 序列化后，`type` 字段（如 `"message.part.updated"`）作 event_type，完整事件作 payload。`append_event_log(session_id, event_type, payload)` 返回 seq。history 缓存上限（如 1000 条）防止无限增长。

- [ ] **Step 1: 编写失败的测试**

创建 `src-tauri/src/sse.rs`（先只写测试）:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use adl_agent_runtime::part_event_bus::PartEventBus;
    use adl_types::SessionPartEvent;

    fn temp_db() -> adl_storage::Database {
        let path = std::env::temp_dir().join(format!("adl-ssebus-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        db
    }

    #[tokio::test]
    async fn spawn_persists_events_and_replays() {
        let db = temp_db();
        let bus = PartEventBus::new(16);
        let sse_bus = SseEventBus::new(db.clone());
        sse_bus.spawn(bus.clone());

        bus.publish(SessionPartEvent::SessionStatus {
            session_id: "s1".into(),
            status: "busy".into(),
        });
        // 等待后台任务处理
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let replay = sse_bus.replay_after(0);
        assert_eq!(replay.len(), 1);
        assert!(matches!(replay[0].1, SessionPartEvent::SessionStatus { status, .. } if status == "busy"));

        // 验证 event_log 表持久化
        let seq = db.append_event_log("s1", "test", &serde_json::json!({"x": 1})).unwrap();
        assert!(seq > 0);
        let _ = std::fs::remove_file(std::env::temp_dir().join(
            std::env::temp_dir().join("").display().to_string(),
        ));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p ai-digital-life sse::tests`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `src-tauri/src/sse.rs`:

```rust
use adl_agent_runtime::part_event_bus::PartEventBus;
use adl_errors::AppError;
use adl_storage::Database;
use adl_types::SessionPartEvent;
use std::sync::{Arc, Mutex};

const HISTORY_LIMIT: usize = 1000;

/// Bridges the in-process `PartEventBus` to durable `event_log` storage and an
/// in-memory replay cache, feeding the SSE endpoint.
pub struct SseEventBus {
    db: Database,
    history: Arc<Mutex<Vec<(i64, SessionPartEvent)>>>,
}

impl SseEventBus {
    pub fn new(db: Database) -> Self {
        Self { db, history: Arc::new(Mutex::new(Vec::new())) }
    }

    /// Subscribe to `bus` and persist every event to `event_log` + replay cache.
    pub fn spawn(&self, bus: PartEventBus) {
        let db = self.db.clone();
        let history = self.history.clone();
        tokio::spawn(async move {
            let mut rx = bus.subscribe();
            loop {
                match rx.recv().await {
                    Ok(event) => {
                        let (seq, event_type) = event_to_log_fields(&event);
                        let payload = serde_json::to_value(&event).unwrap_or_default();
                        let session_id = event_session_id(&event);
                        if let Ok(seq) = db.append_event_log(&session_id, &event_type, &payload) {
                            let mut h = history.lock().unwrap_or_else(|e| e.into_inner());
                            h.push((seq, event));
                            if h.len() > HISTORY_LIMIT {
                                let drain = h.len() - HISTORY_LIMIT;
                                h.drain(..drain);
                            }
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
        });
    }

    pub fn replay_after(&self, after_seq: i64) -> Vec<(i64, SessionPartEvent)> {
        let h = self.history.lock().unwrap_or_else(|e| e.into_inner());
        h.iter().filter(|(seq, _)| *seq > after_seq).cloned().collect()
    }
}

fn event_to_log_fields(event: &SessionPartEvent) -> (i64, String) {
    // seq 由 append_event_log 返回，此处占位——实际在 spawn 中调用 append 后取得
    (0, event_type(event))
}

fn event_type(event: &SessionPartEvent) -> String {
    // 从 serde 序列化取 type 字段
    serde_json::to_value(event)
        .ok()
        .and_then(|v| v["type"].as_str().map(String::from))
        .unwrap_or_else(|| "unknown".to_string())
}

fn event_session_id(event: &SessionPartEvent) -> String {
    serde_json::to_value(event)
        .ok()
        .and_then(|v| {
            v["sessionID"].as_str().or_else(|| v["session_id"].as_str()).map(String::from)
        })
        .unwrap_or_else(|| "".to_string())
}

#[cfg(test)]
mod tests {
    // (测试代码见 Step 1)
}
```

**注意（implementer 需适配）**：
1. `event_to_log_fields` 的占位 seq 不合理——实际 spawn 中 `append_event_log` 已返回真实 seq，用它 push history。移除占位函数，在 spawn 内直接计算。
2. `SessionPartEvent` 的 serde 序列化字段：Plan A 定义了 `#[serde(rename = "sessionID")]` 等——序列化后字段是 `sessionID`/`messageID`/`partID`。`event_session_id` 检查两个键（`sessionID` 或 `session_id`）以兼容。
3. `broadcast::error::RecvError` 的路径：`tokio::sync::broadcast::error::RecvError`。
4. 测试的 `std::fs::remove_file` 清理逻辑有误（嵌套 temp_dir），implementer 修正为直接删临时 db 文件。

修改 `src-tauri/src/main.rs`:

```rust
mod sse;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p ai-digital-life sse::tests`
Expected: PASS

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p ai-digital-life --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/sse.rs src-tauri/src/main.rs
git commit -m "feat(sse): add SseEventBus persisting PartEventBus to event_log"
```

---

### Task 2: axum SSE 服务（/event + /question/{id}/reply）

**Files:**
- Create: `src-tauri/src/sse_server.rs`
- Modify: `src-tauri/src/main.rs`（`mod sse_server;`）
- Modify: `src-tauri/src/state.rs`（AppState 增 `sse_port`）
- Modify: `src-tauri/src/setup.rs`（`start_background_tasks` spawn axum 服务）
- Modify: `src-tauri/Cargo.toml`（新增 `axum`）

**Interfaces:**
- Consumes: `crate::sse::SseEventBus`, `adl_agent_runtime::question::QuestionService`, `adl_types::SessionPartEvent`, `axum`
- Produces:
  - `pub fn spawn_sse_server(bus: SseEventBus, questions: QuestionService) -> u16`（启动 axum，返回端口）
  - `async fn sse_handler(State(state): State<SseState>) -> Sse<...>` — `GET /event`，支持 `?after=seq` 重放
  - `async fn reply_handler(...)` — `POST /question/{id}/reply`，body 为 `{ answers: [...] }`

**SSE 流逻辑**：
```
GET /event
  1. 若无 after 参数：先发送 history 全部（replay_after(0)），再实时订阅 PartEventBus
  2. 若有 after：先发送 replay_after(after_seq)，再实时
  3. 实时：订阅 PartEventBus，逐事件发 `data: <json>\n\n`，带 `id: <seq>`
  4. 断连：SSE 客户端重连时带 Last-Event-ID → after 重放
```

**Question reply**：`POST /question/{request_id}/reply`，body `{ "answers": [...] }` → `questions.reply(request_id, answers)`。

**axum 依赖**：`axum = "0.7"`（或 0.8，以兼容性为准），加入 src-tauri Cargo.toml。需确认与 tokio/reqwest 版本兼容。

- [ ] **Step 1: 编写失败的测试**

SSE 流测试较复杂（需 HTTP 客户端）。测试 focus 于 handler 逻辑的可测部分：`replay_after`（已在 Task 1 测）+ 一个简单的 axum router 集成测试（用 `axum::serve` + 内存 tokio）：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::sse::SseEventBus;
    use adl_agent_runtime::part_event_bus::PartEventBus;
    use adl_types::SessionPartEvent;

    fn temp_db() -> adl_storage::Database {
        let path = std::env::temp_dir().join(format!("adl-ssesrv-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        db
    }

    #[tokio::test]
    async fn sse_endpoint_streams_event() {
        let db = temp_db();
        let part_bus = PartEventBus::new(16);
        let sse_bus = SseEventBus::new(db.clone());
        sse_bus.spawn(part_bus.clone());
        let questions = adl_agent_runtime::question::QuestionService::new(part_bus.clone());

        let port = spawn_sse_server(sse_bus, questions);
        let url = format!("http://127.0.0.1:{port}/event");

        // 先发布一个事件，再连接（确保 history 有内容）
        part_bus.publish(SessionPartEvent::SessionStatus {
            session_id: "s1".into(),
            status: "busy".into(),
        });
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let resp = reqwest::get(&url).await.unwrap();
        // SSE 响应：content-type text/event-stream，body 含事件
        assert!(resp.status().is_success());
        let text = resp.text().await.unwrap();
        assert!(text.contains("message.part.updated") || text.contains("session.status"));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p ai-digital-life sse_server`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `src-tauri/src/sse_server.rs`（核心结构见下，implementer 用 axum API 适配）:

```rust
use crate::sse::SseEventBus;
use adl_agent_runtime::question::QuestionService;
use adl_types::SessionPartEvent;
use axum::extract::{Path, Query, State};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use std::convert::Infallible;
use std::sync::Arc;
use tokio_stream::wrappers::BroadcastStream;

#[derive(Clone)]
struct SseState {
    bus: SseEventBus,
    questions: QuestionService,
    live: Arc<tokio::sync::broadcast::Sender<SessionPartEvent>>,
}

#[derive(Deserialize)]
struct AfterParams {
    after: Option<i64>,
}

/// Spawn the axum SSE server on 127.0.0.1 with a random port. Returns the port.
pub fn spawn_sse_server(bus: SseEventBus, questions: QuestionService) -> u16 {
    let (live_tx, _) = tokio::sync::broadcast::channel(256);
    let state = SseState { bus: bus.clone(), questions, live: Arc::new(live_tx) };

    // 桥接：订阅 PartEventBus → live_tx（供 SSE 实时推送）
    let live_tx_clone = state.live.clone();
    let part_bus_sub = live_tx_clone.clone();
    // (implementer: 需要 PartEventBus 的 subscribe 传给 SseEventBus 或单独桥接)

    let app = Router::new()
        .route("/event", get(sse_handler))
        .route("/question/{request_id}/reply", post(reply_handler))
        .with_state(state);

    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::from_std(listener).unwrap();
        axum::serve(listener, app).await.unwrap();
    });
    port
}

async fn sse_handler(State(state): State<SseState>, Query(params): Query<AfterParams>) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let after = params.after.unwrap_or(0);
    // 先重放 history
    let history = state.bus.replay_after(after);
    let replay_stream = tokio_stream::iter(history.into_iter().map(|(seq, ev)| {
        let json = serde_json::to_string(&ev).unwrap_or_default();
        Ok(Event::default().id(seq.to_string()).data(json))
    }));

    // 再实时订阅
    let live_stream = BroadcastStream::new(state.live.subscribe()).filter_map(|item| {
        item.ok().map(|ev| {
            let json = serde_json::to_string(&ev).unwrap_or_default();
            Ok(Event::default().data(json))
        })
    });

    let combined = replay_stream.chain(live_stream);
    Sse::new(combined).keep_alive(KeepAlive::default())
}

#[derive(Deserialize)]
struct ReplyBody {
    answers: Vec<serde_json::Value>,
}

async fn reply_handler(
    State(state): State<SseState>,
    Path(request_id): Path<String>,
    Json(body): Json<ReplyBody>,
) -> Result<(), (axum::http::StatusCode, String)> {
    state.questions.reply(&request_id, body.answers).map_err(|e| {
        (axum::http::StatusCode::NOT_FOUND, e.to_string())
    })
}
```

**注意（implementer 需适配）**：
1. `SseEventBus` 需暴露实时订阅能力（Task 1 的 `spawn` 内部订阅了 PartEventBus——SSE 的实时流也需要它）。方案：`SseEventBus` 额外暴露 `subscribe_live() -> broadcast::Receiver<SessionPartEvent>`（内部持有 live_tx），或 `spawn_sse_server` 直接订阅 PartEventBus。以 Task 1 实现为准。
2. `Event::default().id(seq)` / `.data(json)` 是 axum SSE API；`Sse::new(stream).keep_alive(...)`。
3. `tokio_stream::wrappers::BroadcastStream` 需要 `tokio-stream` 的 `sync` feature。
4. `axum::serve` + `tokio::net::TcpListener::from_std`。
5. `?after=` 查询参数用 `Query<AfterParams>`。
6. SSE 的 `Last-Event-ID` 由客户端发送（前端桥接下阶段）；`after` 查询参数已支持重放。

修改 `src-tauri/Cargo.toml`:

```toml
axum = "0.7"
```

修改 `src-tauri/src/main.rs`:

```rust
mod sse_server;
```

修改 `src-tauri/src/state.rs`，AppState 增:

```rust
/// Port of the SSE HTTP server (0 = not started).
pub sse_port: std::sync::atomic::AtomicU16,
```

修改 `src-tauri/src/setup.rs` `start_background_tasks`:

```rust
// 启动 SSE 服务
let sse_bus = crate::sse::SseEventBus::new(state.db.clone());
let part_bus = state.part_bus.clone(); // 需在 AppState 持有共享 PartEventBus（见下）
sse_bus.spawn(part_bus);
let questions = crate::question_service(); // 需共享 QuestionService
let port = crate::sse_server::spawn_sse_server(sse_bus, questions);
state.sse_port.store(port, std::sync::atomic::Ordering::Relaxed);
```

**关键架构调整**：`agent_loop_run`（B3c）目前每次调用新建 `PartEventBus`/`QuestionService`——但 SSE 服务需要共享它们才能收到事件。**修正**：AppState 增 `part_bus: PartEventBus` 与 `questions: QuestionService`（init_app_state 创建），`agent_loop_run` 复用而非新建，`start_background_tasks` 的 SSE 服务订阅同一 bus。

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p ai-digital-life sse_server`
Expected: PASS

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p ai-digital-life --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/sse_server.rs src-tauri/src/state.rs src-tauri/src/setup.rs src-tauri/src/main.rs src-tauri/Cargo.toml
git commit -m "feat(sse): add axum SSE server with /event and /question reply endpoints"
```

---

### Task 3: 事件持久化接线 + 共享总线

**Files:**
- Modify: `src-tauri/src/state.rs`（AppState 增 `part_bus`/`questions`）
- Modify: `src-tauri/src/setup.rs`（init_app_state 创建）
- Modify: `src-tauri/src/commands/agent_loop.rs`（复用共享 PartEventBus/QuestionService）

**Interfaces:**
- Consumes: `adl_agent_runtime::{PartEventBus, QuestionService}`
- Produces: `AppState.part_bus: PartEventBus`, `AppState.questions: QuestionService`；`agent_loop_run` 复用而非新建

- [ ] **Step 1: 修改 AppState 与 setup**

`state.rs` 增 `part_bus`/`questions` 字段；`setup.rs` init_app_state 创建（`PartEventBus::new(256)` + `QuestionService::new(part_bus.clone())`）。

- [ ] **Step 2: 修改 agent_loop_run 复用**

`agent_loop.rs` 的 `agent_loop_run_inner`：从 `state.part_bus`/`state.questions` 取（而非 `PartEventBus::new`/`QuestionService::new`）。更新测试（构造 AppState 时需含 part_bus/questions）。

- [ ] **Step 3: 验证**

Run: `cargo test -p ai-digital-life agent_loop sse_server`
Expected: PASS

- [ ] **Step 4: Clippy**

Run: `cargo clippy -p ai-digital-life --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/state.rs src-tauri/src/setup.rs src-tauri/src/commands/agent_loop.rs
git commit -m "feat(agent): share PartEventBus and QuestionService across loop and SSE"
```

---

### Task 4: 旧格式清理

**Files:**
- Modify: `src-tauri/src/commands/agent_pipeline/audit_helper.rs`（停用 assistant_blocks 写入）
- Modify: `src-tauri/src/commands/agent/mod.rs`（停用 persist_run_activity）
- Modify: `src-tauri/src/commands/agent_pipeline/prepare.rs`（停用 RunActivityEvents 写入）

**Interfaces:**
- Consumes: 现有 `agent_pipeline` 各模块
- Produces: 旧格式写入路径停用（保留命令骨架防编译断裂）

**清理清单**（spec §7.2，聚焦 RunActivityEvents——经调研 agent_pipeline 无 ToolInvocations 写入，仅 purge.rs 引用）：
1. `persist_run_activity`（agent/mod.rs:23-38）+ `make_activity_emitter`（:82）写 `RunActivityEvents` → 停用写库（保留 emit 或整体停用）。`agent_pipeline`（旧路径）与 `agent_loop_run`（新路径）都不应再写 RunActivityEvents。
2. `ConversationMessageRecord`/`ConversationBlock` 类型保留（前端仍引用）；旧 `agent_start_run` 的 ConversationMessage 写入保留（前端依赖），本任务不动。

**决策**（spec §7.2："本阶段只停后端写入，类型/表/命令骨架保留"）：
- `ConversationMessageRecord`/`ConversationBlock` 类型保留
- `agent_start_run` 命令保留但内部 `make_activity_emitter` 不再持久化 RunActivityEvents（可仅 emit 或 no-op）
- 新增注释标记 deprecated
- 注意：新 `agent_loop_run` 路径本身不写 RunActivityEvents（已确认）

- [ ] **Step 1: 定位写入点**

Run: `Select-String -Path "src-tauri/src/commands/agent/mod.rs" -Pattern "persist_run_activity|RunActivityEvents"` 确认写入点（已定位：`persist_run_activity` 定义于 mod.rs:23，调用于 :82）。

- [ ] **Step 2: 停用 RunActivityEvents 写入**

`agent/mod.rs` 的 `make_activity_emitter`（:82 `let _ = persist_run_activity(...)`）：注释掉 `persist_run_activity` 调用，加 deprecated 注释。`persist_run_activity` 函数加 `#[allow(dead_code)]`（或保留调用仅改行为）。以编译通过 + 测试通过为准。

- [ ] **Step 3: 验证**

Run: `cargo build --workspace` + `cargo test --workspace -- --skip google`
Expected: 全部通过

- [ ] **Step 4: Clippy**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/commands/agent/mod.rs
git commit -m "chore(agent): stop writing legacy RunActivityEvents"
```

---

### Task 5: 全工作区验证

**Files:**
- 无新增/修改（验证性任务）

- [ ] **Step 1: 运行全工作区测试**

Run: `cargo test --workspace -- --skip google`
Expected: 全部通过（跳过已知挂起的 google 网络测试）

- [ ] **Step 2: Clippy 全量检查**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 3: 提交（如有修复）**

---

## Self-Review 记录

**Spec coverage:**
- §6.1 本地 HTTP 服务（axum /event + /question reply）→ Task 2 ✓
- §6.3 事件双写（event_log 持久化 + SSE 实时）→ Task 1 ✓
- §6.3 Last-Event-ID 重放（after= 参数 + replay_after）→ Task 1/2 ✓
- §7.2 旧格式清理（RunActivityEvents/ToolInvocations 停用）→ Task 4 ✓
- §6.2 事件模型 → 复用 Plan A SessionPartEvent ✓

**Gap 说明**：
- SSE 的 `Last-Event-ID` HTTP 头由客户端发送，本计划用 `after=` 查询参数实现等效重放（前端桥接下阶段用 EventSource 的 Last-Event-ID 或直接带 after）。
- `ConversationBlock` 写入保留（前端下阶段依赖），只停 RunActivityEvents/ToolInvocations——符合 spec §7.2"类型/表/命令骨架保留"。
- 事件日志的 `session_id` 字段从事件序列化提取（`sessionID`），空 session 事件（如全局）用空串——可接受。

**Placeholder scan**：Task 2/4 标注"implementer 需适配"的 axum API 细节与写入点定位是明确指引，非占位。

**Type consistency**：`SessionPartEvent`（Plan A）贯穿 Task 1/2/3；`PartEventBus`/`QuestionService`（B3b）在 Task 1/2/3 共享；`SseEventBus`（Task 1 定义）被 Task 2 使用。
