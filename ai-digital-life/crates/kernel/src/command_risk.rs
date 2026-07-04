use crate::RiskLevel;
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct PermissionRule {
    pub pattern: String,
    pub decision: PermissionDecision,
    pub tool_type: String,
}

#[derive(Debug, Clone, Default)]
pub struct PermissionEngine {
    rules: Vec<PermissionRule>,
}

impl PermissionEngine {
    pub fn add_rule(&mut self, rule: PermissionRule) {
        self.rules.push(rule);
    }

    pub fn evaluate(&self, command: &str, args: &[String]) -> PermissionDecision {
        let joined = std::iter::once(command)
            .chain(args.iter().map(String::as_str))
            .collect::<Vec<_>>()
            .join(":");

        let mut best: Option<PermissionDecision> = None;

        for rule in &self.rules {
            if pattern_matches(&rule.pattern, command, args)
                || pattern_matches(&rule.pattern, &joined, &[])
            {
                let decision = rule.decision;
                best = match best {
                    None => Some(decision),
                    Some(current) if decision > current => Some(decision),
                    Some(current) => Some(current),
                };
            }
        }

        best.unwrap_or_else(|| default_decision(command, args))
    }
}

fn pattern_matches(pattern: &str, command: &str, args: &[String]) -> bool {
    if !pattern.contains('*') {
        let full = std::iter::once(command)
            .chain(args.iter().map(String::as_str))
            .collect::<Vec<_>>()
            .join(":");
        return full == pattern;
    }

    let parts: Vec<&str> = pattern.split(':').collect();
    let input_parts: Vec<&str> =
        std::iter::once(command).chain(args.iter().map(String::as_str)).collect();

    if parts.len() > input_parts.len() {
        let last_is_wildcard = parts.last().is_some_and(|p| *p == "*");
        if !last_is_wildcard {
            return false;
        }
    }

    for (i, part) in parts.iter().enumerate() {
        if *part == "**" {
            return true;
        }
        if *part == "*" {
            continue;
        }
        match input_parts.get(i) {
            Some(input) if input == part => continue,
            _ => return false,
        }
    }

    parts.len() <= input_parts.len()
}

fn default_decision(command: &str, args: &[String]) -> PermissionDecision {
    match assess_command_risk(command, args, false) {
        RiskLevel::Low => PermissionDecision::Allow,
        RiskLevel::Medium => PermissionDecision::Ask,
        RiskLevel::High => PermissionDecision::Deny,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn permission_engine_defaults_allow_low_risk() {
        let engine = PermissionEngine::default();
        assert_eq!(engine.evaluate("cargo", &["build".into()]), PermissionDecision::Allow);
    }

    #[test]
    fn permission_engine_defaults_ask_medium_risk() {
        let engine = PermissionEngine::default();
        assert_eq!(engine.evaluate("npm", &["install".into()]), PermissionDecision::Ask);
    }

    #[test]
    fn permission_engine_defaults_deny_high_risk() {
        let engine = PermissionEngine::default();
        assert_eq!(engine.evaluate("rm", &["-rf".into(), "/".into()]), PermissionDecision::Deny);
    }

    #[test]
    fn permission_engine_wildcard_rule_overrides_default() {
        let mut engine = PermissionEngine::default();
        engine.add_rule(PermissionRule {
            pattern: "npm:*".into(),
            decision: PermissionDecision::Allow,
            tool_type: "command".into(),
        });
        assert_eq!(engine.evaluate("npm", &["install".into()]), PermissionDecision::Allow);
    }

    #[test]
    fn permission_engine_exact_rule_overrides_wildcard() {
        let mut engine = PermissionEngine::default();
        engine.add_rule(PermissionRule {
            pattern: "npm:*".into(),
            decision: PermissionDecision::Allow,
            tool_type: "command".into(),
        });
        engine.add_rule(PermissionRule {
            pattern: "npm:install:express".into(),
            decision: PermissionDecision::Deny,
            tool_type: "command".into(),
        });
        assert_eq!(
            engine.evaluate("npm", &["install".into(), "express".into()]),
            PermissionDecision::Deny
        );
        assert_eq!(
            engine.evaluate("npm", &["install".into(), "lodash".into()]),
            PermissionDecision::Allow
        );
    }

    #[test]
    fn permission_engine_precedence_deny_over_ask_over_allow() {
        let mut engine = PermissionEngine::default();
        engine.add_rule(PermissionRule {
            pattern: "git:*".into(),
            decision: PermissionDecision::Allow,
            tool_type: "command".into(),
        });
        engine.add_rule(PermissionRule {
            pattern: "git:*".into(),
            decision: PermissionDecision::Deny,
            tool_type: "command".into(),
        });
        engine.add_rule(PermissionRule {
            pattern: "git:*".into(),
            decision: PermissionDecision::Ask,
            tool_type: "command".into(),
        });
        assert_eq!(engine.evaluate("git", &["push".into()]), PermissionDecision::Deny);
    }

    #[test]
    fn permission_decision_ordering() {
        assert!(PermissionDecision::Deny > PermissionDecision::Ask);
        assert!(PermissionDecision::Ask > PermissionDecision::Allow);
        assert!(PermissionDecision::Deny > PermissionDecision::Allow);
    }
}
