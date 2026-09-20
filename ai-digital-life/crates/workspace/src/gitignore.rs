//! `.gitignore` 链式匹配（类 git 语义最小子集，与前端
//! `frontend/src/shared/ipc/searchIgnore.ts` 镜像实现）。
//!
//! - 规则集按"根在前、深层在后"传入，文件内按行序排列，**最后命中的规则获胜**；
//! - `!` 取反可把文件加回，但父目录被排除后其下文件不可再被加回（git 原生规则）；
//! - 支持 `*`（不跨 `/`）、`?`、`**`（跨分隔符）、`[...]` 字符组、行尾 `/`（仅目录）、
//!   行首 `/` 或含 `/`（锚定到规则所在目录），其余为任意层级 basename 匹配。
//!
//! 单测用例与前端 `searchIgnore.test.ts` 逐项对照：任一侧改动语义都会在各自测试里失败。

use std::path::Path;

/// 单个 `.gitignore` 文件（`base_dir` 为其所在目录相对工作区根的路径，根为 `""`）。
pub struct GitignoreRuleSet {
    pub base_dir: String,
    pub content: String,
}

struct ParsedPattern {
    negate: bool,
    dir_only: bool,
    anchored: bool,
    body: String,
}

fn parse_line(raw: &str) -> Option<ParsedPattern> {
    let line = raw.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }
    let mut negate = false;
    let mut body = line;
    if let Some(rest) = body.strip_prefix('!') {
        negate = true;
        body = rest;
    } else if let Some(rest) = body.strip_prefix("\\!").or_else(|| body.strip_prefix("\\#")) {
        body = rest;
    }
    if body.is_empty() {
        return None;
    }
    let mut dir_only = false;
    if body.ends_with('/') {
        dir_only = true;
        body = body.trim_end_matches('/');
    }
    let mut anchored = false;
    if let Some(rest) = body.strip_prefix('/') {
        anchored = true;
        body = rest;
    } else if body.contains('/') {
        anchored = true;
    }
    if body.is_empty() {
        return None;
    }
    Some(ParsedPattern { negate, dir_only, anchored, body: body.to_string() })
}

/// glob 全串匹配：`*` 不跨 `/`（git 语义），`?` 匹配单个非 `/` 字符，
/// `**` 跨分隔符匹配任意（含空），`[...]` 为字符组。
fn glob_match(pattern: &str, text: &str) -> bool {
    fn rec(p: &[char], t: &[char]) -> bool {
        if p.is_empty() {
            return t.is_empty();
        }
        if p[0] == '*' {
            // `**`：跨分隔符匹配任意（含空）。
            if p.get(1) == Some(&'*') {
                let mut rest = &p[2..];
                // `/**/` 整体可省略（匹配零层或多层）。
                if rest.first() == Some(&'/') {
                    rest = &rest[1..];
                    if rec(rest, t) {
                        return true;
                    }
                }
                let mut i = 0;
                while i <= t.len() {
                    if rec(rest, &t[i..]) {
                        return true;
                    }
                    i += 1;
                }
                return false;
            }
            // `*`：贪心匹配，但遇到 `/` 即停（不跨分隔符）。
            let mut i = 0;
            while i <= t.len() {
                if i < t.len() && t[i] == '/' {
                    break;
                }
                if rec(&p[1..], &t[i..]) {
                    return true;
                }
                i += 1;
            }
            return false;
        }
        if t.is_empty() {
            return false;
        }
        match p[0] {
            '?' => {
                if t[0] == '/' {
                    return false;
                }
                rec(&p[1..], &t[1..])
            },
            '[' => {
                let end = p.iter().position(|&c| c == ']');
                let Some(end) = end else {
                    return p[0] == t[0] && rec(&p[1..], &t[1..]);
                };
                let (matched, _) = char_class_match(&p[1..end], t[0]);
                if !matched {
                    return false;
                }
                rec(&p[end + 1..], &t[1..])
            },
            c => {
                if c == t[0] {
                    rec(&p[1..], &t[1..])
                } else {
                    false
                }
            },
        }
    }
    rec(
        &pattern.chars().collect::<Vec<_>>(),
        &text.chars().collect::<Vec<_>>(),
    )
}

/// `[...]` 字符组匹配（含 `[^...]` 取反与 `a-z` 范围）。
fn char_class_match(class: &[char], c: char) -> (bool, bool) {
    let (negated, class) = match class.first() {
        Some('^') | Some('!') => (true, &class[1..]),
        _ => (false, class),
    };
    let mut matched = false;
    let mut i = 0;
    while i < class.len() {
        if i + 2 < class.len() && class[i + 1] == '-' {
            if class[i] <= c && c <= class[i + 2] {
                matched = true;
                break;
            }
            i += 3;
        } else {
            if class[i] == c {
                matched = true;
                break;
            }
            i += 1;
        }
    }
    (matched != negated, true)
}

fn pattern_matches(pattern: &ParsedPattern, rel: &str, is_dir: bool) -> bool {
    if pattern.anchored {
        if glob_match(&pattern.body, rel) {
            return true;
        }
        // 目录规则同时覆盖其下所有后代：文件路径的任一祖先前缀命中即视为命中。
        if pattern.dir_only && !is_dir {
            let mut prefix = String::new();
            for segment in rel.split('/').take(rel.split('/').count().saturating_sub(1)) {
                if !prefix.is_empty() {
                    prefix.push('/');
                }
                prefix.push_str(segment);
                if glob_match(&pattern.body, &prefix) {
                    return true;
                }
            }
        }
        return false;
    }
    // 非锚定：任意层级的段名匹配即可；目录规则跳过文件自身的 basename。
    let segments: Vec<&str> = rel.split('/').collect();
    let end = if !is_dir && pattern.dir_only { segments.len().saturating_sub(1) } else { segments.len() };
    segments[..end].iter().any(|segment| glob_match(&pattern.body, segment))
}

struct CompiledSet {
    base_dir: String,
    patterns: Vec<ParsedPattern>,
}

/// 编译后的 `.gitignore` 链判定器（`is_ignored(相对路径, 是否目录)`）。
pub struct GitignoreMatcher {
    sets: Vec<CompiledSet>,
}

impl GitignoreMatcher {
    pub fn new(rule_sets: &[GitignoreRuleSet]) -> Self {
        let sets = rule_sets
            .iter()
            .map(|set| {
                let base_dir = set.base_dir.replace('\\', "/");
                let base_dir = base_dir.trim_matches('/').to_string();
                let patterns = set.content.lines().filter_map(parse_line).collect();
                CompiledSet { base_dir, patterns }
            })
            .collect();
        Self { sets }
    }

    fn relative_to_base<'a>(&self, path: &'a str, base_dir: &str) -> Option<&'a str> {
        if base_dir.is_empty() {
            return Some(path);
        }
        if path == base_dir {
            return Some("");
        }
        path.strip_prefix(base_dir).and_then(|rest| rest.strip_prefix('/'))
    }

    fn evaluate(&self, path: &str, is_dir: bool) -> bool {
        let mut ignored = false;
        for set in &self.sets {
            let Some(rel) = self.relative_to_base(path, &set.base_dir) else {
                continue;
            };
            for pattern in &set.patterns {
                if pattern_matches(pattern, rel, is_dir) {
                    ignored = !pattern.negate;
                }
            }
        }
        ignored
    }

    /// 路径是否被忽略。父目录被排除后其下文件不可再被加回：先逐层判定祖先目录。
    pub fn is_ignored(&self, relative_path: &str, is_dir: bool) -> bool {
        let path = relative_path.replace('\\', "/");
        let path = path.trim_matches('/');
        if path.is_empty() || path == "." || path.starts_with("../") {
            return false;
        }
        let segments: Vec<&str> = path.split('/').collect();
        let mut prefix = String::new();
        for (i, segment) in segments.iter().enumerate() {
            if i > 0 {
                prefix.push('/');
            }
            prefix.push_str(segment);
            if i + 1 < segments.len() && self.evaluate(&prefix, true) {
                return true;
            }
        }
        self.evaluate(path, is_dir)
    }
}

/// 自工作区根向下收集全部 `.gitignore`（根在前、深层在后；上限 64 个防超深嵌套）。
/// 缺失/不可读即跳过；每次检索重新收集（改完下次检索立即生效，不做缓存）。
pub fn load_gitignore_chain(root: &Path) -> Vec<GitignoreRuleSet> {
    const MAX_GITIGNORE_FILES: usize = 64;
    let mut sets: Vec<GitignoreRuleSet> = Vec::new();
    let mut stack: Vec<String> = vec![String::new()];
    while let Some(dir) = stack.pop() {
        if sets.len() >= MAX_GITIGNORE_FILES {
            break;
        }
        let abs = if dir.is_empty() { root.to_path_buf() } else { root.join(&dir) };
        let entries = match std::fs::read_dir(&abs) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            if file_type.is_dir() {
                if name == ".git" || name == "node_modules" {
                    continue;
                }
                stack.push(if dir.is_empty() { name } else { format!("{dir}/{name}") });
            } else if name == ".gitignore" {
                if let Ok(content) = std::fs::read_to_string(entry.path()) {
                    sets.push(GitignoreRuleSet { base_dir: dir.clone(), content });
                }
            }
        }
    }
    // 栈是 LIFO：按深度排序保证根在前、深层在后（同级顺序无关）。
    sets.sort_by_key(|set| set.base_dir.len());
    sets
}

#[cfg(test)]
mod gitignore_tests {
    use super::*;

    fn matcher(sets: &[(&str, &str)]) -> GitignoreMatcher {
        GitignoreMatcher::new(
            &sets
                .iter()
                .map(|(base_dir, content)| GitignoreRuleSet {
                    base_dir: (*base_dir).to_string(),
                    content: (*content).to_string(),
                })
                .collect::<Vec<_>>(),
        )
    }

    #[test]
    fn ignores_blank_lines_and_comments() {
        let m = matcher(&[("", "# comment\n\n*.log\n")]);
        assert!(m.is_ignored("a.log", false));
        assert!(m.is_ignored("sub/b.log", false));
        assert!(!m.is_ignored("a.LOG", false));
        assert!(!m.is_ignored("a.md", false));
    }

    #[test]
    fn trailing_slash_covers_directory_contents() {
        let m = matcher(&[("", "build/\n")]);
        assert!(m.is_ignored("build", true));
        assert!(m.is_ignored("build/out.js", false));
        assert!(m.is_ignored("src/build/x.js", false));
        assert!(!m.is_ignored("build.js", false));
    }

    #[test]
    fn negation_within_same_file() {
        let m = matcher(&[("", "*.log\n!keep.log\n")]);
        assert!(m.is_ignored("debug.log", false));
        assert!(!m.is_ignored("keep.log", false));
        assert!(!m.is_ignored("sub/keep.log", false));
    }

    #[test]
    fn deeper_files_override_shallower_ones() {
        let m = matcher(&[("", "*.log\n"), ("sub", "!keep.log\n")]);
        assert!(m.is_ignored("a.log", false));
        assert!(m.is_ignored("sub/debug.log", false));
        assert!(!m.is_ignored("sub/keep.log", false));
        assert!(m.is_ignored("keep.log", false));
    }

    #[test]
    fn cannot_reinclude_below_excluded_parent() {
        let m = matcher(&[("", "build/\n"), ("build", "!out.txt\n")]);
        assert!(m.is_ignored("build/out.txt", false));
    }

    #[test]
    fn leading_slash_anchors_to_gitignore_location() {
        let m = matcher(&[("", "/root-only.log\n")]);
        assert!(m.is_ignored("root-only.log", false));
        assert!(!m.is_ignored("sub/root-only.log", false));
    }

    #[test]
    fn double_star_crosses_separators() {
        let m = matcher(&[("", "**/gen/**.js\n")]);
        assert!(m.is_ignored("gen/a.js", false));
        assert!(m.is_ignored("x/gen/deep/a.js", false));
        assert!(!m.is_ignored("x/a.js", false));
    }

    #[test]
    fn anchored_star_stays_within_one_level() {
        let m = matcher(&[("", "doc/*.txt\n")]);
        assert!(m.is_ignored("doc/a.txt", false));
        assert!(!m.is_ignored("doc/sub/a.txt", false));
    }
}
