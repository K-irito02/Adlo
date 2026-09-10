# PTY 子系统重设计

## 概述

将 PTY 子系统从 `portable-pty` 0.8（同步）迁移到 `rust-pty` 0.6（异步 Tokio），全面重构 PTY 会话管理。

## 背景

### 问题

当前使用 `portable-pty` 0.8，在 Windows 上存在 ConPTY 问题：
- PTY 测试被标记为 `#[ignore]`，注明 "ConPTY CreatePseudoConsole returns ERROR_INVALID_HANDLE from the non-interactive test process"
- 终端创建失败，所有 Shell 类型（PowerShell、CMD、Bash）均不可用

### 决策

选择 `rust-pty` 0.6 而非升级 `portable-pty` 0.9.0，原因：
1. 原生 Tokio 异步支持
2. 依赖更少（7 vs 13）
3. 正确的 ConPTY 实现（STARTF_USESTDHANDLES + Job Objects）
4. 更现代的 Rust 习惯用法

## 架构变更

### 当前架构

```
前端 (React)
  → WebSocket
  → ad-server (Rust)
    → SessionManager (std::sync::Mutex)
      → PtySession (portable-pty, 同步)
        → std::thread::spawn 读取输出
```

### 目标架构

```
前端 (React)
  → WebSocket (协议不变)
  → ad-server (Rust)
    → AsyncSessionManager (tokio::sync::RwLock)
      → PtySession (rust-pty, 异步)
        → tokio::spawn 读取输出
```

## 模块设计

### 1. PTY Trait (`crates/pty/src/traits.rs`)

```rust
use async_trait::async_trait;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum PtyStatus {
    Running,
    Terminated,
}

#[derive(Debug, Clone, Copy)]
pub enum ExitStatus {
    Exited(u32),
    Signaled(i32),
}

#[async_trait]
pub trait PtySession: Send + Sync {
    fn id(&self) -> &str;
    fn shell(&self) -> &str;
    fn cwd(&self) -> &str;
    fn status(&self) -> PtyStatus;
    fn size(&self) -> (u16, u16);
    async fn read(&self, buf: &mut [u8]) -> Result<usize, std::io::Error>;
    async fn write(&self, data: &[u8]) -> Result<(), std::io::Error>;
    async fn resize(&self, cols: u16, rows: u16) -> Result<(), std::io::Error>;
    async fn kill(&self) -> Result<(), std::io::Error>;
    async fn wait(&self) -> Result<ExitStatus, std::io::Error>;
    fn try_wait(&self) -> Result<Option<ExitStatus>, std::io::Error>;
}

#[async_trait]
pub trait PtySystem: Send + Sync {
    type Session: PtySession;
    async fn spawn(
        &self,
        program: &str,
        args: &[String],
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> Result<Self::Session, std::io::Error>;
}
```

### 2. rust-pty 实现 (`crates/pty/src/rust_pty_impl.rs`)

```rust
use rust_pty::{PtyConfig, WindowSize};
use rust_pty::traits::{PtySystem as RustPtySystem, PtyChild, PtyMaster};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

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
            master: tokio::sync::Mutex::new(Some(master)),
            child: tokio::sync::Mutex::new(Some(child)),
        })
    }
}

pub struct RustPtySessionImpl {
    id: String,
    shell: String,
    cwd: String,
    cols: u16,
    rows: u16,
    master: tokio::sync::Mutex<Option<rust_pty::WindowsPtyMaster>>,
    child: tokio::sync::Mutex<Option<rust_pty::WindowsPtyChild>>,
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
        // 同步检查，用于非阻塞场景
        // 注意：rust-pty 的 try_wait 是同步的，可以直接调用
        // 但由于需要获取锁，这里返回 None 表示尚未退出
        // 实际退出状态会在 wait() 中获取
        Ok(None)
    }
}
```

### 3. AsyncSessionManager (`crates/pty/src/session_manager.rs`)

```rust
use crate::traits::{PtySession, PtySystem, PtyStatus};
use crate::shell_resolver::ShellResolver;
use crate::rust_pty_impl::RustPtySystemImpl;
use adl_errors::AppError;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[async_trait::async_trait]
pub trait PtyEventEmitter: Send + Sync + 'static {
    async fn emit_output(&self, session_id: &str, data: &str);
    async fn emit_terminated(&self, session_id: &str);
}

pub struct PtySessionHandle {
    pub session: Arc<dyn PtySession>,
    pub reader_task: tokio::task::JoinHandle<()>,
}

pub struct AsyncSessionManager {
    sessions: RwLock<HashMap<String, PtySessionHandle>>,
    pty_system: RustPtySystemImpl,
}

impl AsyncSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            pty_system: RustPtySystemImpl,
        }
    }
    
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
    
    pub async fn write(&self, session_id: &str, data: &str) -> Result<(), AppError> {
        let sessions = self.sessions.read().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| AppError::NotFound(format!("pty session not found: {}", session_id)))?;
        
        handle.session.write(data.as_bytes()).await
            .map_err(|e| AppError::Terminal(format!("write failed: {}", e)))
    }
    
    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), AppError> {
        let sessions = self.sessions.read().await;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| AppError::NotFound(format!("pty session not found: {}", session_id)))?;
        
        handle.session.resize(cols, rows).await
            .map_err(|e| AppError::Terminal(format!("resize failed: {}", e)))
    }
    
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

### 4. WebSocket Handler (`crates/server/src/pty_ws.rs`)

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

### 5. ServerState 变更 (`crates/server/src/state.rs`)

```rust
use adl_pty::AsyncSessionManager;

#[derive(Clone)]
pub struct ServerState {
    // ... 其他字段不变
    pub pty_sessions: Arc<AsyncSessionManager>,  // 变更：Mutex → AsyncSessionManager
    // ... 其他字段不变
}
```

## 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `crates/pty/Cargo.toml` | 修改 | 替换 `portable-pty` 为 `rust-pty` + `async-trait` |
| `crates/pty/src/traits.rs` | 新增 | 定义 `PtySession`、`PtySystem` trait |
| `crates/pty/src/rust_pty_impl.rs` | 新增 | `rust-pty` 的实现 |
| `crates/pty/src/session_manager.rs` | 重写 | `AsyncSessionManager`，使用 `tokio::sync::RwLock` |
| `crates/pty/src/pty.rs` | 删除 | 被 `traits.rs` + `rust_pty_impl.rs` 替代 |
| `crates/pty/src/lib.rs` | 修改 | 更新模块导出 |
| `crates/pty/src/error.rs` | 新增 | 错误类型定义 |
| `crates/pty/src/mock.rs` | 新增 | Mock PTY 实现（测试用） |
| `crates/pty/tests/windows_compat.rs` | 重写 | 适配新 API |
| `crates/server/src/pty_ws.rs` | 重写 | `dispatch_frame` 改为 async |
| `crates/server/src/state.rs` | 修改 | `pty_sessions` 类型变更 |
| `Cargo.toml` (workspace) | 修改 | 替换 workspace 依赖 |
| `frontend/src/shared/ipc/pty-ws.ts` | 修改 | 处理 `terminated` 事件（可选） |

## WebSocket 协议

### 不变的部分

```
Client → Server:
  {"kind":"create","shell":"powershell","cwd":"C:\\","cols":80,"rows":24}
  {"kind":"input","sessionId":"xxx","data":"ls\r"}
  {"kind":"resize","sessionId":"xxx","cols":120,"rows":40}
  {"kind":"kill","sessionId":"xxx"}

Server → Client:
  {"kind":"created","sessionId":"xxx"}
  {"kind":"output","sessionId":"xxx","data":"..."}
  {"kind":"error","message":"..."}
```

### 新增的部分

```
Server → Client:
  {"kind":"terminated","sessionId":"xxx"}  // 可选处理
```

## 测试策略

### 单元测试

1. **PtySession 测试** — 创建、读取、写入、调整尺寸、终止
2. **SessionManager 测试** — 会话管理、并发访问
3. **ShellResolver 测试** — Shell 路径解析（不变）

### 集成测试

1. **WebSocket 协议测试** — 端到端 PTY 会话创建和交互
2. **并发测试** — 多个 WebSocket 连接同时创建 PTY 会话

### Mock 测试

1. **MockPtySession** — 用于单元测试的模拟 PTY 实现

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| `rust-pty` Windows 实现不完整 | 高 | 测试验证；必要时回退到 `portable-pty` |
| 异步锁性能问题 | 中 | `RwLock` 读操作可并发；锁持有时间短 |
| WebSocket 协议变更 | 低 | 仅新增 `terminated` 事件，前端可选处理 |
| 前端适配工作量 | 低 | WebSocket 协议基本不变 |

## 回退方案

如果 `rust-pty` 在生产环境中出现问题：

1. 保留 `portable-pty` 0.9.0 + DSR 响应作为备选方案
2. 通过 feature flag 切换 PTY 实现
3. 逐步回退，而非一次性切换

## 验证标准

1. ✅ PowerShell、CMD、Bash 终端都能正常创建
2. ✅ 终端输出正常显示
3. ✅ 终端输入正常工作
4. ✅ 终端调整尺寸正常
5. ✅ 终端关闭时不会挂起
6. ✅ 所有现有测试通过
7. ✅ 新增测试覆盖核心功能
