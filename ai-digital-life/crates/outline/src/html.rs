use crate::OutlineDraft;
use regex::Regex;
use std::sync::OnceLock;

fn should_outline_html_tag(tag: &str, attrs: &str) -> bool {
    const STRUCTURAL: &[&str] = &[
        "html",
        "head",
        "body",
        "main",
        "header",
        "footer",
        "section",
        "article",
        "aside",
        "nav",
        "details",
        "summary",
        "dialog",
        "form",
        "fieldset",
        "div",
        "template",
        "script",
        "style",
        "table",
        "thead",
        "tbody",
        "tfoot",
        "tr",
        "td",
        "th",
        "ul",
        "ol",
        "li",
        "dl",
        "dt",
        "dd",
        "svg",
        "g",
        "path",
        "symbol",
        "defs",
        "slot",
        "component",
    ];
    STRUCTURAL.contains(&tag)
        || tag.contains('-')
        || attrs.contains(" id=")
        || attrs.contains(" class=")
        || attrs.contains(" name=")
        || attrs.contains(" role=")
}

fn id_regex() -> &'static Regex {
    static ID_REGEX: OnceLock<Regex> = OnceLock::new();
    ID_REGEX.get_or_init(|| Regex::new(r#"id=["']([^"']+)["']"#).unwrap())
}

fn class_regex() -> &'static Regex {
    static CLASS_REGEX: OnceLock<Regex> = OnceLock::new();
    CLASS_REGEX.get_or_init(|| Regex::new(r#"class=["']([^"']+)["']"#).unwrap())
}

fn name_regex() -> &'static Regex {
    static NAME_REGEX: OnceLock<Regex> = OnceLock::new();
    NAME_REGEX.get_or_init(|| Regex::new(r#"(?:name|role)=["']([^"']+)["']"#).unwrap())
}

fn format_html_tag_label(tag: &str, attrs: &str) -> String {
    if let Some(captures) = id_regex().captures(attrs) {
        return format!("{tag}#{}", &captures[1]);
    }
    if let Some(captures) = class_regex().captures(attrs) {
        let first_class = captures[1].split_whitespace().next().unwrap_or("");
        if !first_class.is_empty() {
            return format!("{tag}.{first_class}");
        }
    }
    if let Some(captures) = name_regex().captures(attrs) {
        return format!("{tag}[{}]", &captures[1]);
    }
    tag.to_string()
}

fn tag_regex() -> &'static Regex {
    static TAG_REGEX: OnceLock<Regex> = OnceLock::new();
    TAG_REGEX.get_or_init(|| Regex::new(r#"</?([A-Za-z][\w:-]*)([^>]*?)(/?)>"#).unwrap())
}

pub(crate) fn parse_html_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut tag_stack: Vec<String> = Vec::new();
    for (index, line_text) in content.lines().enumerate() {
        for captures in tag_regex().captures_iter(line_text) {
            let raw = captures.get(0).map(|value| value.as_str()).unwrap_or("");
            let tag = captures
                .get(1)
                .map(|value| value.as_str().to_ascii_lowercase())
                .unwrap_or_default();
            let attrs = captures.get(2).map(|value| value.as_str()).unwrap_or("");
            let self_closing =
                captures.get(3).map(|value| !value.as_str().is_empty()).unwrap_or(false)
                    || matches!(
                        tag.as_str(),
                        "area"
                            | "base"
                            | "br"
                            | "col"
                            | "embed"
                            | "hr"
                            | "img"
                            | "input"
                            | "link"
                            | "meta"
                            | "param"
                            | "source"
                            | "track"
                            | "wbr"
                    );
            let is_closing = raw.starts_with("</");
            if is_closing {
                while let Some(current) = tag_stack.pop() {
                    if current == tag {
                        break;
                    }
                }
                continue;
            }
            if should_outline_html_tag(&tag, attrs) {
                drafts.push(OutlineDraft {
                    label: format_html_tag_label(&tag, attrs),
                    kind: "heading",
                    line: index + 1,
                    depth: tag_stack.len() + 1,
                });
            }
            if !self_closing {
                tag_stack.push(tag);
            }
        }
    }
    drafts
}
