//! HTML meta extraction utilities — pure functions for parsing
//! `<title>`, `<link rel="icon">` favicons, and HTML entities from
//! raw HTML responses. These functions perform no I/O and have no
//! dependencies on `reqwest` or platform-specific APIs.

use url::Url;

/// Decode the most common HTML entities (`&amp;`, `&lt;`, `&gt;`,
/// `&quot;`, `&#39;`, `&#x27;`, `&#x2F;`, `&nbsp;`) into their
/// character equivalents.
pub fn html_entity_decode(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&#x2F;", "/")
        .replace("&nbsp;", " ")
}

/// Extract the value of an attribute from an HTML tag (original case).
/// Searches both `attr="..."` and `attr='...'` forms. Used by
/// `extract_meta_content` to read the `content` attribute of `<meta>`
/// tags from the original-case HTML snippet.
fn extract_attr_value(html: &str, attr: &str) -> Option<String> {
    for marker in &[format!("{}=\"", attr), format!("{}='", attr)] {
        if let Some(start) = html.to_lowercase().find(marker) {
            let value_start = start + marker.len();
            let quote = &html.to_lowercase()[value_start - 1..value_start];
            let end =
                html.to_lowercase()[value_start..].find(if quote == "\"" { "\"" } else { "'" })?;
            let raw = &html[value_start..value_start + end];
            if !raw.is_empty() {
                return Some(raw.to_string());
            }
        }
    }
    None
}

/// Extract a `<meta>` tag's `content` attribute by its `property`
/// value (e.g. `og:title`). Performs case-insensitive matching on a
/// lowercased copy of the HTML.
fn extract_meta_content<'a>(lower: &'a str, html: &'a str, property: &str) -> Option<String> {
    let prop_lower = property.to_lowercase();
    let markers = [
        format!("property=\"{}\"", prop_lower),
        format!("property='{}'", prop_lower),
        format!("property = \"{}\"", prop_lower),
        format!("property = '{}'", prop_lower),
    ];
    for marker in &markers {
        if let Some(start) = lower.find(marker) {
            let snippet = &lower[..start];
            let tag_start = snippet.rfind("<meta")?;
            let tag_end = lower[tag_start..].find('>')?;
            let tag = &html[tag_start..tag_start + tag_end];
            if let Some(content) = extract_attr_value(tag, "content") {
                return Some(content);
            }
        }
    }
    None
}

/// Extract the page title from HTML. Tries `<title>` first, then
/// falls back to `<meta property="og:title">`. Returns `None` if
/// neither is present or non-empty. HTML entities in the result are
/// decoded.
pub fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();

    // Try <title> first
    if let Some(t_start) = lower.find("<title") {
        if let Some(t_tag_end) = html[t_start..].find('>') {
            let content_start = t_start + t_tag_end + 1;
            if let Some(t_end) = lower[content_start..].find("</title>") {
                let raw = html[content_start..content_start + t_end].trim();
                if !raw.is_empty() {
                    return Some(html_entity_decode(raw));
                }
            }
        }
    }

    // Fall back to og:title
    if let Some(content) = extract_meta_content(&lower, html, "og:title") {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            return Some(html_entity_decode(trimmed));
        }
    }

    None
}

/// Extract the `href` value from a `<link>` snippet, handling both
/// double and single quotes. Returns `None` if the href is empty or
/// contains whitespace (invalid URL).
fn extract_href(snippet: &str, snippet_lower: &str) -> Option<String> {
    for marker in [r#"href=""#, "href='"] {
        if let Some(start) = snippet_lower.find(marker) {
            let value_start = start + marker.len();
            let quote = &snippet_lower[value_start - 1..value_start];
            let end = snippet_lower[value_start..].find(if quote == "\"" { "\"" } else { "'" })?;
            let raw = snippet[value_start..value_start + end].trim();
            if !raw.is_empty() && !raw.contains(' ') {
                return Some(raw.to_string());
            }
        }
    }
    None
}

/// Resolve a possibly-relative href against a base URL. Handles
/// absolute URLs (`http://`/`https://`), protocol-relative URLs
/// (`//...`), and relative paths via `url::Url::join`.
///
/// Renamed from `resolve_url` (in the original `commands/browser.rs`)
/// to avoid collision with `adl_browser::resolve_url` and to clarify
/// that this resolves `<link href>` values, not page navigation URLs.
fn resolve_href(href: &str, base_url: &str) -> Option<String> {
    if href.starts_with("http://") || href.starts_with("https://") {
        return Some(href.to_string());
    }
    if href.starts_with("//") {
        return Some(format!("https:{}", href));
    }
    let base = Url::parse(base_url).ok()?;
    base.join(href).ok().map(|u| u.to_string())
}

/// Extract the best-matching favicon URL from HTML `<link rel="*icon*">`
/// tags. Scores candidates by rel type, file extension, and `sizes`
/// attribute, returning the highest-scoring resolved href.
pub fn extract_favicon(html: &str, base_url: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let mut best_href = String::new();
    let mut best_score = 0i32;
    let mut search_start = 0usize;

    while let Some(link_pos) = lower[search_start..].find("<link") {
        let abs_link = search_start + link_pos;
        let tag_end = match html[abs_link..].find('>') {
            Some(e) => e,
            None => break,
        };
        let snippet = &html[abs_link..abs_link + tag_end];
        let snippet_lower = &lower[abs_link..abs_link + tag_end];

        let rel = extract_attr(snippet_lower, "rel").unwrap_or_default();
        let rel_lower = rel.to_lowercase();
        if rel_lower.contains("icon") {
            if let Some(href) = extract_href(snippet, snippet_lower) {
                if let Some(resolved) = resolve_href(&href, base_url) {
                    let sizes = extract_attr(snippet_lower, "sizes").unwrap_or_default();
                    let score = favicon_score(&resolved, &rel_lower, &sizes);
                    if score > best_score {
                        best_score = score;
                        best_href = resolved;
                    }
                }
            }
        }
        search_start = abs_link + tag_end;
    }

    if best_href.is_empty() { None } else { Some(best_href) }
}

/// Extract an attribute's value from a lowercased HTML tag snippet.
/// Searches both `attr="..."` and `attr='...'` forms.
fn extract_attr(snippet_lower: &str, attr: &str) -> Option<String> {
    for marker in [format!("{}=\"", attr), format!("{}='", attr)] {
        if let Some(start) = snippet_lower.find(&marker) {
            let value_start = start + marker.len();
            let quote = &snippet_lower[value_start - 1..value_start];
            if let Some(end) =
                snippet_lower[value_start..].find(if quote == "\"" { "\"" } else { "'" })
            {
                return Some(snippet_lower[value_start..value_start + end].to_string());
            }
        }
    }
    None
}

/// Score a favicon candidate by rel type, file extension, and size.
/// Higher scores indicate better-quality icons:
/// SVG (+200) > large PNG (+30 +100) > apple-touch-icon (+50) >
/// generic .ico (+5) > favicon.ico (+1) > other (+10).
fn favicon_score(href: &str, rel: &str, sizes: &str) -> i32 {
    let href_lower = href.to_lowercase();
    let mut score = 0i32;

    if rel.contains("apple-touch-icon") {
        score += 50;
    }

    if let Some(size_match) = sizes.split('x').next() {
        if let Ok(size) = size_match.trim().parse::<i32>() {
            score += size;
        }
    }

    if href_lower.ends_with(".svg") {
        score += 200;
    } else if href_lower.ends_with(".png") {
        score += 30;
        if href_lower.contains("512")
            || href_lower.contains("256")
            || href_lower.contains("192")
            || href_lower.contains("180")
        {
            score += 100;
        }
    } else if href_lower.ends_with("favicon.ico") {
        score += 1;
    } else if href_lower.ends_with(".ico") {
        score += 5;
    } else {
        score += 10;
    }

    score
}

/// Build a Google S2 favicon URL for the given page URL. Returns an
/// empty string for localhost / private addresses (no external
/// favicon lookup for local dev servers).
pub fn google_favicon_url(url: &str) -> String {
    if let Ok(parsed) = Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            if host == "localhost" || host.starts_with("127.") || host.starts_with("192.168.") {
                return String::new();
            }
            return format!("https://www.google.com/s2/favicons?domain={host}&sz=64");
        }
    }
    String::new()
}

/// Fallback to `{origin}/favicon.ico` when no favicon link was found
/// in the HTML. Falls back further to `google_favicon_url` if the
/// URL cannot be parsed.
pub fn origin_favicon_fallback(url: &str) -> String {
    if let Ok(parsed) = Url::parse(url) {
        let origin = parsed.origin().ascii_serialization();
        let ico_url = format!("{origin}/favicon.ico");
        return ico_url;
    }
    google_favicon_url(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_entity_decode_handles_common_entities() {
        assert_eq!(html_entity_decode("a&amp;b"), "a&b");
        assert_eq!(html_entity_decode("a&lt;b&gt;c"), "a<b>c");
        assert_eq!(html_entity_decode("&quot;hi&quot;"), "\"hi\"");
        assert_eq!(html_entity_decode("&#39;x&#x27;"), "'x'");
        assert_eq!(html_entity_decode("&#x2F;path"), "/path");
        assert_eq!(html_entity_decode("a&nbsp;b"), "a b");
    }

    #[test]
    fn html_entity_decode_preserves_plain_text() {
        assert_eq!(html_entity_decode("plain text"), "plain text");
        assert_eq!(html_entity_decode(""), "");
    }

    #[test]
    fn extract_title_from_title_tag() {
        let html = "<html><head><title>My Page</title></head></html>";
        assert_eq!(extract_title(html), Some("My Page".to_string()));
    }

    #[test]
    fn extract_title_falls_back_to_og_title() {
        let html = "<html><head><meta property=\"og:title\" content=\"OG Title\"></head></html>";
        assert_eq!(extract_title(html), Some("OG Title".to_string()));
    }

    #[test]
    fn extract_title_prefers_title_tag_over_og_title() {
        let html = "<head><title>Title Tag</title><meta property=\"og:title\" content=\"OG Title\"></head>";
        assert_eq!(extract_title(html), Some("Title Tag".to_string()));
    }

    #[test]
    fn extract_title_returns_none_when_missing() {
        let html = "<html><head></head></html>";
        assert_eq!(extract_title(html), None);
    }

    #[test]
    fn extract_title_returns_none_for_empty_title() {
        let html = "<title>   </title>";
        assert_eq!(extract_title(html), None);
    }

    #[test]
    fn extract_title_decodes_entities() {
        let html = "<title>A &amp; B</title>";
        assert_eq!(extract_title(html), Some("A & B".to_string()));
    }

    #[test]
    fn extract_favicon_from_link_tag() {
        let html = "<link rel=\"icon\" href=\"/favicon.ico\">";
        assert_eq!(
            extract_favicon(html, "https://example.com/page"),
            Some("https://example.com/favicon.ico".to_string())
        );
    }

    #[test]
    fn extract_favicon_prefers_svg_over_ico() {
        let html = "<link rel=\"icon\" href=\"/favicon.ico\">".to_string()
            + "<link rel=\"icon\" href=\"/icon.svg\">";
        let result = extract_favicon(&html, "https://example.com");
        assert_eq!(result, Some("https://example.com/icon.svg".to_string()));
    }

    #[test]
    fn extract_favicon_returns_none_when_missing() {
        let html = "<html><head></head></html>";
        assert_eq!(extract_favicon(html, "https://example.com"), None);
    }

    #[test]
    fn extract_favicon_returns_none_when_no_icon_rel() {
        let html = "<link rel=\"stylesheet\" href=\"/style.css\">";
        assert_eq!(extract_favicon(html, "https://example.com"), None);
    }

    #[test]
    fn extract_favicon_handles_protocol_relative_href() {
        let html = "<link rel=\"icon\" href=\"//cdn.example.com/icon.png\">";
        assert_eq!(
            extract_favicon(html, "https://example.com"),
            Some("https://cdn.example.com/icon.png".to_string())
        );
    }

    #[test]
    fn google_favicon_url_returns_empty_for_localhost() {
        assert_eq!(google_favicon_url("http://localhost:3000"), "");
        assert_eq!(google_favicon_url("http://127.0.0.1:3000"), "");
        assert_eq!(google_favicon_url("http://192.168.1.1"), "");
    }

    #[test]
    fn google_favicon_url_returns_s2_for_public_host() {
        let result = google_favicon_url("https://example.com/page");
        assert_eq!(result, "https://www.google.com/s2/favicons?domain=example.com&sz=64");
    }

    #[test]
    fn google_favicon_url_returns_empty_for_invalid_url() {
        assert_eq!(google_favicon_url("not-a-url"), "");
    }

    #[test]
    fn origin_favicon_fallback_returns_origin_ico() {
        let result = origin_favicon_fallback("https://example.com/page");
        assert_eq!(result, "https://example.com/favicon.ico");
    }

    #[test]
    fn origin_favicon_fallback_falls_back_to_google_for_invalid_url() {
        let result = origin_favicon_fallback("not-a-url");
        assert_eq!(result, "");
    }

    #[test]
    fn resolve_href_handles_absolute_url() {
        let result = resolve_href("https://foo.com/icon.png", "https://example.com");
        assert_eq!(result, Some("https://foo.com/icon.png".to_string()));
    }

    #[test]
    fn resolve_href_handles_protocol_relative() {
        let result = resolve_href("//cdn.example.com/icon.png", "https://example.com");
        assert_eq!(result, Some("https://cdn.example.com/icon.png".to_string()));
    }

    #[test]
    fn resolve_href_handles_relative_path() {
        let result = resolve_href("/favicon.ico", "https://example.com/page");
        assert_eq!(result, Some("https://example.com/favicon.ico".to_string()));
    }

    #[test]
    fn resolve_href_returns_none_for_invalid_base() {
        let result = resolve_href("/icon.png", "not-a-url");
        assert_eq!(result, None);
    }
}
