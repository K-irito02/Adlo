use crate::outline::OutlineDraft;
use regex::Regex;

pub(crate) fn parse_vue_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let open_regex = Regex::new(r"^\s*<(template|script|style)([^>]*)>").unwrap();
    let mut index = 0usize;
    while index < lines.len() {
        let line = lines[index];
        let Some(captures) = open_regex.captures(line) else {
            index += 1;
            continue;
        };
        let section = captures
            .get(1)
            .map(|value| value.as_str().to_ascii_lowercase())
            .unwrap_or_else(|| "script".to_string());
        let start_line = index + 1;
        let end_tag = format!("</{section}>");
        let mut end_index = index + 1;
        while end_index < lines.len() && !lines[end_index].to_ascii_lowercase().contains(&end_tag) {
            end_index += 1;
        }
        drafts.push(OutlineDraft {
            label: section.clone(),
            kind: "heading".to_string(),
            line: start_line,
            depth: 1,
        });
        let inner_content = lines[index + 1..end_index].join("\n");
        let inner_drafts = if section == "template" {
            super::html::parse_html_outline(&inner_content)
        } else if section == "style" {
            super::css::parse_css_outline(&inner_content)
        } else {
            super::brace::parse_brace_outline(&inner_content)
        };
        drafts.extend(inner_drafts.into_iter().map(|draft| OutlineDraft {
            line: draft.line + start_line,
            depth: draft.depth + 1,
            ..draft
        }));
        index = end_index + 1;
    }
    drafts
}