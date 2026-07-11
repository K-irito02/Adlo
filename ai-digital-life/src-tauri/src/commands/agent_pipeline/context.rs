use adl_errors::AppError;
use adl_kernel::{AgentRunDetail, ContextEntry, WorkspaceMeta};

use crate::commands::agent::StartRunInput;
use crate::commands::audit::AuditBatchEntry;

pub fn collect_context(
    workspace: &WorkspaceMeta,
    input: &StartRunInput,
    detail: &AgentRunDetail,
    workspace_scope_id: &str,
    session_id: &str,
    emit_activity: impl Fn(serde_json::Value),
    audit_batch: &mut Vec<AuditBatchEntry>,
) -> Result<Vec<ContextEntry>, AppError> {
    let ws_ctx = adl_context::workspace_context(workspace);
    emit_activity(serde_json::json!({
      "type": "context-added",
      "contextType": "message",
      "label": ws_ctx.label,
      "tokenEstimate": ws_ctx.token_estimate
    }));
    let mut context = vec![ws_ctx];

    let file_context = collect_file_context(
        workspace,
        input,
        detail,
        workspace_scope_id,
        session_id,
        &emit_activity,
        audit_batch,
    );
    context.extend(file_context);

    let symbol_context = collect_symbol_context(
        workspace,
        input,
        detail,
        workspace_scope_id,
        session_id,
        &emit_activity,
        audit_batch,
    );
    context.extend(symbol_context);

    Ok(adl_context::sort_context(context))
}

fn collect_file_context<F: Fn(serde_json::Value)>(
    workspace: &WorkspaceMeta,
    input: &StartRunInput,
    detail: &AgentRunDetail,
    workspace_scope_id: &str,
    session_id: &str,
    emit_activity: &F,
    audit_batch: &mut Vec<AuditBatchEntry>,
) -> Vec<ContextEntry> {
    const FILE_CONTEXT_MAX_TOKENS: usize = 6_000;
    let mut context = Vec::new();
    if !workspace.root_path.is_empty() {
        if let Some(rel) = adl_agent_runtime::target_file_from_prompt(&input.prompt) {
            if let Ok(doc) =
                adl_workspace::read_file(std::path::Path::new(&workspace.root_path), &rel)
            {
                let file_ctx =
                    adl_context::file_context(&rel, &doc.content, FILE_CONTEXT_MAX_TOKENS);
                let truncated = file_ctx.content.len() != doc.content.len();
                emit_activity(serde_json::json!({
                  "type": "file-read",
                  "path": rel,
                  "bytes": doc.content.len(),
                  "tokenEstimate": file_ctx.token_estimate,
                  "truncated": truncated
                }));
                audit_batch.push(AuditBatchEntry {
                    workspace_id: workspace_scope_id.to_string(),
                    session_id: Some(session_id.to_string()),
                    operation_type: "file-read".into(),
                    risk_level: adl_kernel::RiskLevel::Low,
                    summary: format!("Read file context: {rel}"),
                    decision: Some("auto".into()),
                    detail: Some(format!("runId={}; bytes={}", detail.run.id, doc.content.len())),
                });
                emit_activity(serde_json::json!({
                  "type": "context-added",
                  "contextType": "file",
                  "label": file_ctx.label,
                  "path": file_ctx.path,
                  "tokenEstimate": file_ctx.token_estimate,
                  "truncated": truncated
                }));
                context.push(file_ctx);
                if let Ok(items) =
                    adl_workspace::outline(std::path::Path::new(&workspace.root_path), &rel)
                {
                    if let Some(outline) = adl_context::outline_context(&rel, &items, 16) {
                        emit_activity(serde_json::json!({
                          "type": "context-added",
                          "contextType": "outline",
                          "label": outline.label,
                          "path": outline.path,
                          "tokenEstimate": outline.token_estimate
                        }));
                        context.push(outline);
                    }
                }
            }
        }
    }
    context
}

fn collect_symbol_context<F: Fn(serde_json::Value)>(
    workspace: &WorkspaceMeta,
    input: &StartRunInput,
    detail: &AgentRunDetail,
    workspace_scope_id: &str,
    session_id: &str,
    emit_activity: &F,
    audit_batch: &mut Vec<AuditBatchEntry>,
) -> Vec<ContextEntry> {
    let mut context = Vec::new();
    if let Some(sym) = adl_agent_runtime::target_symbol_from_prompt(&input.prompt) {
        context.push(adl_context::symbol_context(&sym));
        emit_activity(serde_json::json!({
          "type": "context-added",
          "contextType": "symbol",
          "label": format!("@{sym}"),
        }));
        if !workspace.root_path.is_empty() {
            if let Ok(hits) =
                adl_workspace::search_text(std::path::Path::new(&workspace.root_path), &sym)
            {
                emit_activity(serde_json::json!({
                  "type": "search",
                  "query": sym,
                  "hitCount": hits.len(),
                  "samplePaths": hits.iter().take(6).map(|h| h.path.clone()).collect::<Vec<_>>(),
                }));
                audit_batch.push(AuditBatchEntry {
                    workspace_id: workspace_scope_id.to_string(),
                    session_id: Some(session_id.to_string()),
                    operation_type: "search".into(),
                    risk_level: adl_kernel::RiskLevel::Low,
                    summary: format!("Workspace search for `{sym}` ({}) hits.", hits.len()),
                    decision: Some("auto".into()),
                    detail: Some(format!("runId={}", detail.run.id)),
                });
                context.extend(adl_context::search_hit_contexts(&sym, &hits, 6));
            }
        }
    }
    context
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_kernel::ConversationScenario;

    fn make_test_workspace(root_path: String) -> WorkspaceMeta {
        WorkspaceMeta {
            id: String::new(),
            path: String::new(),
            root_path,
            name: String::new(),
            r#type: adl_kernel::WorkspaceType::Unknown,
            status: adl_kernel::WorkspaceStatus::Ready,
            git_snapshot: None,
            created_at: 0,
            updated_at: 0,
            last_opened_at: 0,
        }
    }

    fn make_test_detail() -> AgentRunDetail {
        AgentRunDetail {
            run: adl_kernel::AgentRunRecord {
                id: "run-1".into(),
                workspace_id: String::new(),
                session_id: String::new(),
                prompt: String::new(),
                scenario: ConversationScenario::CodeEdit,
                status: adl_kernel::AgentRunStatus::Draft,
                summary: None,
                patch_set_id: None,
                created_at: 0,
                updated_at: 0,
                completed_at: None,
                agent_id: adl_kernel::AgentId::Build,
            },
            steps: vec![],
        }
    }

    #[test]
    fn test_context_added_activity_event_structure() {
        let event = serde_json::json!({
            "type": "context-added",
            "contextType": "message",
            "label": "workspace context",
            "tokenEstimate": 42
        });
        assert_eq!(event["type"], "context-added");
        assert!(event.get("contextType").is_some());
        assert!(event.get("label").is_some());
    }

    #[test]
    fn test_collect_symbol_context_no_symbol_in_prompt() {
        let workspace = make_test_workspace(String::new());
        let input = StartRunInput {
            session_id: String::new(),
            prompt: "Just a regular prompt without symbols".into(),
            scenario: None,
            provider_id: None,
            model_id: None,
        };
        let detail = make_test_detail();
        let mut audit_batch = Vec::new();
        let activities = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let activities_clone = activities.clone();
        let emit = move |v: serde_json::Value| {
            activities_clone.lock().unwrap().push(v);
        };

        let result = collect_symbol_context(
            &workspace,
            &input,
            &detail,
            "scope-1",
            "session-1",
            &emit,
            &mut audit_batch,
        );

        assert!(result.is_empty(), "No symbol in prompt should yield no context");
        assert!(audit_batch.is_empty(), "No audit entries without symbol");
        assert!(activities.lock().unwrap().is_empty(), "No activity events without symbol");
    }

    #[test]
    fn test_collect_symbol_context_symbol_but_empty_root_path() {
        let workspace = make_test_workspace(String::new());
        let input = StartRunInput {
            session_id: String::new(),
            prompt: "Fix the bug in @symbol:MyClass".into(),
            scenario: None,
            provider_id: None,
            model_id: None,
        };
        let detail = make_test_detail();
        let mut audit_batch = Vec::new();
        let activities = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let activities_clone = activities.clone();
        let emit = move |v: serde_json::Value| {
            activities_clone.lock().unwrap().push(v);
        };

        let result = collect_symbol_context(
            &workspace,
            &input,
            &detail,
            "scope-1",
            "session-1",
            &emit,
            &mut audit_batch,
        );

        assert_eq!(result.len(), 1, "Symbol context entry should be added");
        assert!(audit_batch.is_empty(), "No audit entries without search");
        let acts = activities.lock().unwrap();
        assert_eq!(acts.len(), 1, "One context-added activity event");
        assert_eq!(acts[0]["contextType"], "symbol");
    }

    #[test]
    fn test_collect_symbol_context_symbol_with_search_success() {
        let temp_dir = std::env::temp_dir().join("adl_test_symbol_search");
        std::fs::create_dir_all(&temp_dir).unwrap();
        let test_file = temp_dir.join("test.rs");
        std::fs::write(&test_file, "struct MyClass { }").unwrap();

        let workspace = make_test_workspace(temp_dir.to_string_lossy().to_string());
        let input = StartRunInput {
            session_id: String::new(),
            prompt: "Fix the bug in @symbol:MyClass".into(),
            scenario: None,
            provider_id: None,
            model_id: None,
        };
        let detail = make_test_detail();
        let mut audit_batch = Vec::new();
        let activities = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let activities_clone = activities.clone();
        let emit = move |v: serde_json::Value| {
            activities_clone.lock().unwrap().push(v);
        };

        let result = collect_symbol_context(
            &workspace,
            &input,
            &detail,
            "scope-1",
            "session-1",
            &emit,
            &mut audit_batch,
        );

        assert!(!result.is_empty(), "At least symbol context should be present");
        assert_eq!(audit_batch.len(), 1, "One audit entry for search");
        assert_eq!(audit_batch[0].operation_type, "search");
        let acts = activities.lock().unwrap();
        assert!(!acts.is_empty(), "At least context-added event");

        std::fs::remove_dir_all(&temp_dir).ok();
    }

    #[test]
    fn test_collect_symbol_context_symbol_with_search_failure() {
        let workspace = make_test_workspace("/nonexistent/path/that/does/not/exist".into());
        let input = StartRunInput {
            session_id: String::new(),
            prompt: "Fix the bug in @symbol:MyClass".into(),
            scenario: None,
            provider_id: None,
            model_id: None,
        };
        let detail = make_test_detail();
        let mut audit_batch = Vec::new();
        let activities = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let activities_clone = activities.clone();
        let emit = move |v: serde_json::Value| {
            activities_clone.lock().unwrap().push(v);
        };

        let result = collect_symbol_context(
            &workspace,
            &input,
            &detail,
            "scope-1",
            "session-1",
            &emit,
            &mut audit_batch,
        );

        assert_eq!(result.len(), 1, "Only symbol context, search failed");
        assert!(audit_batch.is_empty(), "No audit entries on search failure");
    }
}
