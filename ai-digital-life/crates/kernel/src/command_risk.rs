use crate::RiskLevel;

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
}
