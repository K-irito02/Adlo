//! 标题合并与图标质量门控的纯函数（从前端 useBrowserPageMeta.ts / faviconQuality.ts 迁移）。

pub const META_SOURCE_COM: &str = "com";
pub const META_SOURCE_HTTP: &str = "http";
pub const META_SOURCE_IFRAME: &str = "iframe";
pub const META_SOURCE_GOOGLE: &str = "google";

fn hostname_without_www(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .map(|h| h.strip_prefix("www.").unwrap_or(&h).to_lowercase())
        .unwrap_or_default()
}

pub fn is_placeholder_title(title: &str, url: &str) -> bool {
    if title.is_empty() {
        return true;
    }
    if title == url {
        return true;
    }
    let lower_title = title.to_lowercase();
    if lower_title.starts_with("http://") || lower_title.starts_with("https://") {
        return true;
    }
    let host = hostname_without_www(url);
    if host.is_empty() {
        return false;
    }
    let t = title.trim().to_lowercase();
    t == host || t == format!("www.{host}")
}

pub fn should_apply_exact_match_title(
    current_title: &str,
    url: &str,
    incoming_title: &str,
    source: &str,
    current_source: Option<&str>,
) -> bool {
    if incoming_title.is_empty() {
        return false;
    }
    if incoming_title == current_title {
        return false;
    }
    if is_placeholder_title(incoming_title, url) {
        return false;
    }
    if is_placeholder_title(current_title, url) {
        return true;
    }
    if source == META_SOURCE_HTTP || source == META_SOURCE_IFRAME {
        return true;
    }
    if source == META_SOURCE_COM {
        return matches!(current_source, Some(META_SOURCE_COM) | Some(META_SOURCE_GOOGLE));
    }
    false
}

pub fn get_favicon_quality_score(favicon: &str) -> i32 {
    // 与前端 faviconQuality.ts 完全一致（Google S2=1, /favicon.ico=2, .ico=4,
    // svg=10, png 按尺寸 11-15, 其余=3）
    let lower = favicon.to_lowercase();
    if lower.is_empty() {
        return 0;
    }
    if ["google.com/s2/favicons", "favicon.cc", "faviconkit", "besticon", "favicon-generator"]
        .iter()
        .any(|k| lower.contains(k))
    {
        return 1;
    }
    if lower.ends_with("/favicon.ico") {
        return 2;
    }
    if lower.ends_with("favicon.ico") {
        return 3;
    }
    if lower.ends_with(".ico") {
        return 4;
    }
    if lower.ends_with(".svg") {
        return 10;
    }
    if lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".webp")
        || lower.ends_with(".gif")
    {
        if let Some(size) = regex_size(&lower) {
            return if size >= 256 {
                15
            } else if size >= 128 {
                14
            } else if size >= 64 {
                13
            } else if size >= 32 {
                12
            } else {
                11
            };
        }
        if lower.contains("apple-touch-icon") {
            return 13;
        }
        if ["512", "256", "192", "180"].iter().any(|k| lower.contains(k)) {
            return 14;
        }
        return 11;
    }
    3
}

/// 与前端 faviconQuality.ts 的 /(\d+)(?:x\d+)?\.(?:png|jpg|webp|gif)$/ 完全同构：
/// 仅命中文件名结尾的 "NNN" 或 "NNNxMMM" 数字段，返回第一个数字段（group1）。
fn regex_size(lower: &str) -> Option<i32> {
    let rest = [".png", ".jpg", ".jpeg", ".webp", ".gif"]
        .iter()
        .find_map(|ext| lower.strip_suffix(ext))?;
    let bytes = rest.as_bytes();
    let mut end = rest.len();
    while end > 0 && bytes[end - 1].is_ascii_digit() {
        end -= 1;
    }
    if end == rest.len() {
        return None; // 文件名结尾无数字
    }
    let second: &str = &rest[end..];
    let before = &rest[..end];
    if let Some(first_rest) = before.strip_suffix('x') {
        // "NNNxMMM"：前端正则 group1 是 'x' 前的数字段
        let fb = first_rest.as_bytes();
        let mut fe = first_rest.len();
        while fe > 0 && fb[fe - 1].is_ascii_digit() {
            fe -= 1;
        }
        if fe < first_rest.len() {
            return first_rest[fe..].parse::<i32>().ok();
        }
    }
    second.parse::<i32>().ok()
}

pub fn should_replace_favicon(existing: Option<&str>, incoming: &str) -> bool {
    if incoming.is_empty() {
        return false;
    }
    if existing.is_some_and(|e| e.starts_with("data:")) {
        return false;
    }
    match existing {
        None => true,
        Some(existing) => {
            get_favicon_quality_score(incoming) >= get_favicon_quality_score(existing)
        },
    }
}

pub fn existing_favicon_baseline(favicon_data_uri: &str, favicon_url: &str) -> String {
    if !favicon_data_uri.is_empty() {
        favicon_data_uri.to_string()
    } else if !favicon_url.is_empty() {
        favicon_url.to_string()
    } else {
        String::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholder_title_detection() {
        assert!(is_placeholder_title("", "https://a.com/"));
        assert!(is_placeholder_title("https://a.com/", "https://a.com/"));
        assert!(is_placeholder_title("douyin.com", "https://www.douyin.com/"));
        assert!(!is_placeholder_title("真实标题", "https://a.com/"));
        // scheme 前缀大小写不敏感（与前端 /^https?:\/\//i 一致）
        assert!(is_placeholder_title("HTTP://A.COM/", "https://a.com/"));
    }

    #[test]
    fn exact_match_title_rules() {
        let url = "https://a.com/video";
        // 占位可被任意来源覆盖
        assert!(should_apply_exact_match_title("a.com", url, "新标题", META_SOURCE_COM, None));
        // http 可覆盖任意
        assert!(should_apply_exact_match_title(
            "旧标题",
            url,
            "新标题",
            META_SOURCE_HTTP,
            Some(META_SOURCE_COM)
        ));
        // com 不能覆盖 http 来源的真实标题
        assert!(!should_apply_exact_match_title(
            "真实标题",
            url,
            "陈旧标题",
            META_SOURCE_COM,
            Some(META_SOURCE_HTTP)
        ));
        // com 可覆盖 com/google 来源
        assert!(should_apply_exact_match_title(
            "旧com标题",
            url,
            "新com标题",
            META_SOURCE_COM,
            Some(META_SOURCE_COM)
        ));
        // 相同标题不应用
        assert!(!should_apply_exact_match_title("标题", url, "标题", META_SOURCE_HTTP, None));
    }

    #[test]
    fn favicon_quality_gate() {
        let high = Some("https://cdn.example.com/icon-256.png");
        // 低质量（Google S2 / favicon.ico）不覆盖高质量
        assert!(!should_replace_favicon(high, "https://www.google.com/s2/favicons?domain=x"));
        assert!(!should_replace_favicon(high, "https://x.com/favicon.ico"));
        // 高质量覆盖低质量/空
        assert!(should_replace_favicon(None, "https://x.com/icon-256.png"));
        assert!(should_replace_favicon(
            Some("https://x.com/favicon.ico"),
            "https://x.com/icon-256.png"
        ));
        // dataUri 不可覆盖
        assert!(!should_replace_favicon(Some("data:image/png;base64,AA"), "https://x.com/big.png"));
        assert_eq!(get_favicon_quality_score("https://x.com/icon-256.png"), 15);
        // 同尺寸高分：icon-512.png → 15（regex_size 尾数字段语义）
        assert_eq!(get_favicon_quality_score("https://x.com/icon-512.png"), 15);
    }

    #[test]
    fn favicon_score_extras() {
        assert_eq!(get_favicon_quality_score("https://x.com/icon.svg"), 10);
        assert_eq!(get_favicon_quality_score("https://x.com/apple-touch-icon.png"), 13);
    }

    #[test]
    fn favicon_quality_size_extraction_matches_frontend_regex() {
        // 不等宽 NNNxMMM：前端 group1 取第一个数字段
        assert_eq!(get_favicon_quality_score("https://x.com/icon-256x128.png"), 15);
        assert_eq!(get_favicon_quality_score("https://x.com/icon-128x256.png"), 14);
        // 带 query：前端 faviconQuality.ts 的尺寸/回落分支以 endsWith('.png'|'.jpg'|'.webp'|'.gif')
        // 为门，'.png?v=2' 结尾不命中 → 直接返回 3（与前端实测行为一致）
        assert_eq!(get_favicon_quality_score("https://x.com/icon-256.png?v=2"), 3);
        // 无数字结尾
        assert_eq!(get_favicon_quality_score("https://x.com/icon.png"), 11);
    }
}
