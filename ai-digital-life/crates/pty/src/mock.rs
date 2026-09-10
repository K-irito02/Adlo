use crate::traits::{ExitStatus, PtySession, PtyStatus};
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
    fn id(&self) -> &str {
        &self.id
    }

    fn shell(&self) -> &str {
        &self.shell
    }

    fn cwd(&self) -> &str {
        &self.cwd
    }

    fn status(&self) -> PtyStatus {
        self.status
    }

    fn size(&self) -> (u16, u16) {
        (self.cols, self.rows)
    }

    async fn read(&self, buf: &mut [u8]) -> std::result::Result<usize, std::io::Error> {
        let mut output = self.output_buffer.lock().await;
        if output.is_empty() {
            return Ok(0);
        }
        let n = std::cmp::min(buf.len(), output.len());
        buf[..n].copy_from_slice(&output[..n]);
        output.drain(..n);
        Ok(n)
    }

    async fn write(&self, _data: &[u8]) -> std::result::Result<(), std::io::Error> {
        Ok(())
    }

    async fn resize(&self, _cols: u16, _rows: u16) -> std::result::Result<(), std::io::Error> {
        Ok(())
    }

    async fn kill(&self) -> std::result::Result<(), std::io::Error> {
        Ok(())
    }

    async fn wait(&self) -> std::result::Result<ExitStatus, std::io::Error> {
        Ok(ExitStatus::Exited(0))
    }

    fn try_wait(&self) -> std::result::Result<Option<ExitStatus>, std::io::Error> {
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
        _args: &[String],
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> std::result::Result<Self::Session, std::io::Error> {
        Ok(MockPtySession::new(&adl_types::create_id("mock-pty"), program, cwd, cols, rows))
    }
}
