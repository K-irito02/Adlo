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

/// 无 scheme 的"主机[/路径]"标签（如 "douyin.com"、"douyin.com/jingxuan"、
/// "m.youtube.com/watch"）。SPA 水合前 document.title 常回落成这种 URL 片段，
/// 属于占位而非真实标题（与前端 SCHEME_LESS_URL_LABEL 语义一致）。
fn is_scheme_less_url_label(title: &str) -> bool {
    let t = title.trim();
    if t.is_empty() || !t.is_ascii() || t.contains("://") || !t.contains('.') {
        return false;
    }
    url::Url::parse(&format!("http://{t}")).ok().map(|u| u.host_str().is_some()).unwrap_or(false)
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
    t == host || t == format!("www.{host}") || is_scheme_less_url_label(title)
}

/// 反爬 / 验证码 / 安全校验拦截页占位标题检测。
///
/// 站点对爬虫下发验证码页时，`<title>` 常为"验证码_哔哩哔哩"、"安全验证"、
/// "captcha"、"人机验证" 等，这些并非页面真实标题。若被误写为权威缓存，
/// 收藏/标签会长期显示错误标题。命中时调用方应视为"未抓到真实标题"：
/// 丢弃该标题（写缓存时清空），且不得作为权威标题覆盖既有真实标题。
pub fn is_unsafe_title(title: &str) -> bool {
    if title.is_empty() {
        return false;
    }
    let lower = title.trim().to_lowercase();
    // 中文/多语言反爬关键词
    for kw in [
        "验证码",
        "人机验证",
        "安全验证",
        "滑动验证",
        "行为验证",
        "访问验证",
        "安全检查",
        "身份验证",
        "异常访问",
        "访问被拦截",
        "访问拒绝",
        "please confirm you are a human",
        "captcha",
        "verify you are human",
        "are you human",
        "anti-bot",
        "antibot",
        "confirm you are not a robot",
        "robot check",
        "access denied",
        "forbidden",
    ] {
        if lower.contains(kw) {
            return true;
        }
    }
    false
}

/// 已知前端框架默认 favicon 路径检测（Vite / Next.js / Vercel / React 占位图标）。
/// 这些是脚手架占位图，不是站点真实品牌图标；不得作为权威图标覆盖真实 favicon，
/// 也不得优先于 `{origin}/favicon.ico` 惯例兜底被选中。
pub fn is_framework_default_favicon(favicon: &str) -> bool {
    let lower = favicon.trim().to_lowercase();
    if !lower.starts_with("http://") && !lower.starts_with("https://") && !lower.starts_with("//") {
        return false;
    }
    // 匹配 URL 末尾路径段（含 query 前缀），命中已知默认图标文件名。
    let path = lower
        .split_once("://")
        .and_then(|(_, rest)| rest.split_once('/').map(|(_, p)| format!("/{p}")))
        .unwrap_or_else(|| lower.clone());
    let path = path.split(['?', '#']).next().unwrap_or(path.as_str());
    let file = path.rsplit('/').next().unwrap_or("").to_lowercase();
    [
        "vite.svg",
        "next.svg",
        "vercel.svg",
        "now.svg",
        "favicon.svg", // 脚手架默认 favicon.svg
        "logo.svg",
        "react.svg",
        "svelte-logo.svg",
        "nuxt.svg",
        "vitejs.svg",
    ]
    .iter()
    .any(|f| file == *f || path.ends_with(&format!("/{f}")))
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
    // 反爬/验证码标题永远不作为权威标题写入（RW bookmarks 场景）。
    if is_unsafe_title(incoming_title) {
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
    // 框架默认占位图标（vite.svg 等）质量分压低（3，等同未知扩展名），
    // 防止其覆盖真实品牌 favicon 并被锁定（WX3 回归）。
    if is_framework_default_favicon(&lower) {
        return 3;
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
    fn placeholder_title_scheme_less_url_label() {
        // 无 scheme 的主机[/路径]占位（与前端 SCHEME_LESS_URL_LABEL 一致）
        assert!(is_placeholder_title("douyin.com/jingxuan", "https://www.douyin.com/jingxuan"));
        assert!(is_placeholder_title(
            "m.youtube.com/watch?v=AAA",
            "https://www.youtube.com/watch?v=AAA"
        ));
        assert!(is_placeholder_title("a.com/x", "https://a.com/x"));
        // 真实标题不是无 scheme URL 标签
        assert!(!is_placeholder_title("我的书签", "https://a.com/"));
        assert!(!is_placeholder_title("A Real Title", "https://a.com/"));
        assert!(!is_placeholder_title("验证码_哔哩哔哩", "https://www.bilibili.com/"));
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
    fn unsafe_title_detection() {
        // 反爬/验证码标题必须被识别为 unsafe（不得作为权威标题）。
        assert!(is_unsafe_title("验证码_哔哩哔哩"));
        assert!(is_unsafe_title("安全验证 请完成验证"));
        assert!(is_unsafe_title("Please confirm you are a human"));
        assert!(is_unsafe_title("captcha check"));
        assert!(!is_unsafe_title("哔哩哔哩 (゜-゜)つロ 干杯~"));
        assert!(!is_unsafe_title("抖音"));
        assert!(!is_unsafe_title(""));
    }

    #[test]
    fn unsafe_title_never_applies_as_authoritative() {
        // 反爬标题不得覆盖占位标题，也不得作为权威标题写入。
        let url = "https://www.bilibili.com/";
        assert!(!should_apply_exact_match_title(
            "bilibili.com",
            url,
            "验证码_哔哩哔哩",
            META_SOURCE_HTTP,
            None
        ));
    }

    #[test]
    fn framework_default_favicon_detected() {
        assert!(is_framework_default_favicon("https://x.com/vite.svg"));
        assert!(is_framework_default_favicon("https://x.com/assets/vite.svg"));
        assert!(is_framework_default_favicon("https://x.com/next.svg"));
        assert!(is_framework_default_favicon("//cdn.x.com/vercel.svg"));
        assert!(!is_framework_default_favicon("https://x.com/favicon.ico"));
        assert!(!is_framework_default_favicon("https://x.com/real-icon-512.png"));
        assert!(!is_framework_default_favicon("vite.svg")); // 非 URL 不判占位
    }

    #[test]
    fn framework_default_favicon_scored_low() {
        // vite.svg 占位图标质量分压低，不得覆盖真实 /favicon.ico（分 2/3 或更高）。
        assert_eq!(get_favicon_quality_score("https://x.com/vite.svg"), 3);
        // 真实 svg 图标仍是高质量。
        assert_eq!(get_favicon_quality_score("https://x.com/brand/icon.svg"), 10);
        assert!(!should_replace_favicon(
            Some("https://x.com/icon-256.png"),
            "https://x.com/vite.svg"
        ));
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
