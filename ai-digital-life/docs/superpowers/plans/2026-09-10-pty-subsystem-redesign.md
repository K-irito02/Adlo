# PTY 子系统重设计实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 PTY 子系统从 `portable-pty` 0.8（同步）迁移到 `rust-pty` 0.6（异步 Tokio），全面重构 PTY 会话管理。

**Architecture:** 使用 `rust-pty` 替代 `portable-pty`，引入异步 trait 抽象（`PtySession`、`PtySystem`），将 `SessionManager` 重构为 `AsyncSessionManager`（使用 `tokio::sync::RwLock`），WebSocket handler 改为异步。

**Tech Stack:** Rust, tokio, rust-pty, async-trait, axum WebSocket

**Spec:** `docs/superpowers/specs/2026-09-10-pty-subsystem-redesign.md`

## Global Constraints

- Rust 1.88+ (rust-pty 要求)
- Tokio runtime required
- Windows 10 1809+ (ConPTY requirement)
- WebSocket protocol 保持兼容（仅新增 `terminated` 事件）
- 前端代码无需修改（WebSocket 协议兼容）

## 文件结构

```
crates/pty/src/
├── lib.rs              # 公开 API（修改）
├── traits.rs           # PtySession, PtySystem trait（新增）
├── rust_pty_impl.rs    # rust-pty 实现（新增）
├── session_manager.rs  # AsyncSessionManager（重写）
├── shell_resolver.rs   # Shell 路径解析（不变）
├── error.rs            # 错误类型（新增）
└── mock.rs             # Mock PTY 实现（新增）

crates/server/src/
├── pty_ws.rs           # WebSocket handler（重写）
└── state.rs            # ServerState（修改）

crates/pty/tests/
└── windows_compat.rs   # 测试（重写）

Cargo.toml              # workspace 依赖（修改）
```

---

### Task 1: 更新依赖配置

**Files:**
- Modify: `Cargo.toml` (workspace root)
- Modify: `crates/pty/Cargo.toml`

**Interfaces:**
- Consumes: None
- Produces: `rust-pty` and `async-trait` dependencies available

- [ ] **Step 1: 更新 workspace Cargo.toml**

在 `[workspace.dependencies]` 中添加：

```toml
rust-pty = "0.6"
async-trait = "0.1"
```

移除：

```toml
portable-pty = "0.8"
```

- [ ] **Step 2: 更新 crates/pty/Cargo.toml**

```toml
[dependencies]
adl-types = { path = "../types" }
adl-errors = { path = "../errors" }
rust-pty.workspace = true
async-trait.workspace = true
tokio = { version = "1", features = ["full"] }
serde.workspace = true
tracing.workspace = true
dirs.workspace = true
static_assertions = "1"

[dev-dependencies]
tokio = { version = "1", features = ["full"] }
```

- [ ] **Step 3: 验证编译**

Run: `cargo check -p adl-pty`
Expected: 编译通过（可能有未使用的导入警告）

- [ ] **Step 4: Commit**

```bash
git add Cargo.toml crates/pty/Cargo.toml
git commit -m "chore(pty): replace portable-pty with rust-pty and async-trait"
```

---

### Task 2: 创建错误类型

**Files:**
- Create: `crates/pty/src/error.rs`
- Modify: `crates/pty/src/lib.rs`

**Interfaces:**
- Consumes: None
- Produces: `PtyError` enum, `Result<T>` type alias

- [ ] **Step 1: 创建 error.rs**

```rust
use std::fmt;

/// PTY 操作错误类型
#[derive(Debug)]
pub enum PtyError {
    /// IO 错误
    Io(std::io::Error),
    /// Shell 未找到
    ShellNotFound(String),
    /// 会话未找到
    SessionNotFound(String),
    /// 会话已关闭
    SessionClosed,
    /// 其他错误
    Other(String),
}

impl fmt::Display for PtyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PtyError::Io(e) => write!(f, "IO error: {}", e),
            PtyError::ShellNotFound(s) => write!(f, "Shell not found: {}", s),
            PtyError::SessionNotFound(s) => write!(f, "Session not found: {}", s),
            PtyError::SessionClosed => write!(f, "Session closed"),
            PtyError::Other(s) => write!(f, "{}", s),
        }
    }
}

impl std::error::Error for PtyError {}

impl From<std::io::Error> for PtyError {
    fn from(e: std::io::Error) -> Self {
        PtyError::Io(e)
    }
}

/// PTY 操作结果类型
pub type Result<T> = std::result::Result<T, PtyError>;
```

- [ ] **Step 2: 更新 lib.rs**

添加模块声明：

```rust
pub mod error;
pub mod traits;
pub mod shell_resolver;
pub mod session_manager;
pub mod rust_pty_impl;
pub mod mock;

pub use error::{PtyError, Result};
pub use traits::{PtySession, PtySystem, PtyStatus, ExitStatus};
pub use session_manager::{AsyncSessionManager, PtyEventEmitter, PtySessionInfo};
```

- [ ] **Step 3: 验证编译**

Run: `cargo check -p adl-pty`
Expected: 编译通过

- [ ] **Step 4: Commit**

```bash
git add crates/pty/src/error.rs crates/pty/src/lib.rs
git commit -m "feat(pty): add error types and module structure"
```

---

### Task 3: 创建 PTY Trait

**Files:**
- Create: `crates/pty/src/traits.rs`

**Interfaces:**
- Consumes: `error.rs`
- Produces: `PtySession` trait, `PtySystem` trait, `PtyStatus` enum, `ExitStatus` enum

- [ ] **Step 1: 创建 traits.rs**

```rust
use async_trait::async_trait;

/// PTY 会话状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum PtyStatus {
    Running,
    Terminated,
}

/// 退出状态
#[derive(Debug, Clone, Copy)]
pub enum ExitStatus {
    Exited(u32),
    Signaled(i32),
}

impl ExitStatus {
    pub fn success(&self) -> bool {
        matches!(self, ExitStatus::Exited(0))
    }
    
    pub fn exit_code(&self) -> u32 {
        match self {
            ExitStatus::Exited(code) => *code,
            ExitStatus::Signaled(sig) => *sig as u32,
        }
    }
}

/// PTY 会话 trait
#[async_trait]
pub trait PtySession: Send + Sync {
    /// 获取会话 ID
    fn id(&self) -> &str;
    
    /// 获取 shell 名称
    fn shell(&self) -> &str;
    
    /// 获取工作目录
    fn cwd(&self) -> &str;
    
    /// 获取当前状态
    fn status(&self) -> PtyStatus;
    
    /// 获取终端尺寸 (cols, rows)
    fn size(&self) -> (u16, u16);
    
    /// 异步读取输出
    async fn read(&self, buf: &mut [u8]) -> std::result::Result<usize, std::io::Error>;
    
    /// 异步写入输入
    async fn write(&self, data: &[u8]) -> std::result::Result<(), std::io::Error>;
    
    /// 调整终端尺寸
    async fn resize(&self, cols: u16, rows: u16) -> std::result::Result<(), std::io::Error>;
    
    /// 终止会话
    async fn kill(&self) -> std::result::Result<(), std::io::Error>;
    
    /// 等待会话结束
    async fn wait(&self) -> std::result::Result<ExitStatus, std::io::Error>;
    
    /// 非阻塞检查退出状态
    fn try_wait(&self) -> std::result::Result<Option<ExitStatus>, std::io::Error>;
}

/// PTY 系统 trait
#[async_trait]
pub trait PtySystem: Send + Sync {
    /// 会话类型
    type Session: PtySession;
    
    /// 创建新的 PTY 会话
    async fn spawn(
        &self,
        program: &str,
        args: &[String],
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> std::result::Result<Self::Session, std::io::Error>;
}
```

- [ ] **Step 2: 验证编译**

Run: `cargo check -p adl-pty`
Expected: 编译通过

- [ ] **Step 3: Commit**

```bash
git add crates/pty/src/traits.rs
git commit -m "feat(pty): add PtySession and PtySystem traits"
```

---

### Task 4: 创建 Mock PTY 实现

**Files:**
- Create: `crates/pty/src/mock.rs`

**Interfaces:**
- Consumes: `traits.rs`, `error.rs`
- Produces: `MockPtySession` struct

- [ ] **Step 1: 创建 mock.rs**

```rust
use crate::traits::{PtySession, PtyStatus, ExitStatus};
use async_trait::async_trait;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Mock PTY 会话，用于测试
pub struct MockPtySession {
    id: String,
    shell: String,
    cwd: String,
    cols: u16,
    rows: u16,
    output_buffer: Arc<Mutex<Vec<u8>>>,
    status: PtyStatus,
}

impl MockPtySession {
    pub fn new(id: &str, shell: &str, cwd: &str, cols: u16, rows: u16) -> Self {
        Self {
            id: id.to_string(),
            shell: shell.to_string(),
            cwd: cwd.to_string(),
            cols,
            rows,
            output_buffer: Arc::new(Mutex::new(Vec::new())),
            status: PtyStatus::Running,
        }
    }
    
    /// 向输出缓冲区写入数据（测试用）
    pub async fn push_output(&self, data: &[u8]) {
        let mut buf = self.output_buffer.lock().await;
        buf.extend_from_slice(data);
    }
}

#[async_trait]
impl PtySession for MockPtySession {
    fn id(&self) -> &str { &self.id }
    fn shell(&self) -> &str { &self.shell }
    fn cwd(&self) -> &str { &self.cwd }
    fn status(&self) -> PtyStatus { self.status }
    fn size(&self) -> (u16, u16) { (self.cols, self.rows) }
    
    async fn read(&self, buf: &mut [u8]) -> Result<usize, std::io::Error> {
        let mut output = self.output_buffer.lock().await;
        if output.is_empty() {
            return Ok(0);
        }
        let n = std::cmp::min(buf.len(), output.len());
        buf[..n].copy_from_slice(&output[..n]);
        output.drain(..n);
        Ok(n)
    }
    
    async fn write(&self, _data: &[u8]) -> Result<(), std::io::Error> {
        Ok(())
    }
    
    async fn resize(&self, _cols: u16, _rows: u16) -> Result<(), std::io::Error> {
        Ok(())
    }
    
    async fn kill(&self) -> Result<(), std::io::Error> {
        Ok(())
    }
    
    async fn wait(&self) -> Result<ExitStatus, std::io::Error> {
        Ok(ExitStatus::Exited(0))
    }
    
    fn try_wait(&self) -> Result<Option<ExitStatus>, std::io::Error> {
        Ok(Some(ExitStatus::Exited(0)))
    }
}

/// Mock PTY 系统，用于测试
pub struct MockPtySystem;

#[async_trait]
impl crate::traits::PtySystem for MockPtySystem {
    type Session = MockPtySession;
    
    async fn spawn(
        &self,
        program: &str,
        args: &[String],
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> Result<Self::Session, std::io::Error> {
        Ok(MockPtySession::new(
            &adl_types::create_id("mock-pty"),
            program,
            cwd,
            cols,
            rows,
        ))
    }
}
```

- [ ] **Step 2: 验证编译**

Run: `cargo check -p adl-pty`
Expected: 编译通过

- [ ] **Step 3: Commit**

```bash
git add crates/pty/src/mock.rs
git commit -m "feat(pty): add MockPtySession for testing"
```

---

### Task 5: 创建 rust-pty 实现

**Files:**
- Create: `crates/pty/src/rust_pty_impl.rs`

**Interfaces:**
- Consumes: `traits.rs`, `error.rs`
- Produces: `RustPtySystemImpl`, `RustPtySessionImpl`

- [ ] **Step 1: 创建 rust_pty_impl.rs**

```rust
use crate::traits::{PtySession, PtySystem, PtyStatus, ExitStatus};
use async_trait::async_trait;
use rust_pty::{PtyConfig, WindowSize};
use std::sync::Arc;
use tokio::sync::Mutex;

/// rust-pty 的 PTY 系统实现
pub struct RustPtySystemImpl;

#[async_trait]
impl PtySystem for RustPtySystemImpl {
    type Session = RustPtySessionImpl;
    
    async fn spawn(
        &self,
        program: &str,
        args: &[String],
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> Result<Self::Session, std::io::Error> {
        let config = PtyConfig {
            window_size: WindowSize::new(rows, cols),
            working_directory: Some(cwd.into()),
            ..Default::default()
        };
        
        let (master, child) = rust_pty::WindowsPtySystem::spawn(
            program,
            args.iter().map(|s| s.as_str()),
            &config,
        ).await?;
        
        Ok(RustPtySessionImpl {
            id: adl_types::create_id("pty"),
            shell: program.to_string(),
            cwd: cwd.to_string(),
            cols,
            rows,
            master: Arc::new(Mutex::new(Some(master))),
            child: Arc::new(Mutex::new(Some(child))),
        })
    }
}

/// rust-pty 的会话实现
pub struct RustPtySessionImpl {
    id: String,
    shell: String,
    cwd: String,
    cols: u16,
    rows: u16,
    master: Arc<Mutex<Option<rust_pty::WindowsPtyMaster>>>,
    child: Arc<Mutex<Option<rust_pty::WindowsPtyChild>>>,
}

#[async_trait]
impl PtySession for RustPtySessionImpl {
    fn id(&self) -> &str { &self.id }
    fn shell(&self) -> &str { &self.shell }
    fn cwd(&self) -> &str { &self.cwd }
    fn status(&self) -> PtyStatus { PtyStatus::Running }
    fn size(&self) -> (u16, u16) { (self.cols, self.rows) }
    
    async fn read(&self, buf: &mut [u8]) -> Result<usize, std::io::Error> {
        let mut master = self.master.lock().await;
        match master.as_mut() {
            Some(m) => m.read(buf).await,
            None => Ok(0),
        }
    }
    
    async fn write(&self, data: &[u8]) -> Result<(), std::io::Error> {
        let mut master = self.master.lock().await;
        match master.as_mut() {
            Some(m) => m.write_all(data).await,
            None => Err(std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "PTY session closed",
            )),
        }
    }
    
    async fn resize(&self, cols: u16, rows: u16) -> Result<(), std::io::Error> {
        let master = self.master.lock().await;
        match master.as_ref() {
            Some(m) => {
                m.resize(WindowSize::new(rows, cols)).await?;
                Ok(())
            },
            None => Err(std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "PTY session closed",
            )),
        }
    }
    
    async fn kill(&self) -> Result<(), std::io::Error> {
        let mut child = self.child.lock().await;
        match child.as_mut() {
            Some(c) => { c.kill()?; Ok(()) },
            None => Ok(()),
        }
    }
    
    async fn wait(&self) -> Result<ExitStatus, std::io::Error> {
        let mut child = self.child.lock().await;
        match child.as_mut() {
            Some(c) => {
                let status = c.wait().await?;
                Ok(ExitStatus::Exited(status.exit_code()))
            },
            None => Ok(ExitStatus::Exited(0)),
        }
    }
    
    fn try_wait(&self) -> Result<Option<ExitStatus>, std::io::Error> {
        Ok(None)
    }
}
```

- [ ] **Step 2: 验证编译**

Run: `cargo check -p adl-pty`
Expected: 编译通过（可能有未使用的导入警告）

- [ ] **Step 3: Commit**

```bash
git add crates/pty/src/rust_pty_impl.rs
git commit -m "feat(pty): add rust-pty implementation"
```

---

### Task 6: 创建 AsyncSessionManager

**Files:**
- Create: `crates/pty/src/session_manager.rs` (重写)

**Interfaces:**
- Consumes: `traits.rs`, `rust_pty_impl.rs`, `shell_resolver.rs`
- Produces: `AsyncSessionManager`, `PtyEventEmitter` trait, `PtySessionInfo`

- [ ] **Step 1: 创建 session_manager.rs**

```rust
use crate::traits::{PtySession, PtySystem, PtyStatus};
use crate::shell_resolver::ShellResolver;
use crate::rust_pty_impl::RustPtySystemImpl;
use adl_errors::AppError;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// PTY 事件发射器 trait
#[async_trait::async_trait]
pub trait PtyEventEmitter: Send + Sync + 'static {
    /// 发送 PTY 输出到 WebSocket
    async fn emit_output(&self, session_id: &str, data: &str);
    
    /// 通知会话已终止
    async fn emit_terminated(&self, session_id: &str);
}

/// 会话句柄
pub struct PtySessionHandle {
    pub session: Arc<dyn PtySession>,
    pub reader_task: tokio::task::JoinHandle<()>,
}

/// 异步 SessionManager
pub struct AsyncSessionManager {
    sessions: RwLock<HashMap<String, PtySessionHandle>>,
    pty_system: RustPtySystemImpl,
}

impl Default for AsyncSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl AsyncSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            pty_system: RustPtySystemImpl,
        }
    }
    
    /// 创建新的 PTY 会话
    pub async fn create(
        &self,
        emitter: Arc<dyn PtyEventEmitter>,
        shell: &str,
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> Result<String, AppError> {
        let resolution = ShellResolver::resolve(shell)
            .map_err(|e| AppError::Terminal(e.message()))?;
        
        let session = self.pty_system.spawn(
            &resolution.program,
            &resolution.args,
            cwd,
            cols,
            rows,
        ).await
        .map_err(|e| AppError::Terminal(format!("failed to create PTY session: {}", e)))?;
        
        let session_id = session.id().to_string();
        let session = Arc::from(session);
        
        let session_clone = Arc::clone(&session);
        let sid = session_id.clone();
        let reader_task = tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            loop {
                match session_clone.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        emitter.emit_output(&sid, &data).await;
                    },
                    Err(e) => {
                        tracing::warn!(error = %e, session_id = %sid, "PTY read error");
                        break;
                    },
                }
            }
            emitter.emit_terminated(&sid).await;
        });
        
        let mut sessions = self.sessions.write().await;
        sessions.insert(session_id.clone(), PtySessionHandle {
            session,
            reader_task,
        });
        
        tracing::info!(session_id = %session_id, shell = %shell, "pty session created");
        Ok(session_id)
    }
    
    /// 向会话写入数据
    pub async fn write(&self, session_id: &str, data: &str) -> Result<(), AppError> {
        let sessions = self.sessions.read().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| AppError::NotFound(format!("pty session not found: {}", session_id)))?;
        
        handle.session.write(data.as_bytes()).await
            .map_err(|e| AppError::Terminal(format!("write failed: {}", e)))
    }
    
    /// 调整会话尺寸
    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), AppError> {
        let sessions = self.sessions.read().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| AppError::NotFound(format!("pty session not found: {}", session_id)))?;
        
        handle.session.resize(cols, rows).await
            .map_err(|e| AppError::Terminal(format!("resize failed: {}", e)))
    }
    
    /// 终止会话
    pub async fn kill(&self, session_id: &str) -> Result<(), AppError> {
        let mut sessions = self.sessions.write().await;
        let handle = sessions
            .remove(session_id)
            .ok_or_else(|| AppError::NotFound(format!("pty session not found: {}", session_id)))?;
        
        handle.reader_task.abort();
        handle.session.kill().await
            .map_err(|e| AppError::Terminal(format!("kill failed: {}", e)))?;
        
        tracing::info!(session_id = %session_id, "pty session killed");
        Ok(())
    }
    
    /// 列出所有会话
    pub async fn list(&self) -> Result<Vec<PtySessionInfo>, AppError> {
        let sessions = self.sessions.read().await;
        let infos = sessions
            .iter()
            .map(|(id, handle)| PtySessionInfo {
                session_id: id.clone(),
                shell: handle.session.shell().to_string(),
                cwd: handle.session.cwd().to_string(),
                cols: handle.session.size().0,
                rows: handle.session.size().1,
                status: handle.session.status(),
            })
            .collect();
        Ok(infos)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtySessionInfo {
    pub session_id: String,
    pub shell: String,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    pub status: PtyStatus,
}
```

- [ ] **Step 2: 验证编译**

Run: `cargo check -p adl-pty`
Expected: 编译通过

- [ ] **Step 3: Commit**

```bash
git add crates/pty/src/session_manager.rs
git commit -m "feat(pty): add AsyncSessionManager with tokio::sync::RwLock"
```

---

### Task 7: 更新 WebSocket Handler

**Files:**
- Modify: `crates/server/src/pty_ws.rs`
- Modify: `crates/server/src/state.rs`
- Modify: `crates/server/Cargo.toml`

**Interfaces:**
- Consumes: `adl_pty::AsyncSessionManager`, `adl_pty::PtyEventEmitter`
- Produces: 异步 WebSocket handler

- [ ] **Step 1: 更新 crates/server/Cargo.toml**

确保依赖包含：

```toml
adl-pty = { path = "../pty" }
tokio = { version = "1", features = ["full"] }
async-trait = "0.1"
```

- [ ] **Step 2: 更新 crates/server/src/state.rs**

```rust
use adl_pty::AsyncSessionManager;

#[derive(Clone)]
pub struct ServerState {
    // ... 其他字段不变
    pub pty_sessions: Arc<AsyncSessionManager>,  // 变更类型
    // ... 其他字段不变
}
```

- [ ] **Step 3: 重写 crates/server/src/pty_ws.rs**

```rust
use crate::state::ServerState;
use adl_pty::{AsyncSessionManager, PtyEventEmitter};
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::mpsc;

pub async fn ws_handler(
    State(state): State<ServerState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(state, socket))
}

struct WsEmitter {
    tx: mpsc::UnboundedSender<Message>,
}

#[async_trait::async_trait]
impl PtyEventEmitter for WsEmitter {
    async fn emit_output(&self, session_id: &str, data: &str) {
        let frame = serde_json::json!({
            "kind": "output",
            "sessionId": session_id,
            "data": data
        });
        let _ = self.tx.send(Message::Text(frame.to_string()));
    }
    
    async fn emit_terminated(&self, session_id: &str) {
        let frame = serde_json::json!({
            "kind": "terminated",
            "sessionId": session_id
        });
        let _ = self.tx.send(Message::Text(frame.to_string()));
    }
}

async fn handle_socket(state: ServerState, socket: WebSocket) {
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let emitter: Arc<dyn PtyEventEmitter> = Arc::new(WsEmitter { tx });
    let (mut sink, mut stream) = socket.split();
    let mut created: Vec<String> = Vec::new();

    loop {
        tokio::select! {
            incoming = stream.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        let (reply, new_session) = dispatch_frame(&state, &emitter, &text).await;
                        if let Some(sid) = new_session {
                            created.push(sid);
                        }
                        if let Some(reply) = reply {
                            if sink.send(reply).await.is_err() {
                                break;
                            }
                        }
                    },
                    Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                    Some(Ok(Message::Binary(_)))
                    | Some(Ok(Message::Ping(_)))
                    | Some(Ok(Message::Pong(_))) => {},
                }
            }
            outgoing = rx.recv() => {
                match outgoing {
                    Some(msg) => {
                        if sink.send(msg).await.is_err() {
                            break;
                        }
                    },
                    None => break,
                }
            }
        }
    }

    if !created.is_empty() {
        for sid in &created {
            let _ = state.pty_sessions.kill(sid).await;
        }
    }
}

async fn dispatch_frame(
    state: &ServerState,
    emitter: &Arc<dyn PtyEventEmitter>,
    text: &str,
) -> (Option<Message>, Option<String>) {
    let value: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return (Some(error_message(None, "invalid JSON frame")), None),
    };
    let Some(kind) = value.get("kind").and_then(|k| k.as_str()) else {
        return (Some(error_message(None, "frame missing 'kind'")), None);
    };

    match kind {
        "create" => {
            let shell = value.get("shell").and_then(|s| s.as_str())
                .filter(|s| !s.is_empty()).unwrap_or("powershell");
            let cwd = value.get("cwd").and_then(|s| s.as_str())
                .filter(|s| !s.is_empty()).map(ToOwned::to_owned)
                .unwrap_or_else(|| std::env::current_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."))
                    .to_string_lossy().to_string());
            let cols = value.get("cols").and_then(|c| c.as_u64()).unwrap_or(80) as u16;
            let rows = value.get("rows").and_then(|c| c.as_u64()).unwrap_or(24) as u16;
            
            match state.pty_sessions.create(emitter.clone(), shell, &cwd, cols, rows).await {
                Ok(sid) => {
                    let reply = serde_json::json!({"kind": "created", "sessionId": sid}).to_string();
                    (Some(Message::Text(reply)), Some(sid))
                },
                Err(e) => (Some(error_message(None, &e.to_string())), None),
            }
        },
        "input" => {
            let Some(sid) = value.get("sessionId").and_then(|s| s.as_str()) else {
                return (Some(error_message(None, "input frame missing sessionId")), None);
            };
            let data = value.get("data").and_then(|d| d.as_str()).unwrap_or("");
            match state.pty_sessions.write(sid, data).await {
                Ok(()) => (None, None),
                Err(e) => (Some(error_message(Some(sid), &e.to_string())), None),
            }
        },
        "resize" => {
            let Some(sid) = value.get("sessionId").and_then(|s| s.as_str()) else {
                return (Some(error_message(None, "resize frame missing sessionId")), None);
            };
            let cols = value.get("cols").and_then(|c| c.as_u64()).unwrap_or(80) as u16;
            let rows = value.get("rows").and_then(|c| c.as_u64()).unwrap_or(24) as u16;
            match state.pty_sessions.resize(sid, cols, rows).await {
                Ok(()) => (None, None),
                Err(e) => (Some(error_message(Some(sid), &e.to_string())), None),
            }
        },
        "kill" => {
            let Some(sid) = value.get("sessionId").and_then(|s| s.as_str()) else {
                return (Some(error_message(None, "kill frame missing sessionId")), None);
            };
            match state.pty_sessions.kill(sid).await {
                Ok(()) => (None, None),
                Err(e) => (Some(error_message(Some(sid), &e.to_string())), None),
            }
        },
        _ => (Some(error_message(None, &format!("unknown frame kind: {kind}"))), None),
    }
}

fn error_message(sid: Option<&str>, message: &str) -> Message {
    let mut frame = serde_json::json!({ "kind": "error", "message": message });
    if let Some(sid) = sid {
        frame["sessionId"] = Value::String(sid.to_string());
    }
    Message::Text(frame.to_string())
}
```

- [ ] **Step 4: 验证编译**

Run: `cargo check -p adl-server`
Expected: 编译通过

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/pty_ws.rs crates/server/src/state.rs crates/server/Cargo.toml
git commit -m "feat(server): rewrite WebSocket handler for async PTY"
```

---

### Task 8: 重写测试

**Files:**
- Modify: `crates/pty/tests/windows_compat.rs`

**Interfaces:**
- Consumes: `rust_pty_impl.rs`, `traits.rs`
- Produces: 更新后的测试

- [ ] **Step 1: 重写 windows_compat.rs**

```rust
use rust_pty::{PtyConfig, WindowSize};
use rust_pty::traits::{PtySystem as RustPtySystem, PtyChild, PtyMaster};
use std::time::Duration;

async fn read_all_output(
    mut master: impl PtyMaster,
    timeout: Duration,
) -> Vec<u8> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    
    tokio::spawn(async move {
        let mut result = Vec::new();
        let mut buf = [0u8; 8192];
        loop {
            match master.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => result.extend_from_slice(&buf[..n]),
                Err(_) => break,
            }
        }
        let _ = tx.send(result);
    });
    
    match tokio::time::timeout(timeout, rx).await {
        Ok(Ok(data)) => data,
        _ => {
            eprintln!("read_all_output timed out after {:?}", timeout);
            Vec::new()
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    fn should_run_pty_tests() -> bool {
        std::env::var("ADL_PTY_TEST").map(|v| v == "1").unwrap_or(false)
    }
    
    #[tokio::test]
    async fn test_cmd_echo_utf8() {
        if !should_run_pty_tests() {
            eprintln!("Skipping test_cmd_echo_utf8: set ADL_PTY_TEST=1 to run");
            return;
        }
        
        let config = PtyConfig {
            window_size: WindowSize::new(40, 120),
            ..Default::default()
        };
        
        let (mut master, mut child) = rust_pty::WindowsPtySystem::spawn(
            "cmd",
            &["/c", "echo", "你好 world 🎉"],
            &config,
        ).await.expect("spawn failed");
        
        let output = tokio::time::timeout(
            Duration::from_secs(10),
            read_all_output(master, Duration::from_secs(5)),
        ).await.unwrap_or_default();
        
        let output_str = String::from_utf8_lossy(&output);
        assert!(
            output_str.contains("你好 world 🎉"),
            "Expected UTF-8 in output, got: {:?}",
            output_str,
        );
        
        child.wait().await.expect("wait failed");
    }
    
    #[tokio::test]
    async fn test_powershell_echo() {
        if !should_run_pty_tests() {
            eprintln!("Skipping test_powershell_echo: set ADL_PTY_TEST=1 to run");
            return;
        }
        
        let config = PtyConfig {
            window_size: WindowSize::new(40, 120),
            ..Default::default()
        };
        
        let (mut master, mut child) = rust_pty::WindowsPtySystem::spawn(
            "powershell",
            &["-Command", "Write-Output 'Hello from PowerShell'"],
            &config,
        ).await.expect("spawn failed");
        
        let output = tokio::time::timeout(
            Duration::from_secs(10),
            read_all_output(master, Duration::from_secs(5)),
        ).await.unwrap_or_default();
        
        let output_str = String::from_utf8_lossy(&output);
        assert!(
            output_str.contains("Hello from PowerShell"),
            "Expected PowerShell output, got: {:?}",
            output_str,
        );
        
        child.wait().await.expect("wait failed");
    }
}
```

- [ ] **Step 2: 验证编译**

Run: `cargo check -p adl-pty --tests`
Expected: 编译通过

- [ ] **Step 3: Commit**

```bash
git add crates/pty/tests/windows_compat.rs
git commit -m "test(pty): rewrite tests for rust-pty"
```

---

### Task 9: 验证集成

**Files:**
- None (验证步骤)

**Interfaces:**
- Consumes: All previous tasks
- Produces: 验证通过的集成

- [ ] **Step 1: 运行单元测试**

Run: `cargo test -p adl-pty`
Expected: 所有测试通过

- [ ] **Step 2: 运行集成测试**

Run: `cargo test -p adl-server -- pty_ws`
Expected: 所有测试通过

- [ ] **Step 3: 运行 Clippy**

Run: `cargo clippy -p adl-pty -p adl-server -- -D warnings`
Expected: 无警告

- [ ] **Step 4: 运行格式化**

Run: `cargo fmt -p adl-pty -p adl-server`
Expected: 格式化完成

- [ ] **Step 5: 手动测试（可选）**

设置环境变量 `ADL_PTY_TEST=1` 运行测试：
Run: `ADL_PTY_TEST=1 cargo test -p adl-pty --test windows_compat`
Expected: 所有 PTY 测试通过

- [ ] **Step 6: 最终 Commit**

```bash
git add -A
git commit -m "feat(pty): complete PTY subsystem redesign with rust-pty"
```

---

## 完成标准

1. ✅ 所有单元测试通过
2. ✅ 所有集成测试通过
3. ✅ Clippy 无警告
4. ✅ 格式化通过
5. ✅ WebSocket 协议兼容
6. ✅ 前端无需修改
