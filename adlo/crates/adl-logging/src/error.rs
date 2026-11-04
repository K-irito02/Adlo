use thiserror::Error;

#[derive(Debug, Error)]
pub enum LogError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Mode switch failed: {0}")]
    ModeSwitch(String),

    #[error("Session error: {0}")]
    Session(String),
}

pub type LogResult<T> = Result<T, LogError>;
