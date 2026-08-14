//! robots.txt 解析与匹配（RFC 9309 子集）。
//!
//! 纯函数模块，无 I/O、无网络依赖。供 Tauri 端 `fetch_page_meta_inner`
//! 与 Vite 预览端 robots 门控（`frontend/dev/crawlerRobots.ts`）共用语义。

/// robots.txt 中 User-Agent 行用的产品令牌：取 `User-Agent` 字符串 `'/'` 前段。
pub fn product_token(user_agent: &str) -> &str {
    user_agent.split('/').next().unwrap_or(user_agent)
}

#[derive(Debug, Clone, Default)]
pub struct RobotsRules {
    groups: Vec<RobotsGroup>,
}

#[derive(Debug, Clone, Default)]
struct RobotsGroup {
    user_agents: Vec<String>,
    allow: Vec<String>,
    disallow: Vec<String>,
}

/// 解析 robots.txt 正文。忽略注释（`#` 起）与空行；`user-agent` / `allow` /
/// `disallow` 字段名不区分大小写；连续 `user-agent` 行归同一组；遇到首个
/// `allow`/`disallow` 后再次出现 `user-agent` 视为新组；空值规则被忽略。
pub fn parse_robots_txt(raw: &str) -> RobotsRules {
    let mut groups: Vec<RobotsGroup> = Vec::new();
    let mut current: Option<RobotsGroup> = None;

    for line in raw.lines() {
        let line = line.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        let Some((field, value)) = line.split_once(':') else {
            continue;
        };
        let field = field.trim().to_ascii_lowercase();
        let value = value.trim();
        match field.as_str() {
            "user-agent" => {
                let has_rules =
                    current.as_ref().is_some_and(|g| !g.allow.is_empty() || !g.disallow.is_empty());
                if has_rules {
                    if let Some(g) = current.take() {
                        groups.push(g);
                    }
                }
                current
                    .get_or_insert_with(RobotsGroup::default)
                    .user_agents
                    .push(value.to_string());
            },
            "allow" if !value.is_empty() => {
                current.get_or_insert_with(RobotsGroup::default).allow.push(value.to_string());
            },
            "disallow" if !value.is_empty() => {
                current.get_or_insert_with(RobotsGroup::default).disallow.push(value.to_string());
            },
            _ => {},
        }
    }
    if let Some(g) = current.take() {
        groups.push(g);
    }
    RobotsRules { groups }
}

impl RobotsRules {
    /// 判断某个爬虫是否被允许抓取 `path`（URL 的 pathname 部分）。
    /// 组选择：精确匹配产品令牌优先于 `*`；无匹配组或无路径规则 → 允许。
    /// 路径规则：`allow` 与 `disallow` 中取最长匹配；等长时 `allow` 优先（RFC 9309）。
    pub fn is_allowed(&self, user_agent: &str, path: &str) -> bool {
        let token = product_token(user_agent);
        let Some(group) = self.select_group(token.trim()) else {
            return true;
        };
        let path = if path.is_empty() { "/" } else { path };
        let allow_len = group.allow.iter().filter_map(|p| longest_match(p, path)).max();
        let disallow_len = group.disallow.iter().filter_map(|p| longest_match(p, path)).max();
        match (allow_len, disallow_len) {
            (Some(a), Some(d)) => a >= d,
            (Some(_), None) => true,
            (None, Some(_)) => false,
            (None, None) => true,
        }
    }

    fn select_group(&self, token: &str) -> Option<&RobotsGroup> {
        self.groups
            .iter()
            .find(|g| g.user_agents.iter().any(|ua| ua.eq_ignore_ascii_case(token)))
            .or_else(|| self.groups.iter().find(|g| g.user_agents.iter().any(|ua| ua == "*")))
    }
}

/// 计算 `pattern` 对 `path` 的最长匹配长度（前缀匹配）；无匹配返回 `None`。
/// 支持 `*`（匹配任意字符序列，含空）与末尾 `$`（锚定到路径结尾）。
fn longest_match(pattern: &str, path: &str) -> Option<usize> {
    let anchored = pattern.ends_with('$');
    let core = if anchored { &pattern[..pattern.len() - 1] } else { pattern };
    let p: Vec<char> = core.chars().collect();
    let s: Vec<char> = path.chars().collect();

    // dp[i][j] = pattern[..i] 是否匹配到 path 恰好前 j 个字符
    let mut dp = vec![vec![false; s.len() + 1]; p.len() + 1];
    dp[0][0] = true;
    for i in 1..=p.len() {
        if p[i - 1] == '*' {
            let prev_row = dp[i - 1].clone();
            for (j, prev_matched) in prev_row.iter().enumerate() {
                if *prev_matched {
                    dp[i][j] = true;
                }
            }
            for j in 1..=s.len() {
                if dp[i][j - 1] {
                    dp[i][j] = true;
                }
            }
        } else {
            for j in 1..=s.len() {
                if dp[i - 1][j - 1] && p[i - 1] == s[j - 1] {
                    dp[i][j] = true;
                }
            }
        }
    }

    if anchored {
        dp[p.len()][s.len()].then_some(s.len())
    } else {
        (0..=s.len()).rev().find(|&j| dp[p.len()][j])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn product_token_takes_part_before_slash() {
        assert_eq!(product_token("AIDigitalLife/1.0"), "AIDigitalLife");
        assert_eq!(product_token("Googlebot"), "Googlebot");
        assert_eq!(product_token("  Foo/2.1  "), "  Foo"); // token = 按 '/'.split 后首段（含首尾空格由调用方自行 trim）
    }

    #[test]
    fn disallow_blocks_matching_path() {
        let rules = parse_robots_txt("User-agent: AIDigitalLife\nDisallow: /private/");
        assert!(!rules.is_allowed("AIDigitalLife/1.0", "/private/data.html"));
    }

    #[test]
    fn allow_wins_over_disallow_on_equal_specificity() {
        let rules = parse_robots_txt("User-agent: *\nDisallow: /foo\nAllow: /foo\n");
        assert!(rules.is_allowed("AIDigitalLife", "/foo"));
    }

    #[test]
    fn most_specific_user_agent_group_wins_over_star() {
        let rules = parse_robots_txt(
            "User-agent: *\nDisallow: /x\n\nUser-agent: AIDigitalLife\nAllow: /\n",
        );
        // 精确 token 命中第二组 → Allow
        assert!(rules.is_allowed("AIDigitalLife/1.0", "/x"));
        // 其他 bot 命中 * → Disallow /x
        assert!(!rules.is_allowed("OtherBot/1.0", "/x"));
    }

    #[test]
    fn comments_and_blank_lines_ignored() {
        let rules = parse_robots_txt(
            "# top comment\n\nUser-agent: AIDigitalLife # inline\n# comment\nDisallow: /tmp\n\n",
        );
        assert!(!rules.is_allowed("AIDigitalLife", "/tmp/a"));
        assert!(rules.is_allowed("AIDigitalLife", "/ok"));
    }

    #[test]
    fn empty_allow_or_disallow_is_ignored() {
        let rules = parse_robots_txt("User-agent: *\nDisallow:\nAllow:\n");
        assert!(rules.is_allowed("AIDigitalLife", "/anything"));
    }

    #[test]
    fn no_rules_for_token_allows_everything() {
        let rules = parse_robots_txt("User-agent: Googlebot\nDisallow: /x\n");
        assert!(rules.is_allowed("AIDigitalLife/1.0", "/x"));
    }

    #[test]
    fn wildcard_star_matches_any_sequence() {
        assert_eq!(longest_match("/a/*/c", "/a/b/c"), Some(6));
        assert_eq!(longest_match("/a*", "/a"), Some(2));
        assert_eq!(longest_match("*", "/anything"), Some(9));
        assert_eq!(longest_match("/a/*/c", "/a/b/d"), None);
    }

    #[test]
    fn dollar_anchor_requires_end_of_path() {
        assert_eq!(longest_match("/a$", "/a"), Some(2));
        assert_eq!(longest_match("/a$", "/ab"), None);
        // 无 $ 时按前缀匹配（最长匹配长度）
        assert_eq!(longest_match("/a", "/ab"), Some(2));
    }

    #[test]
    fn prefix_match_longest_wins_across_rules() {
        let rules =
            parse_robots_txt("User-agent: *\nDisallow: /foo/bar\nDisallow: /foo\nAllow: /foo\n");
        // 最长匹配 /foo/bar (Disallow) 赢过 /foo 的 Allow/Disallow 平局
        assert!(!rules.is_allowed("AIDigitalLife", "/foo/bar"));
        // /foo 上 Allow 与 Disallow 等长 → Allow 赢
        assert!(rules.is_allowed("AIDigitalLife", "/foo"));
    }
}
