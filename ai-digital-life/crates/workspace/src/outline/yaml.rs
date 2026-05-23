use crate::outline::OutlineDraft;
use regex::Regex;

pub(crate) fn parse_yaml_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut indent_stack: Vec<usize> = Vec::new();
    let list_key_regex = Regex::new(r"^-+\s*([^:#]+)\s*:\s*(.*)$").unwrap();
    let key_regex = Regex::new(r"^([^:#][^:]*?)\s*:\s*(.*)$").unwrap();
    let list_regex = Regex::new(r"^-+\s*(?:\{|\[)?\s*$").unwrap();
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let indent = line_text
            .chars()
            .take_while(|ch| ch.is_whitespace())
            .map(|ch| if ch == '\t' { 2 } else { 1 })
            .sum();
        while indent_stack
            .last()
            .copied()
            .is_some_and(|value| indent <= value)
        {
            indent_stack.pop();
        }
        if let Some(captures) = list_key_regex.captures(trimmed) {
            indent_stack.push(indent);
            drafts.push(OutlineDraft {
                label: format!("- {}", captures[1].trim()),
                kind: "heading".to_string(),
                line: index + 1,
                depth: indent_stack.len(),
            });
            continue;
        }
        if let Some(captures) = key_regex.captures(trimmed) {
            let suffix = captures
                .get(2)
                .map(|value| value.as_str().trim())
                .unwrap_or("");
            if !suffix.is_empty()
                && suffix != "|"
                && suffix != ">"
                && !suffix.starts_with('{')
                && !suffix.starts_with('[')
            {
                continue;
            }
            indent_stack.push(indent);
            drafts.push(OutlineDraft {
                label: captures[1]
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'')
                    .to_string(),
                kind: "heading".to_string(),
                line: index + 1,
                depth: indent_stack.len(),
            });
            continue;
        }
        if list_regex.is_match(trimmed) {
            indent_stack.push(indent);
            drafts.push(OutlineDraft {
                label: "- item".to_string(),
                kind: "heading".to_string(),
                line: index + 1,
                depth: indent_stack.len(),
            });
        }
    }
    drafts
}