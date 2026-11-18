//! 应用自身更新的纯逻辑：更新源顺序、平台键、版本择优与更新说明裁剪。
//!
//! 这里**不做网络请求，也不做下载与安装**：清单拉取、签名校验、下载与运行安装器
//! 都由桌面壳调用官方 `tauri-plugin-updater` 完成（见 ADR-0026）。放在独立 crate 里的
//! 原因是这些规则需要单元测试，且前端契约（版本号、说明首段）与 UI 文案解耦。

use adl_errors::AppError;
use semver::Version;

/// 更新源顺序：Gitee 在前（中国大陆直连更稳），GitHub 兜底（海外与镜像更快）。
///
/// 顺序是语义的一部分：同等版本时先命中的来源胜出；两个来源版本不同时取较新者
/// （见 [`newest_candidate`]），避免某次发版漏更新 Gitee 清单后用户永远收不到更新。
pub const UPDATE_SOURCES: [&str; 2] = [
    "https://gitee.com/K_irito/Adlo/raw/main/release/latest.json",
    "https://github.com/K-irito02/Adlo/releases/latest/download/latest.json",
];

/// 清单 `platforms` 的键：`OS-ARCH`，如 `windows-x86_64`。
/// 无法识别的组合返回错误，而不是猜一个键——猜错会让检查一直「已是最新」。
pub fn target_key(os: &str, arch: &str) -> Result<String, AppError> {
    let os = match os {
        "windows" | "darwin" | "linux" => os,
        other => return Err(AppError::Config(format!("unsupported update os: {other}"))),
    };
    let arch = match arch {
        "x86_64" | "aarch64" | "i686" | "armv7" => arch,
        other => return Err(AppError::Config(format!("unsupported update arch: {other}"))),
    };
    Ok(format!("{os}-{arch}"))
}

/// 单个来源在一次检查中的三态回答。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceState<'a> {
    /// 该来源回答「有新版本」，附版本号。
    Update(&'a str),
    /// 该来源明确回答「已是最新」。
    UpToDate,
    /// 该来源不可用（网络/解析/清单异常）。
    Unavailable,
}

/// 多源合并后的结论：索引指向 `states` 里被选中的那一条。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// 至少一个来源明确说「已是最新」，且没有任何来源报更新。
    UpToDate,
    /// 选中 `states[index]`（`Update`，按 semver 取最高）。
    Found(usize),
    /// 所有来源都不可用——这才是真正的失败。
    Unavailable,
}

/// 合并多源回答（纯函数，便于测试真实分支）：
/// - 有 `Update` → 取版本最高者；
/// - 否则只要有任意 `UpToDate` → 已是最新（单源故障不能把结论翻成失败）；
/// - 全部 `Unavailable` → 失败。
pub fn decide(states: &[SourceState<'_>]) -> Decision {
    let mut best: Option<(Version, usize)> = None;
    let mut any_up_to_date = false;
    for (index, state) in states.iter().enumerate() {
        match state {
            SourceState::Update(version) => {
                if let Some(parsed) = parse_version(version) {
                    if best.as_ref().is_none_or(|(current, _)| parsed > *current) {
                        best = Some((parsed, index));
                    }
                }
            },
            SourceState::UpToDate => any_up_to_date = true,
            SourceState::Unavailable => {},
        }
    }
    match best {
        Some((_, index)) => Decision::Found(index),
        None if any_up_to_date => Decision::UpToDate,
        None => Decision::Unavailable,
    }
}

/// 一个来源回答的候选版本。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceCandidate<'a> {
    pub source: &'a str,
    pub version: &'a str,
}
/// 在多个来源的候选版本里取最新者；版本号无法解析的候选被忽略。
///
/// 返回 `None` 表示没有任何可用候选（全部不可解析）。
pub fn newest_candidate<'a>(
    candidates: &'a [SourceCandidate<'a>],
) -> Option<&'a SourceCandidate<'a>> {
    candidates
        .iter()
        .filter_map(|candidate| {
            parse_version(candidate.version).map(|version| (version, candidate))
        })
        .max_by(|(left, _), (right, _)| left.cmp(right))
        .map(|(_, candidate)| candidate)
}

/// 解析清单里的版本号：允许 `v` 前缀（Tauri 清单两种都接受）。
pub fn parse_version(raw: &str) -> Option<Version> {
    Version::parse(raw.trim().trim_start_matches(['v', 'V'])).ok()
}

/// `candidate` 是否比 `current` 新；任一无法解析时按「不是更新」处理。
pub fn is_newer(candidate: &str, current: &str) -> bool {
    match (parse_version(candidate), parse_version(current)) {
        (Some(candidate), Some(current)) => candidate > current,
        _ => false,
    }
}

/// 把发布说明裁成卡片可用的纯文本：只取第一个非空段落，去掉 Markdown 记号，
/// 压平空白，超长按字符边界截断并补省略号。
///
/// 卡片不渲染 Markdown（见 ADR-0026 的版本约定），所以这里必须产出纯文本，
/// 否则用户会在通知卡里看到 `## ` 之类的原始记号。
pub fn summarize_notes(raw: &str, max_chars: usize) -> String {
    let normalized = raw.replace("\r\n", "\n");
    let mut lines: Vec<String> = Vec::new();
    let mut started = false;
    for line in normalized.lines() {
        let line = line.trim();
        if line.is_empty() {
            if started {
                break;
            }
            continue;
        }
        started = true;
        lines.push(clean_markdown_line(line));
    }

    let paragraph = lines
        .iter()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    truncate_chars(&paragraph, max_chars)
}

/// 去掉行首的 Markdown 记号（标题、引用、列表）与行内记号（反引号、链接、强调）。
fn clean_markdown_line(line: &str) -> String {
    let head = line.trim_start_matches(['#', '>', '*', '-', '+', '`', '_']).trim();
    let inline = clean_inline_markdown(head);
    inline.trim_end_matches(['*', '_', '`']).trim().to_string()
}

/// 行内记号：`code` 去反引号、`[text](url)` 只留 text、`**`/`__`/`~~` 成对去掉。
/// 卡片不渲染 Markdown，残留记号会原样显示给用户。
fn clean_inline_markdown(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut index = 0;
    while index < chars.len() {
        let current = chars[index];
        if current == '`' {
            if let Some(offset) = chars[index + 1..].iter().position(|ch| *ch == '`') {
                out.extend(&chars[index + 1..index + 1 + offset]);
                index = index + offset + 2;
                continue;
            }
        }
        if current == '[' {
            if let Some(close) = chars[index + 1..].iter().position(|ch| *ch == ']') {
                let text_end = index + 1 + close;
                if chars.get(text_end + 1) == Some(&'(') {
                    if let Some(paren) = chars[text_end + 2..].iter().position(|ch| *ch == ')') {
                        out.extend(&chars[index + 1..text_end]);
                        index = text_end + 2 + paren + 1;
                        continue;
                    }
                }
            }
        }
        out.push(current);
        index += 1;
    }
    out.replace("**", "").replace("__", "").replace("~~", "")
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    if max_chars == 0 {
        return String::new();
    }
    let mut out: String = text.chars().take(max_chars).collect();
    if text.chars().count() > max_chars {
        out.push('…');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_key_accepts_known_platforms() {
        assert_eq!(target_key("windows", "x86_64").expect("windows"), "windows-x86_64");
        assert_eq!(target_key("darwin", "aarch64").expect("mac"), "darwin-aarch64");
    }

    #[test]
    fn target_key_rejects_unknown_arch_instead_of_guessing() {
        assert!(target_key("windows", "loongarch64").is_err());
        assert!(target_key("freebsd", "x86_64").is_err());
    }

    #[test]
    fn newest_candidate_picks_highest_semver_across_sources() {
        let candidates = [
            SourceCandidate { source: "gitee", version: "0.1.1" },
            SourceCandidate { source: "github", version: "0.2.0" },
        ];
        let picked = newest_candidate(&candidates).expect("candidate");
        assert_eq!(picked.source, "github");
        assert_eq!(picked.version, "0.2.0");
    }

    #[test]
    fn newest_candidate_tolerates_v_prefix_and_skips_garbage() {
        let candidates = [
            SourceCandidate { source: "gitee", version: "not-a-version" },
            SourceCandidate { source: "github", version: "v0.1.3" },
        ];
        let picked = newest_candidate(&candidates).expect("candidate");
        assert_eq!(picked.source, "github");
        assert!(newest_candidate(&[]).is_none());
    }

    #[test]
    fn is_newer_compares_semver_not_string_order() {
        assert!(is_newer("0.10.0", "0.9.0"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.2.0"));
        assert!(!is_newer("oops", "0.1.0"));
    }

    #[test]
    fn summarize_notes_keeps_first_paragraph_only() {
        let raw = "## 修复\n- 更新不再丢失\n- 修复崩溃\n\n其余细节见 Release。";
        let summary = summarize_notes(raw, 40);
        assert_eq!(summary, "修复 更新不再丢失 修复崩溃");
    }

    #[test]
    fn summarize_notes_truncates_on_char_boundary() {
        let raw = "这是一个非常长的更新说明，用来验证按字符而不是字节截断。";
        let summary = summarize_notes(raw, 6);
        assert_eq!(summary, "这是一个非常…");
    }

    #[test]
    fn summarize_notes_handles_empty_input() {
        assert_eq!(summarize_notes("   \n\n  ", 20), "");
    }

    #[test]
    fn summarize_notes_strips_inline_markdown() {
        assert_eq!(summarize_notes("修复 `a` 崩溃", 40), "修复 a 崩溃");
        assert_eq!(summarize_notes("[详情](https://example.com) 见说明", 40), "详情 见说明");
        assert_eq!(summarize_notes("**重点** 与 ~~旧值~~", 40), "重点 与 旧值");
    }

    #[test]
    fn decide_prefers_update_over_unavailable() {
        let states = [SourceState::Unavailable, SourceState::Update("0.2.0")];
        assert_eq!(decide(&states), Decision::Found(1));
    }

    #[test]
    fn decide_keeps_up_to_date_when_another_source_fails() {
        // 单源被墙/超时不能把「已是最新」翻成失败（否则用户永远看到检查失败）。
        let states = [SourceState::UpToDate, SourceState::Unavailable];
        assert_eq!(decide(&states), Decision::UpToDate);
    }

    #[test]
    fn decide_fails_only_when_every_source_is_unavailable() {
        let states = [SourceState::Unavailable, SourceState::Unavailable];
        assert_eq!(decide(&states), Decision::Unavailable);
    }

    #[test]
    fn decide_picks_highest_version_across_sources() {
        let states = [SourceState::Update("0.1.9"), SourceState::Update("0.2.0")];
        assert_eq!(decide(&states), Decision::Found(1));
        let states = [SourceState::Update("0.10.0"), SourceState::Update("0.9.0")];
        assert_eq!(decide(&states), Decision::Found(0));
    }
}
