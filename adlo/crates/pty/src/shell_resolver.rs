use std::path::{Path, PathBuf};

/// Shell type identifiers used across the system.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellKind {
    PowerShell,
    Cmd,
    Bash,
}

impl ShellKind {
    pub fn from_name(s: &str) -> Option<Self> {
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

    /// 由可执行文件路径推断 shell 类型（供 PTY 组装时选择壳层集成策略）。
    /// 无法识别（如 `wsl.exe`）时返回 `None`，表示不做任何注入。
    pub fn from_program(program: &str) -> Option<Self> {
        let name = Path::new(program).file_name().and_then(|s| s.to_str())?.to_lowercase();
        if name.contains("powershell") || name == "pwsh.exe" {
            Some(Self::PowerShell)
        } else if name == "cmd.exe" {
            Some(Self::Cmd)
        } else if name == "bash.exe" {
            Some(Self::Bash)
        } else {
            None
        }
    }

    pub fn recovery_guide(&self) -> String {
        let app_data_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("adlo")
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
    let pf86 =
        std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".into());

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
            std::env::var("COMSPEC").map(PathBuf::from).unwrap_or_else(|_| sys32.join("cmd.exe")),
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
                .join("adlo")
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
        Self { input: input.to_string(), recovery }
    }

    pub fn message(&self) -> String {
        format!(
            "Unknown shell: '{}'. Expected one of: powershell, cmd, bash\n\nRecovery:\n{}",
            self.input, self.recovery
        )
    }
}

/// Helper to check if a shell is available on the system.
pub fn is_shell_available(shell: ShellKind) -> bool {
    system_candidates(shell).iter().any(|p| p.exists())
}

/// PATH lookup (`where`) for a shell executable; first hit only.
fn where_first(prog: &str) -> Option<PathBuf> {
    let out = std::process::Command::new("where").arg(prog).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let line = String::from_utf8_lossy(&out.stdout).lines().next()?.trim().to_string();
    if line.is_empty() { None } else { Some(PathBuf::from(line)) }
}

/// PATH-resolved bash, except the WSL launcher in `System32` (not a real bash;
/// the fixed candidates handle WSL through `wsl.exe`).
fn bash_path_candidate(path: Option<PathBuf>) -> Option<PathBuf> {
    let path = path?;
    let name = path.file_name()?.to_str()?;
    if !name.eq_ignore_ascii_case("bash.exe") {
        return None;
    }
    let parent = path.parent()?.file_name()?.to_str()?;
    if parent.eq_ignore_ascii_case("System32") {
        return None;
    }
    Some(path)
}

pub struct ShellResolver;

impl ShellResolver {
    pub fn resolve(shell: &str) -> Result<ShellResolution, ShellNotFound> {
        let kind = ShellKind::from_name(shell).ok_or_else(|| ShellNotFound::unknown(shell))?;

        // Level 0 (bash only): PATH first. The server prepends the hosted
        // PortableGit `bin/` when the source preference is host/auto, so the
        // hosted bash wins over a system Git/WSL install.
        if kind == ShellKind::Bash {
            if let Some(candidate) = bash_path_candidate(where_first("bash")) {
                let args = shell_args_for(&candidate);
                tracing::debug!(
                    program = %candidate.to_string_lossy(),
                    "Shell resolved to PATH bash (hosted or custom)"
                );
                return Ok(ShellResolution {
                    kind,
                    program: candidate.to_string_lossy().to_string(),
                    args,
                });
            }
        }

        // Level 1: Well-known system paths
        for candidate in system_candidates(kind) {
            if candidate.exists() {
                let args = shell_args_for(&candidate);
                tracing::debug!(
                    shell = %shell,
                    program = %candidate.to_string_lossy(),
                    "Shell resolved to system path"
                );
                return Ok(ShellResolution {
                    kind,
                    program: candidate.to_string_lossy().to_string(),
                    args,
                });
            }
        }

        // Level 2: Rely on PATH (no pre-check, the OS will resolve or fail)
        let (prog_name, args) = match kind {
            ShellKind::PowerShell => ("powershell.exe", powershell_args()),
            ShellKind::Cmd => ("cmd.exe", vec!["/q".to_string()]),
            ShellKind::Bash => {
                let sys_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
                let sys32 = Path::new(&sys_root).join("System32");
                let wsl_path = sys32.join("wsl.exe");
                if wsl_path.exists() {
                    ("wsl.exe", vec![])
                } else {
                    ("bash.exe", vec!["-l".to_string()])
                }
            },
        };
        tracing::debug!(
            shell = %shell,
            program = %prog_name,
            "Shell falling back to PATH resolution"
        );
        Ok(ShellResolution { kind, program: prog_name.to_string(), args })
    }
}

/// PowerShell 5.1 有两处编码默认值不是 UTF-8，导致中文显示异常：
///
/// 1. **输出通道**：PowerShell 在 stdout 为管道（ConPTY）时按 `[Console]::OutputEncoding`
///    编码自身输出，默认跟随控制台 OEM 代码页（中文系统为 GBK/CP936）；而 PTY 读取端
///    统一按 UTF-8 解码，GBK 中文会被替换为 U+FFFD（乱码）。
/// 2. **文件读取**：`Get-Content`（`cat` / `gc` / `type` 都是它的别名）在未指定 `-Encoding`
///    时按系统 ANSI 代码页解码文件，读取 UTF-8 文件同样乱码。cmd 的 `type` 与 bash 的 `cat`
///    是直接输出原始字节不做解码，所以只有 PowerShell 中招。
///
/// 该启动脚本在会话建立时统一编码策略：
/// - `Console.OutputEncoding`/`Console.InputEncoding` 会同步把控制台代码页切到 65001
/// - `$OutputEncoding` 控制 PowerShell 向外部程序管道传递数据时的编码
/// - `$PSDefaultParameterValues['Get-Content:Encoding']` 让文件读取默认按 UTF-8 解码
///   （仅读取路径；写入路径保持 PowerShell 原语义，避免 `utf8` 写 BOM 的副作用）
///
/// 与 VS Code / Windows Terminal 的官方做法一致；仅作用于 PowerShell，
/// 不影响 cmd / bash（它们本就输出 UTF-8）。
const POWERSHELL_UTF8_SETUP: &str = "$OutputEncoding = [System.Console]::InputEncoding = [System.Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; $PSDefaultParameterValues['Get-Content:Encoding'] = 'utf8'";

/// PowerShell 启动参数：保留 `-NoLogo -NoProfile`，追加 UTF-8 编码设置 + 当前目录上报，
/// 并保持交互（`-NoExit` 使设置执行后仍进入交互式会话）。
fn powershell_args() -> Vec<String> {
    vec![
        "-NoLogo".to_string(),
        "-NoProfile".to_string(),
        "-NoExit".to_string(),
        "-Command".to_string(),
        format!("{POWERSHELL_UTF8_SETUP}; {POWERSHELL_CWD_REPORT}"),
    ]
}

/// 「当前目录上报」：让 shell 在每次打印提示符前，用 **OSC 9;9** 这个不可见转义序列
/// 把当前目录报给终端，前端据此记住每个标签的目录，重启后把新会话的起始目录设回去。
///
/// 为什么必须由 shell 上报：重启后我们起的是一个**新进程**，进程内没有旧进程的目录状态，
/// `cd` 的结果无法被继承（Windows 上也无法可靠地读取别的进程的 cwd）。
/// 这也是 VS Code / Windows Terminal 的官方做法（Windows Terminal 文档
/// "Opening a tab/pane in the same directory"）。
///
/// 安全性：
/// - xterm 只注册了 OSC `0/1/2/4/8/10-12/104/110-112`，`OSC 9` 会落到 fallback 分支
///   （仅写调试日志），因此**不会把序列显示成乱码**
/// - 整段只用单引号字符串，避免 Windows 命令行传递时的双引号转义问题
/// - `$esc` 显式转成 `[string]`：PowerShell 的 `+` 由**左操作数类型**决定语义
///   （`[char]27 + 'x'` 会按数值/字符转换处理），先转成字符串才能保证是拼接
/// - `-NoProfile` 下不存在用户自定义 `prompt`，此处重定义不会覆盖用户配置；
///   提示符文本保持 PowerShell 默认样式（`PS <路径>> `）
const POWERSHELL_CWD_REPORT: &str = "function global:prompt { $loc = $ExecutionContext.SessionState.Path.CurrentLocation; $esc = [string][char]27; $out = ''; if ($loc.Provider.Name -eq 'FileSystem') { $out = $esc + ']9;9;' + $loc.ProviderPath + $esc + '\\' }; $out + 'PS ' + $loc + ('>' * ($nestedPromptLevel + 1)) + ' ' }";

/// bash 的 `PROMPT_COMMAND`：每次打印提示符前上报 OSC 9;9，内容为 MSYS 形式的 `$PWD`
/// （如 `/e/AI-DIGITAL-LIFE/...`）。MSYS 路径 → Windows 路径的转换在前端完成，
/// 这样就不必为每个提示符额外启动一次 `cygpath` 进程。
const BASH_PROMPT_COMMAND: &str = r#"printf '\033]9;9;%s\033\\' "$PWD""#;

/// cmd 的 `PROMPT` 值：先输出 OSC 9;9 上报当前目录，再衔接原有提示符。
///
/// cmd 的 PROMPT 转义：`$E`=ESC(0x1B)，`$P`=当前盘符+路径，`$G`=`>`；
/// 反斜杠是字面字符，与前面的 `$E` 组成 ST 终止符（`ESC \`）。
/// 尊重用户已在环境中设置的 `PROMPT`，未设置时回退到 cmd 默认的 `$P$G`。
fn cmd_prompt_value() -> String {
    let base = std::env::var("PROMPT").ok().filter(|v| !v.is_empty());
    format!("$E]9;9;$P$E\\{}", base.unwrap_or_else(|| "$P$G".to_string()))
}

/// 壳层集成所需注入的环境变量（目前仅用于 OSC 9;9 当前目录上报）。
///
/// - cmd / bash 走环境变量；PowerShell 因需要函数定义，走启动参数（见 `powershell_args`）
/// - 无法识别的 shell（如 `wsl.exe`）返回空，不做任何注入
/// - bash 若在父进程环境中已存在非空 `PROMPT_COMMAND`（例如用户自行配置），
///   则不再注入，避免覆盖用户设置（此时目录上报降级为不可用）
pub fn shell_integration_env(program: &str) -> Vec<(&'static str, String)> {
    match ShellKind::from_program(program) {
        Some(ShellKind::Cmd) => vec![("PROMPT", cmd_prompt_value())],
        Some(ShellKind::Bash) => {
            let already_set =
                std::env::var("PROMPT_COMMAND").map(|v| !v.trim().is_empty()).unwrap_or(false);
            if already_set {
                Vec::new()
            } else {
                vec![("PROMPT_COMMAND", BASH_PROMPT_COMMAND.to_string())]
            }
        },
        _ => Vec::new(),
    }
}

fn shell_args_for(path: &Path) -> Vec<String> {
    let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    if name.contains("powershell") || name == "pwsh.exe" {
        powershell_args()
    } else if name == "cmd.exe" {
        vec!["/q".to_string()]
    } else if name == "bash.exe" {
        vec!["-l".to_string()]
    } else {
        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CMD: &str = "C:\\WINDOWS\\System32\\cmd.exe";
    const POWERSHELL: &str = "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
    const BASH: &str = "C:\\Program Files\\Git\\bin\\bash.exe";
    const WSL: &str = "C:\\Windows\\System32\\wsl.exe";

    #[test]
    fn path_bash_prefers_hosted_but_skips_wsl_launcher() {
        let hosted = PathBuf::from(
            "C:/Users/u/AppData/Roaming/com.adlo.app/env-hosted/git/installed/2.56.0/bin/bash.exe",
        );
        assert_eq!(bash_path_candidate(Some(hosted.clone())), Some(hosted));
        assert_eq!(bash_path_candidate(Some(PathBuf::from("C:/Windows/System32/bash.exe"))), None);
        assert_eq!(bash_path_candidate(None), None);
    }

    #[test]
    fn from_program_recognizes_known_shells() {
        assert_eq!(ShellKind::from_program(CMD), Some(ShellKind::Cmd));
        assert_eq!(ShellKind::from_program(POWERSHELL), Some(ShellKind::PowerShell));
        assert_eq!(ShellKind::from_program(BASH), Some(ShellKind::Bash));
        // wsl.exe 不做注入（其路径语义与 MSYS 不同）
        assert_eq!(ShellKind::from_program(WSL), None);
    }

    #[test]
    fn powershell_args_report_cwd_via_osc99_without_double_quotes() {
        let joined = powershell_args().join(" ");
        assert!(joined.contains("]9;9;"), "PowerShell 启动脚本应含 OSC 9;9 上报：{joined}");
        assert!(joined.contains("function global:prompt"), "应重定义 prompt：{joined}");
        assert!(joined.contains("[System.Console]::OutputEncoding"), "UTF-8 设置不能丢：{joined}");
        // `+` 的语义由左操作数决定：必须先转成 [string]，否则 [char]27 + 'x' 会被当作字符转换
        assert!(joined.contains("[string][char]27"), "ESC 需显式转成字符串：{joined}");
        // 双引号会带来 Windows 命令行转义风险：整段脚本必须只用单引号字符串
        assert!(!joined.contains('"'), "PowerShell 启动脚本不应包含双引号：{joined}");
    }

    #[test]
    fn cmd_prompt_reports_cwd_and_keeps_suffix() {
        const OSC_PREFIX: &str = "$E]9;9;$P$E\\";
        let value = cmd_prompt_value();
        assert!(value.starts_with(OSC_PREFIX), "cmd PROMPT 应以 OSC 9;9 前缀开头：{value}");
        assert!(value.len() > OSC_PREFIX.len(), "应保留原有提示符后缀：{value}");
    }

    #[test]
    fn bash_prompt_command_emits_st_terminated_osc99() {
        assert!(BASH_PROMPT_COMMAND.contains("]9;9;"), "应含 OSC 9;9：{BASH_PROMPT_COMMAND}");
        assert!(
            BASH_PROMPT_COMMAND.contains("\\033\\\\"),
            "应以 ESC + 反斜杠（ST）终止，否则会吞掉提示符：{BASH_PROMPT_COMMAND}"
        );
        assert!(BASH_PROMPT_COMMAND.contains("$PWD"), "应上报 $PWD：{BASH_PROMPT_COMMAND}");
    }

    #[test]
    fn integration_env_is_shell_specific() {
        let cmd_env = shell_integration_env(CMD);
        assert_eq!(cmd_env.len(), 1);
        assert_eq!(cmd_env[0].0, "PROMPT");
        // PowerShell 走启动参数，不走环境变量
        assert!(shell_integration_env(POWERSHELL).is_empty());
        assert!(shell_integration_env(WSL).is_empty());
    }
}
