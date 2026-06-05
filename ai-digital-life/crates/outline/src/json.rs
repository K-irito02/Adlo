use crate::{count_leading_closers, update_brace_depth, OutlineDraft};
use regex::Regex;
use std::sync::OnceLock;

fn key_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"^"([^"]+)"\s*:\s*(.*)$"#).unwrap())
}

pub(crate) fn parse_json_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut brace_depth = 0usize;
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() {
            continue;
        }
        let sanitized = line_text.replace('"', "");
        let effective_depth =
            brace_depth.saturating_sub(count_leading_closers(&sanitized, &['}', ']']));
        if let Some(captures) = key_regex().captures(trimmed) {
            let value = captures.get(2).map(|capture| capture.as_str().trim()).unwrap_or("");
            if value.is_empty() || value.starts_with('{') || value.starts_with('[') {
                drafts.push(OutlineDraft {
                    label: captures[1].to_string(),
                    kind: "heading".to_string(),
                    line: index + 1,
                    depth: effective_depth + 1,
                });
            }
        }
        brace_depth = update_brace_depth(brace_depth, &sanitized);
    }
    drafts
}
