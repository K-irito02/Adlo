use crate::pty::{PtyConfig, PtySession, PtyStatus};
use crate::shell_resolver::ShellResolver;
use adl_errors::AppError;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub trait PtyEventEmitter: Send + Sync + 'static {
    fn emit_output(&self, session_id: &str, data: &str);
}

pub struct PtySessionHandle {
    pub session: Arc<PtySession>,
}

pub struct SessionManager {
    sessions: Mutex<HashMap<String, PtySessionHandle>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn create(
        &self,
        emitter: Arc<dyn PtyEventEmitter>,
        shell: &str,
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> Result<String, AppError> {
        let resolution = ShellResolver::resolve(shell)
            .map_err(|e| AppError::Terminal(e.message()))?;

        let config = PtyConfig {
            program: resolution.program,
            args: resolution.args,
        };
        let session = PtySession::new(config, cwd, cols, rows)?;
        let session_id = session.id.clone();
        let session = Arc::new(session);

        let session_clone = Arc::clone(&session);
        let sid = session_id.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match session_clone.read_output(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        emitter.emit_output(&sid, &data);
                    }
                    Err(_) => break,
                }
            }
        });

        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| AppError::Internal("mutex poisoned".into()))?;
        sessions.insert(
            session_id.clone(),
            PtySessionHandle {
                session,
            },
        );

        tracing::info!(session_id = %session_id, shell = %shell, "pty session created");
        Ok(session_id)
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), AppError> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| AppError::Internal("mutex poisoned".into()))?;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| AppError::NotFound(format!("pty session not found: {}", session_id)))?;
        handle.session.write_input(data.as_bytes())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), AppError> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| AppError::Internal("mutex poisoned".into()))?;
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| AppError::NotFound(format!("pty session not found: {}", session_id)))?;
        handle.session.resize(cols, rows)
    }

    pub fn kill(&self, session_id: &str) -> Result<(), AppError> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| AppError::Internal("mutex poisoned".into()))?;
        let handle = sessions
            .remove(session_id)
            .ok_or_else(|| AppError::NotFound(format!("pty session not found: {}", session_id)))?;

        handle.session.kill()?;
        tracing::info!(session_id = %session_id, "pty session killed");
        Ok(())
    }

    pub fn list(&self) -> Result<Vec<PtySessionInfo>, AppError> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| AppError::Internal("mutex poisoned".into()))?;
        let infos = sessions
            .iter()
            .map(|(id, handle)| PtySessionInfo {
                session_id: id.clone(),
                shell: handle.session.shell.clone(),
                cwd: handle.session.cwd.clone(),
                cols: handle.session.cols,
                rows: handle.session.rows,
                status: handle
                    .session
                    .status
                    .lock()
                    .map(|s| *s)
                    .unwrap_or(PtyStatus::Running),
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
assert_impl_all!(PtySession: Send, Sync);
assert_impl_all!(SessionManager: Send, Sync);
assert_impl_all!(PtySessionHandle: Send, Sync);
