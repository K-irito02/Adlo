use crate::{count_leading_closers, update_brace_depth, OutlineDraft};
use regex::Regex;
use std::sync::LazyLock;

const BLOCK_KEYWORDS: &[&str] = &[
    "if", "else", "for", "while", "switch", "case", "catch", "try", "finally", "match", "do",
    "with", "except", "elif", "foreach",
];

static BRACE_MATCHERS: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    vec![
        (Regex::new(r"^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)").unwrap(), "class"),
        (Regex::new(r"^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)").unwrap(), "interface"),
        (Regex::new(r"^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)").unwrap(), "type"),
        (Regex::new(r"^(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)").unwrap(), "enum"),
        (Regex::new(r"^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)").unwrap(), "function"),
        (Regex::new(r"^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{|\[|async\b|function\b|\(?[\w\s,]*\)?\s*=>)").unwrap(), "const"),
        (Regex::new(r"^(?:export\s+)?(?:let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{|\[|async\b|function\b|\(?[\w\s,]*\)?\s*=>)").unwrap(), "variable"),
        (Regex::new(r"^(?:pub\s+)?fn\s+([A-Za-z_][\w]*)").unwrap(), "function"),
        (Regex::new(r"^(?:pub\s+)?struct\s+([A-Za-z_][\w]*)").unwrap(), "class"),
        (Regex::new(r"^(?:pub\s+)?enum\s+([A-Za-z_][\w]*)").unwrap(), "enum"),
        (Regex::new(r"^(?:pub\s+)?trait\s+([A-Za-z_][\w]*)").unwrap(), "interface"),
        (Regex::new(r"^(?:pub\s+)?impl(?:<[^>]+>)?\s+([A-Za-z_][\w:]*)").unwrap(), "heading"),
        (Regex::new(r"^(?:pub\s+)?type\s+([A-Za-z_][\w]*)").unwrap(), "type"),
        (Regex::new(r"^(?:pub\s+)?const\s+([A-Za-z_][\w]*)").unwrap(), "const"),
        (Regex::new(r"^func(?:\s*\([^)]*\))?\s+([A-Za-z_][\w]*)").unwrap(), "function"),
        (Regex::new(r"^type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)\b").unwrap(), "class"),
        (Regex::new(r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*class\s+([A-Za-z_][\w]*)").unwrap(), "class"),
        (Regex::new(r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*interface\s+([A-Za-z_][\w]*)").unwrap(), "interface"),
        (Regex::new(r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*enum\s+([A-Za-z_][\w]*)").unwrap(), "enum"),
        (Regex::new(r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*record\s+([A-Za-z_][\w]*)").unwrap(), "class"),
        (Regex::new(r"(?i)^(?:public|private|protected|internal|\s)*namespace\s+([A-Za-z_][\w.]*)").unwrap(), "heading"),
        (Regex::new(r"^(?:template\s*<[^>]+>\s*)?(?:class|struct)\s+([A-Za-z_~][\w:]*)").unwrap(), "class"),
        (Regex::new(r"^enum\s+(?:class\s+)?([A-Za-z_][\w]*)").unwrap(), "enum"),
        (Regex::new(r"^(?:module|mod)\s+([A-Za-z_][\w]*)").unwrap(), "heading"),
        (Regex::new(r"^(?:public|private|protected|internal|static|async|virtual|override|abstract|readonly|get|set|\s)+([A-Za-z_$][\w$]*)\s*\([^;=]*\)\s*(?::[^{=]+)?\s*(?:\{|=>)").unwrap(), "method"),
        (Regex::new(r"^(?:public|private|protected|internal|readonly|static|\s)+([A-Za-z_$][\w$]*)\s*[:=]").unwrap(), "property"),
        (Regex::new(r"^(?:[\w:<>,~*&\[\]\s]+)\s+([A-Za-z_~][\w:]*)\s*\([^;]*\)\s*(?:const\b)?\s*(?:\{|$)").unwrap(), "function"),
    ]
});

fn brace_matchers() -> &'static [(Regex, &'static str)] {
    &BRACE_MATCHERS
}

static STRING_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#""(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`"#).unwrap()
});

static COMMENT_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"//.*$|/\*.*?\*/").unwrap());

fn sanitize_brace_line(line_text: &str) -> String {
    let without_strings = STRING_REGEX.replace_all(line_text, "\"\"");
    COMMENT_REGEX.replace_all(&without_strings, "").into_owned()
}

pub(crate) fn parse_brace_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut brace_depth = 0usize;
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") || trimmed.starts_with('*') {
            continue;
        }
        let sanitized = sanitize_brace_line(line_text);
        let effective_depth =
            brace_depth.saturating_sub(count_leading_closers(&sanitized, &['}', ']']));
        for (regex, kind) in brace_matchers().iter() {
            if let Some(captures) = regex.captures(trimmed) {
                let label = captures.get(1).map(|value| value.as_str().trim()).unwrap_or("");
                if label.is_empty() {
                    continue;
                }
                let lowered = label.rsplit("::").next().unwrap_or(label).to_ascii_lowercase();
                if (*kind == "function" || *kind == "method")
                    && BLOCK_KEYWORDS.contains(&lowered.as_str())
                {
                    continue;
                }
                if (*kind == "function" || *kind == "method")
                    && trimmed.ends_with(';')
                    && !trimmed.contains('{')
                {
                    continue;
                }
                drafts.push(OutlineDraft {
                    label: label.to_string(),
                    kind: (*kind).to_string(),
                    line: index + 1,
                    depth: effective_depth + 1,
                });
                break;
            }
        }
        brace_depth = update_brace_depth(brace_depth, &sanitized);
    }
    drafts
}
