use adl_errors::AppError;
use adl_kernel::FileOutlineItem;
use std::collections::HashMap;
use std::sync::OnceLock;

mod brace;
mod css;
mod html;
mod json;
mod markdown;
mod python;
mod shell;
mod sql;
mod vue;
mod yaml;

#[derive(Clone)]
pub(crate) struct OutlineDraft {
    pub(crate) label: String,
    pub(crate) kind: String,
    pub(crate) line: usize,
    pub(crate) depth: usize,
}

pub fn outline(
    content: &str,
    relative_path: &str,
    total_lines: usize,
) -> Result<Vec<FileOutlineItem>, AppError> {
    let drafts = match detect_outline_family(relative_path) {
        "markdown" => markdown::parse_markdown_outline(content),
        "python" => python::parse_python_outline(content),
        "yaml" => yaml::parse_yaml_outline(content),
        "config" => parse_config_outline(content),
        "json" => json::parse_json_outline(content),
        "html" => html::parse_html_outline(content),
        "css" => css::parse_css_outline(content),
        "vue" => vue::parse_vue_outline(content),
        "shell" => shell::parse_shell_outline(content, false),
        "powershell" => shell::parse_shell_outline(content, true),
        "sql" => sql::parse_sql_outline(content),
        "none" => Vec::new(),
        _ => brace::parse_brace_outline(content),
    };
    Ok(finalize_outline_items(drafts, &relative_path.replace('\\', "/"), total_lines))
}

fn clean_markdown_heading_label(value: &str) -> &str {
    let trimmed = value.trim();
    let without_closing_hashes = trimmed.trim_end_matches('#').trim_end();
    without_closing_hashes.trim()
}

fn outline_family_map() -> &'static HashMap<&'static str, &'static str> {
    static MAP: OnceLock<HashMap<&str, &str>> = OnceLock::new();
    MAP.get_or_init(|| {
        HashMap::from([
            ("md", "markdown"),
            ("markdown", "markdown"),
            ("py", "python"),
            ("yaml", "yaml"),
            ("yml", "yaml"),
            ("toml", "config"),
            ("ini", "config"),
            ("cfg", "config"),
            ("conf", "config"),
            ("json", "json"),
            ("html", "html"),
            ("htm", "html"),
            ("xml", "html"),
            ("svg", "html"),
            ("css", "css"),
            ("scss", "css"),
            ("less", "css"),
            ("vue", "vue"),
            ("sh", "shell"),
            ("bash", "shell"),
            ("zsh", "shell"),
            ("fish", "shell"),
            ("ps1", "powershell"),
            ("sql", "sql"),
            ("db", "none"),
            ("sqlite", "none"),
            ("sqlite3", "none"),
        ])
    })
}

pub(crate) fn detect_outline_family(relative_path: &str) -> &'static str {
    let file_name =
        relative_path.rsplit(&['/', '\\'][..]).next().unwrap_or(relative_path).to_ascii_lowercase();

    if file_name == "dockerfile" {
        return "shell";
    }

    let extension = file_name.rsplit_once('.').map(|(_, ext)| ext).unwrap_or(file_name.as_str());

    outline_family_map().get(extension).copied().unwrap_or("brace")
}

fn finalize_outline_items(
    drafts: Vec<OutlineDraft>,
    relative_path: &str,
    total_lines: usize,
) -> Vec<FileOutlineItem> {
    let mut sorted = drafts;
    sorted.sort_by(|left, right| {
        left.line
            .cmp(&right.line)
            .then(left.depth.cmp(&right.depth))
            .then(left.label.cmp(&right.label))
    });

    let n = sorted.len();
    let mut end_lines = vec![total_lines; n];
    let mut stack: Vec<usize> = Vec::new();

    for i in 0..n {
        while let Some(&top) = stack.last() {
            if sorted[i].depth <= sorted[top].depth {
                end_lines[top] = sorted[i].line.saturating_sub(1).max(sorted[top].line);
                stack.pop();
            } else {
                break;
            }
        }
        stack.push(i);
    }

    let mut last_line = 0;
    let mut occurrence = 0;
    sorted
        .into_iter()
        .enumerate()
        .map(|(i, item)| {
            if item.line == last_line {
                occurrence += 1;
            } else {
                last_line = item.line;
                occurrence = 1;
            }
            let id = if occurrence == 1 {
                format!("{relative_path}:{}", item.line)
            } else {
                format!("{relative_path}:{}:{}", item.line, occurrence)
            };
            FileOutlineItem {
                id,
                label: item.label,
                kind: item.kind,
                line: item.line,
                end_line: Some(end_lines[i]),
                depth: Some(item.depth),
            }
        })
        .collect()
}

fn config_section_regex() -> &'static regex::Regex {
    static SECTION_REGEX: OnceLock<regex::Regex> = OnceLock::new();
    SECTION_REGEX.get_or_init(|| regex::Regex::new(r"^\[([^\]]+)\]$").unwrap())
}

fn config_entry_regex() -> &'static regex::Regex {
    static ENTRY_REGEX: OnceLock<regex::Regex> = OnceLock::new();
    ENTRY_REGEX.get_or_init(|| regex::Regex::new(r"^([A-Za-z0-9_.-]+)\s*=\s*(.+)$").unwrap())
}

fn parse_config_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut current_section_depth = 0usize;
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }
        if let Some(captures) = config_section_regex().captures(trimmed) {
            let label = captures[1].trim().to_string();
            current_section_depth = label.split('.').filter(|part| !part.is_empty()).count().max(1);
            drafts.push(OutlineDraft {
                label,
                kind: "heading".to_string(),
                line: index + 1,
                depth: current_section_depth,
            });
            continue;
        }
        if let Some(captures) = config_entry_regex().captures(trimmed) {
            let value = captures[2].trim();
            if value.starts_with('{') || value.starts_with('[') || value.is_empty() {
                drafts.push(OutlineDraft {
                    label: captures[1].to_string(),
                    kind: "heading".to_string(),
                    line: index + 1,
                    depth: current_section_depth + 1,
                });
            }
        }
    }
    drafts
}

pub(crate) fn count_chars(value: &str, chars: &[char]) -> usize {
    value.chars().filter(|ch| chars.contains(ch)).count()
}

pub(crate) fn count_leading_closers(value: &str, closers: &[char]) -> usize {
    value.trim_start().chars().take_while(|ch| closers.contains(ch)).count()
}

pub(crate) fn calc_indent(line: &str, tab_width: usize) -> usize {
    line.chars()
        .take_while(|ch| ch.is_whitespace())
        .map(|ch| if ch == '\t' { tab_width } else { 1 })
        .sum()
}

pub(crate) fn update_brace_depth(depth: usize, line: &str) -> usize {
    depth
        .saturating_add(count_chars(line, &['{', '[']))
        .saturating_sub(count_chars(line, &['}', ']']))
}
