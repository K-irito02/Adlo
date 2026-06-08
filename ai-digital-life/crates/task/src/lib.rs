//! Task state machine, approval, and audit helpers.

use adl_kernel::{
    create_id, now_ms, ApprovalPolicySummary, ApprovalRecord, ApprovalRequestSummary, AuditRecord,
    RiskLevel, TaskOperation, TaskRecord, TaskStatus, TaskSummary,
};

pub use adl_kernel::command_risk::{assess_command_risk, requires_approval};

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
        impact: task.operations.iter().filter_map(|operation| operation.target.clone()).collect(),
        reversible: task.operations.iter().all(|operation| operation.reversible),
        created_at: now,
        expires_at: None,
    };
    ApprovalRecord {
        id: request.id.clone(),
        task_id: task.id.clone(),
        workspace_id: task.workspace_id.clone(),
        run_id: None,
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
    let risk =
        task.operations.first().map(|operation| operation.risk_level).unwrap_or(RiskLevel::Low);
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
    fn make_task_with_low_risk_approved_immediately() {
        let operation = TaskOperation {
            kind: "read".into(),
            target: Some("README.md".into()),
            params: serde_json::Value::Null,
            risk_level: RiskLevel::Low,
            reversible: true,
        };
        let task = make_task("w1", "s1", "Read file", operation);
        assert_eq!(task.status, TaskStatus::Approved);
    }

    #[test]
    fn make_task_with_high_risk_waits_for_approval() {
        let operation = TaskOperation {
            kind: "delete".into(),
            target: Some("temp.txt".into()),
            params: serde_json::Value::Null,
            risk_level: RiskLevel::High,
            reversible: false,
        };
        let task = make_task("w1", "s1", "Delete file", operation);
        assert_eq!(task.status, TaskStatus::WaitingApproval);
    }

    #[test]
    fn make_approval_extracts_highest_risk_level() {
        let operations = vec![
            TaskOperation {
                kind: "read".into(),
                target: None,
                params: serde_json::Value::Null,
                risk_level: RiskLevel::Low,
                reversible: true,
            },
            TaskOperation {
                kind: "write".into(),
                target: Some("file.txt".into()),
                params: serde_json::Value::Null,
                risk_level: RiskLevel::Medium,
                reversible: true,
            },
        ];
        let task = TaskRecord {
            id: "task1".into(),
            workspace_id: "w1".into(),
            session_id: "s1".into(),
            r#type: "multi".into(),
            description: "Multiple operations".into(),
            status: TaskStatus::WaitingApproval,
            priority: "medium".into(),
            operations,
            approval_id: None,
            checkpoint_id: None,
            result_json: None,
            error_json: None,
            created_at: now_ms(),
            updated_at: now_ms(),
            started_at: None,
            completed_at: None,
        };
        let approval = make_approval(&task, "Approve task");
        assert_eq!(approval.risk_level, RiskLevel::Medium);
    }

    #[test]
    fn task_summary_extracts_operation_info() {
        let operation = TaskOperation {
            kind: "edit".into(),
            target: Some("src/main.rs".into()),
            params: serde_json::Value::Null,
            risk_level: RiskLevel::Low,
            reversible: true,
        };
        let task = TaskRecord {
            id: "task1".into(),
            workspace_id: "w1".into(),
            session_id: "s1".into(),
            r#type: "edit".into(),
            description: "Edit main file".into(),
            status: TaskStatus::Running,
            priority: "low".into(),
            operations: vec![operation],
            approval_id: None,
            checkpoint_id: None,
            result_json: None,
            error_json: None,
            created_at: now_ms(),
            updated_at: now_ms(),
            started_at: None,
            completed_at: None,
        };
        let summary = task_summary(&task);
        assert_eq!(summary.id, "task1");
        assert_eq!(summary.title, "edit");
        assert_eq!(summary.status, TaskStatus::Running);
        assert_eq!(summary.risk_level, RiskLevel::Low);
        assert!(summary.detail.contains("src/main.rs"));
    }

    #[test]
    fn audit_record_creation() {
        let record = audit("workspace", "w1", "open", "Opened /path/to/workspace");
        assert_eq!(record.entity_type, "workspace");
        assert_eq!(record.entity_id, "w1");
        assert_eq!(record.action, "open");
        assert_eq!(record.detail, "Opened /path/to/workspace");
    }

    #[test]
    fn default_policy_contains_rules() {
        let policy = default_policy();
        assert_eq!(policy.mode, "manual");
        assert!(!policy.high_risk_rules.is_empty());
    }
}
