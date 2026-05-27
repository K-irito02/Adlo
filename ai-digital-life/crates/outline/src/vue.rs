use crate::OutlineDraft;
use regex::Regex;
use std::sync::OnceLock;

fn open_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\s*<(template|script|style)([^>]*)>").unwrap())
}

pub(crate) fn parse_vue_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let mut line_offsets: Vec<usize> = Vec::with_capacity(lines.len());

    {
        let mut offset = 0usize;
        for line in &lines {
            line_offsets.push(offset);
            offset += line.len() + 1;
        }
    }

    let mut index = 0usize;
    while index < lines.len() {
        let line = lines[index];
        let Some(captures) = open_regex().captures(line) else {
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
        while end_index < lines.len()
            && !lines[end_index].to_ascii_lowercase().contains(&end_tag)
        {
            end_index += 1;
        }

        drafts.push(OutlineDraft {
            label: section.clone(),
            kind: "heading".to_string(),
            line: start_line,
            depth: 1,
        });

        if end_index > index + 1 {
            let inner_start = line_offsets[index + 1];
            let inner_end = if end_index < lines.len() {
                line_offsets[end_index].saturating_sub(1)
            } else {
                content.len()
            };
            let inner_content = &content[inner_start..inner_end.min(content.len())];

            let inner_drafts = match section.as_str() {
                "template" => crate::html::parse_html_outline(inner_content),
                "style" => crate::css::parse_css_outline(inner_content),
                _ => crate::brace::parse_brace_outline(inner_content),
            };
            drafts.extend(inner_drafts.into_iter().map(|draft| OutlineDraft {
                line: draft.line + start_line,
                depth: draft.depth + 1,
                ..draft
            }));
        }
        index = end_index + 1;
    }
    drafts
}
