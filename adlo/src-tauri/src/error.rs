use adl_errors::AppError;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl From<AppError> for CommandError {
    fn from(e: AppError) -> Self {
        Self { code: e.error_code().to_string(), message: e.to_string() }
    }
}

impl From<anyhow::Error> for CommandError {
    fn from(e: anyhow::Error) -> Self {
        let msg = e.to_string();
        let code = if let Some(app_err) = e.downcast_ref::<AppError>() {
            app_err.error_code().to_string()
        } else if e.downcast_ref::<std::io::Error>().is_some() {
            "IO_ERROR".to_string()
        } else if let Some(serde_err) = e.downcast_ref::<serde_json::Error>() {
            match serde_err.classify() {
                serde_json::error::Category::Io => "IO_ERROR".to_string(),
                serde_json::error::Category::Syntax
                | serde_json::error::Category::Data
                | serde_json::error::Category::Eof => "INVALID_INPUT".to_string(),
            }
        } else {
            "INTERNAL_ERROR".to_string()
        };
        Self { code, message: msg }
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_error_code_is_accessible() {
        let err = AppError::NotFound("x".into());
        assert_eq!(err.error_code(), "NOT_FOUND");
        let err = AppError::Internal("x".into());
        assert_eq!(err.error_code(), "INTERNAL_ERROR");
        let err = AppError::AuthError("x".into());
        assert_eq!(err.error_code(), "AUTH_ERROR");
    }

    #[test]
    fn command_error_from_app_error_contains_message() {
        let err = CommandError::from(AppError::NotFound("workspace".into()));
        assert_eq!(err.code, "NOT_FOUND");
        assert!(err.message.contains("workspace"));
    }

    #[test]
    fn command_error_display_format() {
        let err = CommandError::from(AppError::InvalidInput("bad param".into()));
        let display = err.to_string();
        assert!(display.starts_with("[INVALID_INPUT]"));
        assert!(display.contains("bad param"));
    }
}
