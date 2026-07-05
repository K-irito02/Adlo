//! Governed command execution with bounded output capture.

use adl_errors::AppError;
use adl_kernel::{
    create_id, now_ms, CommandExecutionResult, CommandProfile, CommandRequest, PermissionDecision,
    PermissionRuleset, RiskLevel,
};
use std::path::Path;
use std::time::Duration;
use tokio::process::Command;

const DEFAULT_TIMEOUT_SECS: u64 = 120;
const MAX_CAPTURE_CHARS: usize = 60_000;

pub fn build_request(
    workspace_id: &str,
    run_id: Option<String>,
    command: String,
    args: Vec<String>,
    shell: bool,
) -> CommandRequest {
    let risk = adl_kernel::command_risk::assess_command_risk(&command, &args, shell);
    CommandRequest {
        id: create_id("command"),
        workspace_id: workspace_id.to_string(),
        run_id,
        profile: classify_profile(&command, &args),
        command,
        args,
        shell,
        risk_level: risk,
        created_at: now_ms(),
    }
}

pub fn classify_profile(command: &str, args: &[String]) -> CommandProfile {
    let joined = std::iter::once(command)
        .chain(args.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    if joined == "cargo test"
        || joined == "cargo test --workspace"
        || joined.contains("vitest")
        || joined.contains("pytest")
        || joined.starts_with("cargo test ")
        || joined.starts_with("npx vitest")
        || joined.starts_with("npm test")
        || joined.starts_with("npm run test ")
        || joined == "npm run test"
        || joined.starts_with("pnpm test")
        || joined.starts_with("pnpm run test ")
        || joined == "pnpm run test"
    {
        CommandProfile::Test
    } else if joined.contains(" build") || joined.contains("cargo check") {
        CommandProfile::Build
    } else if joined.contains("lint") || joined.contains("clippy") || joined == "cargo fmt" {
        CommandProfile::Lint
    } else if joined.contains("install") || joined.starts_with("pnpm add") {
        CommandProfile::Install
    } else {
        CommandProfile::Custom
    }
}

pub async fn run_command(
    workspace_root: &Path,
    request: CommandRequest,
    timeout_secs: Option<u64>,
) -> Result<CommandExecutionResult, AppError> {
    run_command_internal(workspace_root, request, timeout_secs, false).await
}

pub async fn run_approved_command(
    workspace_root: &Path,
    request: CommandRequest,
    timeout_secs: Option<u64>,
) -> Result<CommandExecutionResult, AppError> {
    run_command_internal(workspace_root, request, timeout_secs, true).await
}

pub async fn run_command_with_permission(
    workspace_root: &Path,
    request: CommandRequest,
    timeout_secs: Option<u64>,
    permission_engine: &PermissionRuleset,
    approval_granted: bool,
) -> Result<CommandExecutionResult, AppError> {
    let decision = permission_engine.evaluate("command", &request.command, &request.args);
    match decision {
        PermissionDecision::Deny => {
            return Err(AppError::Security(format!(
                "command denied by permission engine: {}",
                request.command
            )));
        },
        PermissionDecision::Ask if !approval_granted => {
            return Err(AppError::ApprovalRequired(format!(
                "command requires approval: {}",
                request.command
            )));
        },
        _ => {},
    }
    run_command_internal(workspace_root, request, timeout_secs, true).await
}

async fn run_command_internal(
    workspace_root: &Path,
    request: CommandRequest,
    timeout_secs: Option<u64>,
    approval_granted: bool,
) -> Result<CommandExecutionResult, AppError> {
    if request.risk_level != RiskLevel::Low && !approval_granted {
        return Err(AppError::ApprovalRequired(format!(
            "command requires approval: {}",
            request.command
        )));
    }
    let started_at = now_ms();
    let mut command = if request.shell {
        shell_command(&request.command, &request.args)
    } else {
        let mut command = Command::new(&request.command);
        command.args(&request.args);
        command
    };
    command.current_dir(workspace_root);
    command.kill_on_drop(true);

    let output = tokio::time::timeout(
        Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS)),
        command.output(),
    )
    .await
    .map_err(|_| AppError::Terminal("command timed out".into()))?
    .map_err(|e| AppError::Terminal(format!("failed to run command: {e}")))?;

    let stdout = truncate_output(&String::from_utf8_lossy(&output.stdout));
    let stderr = truncate_output(&String::from_utf8_lossy(&output.stderr));
    let success = output.status.success();
    let exit_code = output.status.code();
    Ok(CommandExecutionResult {
        request,
        exit_code,
        signal: None,
        stdout,
        stderr,
        summary: if success {
            "Command completed successfully.".into()
        } else {
            format!("Command failed with exit code {exit_code:?}.")
        },
        success,
        started_at,
        completed_at: now_ms(),
    })
}

#[cfg(windows)]
fn shell_command_impl(command: &str, args: &[String]) -> Command {
    let mut shell = Command::new("cmd");
    shell.arg("/C").arg(
        std::iter::once(command)
            .chain(args.iter().map(String::as_str))
            .collect::<Vec<_>>()
            .join(" "),
    );
    shell
}

#[cfg(not(windows))]
fn shell_command_impl(command: &str, args: &[String]) -> Command {
    let mut shell = Command::new("sh");
    shell.arg("-c").arg(
        std::iter::once(command)
            .chain(args.iter().map(String::as_str))
            .collect::<Vec<_>>()
            .join(" "),
    );
    shell
}

fn shell_command(command: &str, args: &[String]) -> Command {
    shell_command_impl(command, args)
}

pub fn truncate_output(value: &str) -> String {
    if value.chars().count() <= MAX_CAPTURE_CHARS {
        return value.to_string();
    }
    const TRUNCATION_MARKER: &str = "\n...[output truncated]...\n";
    let remaining = MAX_CAPTURE_CHARS.saturating_sub(TRUNCATION_MARKER.chars().count());
    let half = remaining / 2;
    let head: String = value.chars().take(half).collect();
    let tail: String = value.chars().rev().take(half).collect::<String>().chars().rev().collect();
    format!("{head}{TRUNCATION_MARKER}{tail}")
}

pub fn validation_command(
    root: &Path,
    workspace_id: &str,
    run_id: Option<String>,
) -> Option<CommandRequest> {
    if root.join("Cargo.toml").exists() {
        Some(build_request(
            workspace_id,
            run_id,
            "cargo".into(),
            vec!["test".into(), "--workspace".into()],
            false,
        ))
    } else if root.join("package.json").exists() {
        Some(build_request(workspace_id, run_id, "npm".into(), vec!["test".into()], false))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cargo_test_is_test_profile() {
        assert_eq!(
            classify_profile("cargo", &["test".into(), "--workspace".into()]),
            CommandProfile::Test
        );
    }

    #[test]
    fn classify_profile_build_commands() {
        assert_eq!(classify_profile("cargo", &["build".into()]), CommandProfile::Build);
        assert_eq!(classify_profile("cargo", &["check".into()]), CommandProfile::Build);
    }

    #[test]
    fn classify_profile_lint_commands() {
        assert_eq!(classify_profile("cargo", &["clippy".into()]), CommandProfile::Lint);
        assert_eq!(classify_profile("cargo", &["fmt".into()]), CommandProfile::Lint);
        assert_eq!(classify_profile("npm", &["run".into(), "lint".into()]), CommandProfile::Lint);
    }

    #[test]
    fn classify_profile_install_commands() {
        assert_eq!(classify_profile("npm", &["install".into()]), CommandProfile::Install);
        assert_eq!(classify_profile("pnpm", &["install".into()]), CommandProfile::Install);
        assert_eq!(
            classify_profile("pip", &["install".into(), "package".into()]),
            CommandProfile::Install
        );
        assert_eq!(classify_profile("pnpm", &["add".into()]), CommandProfile::Install);
    }

    #[test]
    fn classify_profile_custom_commands() {
        assert_eq!(classify_profile("echo", &["hello".into()]), CommandProfile::Custom);
        assert_eq!(classify_profile("node", &["server.js".into()]), CommandProfile::Custom);
    }

    #[test]
    fn classify_cargo_test() {
        let profile = classify_profile("cargo", &["test".to_string(), "--workspace".to_string()]);
        assert_eq!(profile, CommandProfile::Test);
    }

    #[test]
    fn classify_npm_test() {
        let profile = classify_profile("npm", &["test".to_string()]);
        assert_eq!(profile, CommandProfile::Test);
    }

    #[test]
    fn classify_npm_run_test() {
        let profile = classify_profile("npm", &["run".to_string(), "test".to_string()]);
        assert_eq!(profile, CommandProfile::Test);
    }

    #[test]
    fn classify_pnpm_run_test() {
        let profile = classify_profile("pnpm", &["run".to_string(), "test".to_string()]);
        assert_eq!(profile, CommandProfile::Test);
    }

    #[test]
    fn classify_echo_test_not_classified() {
        let profile = classify_profile("echo", &["\"running test suite\"".to_string()]);
        assert_ne!(profile, CommandProfile::Test, "echo with 'test' in msg should not be Test");
    }

    #[test]
    fn truncate_output_preserves_short_output() {
        let short = "hello world";
        let result = truncate_output(short);
        assert_eq!(result, short);
    }

    #[test]
    fn truncate_output_handles_exact_limit() {
        let chars: String = (0..MAX_CAPTURE_CHARS).map(|_| 'x').collect();
        let result = truncate_output(&chars);
        assert_eq!(result.len(), MAX_CAPTURE_CHARS);
        assert!(!result.contains("...[output truncated]..."));
    }

    #[test]
    fn truncate_output_truncates_long_output() {
        let chars: String = (0..MAX_CAPTURE_CHARS + 1000).map(|_| 'x').collect();
        let result = truncate_output(&chars);
        assert!(result.contains("...[output truncated]..."));
        assert!(result.len() < MAX_CAPTURE_CHARS + 1000);
    }

    #[test]
    fn truncate_output_preserves_head_and_tail() {
        let head = "START: ";
        let tail = " :END";
        let total_len = MAX_CAPTURE_CHARS + 500;
        let middle: String = (0..total_len - head.len() - tail.len()).map(|_| 'x').collect();
        let content = format!("{}{}{}", head, middle, tail);
        let result = truncate_output(&content);
        assert!(result.starts_with(head));
        assert!(result.ends_with(tail));
    }

    #[test]
    fn truncate_output_short_string_stays_unchanged() {
        let s = "hello world";
        assert_eq!(truncate_output(s), s);
    }

    #[test]
    fn truncate_output_long_string_fits_within_cap() {
        let long = "a".repeat(MAX_CAPTURE_CHARS + 100);
        let result = truncate_output(&long);
        assert!(
            result.chars().count() <= MAX_CAPTURE_CHARS,
            "truncated output ({}) exceeded MAX_CAPTURE_CHARS ({})",
            result.chars().count(),
            MAX_CAPTURE_CHARS
        );
        assert!(result.contains("[output truncated]"));
    }

    #[test]
    fn build_request_classifies_risk() {
        let request =
            build_request("w1", Some("r1".into()), "cargo".into(), vec!["build".into()], false);
        assert_eq!(request.risk_level, RiskLevel::Low);

        let install_request =
            build_request("w1", Some("r1".into()), "npm".into(), vec!["install".into()], false);
        assert_eq!(install_request.risk_level, RiskLevel::Medium);
    }

    #[test]
    fn validation_command_returns_cargo_for_rust_workspace() {
        let dir = std::env::temp_dir().join(format!("adl-command-val-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Cargo.toml"), "[package]\nname='x'").unwrap();

        let request = validation_command(&dir, "w1", Some("r1".into()));
        assert!(request.is_some());
        let req = request.unwrap();
        assert_eq!(req.command, "cargo");
        assert_eq!(req.args, vec!["test", "--workspace"]);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn validation_command_returns_npm_for_node_workspace() {
        let dir = std::env::temp_dir().join(format!("adl-command-val-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("package.json"), "{}").unwrap();

        let request = validation_command(&dir, "w1", Some("r1".into()));
        assert!(request.is_some());
        let req = request.unwrap();
        assert_eq!(req.command, "npm");
        assert_eq!(req.args, vec!["test"]);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn validation_command_returns_none_for_unknown_workspace() {
        let dir = std::env::temp_dir().join(format!("adl-command-val-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let request = validation_command(&dir, "w1", Some("r1".into()));
        assert!(request.is_none());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn permission_ruleset_allows_low_risk_without_approval() {
        let engine = PermissionRuleset::default();
        assert_eq!(
            engine.evaluate("command", "cargo", &["build".into()]),
            PermissionDecision::Allow
        );
    }

    #[test]
    fn permission_ruleset_asks_medium_risk_without_approval() {
        let engine = PermissionRuleset::default();
        assert_eq!(engine.evaluate("command", "npm", &["install".into()]), PermissionDecision::Ask);
    }
}
