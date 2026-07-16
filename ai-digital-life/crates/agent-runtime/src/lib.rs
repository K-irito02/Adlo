//! Single-agent sequential planning runtime.

pub mod compaction;
pub mod compaction_summary;
pub mod permission_check;
pub mod plan_mode;
pub mod prompt;
pub mod registry;
pub mod router;
pub mod run_activity_seq;

pub mod token_counter;
pub mod tools;

pub use tools::registry::{global_registry, ToolDefinition, ToolExecutionResult, ToolRegistry};

use adl_types::{
    create_id, now_ms, AgentId, AgentPlanStep, AgentRunDetail, AgentRunRecord, AgentRunStatus,
    ContextEntry, ConversationScenario, ModelChatMessage, PatchSet, ValidationResult,
    WorkspaceMeta,
};

pub fn create_run(
    workspace_id: &str,
    session_id: &str,
    prompt: &str,
    scenario: ConversationScenario,
) -> AgentRunDetail {
    let now = now_ms();
    let run_id = create_id("run");
    let steps = ["Understand request", "Collect context", "Generate patch preview"]
        .into_iter()
        .map(|title| AgentPlanStep {
            id: create_id("step"),
            run_id: run_id.clone(),
            title: title.into(),
            detail: Some("Single-agent thin-slice step.".into()),
            status: "pending".into(),
            created_at: now,
            updated_at: now,
        })
        .collect();
    AgentRunDetail {
        run: AgentRunRecord {
            id: run_id,
            workspace_id: workspace_id.to_string(),
            session_id: session_id.to_string(),
            prompt: prompt.to_string(),
            scenario,
            status: AgentRunStatus::Planning,
            summary: None,
            patch_set_id: None,
            created_at: now,
            updated_at: now,
            completed_at: None,
            agent_id: AgentId::Build,
        },
        steps,
    }
}

/// Inject Plan Mode system prompt into an agent run detail.
///
/// The prompt is stashed inside `run.summary` (which starts as `None`) using a
/// `[PLAN_MODE_PROMPT]` marker so that `agent_pipeline::call_model` can read it
/// back out and prepend it to the system message before invoking the model.
/// `complete_plan` will overwrite `summary` with the final user-facing
/// summary at the end of the run, so the plan prompt never leaks to the UI.
pub fn inject_plan_mode_prompt(mut detail: AgentRunDetail, plan_prompt: &str) -> AgentRunDetail {
    if let Some(summary) = &mut detail.run.summary {
        summary.push_str("\n\n[PLAN_MODE_PROMPT]\n");
        summary.push_str(plan_prompt);
    } else {
        detail.run.summary = Some(format!("[PLAN_MODE_PROMPT]\n{}", plan_prompt));
    }
    detail
}

pub fn complete_plan(
    mut detail: AgentRunDetail,
    patch_set: Option<&PatchSet>,
    scenario: ConversationScenario,
) -> AgentRunDetail {
    let now = now_ms();
    for step in &mut detail.steps {
        step.status = "completed".into();
        step.updated_at = now;
    }
    detail.run.patch_set_id = patch_set.map(|p| p.id.clone());
    match (scenario, patch_set.is_some()) {
        (_, true) => {
            detail.run.status = AgentRunStatus::Ready;
            detail.run.summary = Some(
                "Patch preview is ready for review; apply from the changes panel when satisfied."
                    .into(),
            );
        },
        (ConversationScenario::Plan | ConversationScenario::Chat, false) => {
            detail.run.status = AgentRunStatus::Succeeded;
            detail.run.completed_at = Some(now);
            detail.run.summary = Some("Model response complete (no patch in this run).".into());
        },
        (ConversationScenario::CodeEdit, false) => {
            detail.run.status = AgentRunStatus::Ready;
            detail.run.summary = Some(
                "No @file target was parsed; add @file:path to propose a patch, or use Plan/Ask mode."
                    .into(),
            );
        },
    }
    detail.run.updated_at = now;
    detail
}

pub fn abort_run(mut detail: AgentRunDetail) -> AgentRunDetail {
    let now = now_ms();
    detail.run.status = AgentRunStatus::Aborted;
    detail.run.updated_at = now;
    detail.run.completed_at = Some(now);
    detail
}

pub fn mark_applying(mut detail: AgentRunDetail) -> AgentRunDetail {
    detail.run.status = AgentRunStatus::Applying;
    detail.run.summary = Some("Applying accepted patch hunks.".into());
    detail.run.updated_at = now_ms();
    detail
}

pub fn mark_verifying(mut detail: AgentRunDetail) -> AgentRunDetail {
    detail.run.status = AgentRunStatus::Verifying;
    detail.run.summary = Some("Patch applied; running validation.".into());
    detail.run.updated_at = now_ms();
    detail
}

pub fn complete_after_patch(
    mut detail: AgentRunDetail,
    validation: &ValidationResult,
    rolled_back: bool,
) -> AgentRunDetail {
    let now = now_ms();
    detail.run.updated_at = now;
    detail.run.completed_at = Some(now);
    if rolled_back {
        detail.run.status = AgentRunStatus::RolledBack;
        detail.run.summary =
            Some(format!("Validation failed and changes were rolled back: {}", validation.summary));
        return detail;
    }
    detail.run.status = if validation.status == "failed" {
        AgentRunStatus::Failed
    } else {
        AgentRunStatus::Succeeded
    };
    detail.run.summary = Some(match validation.status.as_str() {
        "passed" => format!("Patch applied and validation passed: {}", validation.summary),
        "skipped" => "Patch applied; no validation command was selected.".into(),
        _ => format!("Patch applied but validation failed: {}", validation.summary),
    });
    detail
}

pub fn build_model_messages(
    workspace: &WorkspaceMeta,
    user_prompt: &str,
    scenario: ConversationScenario,
    context: &[ContextEntry],
) -> Vec<ModelChatMessage> {
    let prompt = adl_context::assemble_prompt(scenario, user_prompt, context);
    vec![
        ModelChatMessage {
            role: adl_types::ConversationRole::System,
            content: format!("Workspace: {} ({})", workspace.name, workspace.root_path),
        },
        ModelChatMessage { role: adl_types::ConversationRole::User, content: prompt },
    ]
}

/// Resolves an explicit `@file:path` or a loose `@path/to/file` token to a workspace-relative path.
pub fn target_file_from_prompt(prompt: &str) -> Option<String> {
    for token in prompt.split_whitespace() {
        let token = token.trim_matches(|ch: char| {
            ch == '`' || ch == ',' || ch == '.' || ch == ')' || ch == '>' || ch == '}'
        });
        if let Some(rest) = token.strip_prefix("@file:") {
            let p = rest.trim();
            if !p.is_empty() {
                return Some(p.replace('\\', "/"));
            }
        }
        if let Some(p) = token.strip_prefix('@').filter(|value| {
            !value.is_empty()
                && (value.contains('/')
                    || value.contains('\\')
                    || value
                        .rsplit_once('.')
                        .is_some_and(|(base, ext)| !base.is_empty() && !ext.is_empty()))
        }) {
            if p.starts_with("symbol:") {
                continue;
            }
            return Some(p.replace('\\', "/"));
        }
    }
    None
}

/// For prompt assembly: an `@symbol:name` reference (outline lookup is left to the tool layer).
pub fn target_symbol_from_prompt(prompt: &str) -> Option<String> {
    prompt.split_whitespace().find_map(|token| {
        let t = token.trim_matches(|ch: char| ch == '`' || ch == ',' || ch == '.' || ch == ')');
        t.strip_prefix("@symbol:").map(str::trim).filter(|s| !s.is_empty()).map(String::from)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_file_reference() {
        assert_eq!(
            target_file_from_prompt("please edit @file:src/main.rs"),
            Some("src/main.rs".into())
        );
    }

    #[test]
    fn extracts_symbol_reference() {
        assert_eq!(
            target_symbol_from_prompt("find @symbol:foo_bar in the repo"),
            Some("foo_bar".into())
        );
    }

    #[test]
    fn completes_patch_run_after_rollback() {
        let detail = create_run("w", "s", "edit @file:src/lib.rs", ConversationScenario::CodeEdit);
        let validation = ValidationResult {
            id: "validation_1".into(),
            workspace_id: "w".into(),
            run_id: Some("r".into()),
            patch_set_id: Some("p".into()),
            status: "failed".into(),
            summary: "cargo test failed".into(),
            diagnostics: vec![],
            created_at: now_ms(),
        };
        let detail = complete_after_patch(detail, &validation, true);
        assert_eq!(detail.run.status, AgentRunStatus::RolledBack);
        assert!(detail.run.summary.unwrap().contains("rolled back"));
    }
}
