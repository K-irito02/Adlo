//! Context selection and prompt assembly for agent requests.

pub mod references;

use adl_kernel::{
    create_id, estimate_tokens, ContextEntry, ConversationScenario, FileOutlineItem, PromptRule,
    WorkspaceMeta, WorkspaceSearchHit,
};

// ── Context selection (from context-engine) ──

pub fn trim_to_token_budget(content: &str, max_tokens: usize) -> String {
    if estimate_tokens(content) <= max_tokens {
        return content.to_string();
    }
    let max_chars = max_tokens.saturating_mul(4);
    let head_end =
        content.char_indices().nth(max_chars / 2).map(|(i, _)| i).unwrap_or(content.len());
    let split_idx = content
        .char_indices()
        .nth_back(max_chars.saturating_sub(1) / 2)
        .map(|(i, _)| i)
        .unwrap_or(content.len());
    let trim_msg = "\n...[context trimmed]...\n";
    let mut result = String::with_capacity(head_end + trim_msg.len() + (content.len() - split_idx));
    result.push_str(&content[..head_end]);
    result.push_str(trim_msg);
    result.push_str(&content[split_idx..]);
    result
}

pub fn workspace_context(workspace: &WorkspaceMeta) -> ContextEntry {
    let content = format!(
        "Workspace: {}\nRoot: {}\nType: {:?}\nStatus: {:?}",
        workspace.name, workspace.root_path, workspace.r#type, workspace.status
    );
    ContextEntry {
        id: create_id("ctx"),
        r#type: "message".into(),
        label: "Workspace summary".into(),
        token_estimate: estimate_tokens(&content),
        content,
        path: None,
    }
}

pub fn file_context(path: &str, content: &str, max_tokens: usize) -> ContextEntry {
    let trimmed = trim_to_token_budget(content, max_tokens);
    ContextEntry {
        id: create_id("ctx"),
        r#type: "file".into(),
        label: path.to_string(),
        token_estimate: estimate_tokens(&trimmed),
        content: trimmed,
        path: Some(path.to_string()),
    }
}

/// Explicit `@symbol:` reference: content for the model; resolution is done via search/outline tools.
pub fn symbol_context(symbol_name: &str) -> ContextEntry {
    let content = format!(
        "The user explicitly referenced symbol `{symbol_name}`. Prefer workspace search and outline to locate definitions."
    );
    ContextEntry {
        id: create_id("ctx"),
        r#type: "symbol".into(),
        label: format!("@{symbol_name}"),
        token_estimate: estimate_tokens(&content),
        content,
        path: None,
    }
}

pub fn outline_context(
    path: &str,
    items: &[FileOutlineItem],
    max_items: usize,
) -> Option<ContextEntry> {
    if items.is_empty() {
        return None;
    }
    let content = items
        .iter()
        .take(max_items)
        .map(|item| format!("- [{}] {}:{}", item.kind, item.label, item.line))
        .collect::<Vec<_>>()
        .join("\n");
    Some(ContextEntry {
        id: create_id("ctx"),
        r#type: "outline".into(),
        label: format!("Outline: {path}"),
        token_estimate: estimate_tokens(&content),
        content,
        path: Some(path.to_string()),
    })
}

pub fn search_hit_contexts(
    query: &str,
    hits: &[WorkspaceSearchHit],
    max_hits: usize,
) -> Vec<ContextEntry> {
    hits.iter()
        .take(max_hits)
        .map(|hit| {
            let content =
                format!("Search hit for `{query}`\n{}:{}\n{}", hit.path, hit.line, hit.preview);
            ContextEntry {
                id: create_id("ctx"),
                r#type: "search-hit".into(),
                label: format!("{}:{}", hit.path, hit.line),
                token_estimate: estimate_tokens(&content),
                content,
                path: Some(hit.path.clone()),
            }
        })
        .collect()
}

pub fn sort_context(mut entries: Vec<ContextEntry>) -> Vec<ContextEntry> {
    entries.sort_by_key(|entry| match entry.r#type.as_str() {
        "message" => 0,
        "file" => 1,
        "symbol" => 2,
        "outline" => 3,
        "search-hit" => 4,
        _ => 5,
    });
    entries
}

// ── Prompt assembly (from prompt-engine) ──

pub fn default_rules(scenario: ConversationScenario) -> Vec<PromptRule> {
    vec![
        PromptRule {
            id: "platform-safety".into(),
            kind: "platform".into(),
            content: "You are the backend planner for a desktop-first coding assistant. Use Patch First. Do not claim files were written unless a patch application step succeeds. High-risk actions require approval.".into(),
        },
        PromptRule {
            id: "project-tauri".into(),
            kind: "project".into(),
            content: "The project is Rust + Tauri 2.x. WebView cannot access filesystem, processes, SQL, or model secrets directly. Use typed Tauri commands and least-privilege capabilities.".into(),
        },
        PromptRule {
            id: "phase-scenario".into(),
            kind: "workflow-phase".into(),
            content: match scenario {
                ConversationScenario::Plan => "Return a concise structured plan with risk labels.".into(),
                ConversationScenario::Chat => "Answer concisely and cite relevant context.".into(),
                ConversationScenario::CodeEdit => {
                    "Prefer a small patch proposal with validation instructions.".into()
                }
            },
        },
        PromptRule {
            id: "tool-contract".into(),
            kind: "tool-contract".into(),
            content: "Available tools are read_file, list_tree, search, outline, create_patch, apply_patch, rollback_patch, and run_command. Side effects are governed.".into(),
        },
    ]
}

pub fn assemble_prompt(
    scenario: ConversationScenario,
    user_prompt: &str,
    context: &[ContextEntry],
) -> String {
    let mut output = String::new();
    for rule in default_rules(scenario) {
        output.push_str(&format!("[{}]\n{}\n\n", rule.kind, rule.content));
    }
    output.push_str("[user]\n");
    output.push_str(user_prompt);
    output.push_str("\n\n[reference-material]\n");
    for entry in context {
        output.push_str(&format!("## {}\n{}\n\n", entry.label, entry.content));
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Context engine tests ──

    #[test]
    fn trims_long_context() {
        let content = "a".repeat(10_000);
        let trimmed = trim_to_token_budget(&content, 100);
        assert!(estimate_tokens(&trimmed) < estimate_tokens(&content));
        assert!(trimmed.contains("context trimmed"));
    }

    #[test]
    fn builds_search_hit_contexts() {
        let entries = search_hit_contexts(
            "foo",
            &[WorkspaceSearchHit {
                path: "src/lib.rs".into(),
                line: 12,
                preview: "fn foo() {}".into(),
            }],
            4,
        );
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].r#type, "search-hit");
        assert!(entries[0].content.contains("foo"));
    }

    // ── Prompt engine tests ──

    #[test]
    fn platform_rule_precedes_user_content() {
        let prompt = assemble_prompt(ConversationScenario::CodeEdit, "change files", &[]);
        assert!(prompt.find("platform").unwrap() < prompt.find("[user]").unwrap());
    }
}
