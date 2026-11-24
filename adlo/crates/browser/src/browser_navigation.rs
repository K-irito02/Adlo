use adl_errors::AppError;
use url::Url;

/// 初始化脚本：确保所有链接点击都在当前 WebView 中打开
///
/// Source lives in `init_script.js` to enable JS IDE tooling (syntax highlighting,
/// linting, formatting). Inlined at compile time via `include_str!` — no runtime
/// file I/O.
pub const INIT_SCRIPT: &str = include_str!("init_script.js");

/// Generate an initialization script with a hardcoded canvas background color
/// based on the color scheme, applied **only to `about:` documents**.
///
/// Why not apply it to real pages: WebView2's pre-first-paint background is
/// already handled by `SetDefaultBackgroundColor` plus the Profile
/// `PreferredColorScheme`. A persistent inline background on
/// `document.documentElement` overrides the browser's default white canvas, so
/// pages without their own background (plain/local HTML, unstyled exports)
/// render dark while keeping the UA default black text — unreadable and
/// different from Edge/Chrome. Real pages therefore keep normal web semantics;
/// only the offscreen creation document (and other `about:` documents) gets the
/// neutral canvas color.
pub fn init_script_with_background(color_scheme: &str) -> String {
    // Neutral browser-canvas colors; must match `theme_to_rgb` in
    // webview2_background.rs. They are intentionally not the app theme color.
    let bg = match color_scheme {
        "light" => "#f2f2f2",
        _ => "#e0e0e0",
    };
    format!(
        "(function() {{ try {{ if (location.protocol === 'about:') {{ document.documentElement.style.backgroundColor = '{bg}'; }} }} catch(e) {{}} }})();\n{INIT_SCRIPT}"
    )
}

/// Generate the init script with the background color **and** the agent-site
/// link-interception parameters baked into an injected prefix.
///
/// The prefix sets `window.__adlAgentOrigins`, `window.__adlAgentInterceptEnabled`,
/// `window.__adlAgentRules`, and `window.__adlAgentOverridesByOrigin` before
/// `init_script.js` runs, so the first click on a whitelisted agent site
/// intercepts from its first navigation.
pub fn init_script_with_background_and_agent(
    color_scheme: &str,
    agent_origins: &[String],
    agent_intercept_enabled: bool,
    agent_site_rules: &[adl_types::types::config::AgentSiteRule],
    agent_site_overrides: &[adl_types::types::config::AgentSiteOverride],
) -> String {
    let origins = serde_json::to_string(agent_origins).unwrap_or_else(|_| "[]".to_string());
    let rules = serde_json::to_string(agent_site_rules).unwrap_or_else(|_| "[]".to_string());
    let overrides =
        serde_json::to_string(agent_site_overrides).unwrap_or_else(|_| "[]".to_string());
    let prefix = format!(
        "(function() {{ window.__adlAgentOrigins = {origins}; window.__adlAgentInterceptEnabled = {enabled}; window.__adlAgentRules = {rules}; window.__adlAgentOverridesByOrigin = {overrides}; }})();\n",
        enabled = agent_intercept_enabled,
        rules = rules,
        overrides = overrides,
    );
    format!("{prefix}{}", init_script_with_background(color_scheme))
}

pub fn resolve_url(raw: &str) -> Result<Url, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("about:blank") {
        return Url::parse("data:text/html,<html><body></body></html>")
            .map_err(|e| AppError::Internal(format!("invalid url: {e}")));
    }
    if let Ok(parsed) = Url::parse(trimmed) {
        return Ok(parsed);
    }
    if !trimmed.contains("://") {
        let with_scheme = format!("https://{}", trimmed);
        if let Ok(parsed) = Url::parse(&with_scheme) {
            return Ok(parsed);
        }
    }
    Err(AppError::InvalidInput(format!("Cannot parse URL: {}", trimmed)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn background_is_limited_to_about_documents() {
        let dark = init_script_with_background("dark");
        assert!(dark.contains("location.protocol === 'about:'"));
        assert!(dark.contains("#e0e0e0"));
        let guard = dark.find("location.protocol === 'about:'").unwrap();
        let assignment = dark.find("document.documentElement.style.backgroundColor").unwrap();
        assert!(guard < assignment);

        let light = init_script_with_background("light");
        assert!(light.contains("#f2f2f2"));
    }
}
