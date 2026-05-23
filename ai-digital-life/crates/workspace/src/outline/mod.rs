use adl_errors::AppError;
use adl_kernel::FileOutlineItem;
use std::collections::BTreeMap;

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

pub fn outline(root: &std::path::Path, relative_path: &str) -> Result<Vec<FileOutlineItem>, AppError> {
    let doc = crate::read_file(root, relative_path)?;
    let total_lines = doc.content.lines().count().max(1);
    let drafts = match detect_outline_family(relative_path) {
        "markdown" => markdown::parse_markdown_outline(&doc.content),
        "python" => python::parse_python_outline(&doc.content),
        "yaml" => yaml::parse_yaml_outline(&doc.content),
        "config" => parse_config_outline(&doc.content),
        "json" => json::parse_json_outline(&doc.content),
        "html" => html::parse_html_outline(&doc.content),
        "css" => css::parse_css_outline(&doc.content),
        "vue" => vue::parse_vue_outline(&doc.content),
        "shell" => shell::parse_shell_outline(&doc.content, false),
        "powershell" => shell::parse_shell_outline(&doc.content, true),
        "sql" => sql::parse_sql_outline(&doc.content),
        "none" => Vec::new(),
        _ => brace::parse_brace_outline(&doc.content),
    };
    Ok(finalize_outline_items(
        drafts,
        &relative_path.replace('\\', "/"),
        total_lines,
    ))
}

fn clean_markdown_heading_label(value: &str) -> &str {
    let trimmed = value.trim();
    let without_closing_hashes = trimmed.trim_end_matches('#').trim_end();
    without_closing_hashes.trim()
}

pub(crate) fn detect_outline_family(relative_path: &str) -> &'static str {
    let normalized = relative_path.replace('\\', "/");
    let file_name = normalized
        .rsplit('/')
        .next()
        .unwrap_or(&normalized)
        .to_ascii_lowercase();
    let extension = file_name
        .rsplit_once('.')
        .map(|(_, ext)| ext)
        .unwrap_or(file_name.as_str());

    match extension {
        "md" | "markdown" => "markdown",
        "py" => "python",
        "yaml" | "yml" => "yaml",
        "toml" | "ini" | "cfg" | "conf" => "config",
        "json" => "json",
        "html" | "htm" | "xml" | "svg" => "html",
        "css" | "scss" | "less" => "css",
        "vue" => "vue",
        "sh" | "bash" | "zsh" | "fish" => "shell",
        "ps1" => "powershell",
        "sql" => "sql",
        "db" | "sqlite" | "sqlite3" => "none",
        _ if file_name == "dockerfile" => "shell",
        _ => "brace",
    }
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

    let mut line_occurrences: BTreeMap<usize, usize> = BTreeMap::new();
    sorted
        .iter()
        .enumerate()
        .map(|(index, item)| {
            let mut end_line = total_lines;
            for next in sorted.iter().skip(index + 1) {
                if next.depth <= item.depth {
                    end_line = std::cmp::max(item.line, next.line.saturating_sub(1));
                    break;
                }
            }
            let occurrence = line_occurrences.entry(item.line).or_insert(0);
            *occurrence += 1;
            let id = if *occurrence == 1 {
                format!("{relative_path}:{}", item.line)
            } else {
                format!("{relative_path}:{}:{}", item.line, *occurrence)
            };
            FileOutlineItem {
                id,
                label: item.label.clone(),
                kind: item.kind.clone(),
                line: item.line,
                end_line: Some(end_line),
                depth: Some(item.depth),
            }
        })
        .collect()
}

fn parse_config_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let section_regex = regex::Regex::new(r"^\[([^\]]+)\]$").unwrap();
    let entry_regex = regex::Regex::new(r"^([A-Za-z0-9_.-]+)\s*=\s*(.+)$").unwrap();
    let mut current_section_depth = 0usize;
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }
        if let Some(captures) = section_regex.captures(trimmed) {
            let label = captures[1].trim().to_string();
            current_section_depth = label
                .split('.')
                .filter(|part| !part.is_empty())
                .count()
                .max(1);
            drafts.push(OutlineDraft {
                label,
                kind: "heading".to_string(),
                line: index + 1,
                depth: current_section_depth,
            });
            continue;
        }
        if let Some(captures) = entry_regex.captures(trimmed) {
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
    value
        .trim_start()
        .chars()
        .take_while(|ch| closers.contains(ch))
        .count()
}