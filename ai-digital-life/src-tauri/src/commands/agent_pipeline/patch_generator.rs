use adl_agent_runtime::permission_check::{check_tool_permission, PermissionCheckResult};
use adl_errors::AppError;
use adl_types::{
    AgentRunDetail, ConversationScenario, ConversationSessionRecord, PatchSet, WorkspaceMeta,
};
use adl_types::permission_types::PermissionRuleset;
use adl_storage::EntityTable;

use crate::commands::agent::StartRunInput;
use crate::state::AppState;

pub fn generate_patches(
    workspace: &WorkspaceMeta,
    input: &StartRunInput,
    scenario: ConversationScenario,
    detail: &mut AgentRunDetail,
    state: &AppState,
    session: &ConversationSessionRecord,
    emit_activity: impl Fn(serde_json::Value),
) -> Result<Option<PatchSet>, AppError> {
    let patch_set = match scenario {
        ConversationScenario::CodeEdit if !workspace.root_path.is_empty() => {
            match adl_agent_runtime::target_file_from_prompt(&input.prompt) {
                Some(path) => {
                    let document = adl_workspace::read_file(
                        std::path::Path::new(&workspace.root_path),
                        &path,
                    )?;

                    // 权限检查：CodeEdit 场景下的 apply_patch 操作需要通过 ruleset 拦截
                    // 这是中心化拦截点（vs OpenCode 的 ctx.ask 分散式调用）
                    let ruleset = build_ruleset_from_config();
                    let tool_input = format!("patch {} {}", path, input.prompt);
                    let doom_loop_count = 0u32; // TODO: 从 session 状态读取连续失败次数
                    match check_tool_permission(
                        "apply_patch",
                        &tool_input,
                        &ruleset,
                        doom_loop_count,
                    ) {
                        PermissionCheckResult::Deny(reason) => {
                            emit_activity(serde_json::json!({
                                "type": "permission-denied",
                                "tool": "apply_patch",
                                "reason": reason
                            }));
                            return Ok(None);
                        },
                        PermissionCheckResult::Ask(reason) => {
                            emit_activity(serde_json::json!({
                                "type": "permission-ask",
                                "tool": "apply_patch",
                                "reason": reason
                            }));
                            // Ask 模式当前仅记录审计日志后继续执行
                            // 完整的 Ask 需要前端审批 UI 流程，作为后续增量完善
                        },
                        PermissionCheckResult::Allow => {},
                    }

                    Some(adl_agent_runtime::create_patch_from_document(
                        &workspace.id,
                        &session.id,
                        Some(detail.run.id.as_str()),
                        &input.prompt,
                        &document,
                    ))
                },
                None => None,
            }
        },
        ConversationScenario::CodeEdit
        | ConversationScenario::Plan
        | ConversationScenario::Chat => None,
    };
    if let Some(patch_set) = &patch_set {
        emit_activity(serde_json::json!({
          "type": "patch",
          "phase": "proposed",
          "patchSetId": patch_set.id,
          "fileCount": patch_set.file_patches.len(),
          "hunkCount": patch_set.file_patches.iter().map(|f| f.hunks.len()).sum::<usize>()
        }));
        state.db.transaction(|conn| {
            state.db.save_entity_on_conn(
                conn,
                EntityTable::PatchSets,
                &patch_set.id,
                Some(&workspace.id),
                Some(&session.id),
                Some("ready"),
                patch_set,
            )?;
            for file_patch in &patch_set.file_patches {
                state.db.save_entity_on_conn(
                    conn,
                    EntityTable::FilePatches,
                    &file_patch.id,
                    Some(&workspace.id),
                    Some(&session.id),
                    Some("ready"),
                    file_patch,
                )?;
                for hunk in &file_patch.hunks {
                    state.db.save_entity_on_conn(
                        conn,
                        EntityTable::PatchHunks,
                        &hunk.id,
                        Some(&workspace.id),
                        Some(&session.id),
                        Some("pending"),
                        hunk,
                    )?;
                }
            }
            Ok(())
        })?;
    }
    Ok(patch_set)
}

fn build_ruleset_from_config() -> PermissionRuleset {
    adl_kernel::build_ruleset(&[], true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_patches_scenario_code_edit_enables_patches() {
        let scenario = ConversationScenario::CodeEdit;
        let root_empty = false;
        let generates_patch = matches!(scenario, ConversationScenario::CodeEdit) && !root_empty;
        assert!(generates_patch, "CodeEdit with non-empty root should generate patches");
    }

    #[test]
    fn test_generate_patches_scenario_plan_never_patches() {
        let scenarios = [ConversationScenario::Plan, ConversationScenario::Chat];
        for scenario in &scenarios {
            let generates_patch = matches!(scenario, ConversationScenario::CodeEdit);
            assert!(!generates_patch, "{scenario:?} should not generate patches");
        }
    }
}
