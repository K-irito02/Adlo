use adl_types::permission_types::{PermissionDecision, PermissionRule, PermissionRuleset};
use adl_types::RiskLevel;
use regex::Regex;

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

/// Determine if a rule matches the current request.
pub(crate) fn rule_matches(
    rule: &PermissionRule,
    tool_name: &str,
    command: &str,
    args: &[String],
) -> bool {
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

pub(crate) fn default_decision(command: &str, args: &[String]) -> PermissionDecision {
    match assess_command_risk(command, args, false) {
        RiskLevel::Low => PermissionDecision::Allow,
        RiskLevel::Medium => PermissionDecision::Ask,
        RiskLevel::High => PermissionDecision::Deny,
    }
}

/// Map a `RiskLevel` to its default `PermissionDecision`.
///
/// Used as the fallback when no ruleset rule matches: low-risk commands are
/// allowed, medium-risk commands prompt the user, high-risk commands are denied.
pub fn risk_to_decision(risk: RiskLevel) -> PermissionDecision {
    match risk {
        RiskLevel::Low => PermissionDecision::Allow,
        RiskLevel::Medium => PermissionDecision::Ask,
        RiskLevel::High => PermissionDecision::Deny,
    }
}

/// Evaluate a permission request against the ruleset.
/// Returns the decision from the LAST matching rule (OpenCode behavior).
/// If no rule matches, returns the default decision (derived from RiskLevel).
pub fn evaluate_ruleset(
    ruleset: &PermissionRuleset,
    tool_name: &str,
    command: &str,
    args: &[String],
) -> PermissionDecision {
    let mut decision = default_decision(command, args);
    for rule in &ruleset.rules {
        if rule_matches(rule, tool_name, command, args) {
            decision = rule.decision;
        }
    }
    decision
}

/// Evaluate a permission request against the ruleset, falling back to risk-based
/// default when the ruleset is empty.
///
/// When the ruleset contains at least one rule, `evaluate_ruleset` decides (last
/// matching rule wins, or default if none match). When the ruleset is empty,
/// the caller-provided `risk` decides via `risk_to_decision`. The `risk`
/// parameter is only consulted when `ruleset.is_empty()` is true.
pub fn evaluate_permission(
    ruleset: &PermissionRuleset,
    tool_name: &str,
    command: &str,
    args: &[String],
    risk: RiskLevel,
) -> PermissionDecision {
    let ruleset_decision = evaluate_ruleset(ruleset, tool_name, command, args);

    if !ruleset.is_empty() {
        return ruleset_decision;
    }

    risk_to_decision(risk)
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
