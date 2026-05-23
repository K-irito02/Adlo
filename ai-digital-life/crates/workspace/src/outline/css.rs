use crate::outline::{count_chars, OutlineDraft};

pub(crate) fn parse_css_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut brace_depth = 0usize;
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with("/*") || trimmed.starts_with('*') {
            continue;
        }
        if let Some(open_index) = line_text.find('{') {
            let label = line_text[..open_index].trim();
            if !label.is_empty() && !label.contains(':') {
                drafts.push(OutlineDraft {
                    label: label.to_string(),
                    kind: "heading".to_string(),
                    line: index + 1,
                    depth: brace_depth + 1,
                });
            }
        }
        brace_depth = brace_depth
            .saturating_add(count_chars(line_text, &['{']))
            .saturating_sub(count_chars(line_text, &['}']));
    }
    drafts
}