use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "lowercase")]
pub enum ReferenceSource {
    Local,
    Git,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferenceConfig {
    pub name: String,
    pub source: ReferenceSource,
    pub path: String,
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_serializes() {
        let config = ReferenceConfig {
            name: "opencode".to_string(),
            source: ReferenceSource::Local,
            path: "/references/opencode".to_string(),
            branch: None,
            enabled: true,
        };
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: ReferenceConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "opencode");
        assert_eq!(deserialized.source, ReferenceSource::Local);
    }
}
