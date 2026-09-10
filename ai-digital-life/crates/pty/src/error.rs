use std::fmt;

/// PTY 操作错误类型
#[derive(Debug)]
pub enum PtyError {
    /// IO 错误
    Io(std::io::Error),
    /// Shell 未找到
    ShellNotFound(String),
    /// 会话未找到
    SessionNotFound(String),
    /// 会话已关闭
    SessionClosed,
    /// 其他错误
    Other(String),
}

impl fmt::Display for PtyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PtyError::Io(e) => write!(f, "IO error: {}", e),
            PtyError::ShellNotFound(s) => write!(f, "Shell not found: {}", s),
            PtyError::SessionNotFound(s) => write!(f, "Session not found: {}", s),
            PtyError::SessionClosed => write!(f, "Session closed"),
            PtyError::Other(s) => write!(f, "{}", s),
        }
    }
}

impl std::error::Error for PtyError {}

impl From<std::io::Error> for PtyError {
    fn from(e: std::io::Error) -> Self {
        PtyError::Io(e)
    }
}

/// PTY 操作结果类型
pub type Result<T> = std::result::Result<T, PtyError>;
