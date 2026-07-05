//! Permission check module — central interception point for agent tool execution.
//!
//! Wraps `adl_kernel::command_risk::evaluate_permission` with a doom-loop aware
//! `check_tool_permission` entry point. Integrated into `agent_pipeline::generate_patches`
//! so that `apply_patch` operations are intercepted by the permission ruleset before
//! execution. This is central interception (vs OpenCode's decentralized `ctx.ask`).

use adl_kernel::command_risk::{evaluate_permission, PermissionDecision, PermissionRuleset};

/// Result of a permission check for a tool call.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PermissionCheckResult {
    /// Tool call is allowed.
    Allow,
    /// Tool call is denied; agent should be informed.
    Deny(String),
    /// Tool call requires user approval; agent should wait.
    Ask(String),
}

/// Check permission for a tool call before execution.
///
/// Integrates the permission ruleset with the agent tool execution chain.
/// This is the central interception point (vs OpenCode's decentralized `ctx.ask`).
///
/// - `tool_name`: the tool type identifier (e.g. `"read"`, `"write"`, `"bash"`, `"apply_patch"`).
///   Matched against each rule's `tool_type` field.
/// - `tool_input`: the full command/input string. It is split on whitespace into a
///   `command` + `args` pair so that existing `command_risk` rule matching keeps working.
/// - `ruleset`: the permission ruleset to evaluate against.
/// - `doom_loop_count`: consecutive failure count for doom loop detection. When `>= 3`,
///   the decision is upgraded to `Ask` regardless of ruleset outcome.
pub fn check_tool_permission(
    tool_name: &str,
    tool_input: &str,
    ruleset: &PermissionRuleset,
    doom_loop_count: u32,
) -> PermissionCheckResult {
    // 1. Doom loop check: 连续失败 >=3 次时升级为 Ask
    if doom_loop_count >= 3 {
        return PermissionCheckResult::Ask(format!(
            "Doom loop detected: tool '{}' has failed {} times consecutively",
            tool_name, doom_loop_count
        ));
    }

    // 2. 将 tool_input 拆分为 command + args 以匹配 evaluate_permission 签名
    let parts: Vec<&str> = tool_input.split_whitespace().collect();
    let command = parts.first().copied().unwrap_or("");
    let args: Vec<String> = parts.iter().skip(1).map(|s| s.to_string()).collect();
    let risk = adl_kernel::assess_command_risk(command, &args, false);

    // 3. 评估规则集（ruleset 优先，无匹配规则时回退到 risk-based decision）
    let decision = evaluate_permission(ruleset, tool_name, command, &args, risk);
    match decision {
        PermissionDecision::Allow => PermissionCheckResult::Allow,
        PermissionDecision::Deny => PermissionCheckResult::Deny(format!(
            "Tool '{}' is denied by permission ruleset",
            tool_name
        )),
        PermissionDecision::Ask => {
            PermissionCheckResult::Ask(format!("Tool '{}' requires user approval", tool_name))
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_kernel::command_risk::PermissionRule;

    #[test]
    fn allow_when_ruleset_permits() {
        // read tool with non-destructive content should be allowed by default rules
        let ruleset = PermissionRuleset::default_rules();
        let result = check_tool_permission("read", "some content", &ruleset, 0);
        assert_eq!(result, PermissionCheckResult::Allow);
    }

    #[test]
    fn deny_when_ruleset_forbids() {
        // bash tool with `rm -rf /` should be denied by the default rule
        // `rm -rf /**` (tool_type="bash", decision=Deny). A custom shell rule is
        // also added to demonstrate that user rules compose with defaults.
        let mut ruleset = PermissionRuleset::default_rules();
        ruleset.add_rule(PermissionRule {
            pattern: "rm -rf *".to_string(),
            decision: PermissionDecision::Deny,
            tool_type: "shell".to_string(),
            always: true,
            reason: "destructive".to_string(),
        });
        let result = check_tool_permission("bash", "rm -rf /", &ruleset, 0);
        assert!(matches!(result, PermissionCheckResult::Deny(_)));
    }

    #[test]
    fn ask_on_doom_loop() {
        let ruleset = PermissionRuleset::default_rules();
        let result = check_tool_permission("read", "content", &ruleset, 3);
        assert!(matches!(result, PermissionCheckResult::Ask(_)));
    }

    #[test]
    fn no_doom_loop_below_threshold() {
        let ruleset = PermissionRuleset::default_rules();
        let result = check_tool_permission("read", "content", &ruleset, 2);
        assert_eq!(result, PermissionCheckResult::Allow);
    }
}
