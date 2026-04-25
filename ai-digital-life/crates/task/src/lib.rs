//! Task state machine, approval, and audit helpers.

use adl_kernel::{
    create_id, now_ms, ApprovalPolicySummary, ApprovalRecord, ApprovalRequestSummary, AuditRecord,
    RiskLevel, TaskOperation, TaskRecord, TaskStatus, TaskSummary,
};

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
        || command_lower == "cargo"
            && args
                .iter()
                .any(|arg| matches!(arg.as_str(), "install" | "publish"))
    {
        RiskLevel::Medium
    } else {
        RiskLevel::Low
    }
}

pub fn requires_approval(risk: RiskLevel) -> bool {
    matches!(risk, RiskLevel::Medium | RiskLevel::High)
}

pub fn make_task(
    workspace_id: &str,
    session_id: &str,
    description: impl Into<String>,
    operation: TaskOperation,
) -> TaskRecord {
    let now = now_ms();
    let status = if requires_approval(operation.risk_level) {
        TaskStatus::WaitingApproval
    } else {
        TaskStatus::Approved
    };
    TaskRecord {
        id: create_id("task"),
        workspace_id: workspace_id.to_string(),
        session_id: session_id.to_string(),
        r#type: operation.kind.clone(),
        description: description.into(),
        status,
        priority: match operation.risk_level {
            RiskLevel::Low => "low",
            RiskLevel::Medium => "medium",
            RiskLevel::High => "high",
        }
        .into(),
        operations: vec![operation],
        approval_id: None,
        checkpoint_id: None,
        result_json: None,
        error_json: None,
        created_at: now,
        updated_at: now,
        started_at: None,
        completed_at: None,
    }
}

pub fn make_approval(task: &TaskRecord, title: impl Into<String>) -> ApprovalRecord {
    let now = now_ms();
    let risk = task
        .operations
        .iter()
        .map(|operation| operation.risk_level)
        .max_by_key(|risk| match risk {
            RiskLevel::Low => 0,
            RiskLevel::Medium => 1,
            RiskLevel::High => 2,
        })
        .unwrap_or(RiskLevel::Low);
    let request = ApprovalRequestSummary {
        id: create_id("approval"),
        task_id: task.id.clone(),
        title: title.into(),
        description: task.description.clone(),
        risk_level: risk,
        impact: task
            .operations
            .iter()
            .filter_map(|operation| operation.target.clone())
            .collect(),
        reversible: task.operations.iter().all(|operation| operation.reversible),
        created_at: now,
        expires_at: None,
    };
    ApprovalRecord {
        id: request.id.clone(),
        task_id: task.id.clone(),
        workspace_id: task.workspace_id.clone(),
        risk_level: risk,
        request,
        decision: None,
        reason: None,
        approved_by: None,
        created_at: now,
        decided_at: None,
        expires_at: None,
    }
}

pub fn task_summary(task: &TaskRecord) -> TaskSummary {
    let risk = task
        .operations
        .first()
        .map(|operation| operation.risk_level)
        .unwrap_or(RiskLevel::Low);
    TaskSummary {
        id: task.id.clone(),
        title: task.r#type.clone(),
        description: task.description.clone(),
        status: task.status,
        risk_level: risk,
        updated_at: task.updated_at,
        detail: task
            .operations
            .iter()
            .filter_map(|operation| operation.target.clone())
            .collect::<Vec<_>>()
            .join(", "),
    }
}

pub fn audit(
    entity_type: impl Into<String>,
    entity_id: impl Into<String>,
    action: impl Into<String>,
    detail: impl Into<String>,
) -> AuditRecord {
    AuditRecord {
        id: create_id("audit"),
        entity_type: entity_type.into(),
        entity_id: entity_id.into(),
        action: action.into(),
        detail: detail.into(),
        created_at: now_ms(),
    }
}

pub fn default_policy() -> ApprovalPolicySummary {
    ApprovalPolicySummary {
        mode: "manual".into(),
        summary: "Low-risk reads and validation commands can proceed; medium and high-risk actions require approval.".into(),
        high_risk_rules: vec![
            "Shell mode command execution requires approval.".into(),
            "Dependency installation requires approval.".into(),
            "Deletion, force push, and destructive git operations require approval.".into(),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_commands_are_high_risk() {
        assert_eq!(
            assess_command_risk("pwsh", &["rm -rf x".into()], true),
            RiskLevel::High
        );
    }

    #[test]
    fn install_is_medium_risk() {
        assert_eq!(
            assess_command_risk("npm", &["install".into()], false),
            RiskLevel::Medium
        );
    }
}
