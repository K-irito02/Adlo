//! Context selection for agent requests.

use adl_kernel::{create_id, ContextEntry, WorkspaceMeta};

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

pub fn sort_context(mut entries: Vec<ContextEntry>) -> Vec<ContextEntry> {
    entries.sort_by_key(|entry| match entry.r#type.as_str() {
        "message" => 0,
        "file" => 1,
        "outline" => 2,
        "search-hit" => 3,
        _ => 4,
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
}
