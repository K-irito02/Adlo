use std::collections::HashMap;
use std::sync::Arc;

use rust_pty::{PtyMaster, WindowSize};
use tokio::io::AsyncWriteExt;
use tokio::sync::RwLock;

use crate::rust_pty_impl::{PtyCommand, RustPtySystemImpl};
use crate::shell_resolver::ShellResolver;
use crate::traits::{PtySession, PtyStatus, PtySystem};
use adl_errors::AppError;

/// 同步 SessionManager（保留向后兼容）
pub struct SessionManager;

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionManager {
    pub fn new() -> Self {
        Self
    }
}

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
        Self { sessions: RwLock::new(HashMap::new()), pty_system: RustPtySystemImpl }
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
        tracing::info!(
            shell = %shell,
            cwd = %cwd,
            cols = cols,
            rows = rows,
            "AsyncSessionManager::create called"
        );

        let resolution =
            ShellResolver::resolve(shell).map_err(|e| AppError::Terminal(e.message()))?;

        tracing::info!(
            program = %resolution.program,
            args = ?resolution.args,
            "Shell resolved"
        );

        tracing::debug!("Calling pty_system.spawn");
        let mut session = self
            .pty_system
            .spawn(&resolution.program, &resolution.args, cwd, cols, rows)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "Failed to spawn PTY session");
                AppError::Terminal(format!("failed to create PTY session: {}", e))
            })?;

        let mut command_rx =
            session.take_command_rx().expect("command receiver must exist after spawn");
        let master_handle = session.master_handle();
        let session_id = session.id().to_string();
        let session = Arc::from(session);

        tracing::info!(session_id = %session_id, "PTY session spawned, starting reader task");

        // Spawn reader task as a separate tokio task. The reader task runs a
        // select loop over the PTY read and the command channel: writes/resizes
        // are queued (non-blocking) and applied here by cancelling the pending
        // read (releasing the master Mutex) before acquiring it. This prevents
        // a blocking read from holding the master Mutex for up to 30s, which
        // previously starved writes and, via the sessions RwLock, blocked
        // create()/kill() — the root cause of "PTY create timed out".
        let session_clone = Arc::clone(&session);
        let sid = session_id.clone();
        let reader_task = tokio::spawn(async move {
            tracing::debug!(session_id = %sid, "Reader task started");
            let mut buf = [0u8; 4096];
            loop {
                tokio::select! {
                    read_result = session_clone.read(&mut buf) => {
                        match read_result {
                            Ok(0) => {
                                tracing::debug!(session_id = %sid, "Reader task: EOF received");
                                break;
                            },
                            Ok(n) => {
                                tracing::trace!(session_id = %sid, bytes = n, "Reader task: read output");
                                let data = String::from_utf8_lossy(&buf[..n]).to_string();
                                emitter.emit_output(&sid, &data).await;
                            },
                            Err(e) => {
                                tracing::warn!(error = %e, session_id = %sid, "Reader task: read error");
                                break;
                            },
                        }
                    }
                    cmd = command_rx.recv() => {
                        match cmd {
                            Some(PtyCommand::Write(data)) => {
                                tracing::debug!(session_id = %sid, bytes = data.len(), "Reader task: applying write");
                                let mut master = master_handle.lock().await;
                                match master.as_mut() {
                                    Some(m) => {
                                        if let Err(e) = m.write_all(&data).await {
                                            tracing::warn!(error = %e, session_id = %sid, "Reader task: master write failed");
                                            break;
                                        }
                                    },
                                    None => break,
                                }
                            },
                            Some(PtyCommand::Resize(cols, rows)) => {
                                tracing::debug!(session_id = %sid, cols = cols, rows = rows, "Reader task: applying resize");
                                let master = master_handle.lock().await;
                                match master.as_ref() {
                                    Some(m) => {
                                        if let Err(e) = m.resize(WindowSize::new(cols, rows)) {
                                            tracing::warn!(error = %e, session_id = %sid, "Reader task: resize failed");
                                        }
                                    },
                                    None => break,
                                }
                            },
                            None => {
                                tracing::debug!(session_id = %sid, "Reader task: command channel closed");
                                break;
                            },
                        }
                    }
                }
            }
            tracing::debug!(session_id = %sid, "Reader task finished, emitting terminated");
            emitter.emit_terminated(&sid).await;
        });

        let mut sessions = self.sessions.write().await;
        sessions.insert(session_id.clone(), PtySessionHandle { session, reader_task });

        tracing::info!(session_id = %session_id, shell = %shell, "pty session created successfully");
        Ok(session_id)
    }

    /// 向会话写入数据（非阻塞：入队后立即返回，由 reader task 应用到 master）
    pub async fn write(&self, session_id: &str, data: &str) -> Result<(), AppError> {
        let session = {
            let sessions = self.sessions.read().await;
            match sessions.get(session_id) {
                Some(handle) => Arc::clone(&handle.session),
                None => {
                    return Err(AppError::NotFound(format!(
                        "pty session not found: {}",
                        session_id
                    )));
                },
            }
        };
        tracing::trace!(session_id = %session_id, bytes = data.len(), "write queued to session");
        session
            .write(data.as_bytes())
            .await
            .map_err(|e| AppError::Terminal(format!("write failed: {}", e)))
    }

    /// 调整会话尺寸（非阻塞：入队后立即返回，由 reader task 应用到 master）
    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), AppError> {
        let session = {
            let sessions = self.sessions.read().await;
            match sessions.get(session_id) {
                Some(handle) => Arc::clone(&handle.session),
                None => {
                    return Err(AppError::NotFound(format!(
                        "pty session not found: {}",
                        session_id
                    )));
                },
            }
        };
        tracing::trace!(session_id = %session_id, cols = cols, rows = rows, "resize queued to session");
        session
            .resize(cols, rows)
            .await
            .map_err(|e| AppError::Terminal(format!("resize failed: {}", e)))
    }

    /// 终止会话
    pub async fn kill(&self, session_id: &str) -> Result<(), AppError> {
        let handle = {
            let mut sessions = self.sessions.write().await;
            sessions.remove(session_id)
        }
        .ok_or_else(|| AppError::NotFound(format!("pty session not found: {}", session_id)))?;

        handle.reader_task.abort();
        handle
            .session
            .kill()
            .await
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

use static_assertions::assert_impl_all;
assert_impl_all!(AsyncSessionManager: Send, Sync);
assert_impl_all!(PtySessionHandle: Send, Sync);
