use crate::{count_leading_closers, update_brace_depth, OutlineDraft};
use regex::Regex;
use std::sync::LazyLock;

const BLOCK_KEYWORDS: &[&str] = &[
    "if", "else", "for", "while", "switch", "case", "catch", "try", "finally", "match", "do",
    "with", "except", "elif", "foreach",
];

/// Static (pattern, kind) pairs backing `BRACE_MATCHERS`.
///
/// Kept as a plain const slice so tests can iterate the patterns without
/// compiling the regexes — see `tests::all_brace_patterns_compile`.
/// Order matters: more specific patterns appear before the generic
/// C-family method/function matcher at the tail.
const BRACE_PATTERNS: &[(&str, &str)] = &[
    (r"^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)", "class"),
    (r"^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)", "interface"),
    (r"^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)", "type"),
    (r"^(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)", "enum"),
    (r"^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)", "function"),
    (
        r"^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{|\[|async\b|function\b|\(?[\w\s,]*\)?\s*=>)",
        "const",
    ),
    (
        r"^(?:export\s+)?(?:let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{|\[|async\b|function\b|\(?[\w\s,]*\)?\s*=>)",
        "variable",
    ),
    (r"^(?:pub\s+)?(?:async\s+|const\s+|unsafe\s+)*fn\s+([A-Za-z_][\w]*)", "function"),
    (r"^(?:pub\s+)?struct\s+([A-Za-z_][\w]*)", "class"),
    (r"^(?:pub\s+)?enum\s+([A-Za-z_][\w]*)", "enum"),
    (r"^(?:pub\s+)?trait\s+([A-Za-z_][\w]*)", "interface"),
    (r"^(?:pub\s+)?impl(?:<[^>]+>)?\s+([A-Za-z_][\w:]*)", "heading"),
    (r"^(?:pub\s+)?type\s+([A-Za-z_][\w]*)", "type"),
    (r"^(?:pub\s+)?const\s+([A-Za-z_][\w]*)", "const"),
    (r"^func(?:\s*\([^)]*\))?\s+([A-Za-z_][\w]*)", "function"),
    (r"^type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)\b", "class"),
    (
        r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*class\s+([A-Za-z_][\w]*)",
        "class",
    ),
    (
        r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*interface\s+([A-Za-z_][\w]*)",
        "interface",
    ),
    (
        r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*enum\s+([A-Za-z_][\w]*)",
        "enum",
    ),
    (
        r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*record\s+([A-Za-z_][\w]*)",
        "class",
    ),
    (r"(?i)^(?:public|private|protected|internal|\s)*namespace\s+([A-Za-z_][\w.]*)", "heading"),
    (r"^(?:template\s*<[^>]+>\s*)?(?:class|struct)\s+([A-Za-z_~][\w:]*)", "class"),
    (r"^enum\s+(?:class\s+)?([A-Za-z_][\w]*)", "enum"),
    (r"^(?:module|mod)\s+([A-Za-z_][\w]*)", "heading"),
    (
        r"^(?:public|private|protected|internal|static|async|virtual|override|abstract|readonly|get|set|\s)+([A-Za-z_$][\w$]*)\s*\([^;=]*\)\s*(?::[^{=]+)?\s*(?:\{|=>)",
        "method",
    ),
    (
        r"^(?:public|private|protected|internal|readonly|static|\s)+([A-Za-z_$][\w$]*)\s*[:=]",
        "property",
    ),
    (
        r"^(?:[\w:<>,~*&\[\]\s]+)\s+([A-Za-z_~][\w:]*)\s*\([^;]*\)\s*(?:const\b)?\s*(?:\{|$)",
        "function",
    ),
];

static BRACE_MATCHERS: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    BRACE_PATTERNS
        .iter()
        .map(|(pattern, kind)| {
            let regex = Regex::new(pattern).unwrap_or_else(|e| {
                panic!("BRACE_MATCHERS: failed to compile regex {pattern:?}: {e}")
            });
            (regex, *kind)
        })
        .collect()
});

fn brace_matchers() -> &'static [(Regex, &'static str)] {
    &BRACE_MATCHERS
}

static STRING_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#""(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`"#)
        .unwrap_or_else(|e| panic!("STRING_REGEX: failed to compile: {e}"))
});

static COMMENT_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"//.*$|/\*.*?\*/")
        .unwrap_or_else(|e| panic!("COMMENT_REGEX: failed to compile: {e}"))
});

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

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression guard: every entry in `BRACE_PATTERNS` must compile as a
    /// valid regex. Catches typos introduced when editing the pattern table
    /// (e.g. unbalanced parens, stray quantifiers) before they panic at
    /// runtime via `LazyLock` init.
    #[test]
    fn all_brace_patterns_compile() {
        for (pattern, kind) in BRACE_PATTERNS {
            Regex::new(pattern)
                .unwrap_or_else(|e| panic!("brace pattern for kind={kind} failed to compile: {e}"));
        }
    }

    /// Regression guard: the two standalone regexes must also compile.
    #[test]
    fn string_and_comment_regex_compile() {
        let _ = *STRING_REGEX;
        let _ = *COMMENT_REGEX;
        // Force LazyLock init; panic in init closure would fail this test.
    }

    /// Sanity check: a known TS class declaration is matched as `class`.
    #[test]
    fn brace_matcher_detects_ts_class() {
        let matchers = brace_matchers();
        let line = "export class Foo extends Bar {";
        let matched = matchers.iter().find_map(|(re, kind)| re.captures(line).map(|c| (c, *kind)));
        assert!(matched.is_some(), "expected a match for {line:?}");
        let (captures, kind) = matched.unwrap();
        assert_eq!(kind, "class");
        assert_eq!(captures.get(1).map(|m| m.as_str()), Some("Foo"));
    }

    /// Sanity check: a known Rust `fn` is matched as `function`.
    #[test]
    fn brace_matcher_detects_rust_fn() {
        let matchers = brace_matchers();
        let line = "pub async fn run_pipeline(ctx: &Context) -> Result<()> {";
        let matched = matchers.iter().find_map(|(re, kind)| re.captures(line).map(|c| (c, *kind)));
        assert!(matched.is_some(), "expected a match for {line:?}");
        let (captures, kind) = matched.unwrap();
        assert_eq!(kind, "function");
        assert_eq!(captures.get(1).map(|m| m.as_str()), Some("run_pipeline"));
    }
}
