use crate::OutlineDraft;

pub(crate) fn parse_markdown_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut in_fence = false;
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim_start();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence || !trimmed.starts_with('#') {
            continue;
        }
        let depth = trimmed.chars().take_while(|ch| *ch == '#').count().min(6);
        let has_required_space = trimmed
            .chars()
            .nth(depth)
            .map(|ch| ch.is_whitespace())
            .unwrap_or(false);
        if !has_required_space {
            continue;
        }
        let label = crate::clean_markdown_heading_label(&trimmed[depth..]);
        if label.is_empty() {
            continue;
        }
        drafts.push(OutlineDraft {
            label: label.to_string(),
            kind: "heading".to_string(),
            line: index + 1,
            depth,
        });
    }
    drafts
}
