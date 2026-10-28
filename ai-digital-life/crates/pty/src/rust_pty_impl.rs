use std::collections::HashMap;
use std::ffi::OsString;
use std::sync::Arc;

use async_trait::async_trait;
use rust_pty::{
    NativePtySystem, PtyConfig, PtySystem as RustPtySystem, WindowsPtyChild, WindowsPtyMaster,
};
use tokio::io::AsyncReadExt;
use tokio::sync::Mutex;

use crate::traits::{PtySession, PtyStatus, PtySystem};

/// 注入给所有终端会话的环境变量。
///
/// 1. `LANG`：MSYS/Git for Windows 工具（如 `ls`）会依据 locale 的字符集决定如何输出非
///    ASCII 文件名：未设置 `LANG`/`LC_*` 时按 C locale 处理，把中文文件名转义成
///    `$'\344\270\264...'`（八进制字节转义）形式。注入 UTF-8 locale 后按 UTF-8 原样输出。
/// 2. 壳层集成（`shell_integration_env`）：cmd / bash 通过环境变量注入 OSC 9;9
///    当前目录上报（PowerShell 走启动参数），供重启后恢复「上次所在目录」。
///
/// 仅使用 `env_add`（与继承环境合并），不覆盖用户已有环境。
fn terminal_env(program: &str) -> HashMap<OsString, OsString> {
    let mut env = HashMap::new();
    env.insert(OsString::from("LANG"), OsString::from("en_US.UTF-8"));
    // 宿主托管 CLI 的 bin 目录前置到 PATH（只影响本会话，见 ADR-0005）。
    // 沿用继承环境的键名大小写，避免 Windows 下 Path/PATH 重复。
    let inherited = std::env::vars_os().find(|(k, _)| k.eq_ignore_ascii_case("PATH"));
    let (path_key, path_value) = match inherited {
        Some((k, v)) => (k, Some(v)),
        None => (OsString::from("PATH"), None),
    };
    if let Some(path) = crate::managed_bins::terminal_path(path_value.as_ref()) {
        env.insert(path_key, path);
    }
    let injected = crate::shell_resolver::shell_integration_env(program);
    if !injected.is_empty() {
        tracing::debug!(
            program = %program,
            keys = ?injected.iter().map(|(k, _)| *k).collect::<Vec<_>>(),
            "rust-pty: injecting shell integration env (OSC 9;9 cwd reporting)"
        );
    }
    for (key, value) in injected {
        env.insert(OsString::from(key), OsString::from(value));
    }
    env
}

/// 发往 reader task 的 PTY 命令。
///
/// 写入输入 / 调整尺寸不再直接持有 master Mutex（reader task 在阻塞读期间
/// 独占该锁），而是通过无界通道排队，由 reader task 在 select 循环中消费并
/// 应用到 master，从而避免 WS 处理循环被 PTY 锁阻塞。
pub enum PtyCommand {
    /// 写入终端输入
    Write(Vec<u8>),
    /// 调整终端尺寸
    Resize(u16, u16),
}

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
        tracing::debug!(
            program = %program,
            args = ?args,
            cwd = %cwd,
            cols = cols,
            rows = rows,
            "rust-pty: spawning PTY session"
        );

        let config = PtyConfig {
            window_size: (cols, rows),
            working_directory: Some(cwd.into()),
            env_add: terminal_env(program),
            ..Default::default()
        };

        let result =
            NativePtySystem::spawn(program, args.iter().map(|s| s.as_str()), &config).await;

        match result {
            Ok((master, child)) => {
                let (command_tx, command_rx) = tokio::sync::mpsc::unbounded_channel::<PtyCommand>();
                Ok(RustPtySessionImpl {
                    id: adl_types::create_id("pty"),
                    shell: program.to_string(),
                    cwd: cwd.to_string(),
                    cols,
                    rows,
                    master: Arc::new(Mutex::new(Some(master))),
                    child: Arc::new(Mutex::new(Some(child))),
                    command_tx,
                    command_rx: Some(command_rx),
                })
            },
            Err(e) => {
                tracing::error!(error = %e, "rust-pty: failed to create PTY session");
                Err(std::io::Error::other(e))
            },
        }
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
    command_tx: tokio::sync::mpsc::UnboundedSender<PtyCommand>,
    command_rx: Option<tokio::sync::mpsc::UnboundedReceiver<PtyCommand>>,
}

impl RustPtySessionImpl {
    /// 取出命令接收端（由 reader task 独占消费，只能调用一次）
    pub fn take_command_rx(&mut self) -> Option<tokio::sync::mpsc::UnboundedReceiver<PtyCommand>> {
        self.command_rx.take()
    }

    /// 获取 master 句柄（reader task 直接写入/调整尺寸用）
    pub fn master_handle(&self) -> Arc<Mutex<Option<WindowsPtyMaster>>> {
        Arc::clone(&self.master)
    }
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
        self.command_tx
            .send(PtyCommand::Write(data.to_vec()))
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::BrokenPipe, "PTY session closed"))
    }

    async fn resize(&self, cols: u16, rows: u16) -> Result<(), std::io::Error> {
        self.command_tx
            .send(PtyCommand::Resize(cols, rows))
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::BrokenPipe, "PTY session closed"))
    }

    async fn kill(&self) -> Result<(), std::io::Error> {
        let mut child = self.child.lock().await;
        match child.as_mut() {
            Some(c) => c.kill().map_err(std::io::Error::other),
            None => Ok(()),
        }
    }
}
