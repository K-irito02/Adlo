use crate::outline::OutlineDraft;
use regex::Regex;

pub(crate) fn parse_shell_outline(content: &str, powershell: bool) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut depth = 0usize;
    let ps_function_regex = Regex::new(r"(?i)^function\s+([A-Za-z_][\w-]*)").unwrap();
    let sh_function_regex = Regex::new(r"^(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{").unwrap();
    let ps_block_regex =
        Regex::new(r"(?i)^(if|foreach|for|while|switch|try|catch|finally|class|enum)\b").unwrap();
    let sh_block_regex = Regex::new(r"^(if|for|while|until|case|select)\b").unwrap();
    let shell_close_regex = Regex::new(r"^(fi|done|esac)\b").unwrap();
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with('}') || shell_close_regex.is_match(trimmed) {
            depth = depth.saturating_sub(1);
        }
        let line = index + 1;
        if let Some(captures) = if powershell {
            ps_function_regex.captures(trimmed)
        } else {
            sh_function_regex.captures(trimmed)
        } {
            drafts.push(OutlineDraft {
                label: captures[1].to_string(),
                kind: "function".to_string(),
                line,
                depth: depth + 1,
            });
        } else if let Some(captures) = if powershell {
            ps_block_regex.captures(trimmed)
        } else {
            sh_block_regex.captures(trimmed)
        } {
            drafts.push(OutlineDraft {
                label: captures[1].to_ascii_lowercase(),
                kind: "heading".to_string(),
                line,
                depth: depth + 1,
            });
        }
        let opens_block = if powershell {
            trimmed.ends_with('{')
        } else {
            trimmed.ends_with('{')
                || trimmed.ends_with(" do")
                || trimmed.ends_with(" then")
                || trimmed.starts_with("case ")
        };
        if opens_block {
            depth += 1;
        }
    }
    drafts
}