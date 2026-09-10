use crate::traits::{PtySession, PtyStatus};
use async_trait::async_trait;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{Mutex, Notify};

/// Mock PTY 会话，用于测试
pub struct MockPtySession {
    id: String,
    shell: String,
    cwd: String,
    cols: u16,
    rows: u16,
    output_buffer: Arc<Mutex<Vec<u8>>>,
    notify: Arc<Notify>,
    closed: Arc<AtomicBool>,
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
            notify: Arc::new(Notify::new()),
            closed: Arc::new(AtomicBool::new(false)),
            status: PtyStatus::Running,
        }
    }

    /// 向输出缓冲区写入数据（测试用）
    pub async fn push_output(&self, data: &[u8]) {
        let mut buf = self.output_buffer.lock().await;
        buf.extend_from_slice(data);
        drop(buf);
        self.notify.notify_waiters();
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
        loop {
            let mut output = self.output_buffer.lock().await;
            if !output.is_empty() {
                let n = std::cmp::min(buf.len(), output.len());
                buf[..n].copy_from_slice(&output[..n]);
                output.drain(..n);
                return Ok(n);
            }
            // 空缓冲：等待 push_output 或 kill（与真实 shell 空闲时阻塞一致），
            // 避免把空缓冲误判为 EOF 导致会话创建即终止。
            if self.closed.load(Ordering::SeqCst) {
                return Ok(0);
            }
            drop(output);
            self.notify.notified().await;
        }
    }

    async fn write(&self, _data: &[u8]) -> std::result::Result<(), std::io::Error> {
        Ok(())
    }

    async fn resize(&self, _cols: u16, _rows: u16) -> std::result::Result<(), std::io::Error> {
        Ok(())
    }

    async fn kill(&self) -> std::result::Result<(), std::io::Error> {
        self.closed.store(true, Ordering::SeqCst);
        self.notify.notify_waiters();
        Ok(())
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
