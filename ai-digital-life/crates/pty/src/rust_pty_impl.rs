use crate::traits::{ExitStatus, PtySession, PtyStatus, PtySystem};
use async_trait::async_trait;
use rust_pty::{NativePtySystem, PtyConfig, PtyMaster, PtySystem as RustPtySystem, WindowSize, WindowsPtyChild, WindowsPtyMaster};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
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
            window_size: (cols, rows),
            working_directory: Some(cwd.into()),
            ..Default::default()
        };

        let (master, child) = NativePtySystem::spawn(
            program,
            args.iter().map(|s| s.as_str()),
            &config,
        )
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

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
    master: Arc<Mutex<Option<WindowsPtyMaster>>>,
    child: Arc<Mutex<Option<WindowsPtyChild>>>,
}

#[async_trait]
impl PtySession for RustPtySessionImpl {
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
        PtyStatus::Running
    }

    fn size(&self) -> (u16, u16) {
        (self.cols, self.rows)
    }

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
                m.resize(WindowSize::new(cols, rows))
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
                Ok(())
            }
            None => Err(std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "PTY session closed",
            )),
        }
    }

    async fn kill(&self) -> Result<(), std::io::Error> {
        let mut child = self.child.lock().await;
        match child.as_mut() {
            Some(c) => c
                .kill()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)),
            None => Ok(()),
        }
    }

    async fn wait(&self) -> Result<ExitStatus, std::io::Error> {
        let mut child = self.child.lock().await;
        match child.as_mut() {
            Some(c) => {
                let status = c
                    .wait()
                    .await
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
                match status {
                    rust_pty::ExitStatus::Exited(code) => Ok(ExitStatus::Exited(code as u32)),
                    rust_pty::ExitStatus::Terminated(sig) => Ok(ExitStatus::Signaled(sig as i32)),
                }
            }
            None => Ok(ExitStatus::Exited(0)),
        }
    }

    fn try_wait(&self) -> Result<Option<ExitStatus>, std::io::Error> {
        Ok(None)
    }
}
