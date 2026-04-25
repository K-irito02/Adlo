//! Single-agent sequential planning runtime.

use adl_kernel::{
    create_id, now_ms, AgentPlanStep, AgentRunDetail, AgentRunRecord, AgentRunStatus, ContextEntry,
    ConversationBlock, ConversationScenario, ModelChatMessage, PatchSet, WorkspaceFileDocument,
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
    let steps = [
        "Understand request",
        "Collect context",
        "Generate patch preview",
    ]
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
        },
        steps,
    }
}

pub fn complete_plan(mut detail: AgentRunDetail, patch_set: Option<&PatchSet>) -> AgentRunDetail {
    let now = now_ms();
    for step in &mut detail.steps {
        step.status = "completed".into();
        step.updated_at = now;
    }
    detail.run.status = AgentRunStatus::Ready;
    detail.run.summary = Some("Plan and patch preview are ready for review.".into());
    detail.run.patch_set_id = patch_set.map(|patch_set| patch_set.id.clone());
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

pub fn build_model_messages(
    workspace: &WorkspaceMeta,
    user_prompt: &str,
    scenario: ConversationScenario,
    context: &[ContextEntry],
) -> Vec<ModelChatMessage> {
    let prompt = adl_prompt_engine::assemble_prompt(scenario, user_prompt, context);
    vec![
        ModelChatMessage {
            role: adl_kernel::ConversationRole::System,
            content: format!("Workspace: {} ({})", workspace.name, workspace.root_path),
        },
        ModelChatMessage {
            role: adl_kernel::ConversationRole::User,
            content: prompt,
        },
    ]
}

pub fn target_file_from_prompt(prompt: &str) -> Option<String> {
    prompt.split_whitespace().find_map(|token| {
        let token = token.trim_matches(|ch: char| ch == '`' || ch == ',' || ch == '.' || ch == ')');
        token
            .strip_prefix("@file:")
            .or_else(|| token.strip_prefix('@'))
            .filter(|value| value.contains('/') || value.contains('\\') || value.contains('.'))
            .map(|value| value.replace('\\', "/"))
    })
}

pub fn create_patch_from_document(
    workspace_id: &str,
    session_id: &str,
    run_id: Option<String>,
    prompt: &str,
    document: &WorkspaceFileDocument,
) -> PatchSet {
    let note = format!("// AI Digital Life task: {}\n", prompt.trim());
    let after = if document.content.starts_with(&note) {
        document.content.clone()
    } else {
        format!("{note}{}", document.content)
    };
    adl_change_engine::create_single_file_patch_set(adl_change_engine::PatchProposal {
        workspace_id,
        session_id,
        run_id,
        relative_path: &document.path,
        before_content: &document.content,
        after_content: &after,
        title: format!("Update {}", document.path),
        summary: format!("Patch preview for {}", document.path),
    })
}

pub fn assistant_blocks(
    detail: &AgentRunDetail,
    patch_set: Option<&PatchSet>,
) -> Vec<ConversationBlock> {
    let mut blocks = vec![ConversationBlock::Plan {
        id: create_id("block"),
        title: "Single Agent Plan".into(),
        items: detail
            .steps
            .iter()
            .map(|step| adl_kernel::PlanConversationItem {
                id: step.id.clone(),
                title: step.title.clone(),
                detail: step.detail.clone(),
                status: step.status.clone(),
            })
            .collect(),
    }];
    if let Some(patch_set) = patch_set {
        blocks.push(ConversationBlock::PatchSummary {
            id: create_id("block"),
            patch_set_id: patch_set.id.clone(),
            summary: patch_set.summary.clone(),
            file_count: patch_set.file_patches.len(),
            hunk_count: patch_set
                .file_patches
                .iter()
                .map(|file_patch| file_patch.hunks.len())
                .sum(),
        });
    }
    blocks.push(ConversationBlock::FinalSummary {
        id: create_id("block"),
        summary: "Patch First preview generated; apply remains explicit.".into(),
    });
    blocks
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
}
