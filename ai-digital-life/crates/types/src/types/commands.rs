use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Agent identifier for slash commands.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum AgentId {
    #[default]
    Build,
    Plan,
    General,
}

/// Configuration for a user-defined slash command.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]

pub struct CommandConfig {
    /// The command name (without leading /). E.g., "refactor", "deploy".
    pub name: String,
    /// Human-readable description shown in the command palette.
    #[serde(default)]
    pub description: String,
    /// The agent to use for this command.
    #[serde(default = "default_agent_id")]
    pub agent: AgentId,
    /// Optional model override for this command.
    #[serde(default)]
    pub model: Option<String>,
    /// The prompt template with variables ($1, $ARGUMENTS, $WORKSPACE).
    pub template: String,
    /// Whether this command runs as a subtask (hidden from main conversation).
    #[serde(default)]
    pub subtask: bool,
    /// Hints extracted from the template (auto-generated).
    #[serde(default)]
    pub hints: Vec<CommandHint>,
}

fn default_agent_id() -> AgentId {
    AgentId::Build
}

/// A hint about a command parameter.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]

pub struct CommandHint {
    /// The variable name (e.g., "1", "ARGUMENTS", "WORKSPACE").
    pub variable: String,
    /// Human-readable description of what this variable expects.
    #[serde(default)]
    pub description: String,
    /// Whether this variable is required.
    #[serde(default)]
    pub required: bool,
}

impl CommandConfig {
    /// Extract template variables ($1, $2, $ARGUMENTS, $WORKSPACE) from the template.
    pub fn extract_variables(template: &str) -> Vec<String> {
        let mut vars = Vec::new();
        let mut remaining = template;
        while let Some(start) = remaining.find('$') {
            remaining = &remaining[start + 1..];
            let end = remaining
                .find(|c: char| !c.is_alphanumeric() && c != '_')
                .unwrap_or(remaining.len());
            if end > 0 {
                let var = &remaining[..end];
                if !var.is_empty() && !vars.contains(&var.to_string()) {
                    vars.push(var.to_string());
                }
            }
            remaining = &remaining[end..];
        }
        vars
    }

    /// Substitute template variables with provided values.
    pub fn render_template(template: &str, args: &[String], workspace: &str) -> String {
        let mut result = template.to_string();
        let arguments = args.join(" ");

        result = result.replace("$ARGUMENTS", &arguments);
        result = result.replace("$WORKSPACE", workspace);

        for (i, arg) in args.iter().enumerate() {
            let placeholder = format!("${}", i + 1);
            result = result.replace(&placeholder, arg);
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_variables_finds_numbered() {
        let vars = CommandConfig::extract_variables("Fix the bug in $1 related to $2");
        assert!(vars.contains(&"1".to_string()));
        assert!(vars.contains(&"2".to_string()));
    }

    #[test]
    fn extract_variables_finds_arguments() {
        let vars = CommandConfig::extract_variables("Review the following: $ARGUMENTS");
        assert!(vars.contains(&"ARGUMENTS".to_string()));
    }

    #[test]
    fn extract_variables_finds_workspace() {
        let vars = CommandConfig::extract_variables("Analyze $WORKSPACE for issues");
        assert!(vars.contains(&"WORKSPACE".to_string()));
    }

    #[test]
    fn extract_variables_dedupes() {
        let vars = CommandConfig::extract_variables("$1 and $1 again");
        assert_eq!(vars.iter().filter(|v| v == &&"1".to_string()).count(), 1);
    }

    #[test]
    fn render_template_substitutes_numbered_args() {
        let result = CommandConfig::render_template(
            "Fix $1 in $2",
            &["auth".to_string(), "login.ts".to_string()],
            "/workspace",
        );
        assert_eq!(result, "Fix auth in login.ts");
    }

    #[test]
    fn render_template_substitutes_arguments() {
        let result = CommandConfig::render_template(
            "Review: $ARGUMENTS",
            &["file1.rs".to_string(), "file2.rs".to_string()],
            "/workspace",
        );
        assert_eq!(result, "Review: file1.rs file2.rs");
    }

    #[test]
    fn render_template_substitutes_workspace() {
        let result =
            CommandConfig::render_template("Analyze $WORKSPACE", &[], "/home/user/project");
        assert_eq!(result, "Analyze /home/user/project");
    }

    #[test]
    fn render_template_handles_missing_args() {
        let result = CommandConfig::render_template(
            "Fix $1 and $2",
            &["only_one".to_string()],
            "/workspace",
        );
        assert_eq!(result, "Fix only_one and $2");
    }

    #[test]
    fn command_config_serializes() {
        let config = CommandConfig {
            name: "refactor".to_string(),
            description: "Refactor selected code".to_string(),
            agent: AgentId::Build,
            model: None,
            template: "Refactor $ARGUMENTS following best practices".to_string(),
            subtask: false,
            hints: vec![],
        };
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: CommandConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "refactor");
        assert_eq!(deserialized.agent, AgentId::Build);
    }
}
