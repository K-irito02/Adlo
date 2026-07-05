use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticInfo {
    pub file_path: String,
    pub line: u32,
    pub column: u32,
    pub severity: DiagnosticSeverity,
    pub message: String,
    pub source: Option<String>,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Information,
    Hint,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostic_serializes() {
        let diag = DiagnosticInfo {
            file_path: "src/main.rs".to_string(),
            line: 10,
            column: 5,
            severity: DiagnosticSeverity::Error,
            message: "expected `;`".to_string(),
            source: Some("rustc".to_string()),
            code: Some("E0001".to_string()),
        };
        let json = serde_json::to_string(&diag).unwrap();
        assert!(json.contains("expected"));
    }
}
