use adl_errors::AppError;
use adl_kernel::create_id;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::Read;
use std::io::Write;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum PtyStatus {
    Running,
    Terminated,
}

pub struct PtySession {
    pub id: String,
    pub shell: String,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    master: Mutex<Option<Box<dyn portable_pty::MasterPty + Send>>>,
    child: Mutex<Option<Box<dyn portable_pty::Child + Send>>>,
    output_reader: Mutex<Option<Box<dyn Read + Send>>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    pub status: Mutex<PtyStatus>,
}

/// Pre-resolved shell program and arguments.
/// The caller (SessionManager or ShellResolver) is responsible for path resolution.
pub struct PtyConfig {
    pub program: String,
    pub args: Vec<String>,
}

impl PtySession {
    pub fn new(
        config: PtyConfig,
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> Result<Self, AppError> {
        let pty_system = NativePtySystem::default();
        let size = PtySize { rows, cols, pixel_width: 0, pixel_height: 0 };
        let pair = pty_system
            .openpty(size)
            .map_err(|e| AppError::Terminal(format!("failed to open pty: {}", e)))?;

        let mut cmd = CommandBuilder::new(&config.program);
        if !config.args.is_empty() {
            cmd.args(&config.args);
        }
        cmd.cwd(cwd);

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Terminal(format!("failed to spawn shell: {}", e)))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Terminal(format!("failed to clone pty reader: {}", e)))?;

        let writer = pair.master.take_writer()
            .map_err(|e| AppError::Terminal(format!("failed to take pty writer: {}", e)))?;

        let shell_label = std::path::Path::new(&config.program)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "shell".to_string());

        Ok(Self {
            id: create_id("pty"),
            shell: shell_label,
            cwd: cwd.to_string(),
            master: Mutex::new(Some(pair.master)),
            child: Mutex::new(Some(child)),
            output_reader: Mutex::new(Some(reader)),
            writer: Mutex::new(Some(writer)),
            cols,
            rows,
            status: Mutex::new(PtyStatus::Running),
        })
    }

    #[deprecated(note = "use PtySession::new() + PtyConfig instead")]
    pub fn create(
        shell: &str,
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> Result<Self, AppError> {
        let pty_system = NativePtySystem::default();
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        let pair = pty_system
            .openpty(size)
            .map_err(|e| AppError::Terminal(format!("failed to open pty: {}", e)))?;

        let (program, args): (&str, Vec<&str>) = match shell {
            "bash" => {
                #[cfg(windows)]
                {
                    ("wsl", vec!["bash", "-l"])
                }
                #[cfg(not(windows))]
                {
                    ("bash", vec!["-l"])
                }
            }
            "cmd" => ("cmd", vec![]),
            _ => ("powershell", vec![]),
        };

        let mut cmd = CommandBuilder::new(program);
        if !args.is_empty() {
            cmd.args(&args);
        }
        cmd.cwd(cwd);

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Terminal(format!("failed to spawn shell: {}", e)))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Terminal(format!("failed to clone pty reader: {}", e)))?;

        let writer = pair.master.take_writer()
            .map_err(|e| AppError::Terminal(format!("failed to take pty writer: {}", e)))?;

        Ok(Self {
            id: create_id("pty"),
            shell: shell.to_string(),
            cwd: cwd.to_string(),
            master: Mutex::new(Some(pair.master)),
            child: Mutex::new(Some(child)),
            output_reader: Mutex::new(Some(reader)),
            writer: Mutex::new(Some(writer)),
            cols,
            rows,
            status: Mutex::new(PtyStatus::Running),
        })
    }

    pub fn read_output(&self, buf: &mut [u8]) -> Result<usize, AppError> {
        let mut reader = self
            .output_reader
            .lock()
            .map_err(|_| AppError::Internal("mutex poisoned".into()))?;
        match reader.as_mut() {
            Some(r) => r
                .read(buf)
                .map_err(|e| AppError::Terminal(format!("pty read error: {}", e))),
            None => Ok(0),
        }
    }

    pub fn write_input(&self, data: &[u8]) -> Result<(), AppError> {
        let mut writer = self
            .writer
            .lock()
            .map_err(|_| AppError::Internal("mutex poisoned".into()))?;
        match writer.as_mut() {
            Some(w) => w
                .write_all(data)
                .map_err(|e| AppError::Terminal(format!("pty write error: {}", e))),
            None => Err(AppError::Terminal("pty writer not available".into())),
        }
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), AppError> {
        let master = self
            .master
            .lock()
            .map_err(|_| AppError::Internal("mutex poisoned".into()))?;
        match master.as_ref() {
            Some(m) => {
                let size = PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                };
                m.resize(size)
                    .map_err(|e| AppError::Terminal(format!("pty resize error: {}", e)))?;
                Ok(())
            }
            None => Err(AppError::Terminal("pty master not available".into())),
        }
    }

    pub fn kill(&self) -> Result<(), AppError> {
        let mut status = self
            .status
            .lock()
            .map_err(|_| AppError::Internal("mutex poisoned".into()))?;
        if *status == PtyStatus::Terminated {
            return Ok(());
        }
        *status = PtyStatus::Terminated;

        let _ = self.child.lock().map(|mut c| {
            if let Some(child) = c.as_mut() {
                let _ = child.kill();
            }
            c.take()
        });
        let _ = self.master.lock().map(|mut m| m.take());
        let _ = self.writer.lock().map(|mut w| w.take());
        Ok(())
    }

    pub fn is_running(&self) -> bool {
        self.status
            .lock()
            .map(|s| *s == PtyStatus::Running)
            .unwrap_or(false)
    }

    pub fn try_wait(&self) -> Result<Option<u32>, AppError> {
        let mut child = self
            .child
            .lock()
            .map_err(|_| AppError::Internal("mutex poisoned".into()))?;
        match child.as_mut() {
            Some(c) => {
                let exit = c
                    .try_wait()
                    .map_err(|e| AppError::Terminal(format!("pty try_wait error: {}", e)))?;
                if let Some(status) = exit {
                    let code = if status.success() {
                        0
                    } else {
                        status.exit_code() as u32
                    };
                    Ok(Some(code))
                } else {
                    Ok(None)
                }
            }
            None => Ok(Some(0)),
        }
    }
}
