use crate::outline::OutlineDraft;
use regex::Regex;

pub(crate) fn parse_python_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut indent_stack: Vec<usize> = Vec::new();
    let class_regex = Regex::new(r"^class\s+([A-Za-z_][\w]*)").unwrap();
    let fn_regex = Regex::new(r"^(?:async\s+)?def\s+([A-Za-z_][\w]*)").unwrap();
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let indent = line_text
            .chars()
            .take_while(|ch| ch.is_whitespace())
            .map(|ch| if ch == '\t' { 4 } else { 1 })
            .sum();
        while indent_stack
            .last()
            .copied()
            .is_some_and(|value| indent <= value)
        {
            indent_stack.pop();
        }
        if let Some(captures) = class_regex.captures(trimmed) {
            indent_stack.push(indent);
            drafts.push(OutlineDraft {
                label: captures[1].to_string(),
                kind: "class".to_string(),
                line: index + 1,
                depth: indent_stack.len(),
            });
            continue;
        }
        if let Some(captures) = fn_regex.captures(trimmed) {
            indent_stack.push(indent);
            drafts.push(OutlineDraft {
                label: captures[1].to_string(),
                kind: "function".to_string(),
                line: index + 1,
                depth: indent_stack.len(),
            });
        }
    }
    drafts
}