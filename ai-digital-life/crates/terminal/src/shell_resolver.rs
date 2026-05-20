use std::path::{Path, PathBuf};

/// Shell type identifiers used across the system.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellKind {
    PowerShell,
    Cmd,
    Bash,
}

impl ShellKind {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "powershell" => Some(Self::PowerShell),
            "cmd" => Some(Self::Cmd),
            "bash" => Some(Self::Bash),
            _ => None,
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::PowerShell => "PowerShell",
            Self::Cmd => "CMD",
            Self::Bash => "Bash",
        }
    }

    pub fn recovery_guide(&self) -> String {
        let app_data_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("ai-digital-life")
            .join("bin")
            .join("terminals")
            .join(self.display_name());
        match self {
            Self::PowerShell => format!(
                "PowerShell 是 Windows 内置组件，未找到 PowerShell 可执行文件。\n\
                 恢复方法：\n\
                 1. 确保 Windows PowerShell 功能已开启\n\
                    -> 设置 > 应用 > 可选功能 > 添加功能 > Windows PowerShell\n\
                 2. 或自行放置 powershell.exe 到以下目录：\n\
                    {}\n\
                 3. 或在命令行中运行 'powershell.exe' 验证是否可用",
                app_data_dir.display()
            ),
            Self::Cmd => format!(
                "CMD 是 Windows 内置组件，未找到 cmd.exe。\n\
                 恢复方法：\n\
                 1. 检查 %COMSPEC% 环境变量是否正确\n\
                 2. 或自行放置 cmd.exe 到以下目录：\n\
                    {}\n\
                 3. 或在命令行中运行 'cmd.exe' 验证是否可用",
                app_data_dir.display()
            ),
            Self::Bash => format!(
                "Bash 需要安装 Git for Windows 或 WSL。\n\
                 恢复方法：\n\
                 1. 安装 Git for Windows: https://git-scm.com/download/win\n\
                 2. 或启用 WSL: 以管理员身份运行 'wsl --install'\n\
                 3. 或自行放置 bash.exe 到以下目录：\n\
                    {}\n\
                    （注意：WSL bash.exe 位于 C:\\Windows\\System32\\wsl.exe）",
                app_data_dir.display()
            ),
        }
    }
}

fn system_candidates(shell: ShellKind) -> Vec<PathBuf> {
    let sys_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    let sys32 = Path::new(&sys_root).join("System32");
    let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
    let pf86 = std::env::var("ProgramFiles(x86)")
        .unwrap_or_else(|_| "C:\\Program Files (x86)".into());

    match shell {
        ShellKind::PowerShell => vec![
            sys32.join("WindowsPowerShell").join("v1.0").join("powershell.exe"),
            Path::new(&sys_root)
                .join("SysWOW64")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe"),
        ],
        ShellKind::Cmd => vec![
            sys32.join("cmd.exe"),
            std::env::var("COMSPEC")
                .map(PathBuf::from)
                .unwrap_or_else(|_| sys32.join("cmd.exe")),
        ],
        ShellKind::Bash => vec![
            Path::new(&pf).join("Git").join("bin").join("bash.exe"),
            Path::new(&pf86).join("Git").join("bin").join("bash.exe"),
            sys32.join("wsl.exe"),
            Path::new(&sys_root).join("SysNative").join("wsl.exe"),
        ],
    }
}

/// Result of a shell resolution.
#[derive(Debug, Clone)]
pub struct ShellResolution {
    pub kind: ShellKind,
    pub program: String,
    pub args: Vec<String>,
}

/// Shell resolution error with user-facing message and comprehensive recovery guide.
#[derive(Debug, Clone)]
pub struct ShellNotFound {
    pub input: String,
    pub recovery: String,
}

impl ShellNotFound {
    /// Creates a `ShellNotFound` for an unrecognized shell name.
    /// Generates a comprehensive recovery guide for all three shell types,
    /// including the `app_data_dir` paths so users know where to place custom binaries.
    pub fn unknown(input: &str) -> Self {
        let ad = || -> String {
            dirs::data_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("ai-digital-life")
                .join("bin")
                .join("terminals")
                .to_string_lossy()
                .to_string()
        };
        let ps_dir = Path::new(&ad()).join("PowerShell");
        let cmd_dir = Path::new(&ad()).join("CMD");
        let bash_dir = Path::new(&ad()).join("Bash");
        let recovery = format!(
            "支持以下终端类型：\n\
             \n\
             1. PowerShell（默认）\n\
               系统内置，确保 Windows PowerShell 功能已开启\n\
               或自行放置 powershell.exe 到以下目录：\n\
                  {}\n\
             \n\
             2. CMD\n\
               系统内置，检查 %COMSPEC% 环境变量\n\
               或自行放置 cmd.exe 到以下目录：\n\
                  {}\n\
             \n\
             3. Bash\n\
               需安装 Git for Windows 或 WSL\n\
               或自行放置 bash.exe 到以下目录：\n\
                  {}",
            ps_dir.display(),
            cmd_dir.display(),
            bash_dir.display(),
        );
        Self {
            input: input.to_string(),
            recovery,
        }
    }

    pub fn message(&self) -> String {
        format!(
            "Unknown shell: '{}'. Expected one of: powershell, cmd, bash\n\nRecovery:\n{}",
            self.input, self.recovery
        )
    }
}

pub struct ShellResolver;

impl ShellResolver {
    pub fn resolve(shell: &str) -> Result<ShellResolution, ShellNotFound> {
        let kind = ShellKind::from_str(shell)
            .ok_or_else(|| ShellNotFound::unknown(shell))?;

        // Level 1: Well-known system paths
        for candidate in system_candidates(kind) {
            if candidate.exists() {
                let args = shell_args_for(&candidate);
                return Ok(ShellResolution {
                    kind,
                    program: candidate.to_string_lossy().to_string(),
                    args,
                });
            }
        }

        // Level 2: Rely on PATH (no pre-check, the OS will resolve or fail)
        let (prog_name, args) = match kind {
            ShellKind::PowerShell => {
                ("powershell.exe", vec!["-NoLogo".to_string(), "-NoProfile".to_string()])
            }
            ShellKind::Cmd => ("cmd.exe", vec!["/q".to_string()]),
            ShellKind::Bash => ("bash.exe", vec!["-l".to_string()]),
        };
        Ok(ShellResolution {
            kind,
            program: prog_name.to_string(),
            args,
        })
    }
}

fn shell_args_for(path: &Path) -> Vec<String> {
    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    match name {
        "powershell" => vec!["-NoLogo".to_string(), "-NoProfile".to_string()],
        "pwsh" => vec!["-NoLogo".to_string(), "-NoProfile".to_string()],
        "cmd" => vec!["/q".to_string()],
        "bash" => vec!["-l".to_string()],
        "wsl" => vec![],
        _ => vec![],
    }
}
