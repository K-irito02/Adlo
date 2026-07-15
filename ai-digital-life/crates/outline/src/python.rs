use crate::{calc_indent, OutlineDraft};
use regex::Regex;
use std::sync::OnceLock;

fn class_regex() -> &'static Regex {
    static CLASS_REGEX: OnceLock<Regex> = OnceLock::new();
    CLASS_REGEX.get_or_init(|| Regex::new(r"^class\s+([A-Za-z_][\w]*)").unwrap())
}

fn fn_regex() -> &'static Regex {
    static FN_REGEX: OnceLock<Regex> = OnceLock::new();
    FN_REGEX.get_or_init(|| Regex::new(r"^(?:async\s+)?def\s+([A-Za-z_][\w]*)").unwrap())
}

pub(crate) fn parse_python_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut indent_stack: Vec<usize> = Vec::new();
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let indent = calc_indent(line_text, 4);
        while indent_stack.last().copied().is_some_and(|value| indent <= value) {
            indent_stack.pop();
        }
        if let Some(captures) = class_regex().captures(trimmed) {
            indent_stack.push(indent);
            drafts.push(OutlineDraft {
                label: captures[1].to_string(),
                kind: "class",
                line: index + 1,
                depth: indent_stack.len(),
            });
            continue;
        }
        if let Some(captures) = fn_regex().captures(trimmed) {
            indent_stack.push(indent);
            drafts.push(OutlineDraft {
                label: captures[1].to_string(),
                kind: "function",
                line: index + 1,
                depth: indent_stack.len(),
            });
        }
    }
    drafts
}
