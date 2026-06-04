use crate::OutlineDraft;
use regex::Regex;
use std::sync::OnceLock;

fn create_table_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?i)^create\s+table\s+([A-Za-z0-9_."]+)"#).unwrap())
}

fn create_other_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?i)^create\s+(view|index|function|procedure)\s+([A-Za-z0-9_."]+)"#).unwrap()
    })
}

fn alter_table_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?i)^alter\s+table\s+([A-Za-z0-9_."]+)"#).unwrap())
}

fn column_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"^([A-Za-z_"][\w"]*)\s+[A-Za-z_]"#).unwrap())
}

pub(crate) fn parse_sql_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut inside_create_table = false;
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with("--") {
            continue;
        }
        let line = index + 1;
        if let Some(captures) = create_table_regex().captures(trimmed) {
            drafts.push(OutlineDraft {
                label: format!("table {}", captures[1].replace('"', "")),
                kind: "type".to_string(),
                line,
                depth: 1,
            });
            inside_create_table = true;
            continue;
        }
        if let Some(captures) = create_other_regex().captures(trimmed) {
            let category = captures[1].to_ascii_lowercase();
            drafts.push(OutlineDraft {
                label: format!("{category} {}", captures[2].replace('"', "")),
                kind: if category == "function" {
                    "function".to_string()
                } else {
                    "heading".to_string()
                },
                line,
                depth: 1,
            });
            inside_create_table = false;
            continue;
        }
        if let Some(captures) = alter_table_regex().captures(trimmed) {
            drafts.push(OutlineDraft {
                label: format!("alter {}", captures[1].replace('"', "")),
                kind: "heading".to_string(),
                line,
                depth: 1,
            });
            inside_create_table = false;
            continue;
        }
        if inside_create_table {
            if trimmed == ")" || trimmed == ");" {
                inside_create_table = false;
                continue;
            }
            if let Some(captures) = column_regex().captures(trimmed) {
                drafts.push(OutlineDraft {
                    label: captures[1].replace('"', ""),
                    kind: "property".to_string(),
                    line,
                    depth: 2,
                });
            }
        }
    }
    drafts
}
