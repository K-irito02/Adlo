use crate::RiskLevel;
use regex::Regex;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub fn assess_command_risk(command: &str, args: &[String], shell: bool) -> RiskLevel {
    let command_lower = command.to_lowercase();
    let joined = std::iter::once(command)
        .chain(args.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    if shell
        || joined.contains("rm -rf")
        || joined.contains("remove-item")
        || joined.contains("del /")
        || joined.contains("format ")
        || joined.contains("push --force")
        || joined.contains("reset --hard")
    {
        RiskLevel::High
    } else if command_lower.contains("install")
        || args.iter().any(|arg| arg == "install" || arg == "add")
        || command_lower == "npm"
        || command_lower == "pnpm"
        || (command_lower == "cargo"
            && args.iter().any(|arg| matches!(arg.as_str(), "install" | "publish")))
    {
        RiskLevel::Medium
    } else {
        RiskLevel::Low
    }
}

pub fn requires_approval(risk: RiskLevel) -> bool {
    matches!(risk, RiskLevel::Medium | RiskLevel::High)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
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
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
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
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
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

/// Determine if a rule matches the current request.
fn rule_matches(rule: &PermissionRule, tool_name: &str, command: &str, args: &[String]) -> bool {
    if !rule.tool_type.is_empty() && rule.tool_type != tool_name {
        return false;
    }
    if pattern_matches(&rule.pattern, tool_name) {
        return true;
    }
    let full_command = if args.is_empty() {
        command.to_string()
    } else {
        format!("{} {}", command, args.join(" "))
    };
    if pattern_matches(&rule.pattern, &full_command) {
        return true;
    }
    args.iter().any(|arg| pattern_matches(&rule.pattern, arg))
}

/// Check if a pattern matches a string using regex-based glob matching.
/// Supports `*` and `**` (match any sequence) and `?` (match single char).
/// Inspired by OpenCode's Wildcard.match — converts glob to regex.
pub fn pattern_matches(pattern: &str, text: &str) -> bool {
    if pattern == "**" {
        return true;
    }
    let regex_str = build_glob_regex(pattern);
    Regex::new(&regex_str).is_ok_and(|re| re.is_match(text))
}

/// Convert a glob-like pattern to a regex pattern.
/// - `*` or any run of `*` → `.*`
/// - `?` → `.`
/// - Special regex chars are escaped
fn build_glob_regex(pattern: &str) -> String {
    let mut re = String::with_capacity(pattern.len() + 4);
    re.push('^');
    let chars: Vec<char> = pattern.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            '*' => {
                let mut count = 0;
                while i + count < chars.len() && chars[i + count] == '*' {
                    count += 1;
                }
                let prev_is_slash = i > 0 && chars[i - 1] == '/';
                let next_is_slash = i + count < chars.len() && chars[i + count] == '/';
                let at_start = i == 0;

                if count >= 2 && prev_is_slash && next_is_slash {
                    re.truncate(re.len() - 2);
                    re.push_str("(?:/.*)?");
                    i += count;
                    continue;
                }
                if count >= 2 && at_start && next_is_slash {
                    re.push_str("(?:.*/)?");
                    i += count + 1;
                    continue;
                }
                re.push_str(".*");
                i += count;
            },
            '?' => {
                re.push('.');
                i += 1;
            },
            c @ ('.' | '+' | '^' | '$' | '{' | '}' | '[' | ']' | '\\' | '|' | '(' | ')' | '-'
            | '/' | '"') => {
                re.push('\\');
                re.push(c);
                i += 1;
            },
            c => {
                re.push(c);
                i += 1;
            },
        }
    }
    re.push('$');
    re
}

fn default_decision(command: &str, args: &[String]) -> PermissionDecision {
    match assess_command_risk(command, args, false) {
        RiskLevel::Low => PermissionDecision::Allow,
        RiskLevel::Medium => PermissionDecision::Ask,
        RiskLevel::High => PermissionDecision::Deny,
    }
}

/// Convert a legacy RiskLevel to a PermissionDecision.
pub fn risk_to_decision(risk: RiskLevel) -> PermissionDecision {
    match risk {
        RiskLevel::Low => PermissionDecision::Allow,
        RiskLevel::Medium => PermissionDecision::Ask,
        RiskLevel::High => PermissionDecision::Deny,
    }
}

/// Evaluate a permission request using both the ruleset and legacy risk assessment.
/// The ruleset takes precedence; if no rule matches, falls back to risk-based decision.
pub fn evaluate_permission(
    ruleset: &PermissionRuleset,
    tool_name: &str,
    command: &str,
    args: &[String],
    risk: RiskLevel,
) -> PermissionDecision {
    let ruleset_decision = ruleset.evaluate(tool_name, command, args);

    if !ruleset.is_empty() {
        return ruleset_decision;
    }

    risk_to_decision(risk)
}

/// Check for doom loop pattern (repeated failures).
/// Returns Ask if the same command has failed more than 3 times in a row.
pub fn doom_loop_check(recent_failures: &[String], command: &str) -> PermissionDecision {
    let consecutive_failures =
        recent_failures.iter().rev().take_while(|c| c.as_str() == command).count();

    if consecutive_failures >= 3 {
        PermissionDecision::Ask
    } else {
        PermissionDecision::Allow
    }
}

/// Check if a path is external to the workspace.
pub fn is_external_directory(path: &str, workspace_root: &str) -> bool {
    let normalized_path = std::path::Path::new(path)
        .canonicalize()
        .unwrap_or_else(|_| std::path::PathBuf::from(path));
    let normalized_root = std::path::Path::new(workspace_root)
        .canonicalize()
        .unwrap_or_else(|_| std::path::PathBuf::from(workspace_root));

    !normalized_path.starts_with(&normalized_root)
}

/// Build a permission ruleset from config.
pub fn build_ruleset(custom_rules: &[PermissionRule], include_defaults: bool) -> PermissionRuleset {
    let mut ruleset = if include_defaults {
        PermissionRuleset::default_rules()
    } else {
        PermissionRuleset::new()
    };

    for rule in custom_rules {
        ruleset.add_rule(rule.clone());
    }

    ruleset
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Risk assessment tests ──

    #[test]
    fn shell_commands_are_high_risk() {
        assert_eq!(assess_command_risk("pwsh", &["rm -rf x".into()], true), RiskLevel::High);
    }

    #[test]
    fn install_is_medium_risk() {
        assert_eq!(assess_command_risk("npm", &["install".into()], false), RiskLevel::Medium);
    }

    #[test]
    fn destructive_git_operations() {
        assert_eq!(
            assess_command_risk("git", &["push".into(), "--force".into()], false),
            RiskLevel::High
        );
        assert_eq!(
            assess_command_risk("git", &["reset".into(), "--hard".into()], false),
            RiskLevel::High
        );
        assert_eq!(assess_command_risk("git", &["reset".into()], false), RiskLevel::Low);
    }

    #[test]
    fn delete_operations() {
        assert_eq!(
            assess_command_risk("cmd", &["del".into(), "/f".into(), "file.txt".into()], false),
            RiskLevel::High
        );
        assert_eq!(
            assess_command_risk("powershell", &["Remove-Item".into()], true),
            RiskLevel::High
        );
    }

    #[test]
    fn npm_commands() {
        assert_eq!(assess_command_risk("npm", &[], false), RiskLevel::Medium);
        assert_eq!(assess_command_risk("pnpm", &[], false), RiskLevel::Medium);
        assert_eq!(assess_command_risk("npm", &["start".into()], false), RiskLevel::Medium);
    }

    #[test]
    fn cargo_install() {
        assert_eq!(assess_command_risk("cargo", &["install".into()], false), RiskLevel::Medium);
        assert_eq!(assess_command_risk("cargo", &["publish".into()], false), RiskLevel::Medium);
        assert_eq!(assess_command_risk("cargo", &["build".into()], false), RiskLevel::Low);
    }

    #[test]
    fn requires_approval_for_medium_and_high_risk() {
        assert!(requires_approval(RiskLevel::Medium));
        assert!(requires_approval(RiskLevel::High));
        assert!(!requires_approval(RiskLevel::Low));
    }

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

    // ── Evaluation helper tests ──

    #[test]
    fn risk_low_to_allow() {
        assert_eq!(risk_to_decision(RiskLevel::Low), PermissionDecision::Allow);
    }

    #[test]
    fn risk_medium_to_ask() {
        assert_eq!(risk_to_decision(RiskLevel::Medium), PermissionDecision::Ask);
    }

    #[test]
    fn risk_high_to_deny() {
        assert_eq!(risk_to_decision(RiskLevel::High), PermissionDecision::Deny);
    }

    #[test]
    fn doom_loop_allows_under_threshold() {
        let failures = vec!["npm install".to_string(), "npm install".to_string()];
        assert_eq!(doom_loop_check(&failures, "npm install"), PermissionDecision::Allow);
    }

    #[test]
    fn doom_loop_asks_at_threshold() {
        let failures =
            vec!["npm install".to_string(), "npm install".to_string(), "npm install".to_string()];
        assert_eq!(doom_loop_check(&failures, "npm install"), PermissionDecision::Ask);
    }

    #[test]
    fn doom_loop_resets_on_different_command() {
        let failures = vec![
            "npm install".to_string(),
            "npm install".to_string(),
            "npm install".to_string(),
            "git status".to_string(),
        ];
        assert_eq!(doom_loop_check(&failures, "npm install"), PermissionDecision::Allow);
    }

    #[test]
    fn build_ruleset_with_defaults() {
        let ruleset = build_ruleset(&[], true);
        assert!(!ruleset.rules.is_empty());
    }

    #[test]
    fn build_ruleset_without_defaults() {
        let ruleset = build_ruleset(&[], false);
        assert!(ruleset.rules.is_empty());
    }

    #[test]
    fn build_ruleset_with_custom_rules() {
        let custom = vec![PermissionRule {
            pattern: "**/*.test.rs".to_string(),
            decision: PermissionDecision::Allow,
            tool_type: "write".to_string(),
            always: false,
            reason: "Test files".to_string(),
        }];
        let ruleset = build_ruleset(&custom, false);
        assert_eq!(ruleset.rules.len(), 1);
    }

    #[test]
    fn double_star_matches_zero_segments() {
        assert!(pattern_matches("dir/**/file", "dir/file"), "** should match zero segments");
        assert!(pattern_matches("dir/**/file", "dir/sub/file"), "** should match one segment");
        assert!(
            pattern_matches("dir/**/file", "dir/a/b/file"),
            "** should match multiple segments"
        );
    }
}
