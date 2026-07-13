use crate::command_risk::{default_decision, rule_matches};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]

#[serde(rename_all = "lowercase")]
pub enum PermissionDecision {
    Allow,
    Ask,
    Deny,
}

impl PermissionDecision {
    /// Precedence: Deny > Ask > Allow. Returns the higher-precedence decision.
    pub fn merge(self, other: PermissionDecision) -> PermissionDecision {
        match (self, other) {
            (PermissionDecision::Deny, _) | (_, PermissionDecision::Deny) => {
                PermissionDecision::Deny
            },
            (PermissionDecision::Ask, _) | (_, PermissionDecision::Ask) => PermissionDecision::Ask,
            (PermissionDecision::Allow, PermissionDecision::Allow) => PermissionDecision::Allow,
        }
    }

    pub fn is_allow(&self) -> bool {
        matches!(self, PermissionDecision::Allow)
    }

    pub fn is_ask(&self) -> bool {
        matches!(self, PermissionDecision::Ask)
    }

    pub fn is_deny(&self) -> bool {
        matches!(self, PermissionDecision::Deny)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]

pub struct PermissionRule {
    pub pattern: String,
    pub decision: PermissionDecision,
    #[serde(default)]
    pub tool_type: String,
    /// Whether this rule always applies (persists across session).
    #[serde(default)]
    pub always: bool,
    /// Human-readable reason for this rule (shown in UI).
    #[serde(default)]
    pub reason: String,
}

impl Default for PermissionRule {
    fn default() -> Self {
        Self {
            pattern: String::new(),
            decision: PermissionDecision::Allow,
            tool_type: String::new(),
            always: false,
            reason: String::new(),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct PermissionRuleset {
    pub rules: Vec<PermissionRule>,
}

impl PermissionRuleset {
    pub fn new() -> Self {
        Self { rules: Vec::new() }
    }

    pub fn add_rule(&mut self, rule: PermissionRule) {
        self.rules.push(rule);
    }

    pub fn is_empty(&self) -> bool {
        self.rules.is_empty()
    }

    /// Evaluate a permission request against the ruleset.
    /// Returns the decision from the LAST matching rule (OpenCode behavior).
    /// If no rule matches, returns the default decision (derived from RiskLevel).
    pub fn evaluate(&self, tool_name: &str, command: &str, args: &[String]) -> PermissionDecision {
        let mut decision = default_decision(command, args);
        for rule in &self.rules {
            if rule_matches(rule, tool_name, command, args) {
                decision = rule.decision;
            }
        }
        decision
    }

    /// Get the default ruleset with built-in safety rules.
    pub fn default_rules() -> Self {
        let mut ruleset = Self::new();

        // Protect .env and .env.* files (catch bare filename and path variants)
        for pattern in &[".env", "**/.env", "**/.env.*"] {
            ruleset.add_rule(PermissionRule {
                pattern: pattern.to_string(),
                decision: PermissionDecision::Ask,
                tool_type: "write".to_string(),
                always: true,
                reason: "Protecting environment files".to_string(),
            });
        }
        ruleset.add_rule(PermissionRule {
            pattern: "rm -rf /**".to_string(),
            decision: PermissionDecision::Deny,
            tool_type: "bash".to_string(),
            always: true,
            reason: "Preventing destructive recursive deletion".to_string(),
        });
        ruleset.add_rule(PermissionRule {
            pattern: "git push --force*".to_string(),
            decision: PermissionDecision::Ask,
            tool_type: "bash".to_string(),
            always: true,
            reason: "Force push can overwrite remote history".to_string(),
        });
        ruleset.add_rule(PermissionRule {
            pattern: "**/external/**".to_string(),
            decision: PermissionDecision::Ask,
            tool_type: "write".to_string(),
            always: true,
            reason: "External directory access".to_string(),
        });
        ruleset
    }
}

/// Configuration for the permission ruleset (stored in app config).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]

pub struct PermissionRulesetConfig {
    /// Custom rules added by the user.
    #[serde(default)]
    pub custom_rules: Vec<PermissionRule>,
    /// Whether to include the default safety rules.
    #[serde(default = "default_true")]
    pub include_defaults: bool,
}

impl Default for PermissionRulesetConfig {
    fn default() -> Self {
        Self { custom_rules: Vec::new(), include_defaults: true }
    }
}

fn default_true() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── PermissionDecision helper tests ──

    #[test]
    fn decision_merge_deny_wins() {
        assert_eq!(
            PermissionDecision::Allow.merge(PermissionDecision::Deny),
            PermissionDecision::Deny
        );
        assert_eq!(
            PermissionDecision::Deny.merge(PermissionDecision::Allow),
            PermissionDecision::Deny
        );
    }

    #[test]
    fn decision_merge_ask_over_allow() {
        assert_eq!(
            PermissionDecision::Allow.merge(PermissionDecision::Ask),
            PermissionDecision::Ask
        );
        assert_eq!(
            PermissionDecision::Ask.merge(PermissionDecision::Allow),
            PermissionDecision::Ask
        );
    }

    #[test]
    fn decision_is_helpers() {
        assert!(PermissionDecision::Allow.is_allow());
        assert!(PermissionDecision::Ask.is_ask());
        assert!(PermissionDecision::Deny.is_deny());
        assert!(!PermissionDecision::Allow.is_deny());
    }

    // ── Ruleset tests ──

    #[test]
    fn ruleset_defaults_allow_low_risk() {
        let ruleset = PermissionRuleset::default();
        assert_eq!(
            ruleset.evaluate("command", "cargo", &["build".into()]),
            PermissionDecision::Allow
        );
    }

    #[test]
    fn ruleset_defaults_ask_medium_risk() {
        let ruleset = PermissionRuleset::default();
        assert_eq!(
            ruleset.evaluate("command", "npm", &["install".into()]),
            PermissionDecision::Ask
        );
    }

    #[test]
    fn ruleset_defaults_deny_high_risk() {
        let ruleset = PermissionRuleset::default();
        assert_eq!(
            ruleset.evaluate("command", "rm", &["-rf".into(), "/".into()]),
            PermissionDecision::Deny
        );
    }

    #[test]
    fn ruleset_default_rules_has_safety_rules() {
        let ruleset = PermissionRuleset::default_rules();
        assert!(ruleset.rules.len() >= 3);
        assert!(ruleset.rules.iter().any(|r| r.pattern.contains(".env")));
        assert!(ruleset.rules.iter().all(|r| r.always));
        assert!(ruleset.rules.iter().all(|r| !r.reason.is_empty()));
    }

    #[test]
    fn ruleset_default_evaluates_env_write_as_ask() {
        let ruleset = PermissionRuleset::default_rules();
        let decision = ruleset.evaluate("write", "write", &[".env".to_string()]);
        assert_eq!(decision, PermissionDecision::Ask);
    }

    #[test]
    fn ruleset_default_evaluates_rm_rf_as_deny() {
        let ruleset = PermissionRuleset::default_rules();
        let decision = ruleset.evaluate("bash", "rm", &["-rf".to_string(), "/".to_string()]);
        assert_eq!(decision, PermissionDecision::Deny);
    }

    #[test]
    fn ruleset_default_allows_normal_read() {
        let ruleset = PermissionRuleset::default_rules();
        let decision = ruleset.evaluate("read", "read", &["src/main.rs".to_string()]);
        assert_eq!(decision, PermissionDecision::Allow);
    }

    #[test]
    fn ruleset_custom_rule_overrides_default_last_wins() {
        let mut ruleset = PermissionRuleset::default_rules();
        // Override the built-in .env protection with an Allow rule (last match wins)
        ruleset.add_rule(PermissionRule {
            pattern: ".env".to_string(),
            decision: PermissionDecision::Allow,
            tool_type: "write".to_string(),
            always: true,
            reason: "User override".to_string(),
        });
        let decision = ruleset.evaluate("write", "write", &[".env".to_string()]);
        assert_eq!(decision, PermissionDecision::Allow);
    }

    #[test]
    fn last_rule_overrides_earlier() {
        let mut ruleset = PermissionRuleset::new();
        ruleset.add_rule(PermissionRule {
            pattern: "write".to_string(),
            decision: PermissionDecision::Deny,
            tool_type: String::new(),
            always: true,
            reason: "deny all writes".to_string(),
        });
        ruleset.add_rule(PermissionRule {
            pattern: "write".to_string(),
            decision: PermissionDecision::Allow,
            tool_type: String::new(),
            always: true,
            reason: "override: allow writes".to_string(),
        });
        let result = ruleset.evaluate("write", "write src/main.rs", &[]);
        assert_eq!(
            result,
            PermissionDecision::Allow,
            "last rule should win (Allow) over earlier rule (Deny)"
        );
    }

    #[test]
    fn permission_rule_serializes_snake_case() {
        let rule = PermissionRule {
            pattern: "test".to_string(),
            decision: PermissionDecision::Allow,
            tool_type: "bash".to_string(),
            always: false,
            reason: "test reason".to_string(),
        };
        let json = serde_json::to_string(&rule).expect("serialize");
        assert!(json.contains("\"tool_type\""), "expected snake_case tool_type, got: {}", json);
        assert!(!json.contains("\"toolType\""), "camelCase toolType leaked: {}", json);
    }

    #[test]
    fn permission_ruleset_config_default() {
        let config = PermissionRulesetConfig::default();
        assert!(config.include_defaults);
        assert!(config.custom_rules.is_empty());
    }

    #[test]
    fn permission_decision_ordering() {
        assert!(PermissionDecision::Deny > PermissionDecision::Ask);
        assert!(PermissionDecision::Ask > PermissionDecision::Allow);
        assert!(PermissionDecision::Deny > PermissionDecision::Allow);
    }
}
