//! Builds conversation blocks for an agent run.

use adl_types::{
    AgentRunDetail, ConversationBlock, ConversationScenario, PatchSet, PlanConversationItem,
    create_id,
};

pub fn assistant_blocks(
    detail: &AgentRunDetail,
    patch_set: Option<&PatchSet>,
    scenario: ConversationScenario,
) -> Vec<ConversationBlock> {
    let plan_title = match scenario {
        ConversationScenario::Plan => "Plan execution",
        ConversationScenario::Chat => "Chat",
        ConversationScenario::CodeEdit => "Single agent step",
    };
    let mut blocks = vec![ConversationBlock::Plan {
        id: create_id("block"),
        title: plan_title.into(),
        items: detail
            .steps
            .iter()
            .map(|step| PlanConversationItem {
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
    let final_text = if patch_set.is_some() {
        "Patch preview generated on the right; review and apply in the changes panel.".into()
    } else {
        match scenario {
            ConversationScenario::CodeEdit => {
                "No patch generated: use @file:relative-path to reference workspace files, or switch to Plan/QA mode."
                    .into()
            },
            _ => "No patch output for this turn.".into(),
        }
    };
    blocks.push(ConversationBlock::FinalSummary { id: create_id("block"), summary: final_text });
    blocks
}
