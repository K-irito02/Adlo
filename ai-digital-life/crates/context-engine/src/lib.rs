//! Context selection for agent requests.

use adl_kernel::{create_id, ContextEntry, FileOutlineItem, WorkspaceMeta, WorkspaceSearchHit};

pub fn estimate_tokens(content: &str) -> usize {
    content.chars().count().div_ceil(4)
}

pub fn trim_to_token_budget(content: &str, max_tokens: usize) -> String {
    if estimate_tokens(content) <= max_tokens {
        return content.to_string();
    }
    let max_chars = max_tokens.saturating_mul(4);
    let head: String = content.chars().take(max_chars / 2).collect();
    let tail: String = content
        .chars()
        .rev()
        .take(max_chars / 2)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    format!("{head}\n...[context trimmed]...\n{tail}")
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

pub fn outline_context(path: &str, items: &[FileOutlineItem], max_items: usize) -> Option<ContextEntry> {
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

pub fn search_hit_contexts(query: &str, hits: &[WorkspaceSearchHit], max_hits: usize) -> Vec<ContextEntry> {
    hits.iter()
        .take(max_hits)
        .map(|hit| {
            let content = format!("Search hit for `{query}`\n{}:{}\n{}", hit.path, hit.line, hit.preview);
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
