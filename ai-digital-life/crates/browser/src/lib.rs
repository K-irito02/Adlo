#![allow(unreachable_pub)]

mod browser_events;
mod browser_meta;
mod browser_navigation;
mod browser_pool;
mod browser_webview;
pub mod html_meta;
mod meta_merge;
mod page_meta_service;
pub mod robots_policy;
pub mod robots_txt;
mod site_meta_cache;
mod webview2_audio;
mod webview2_background;
mod webview2_cleanup;
mod webview2_favicon;
mod webview2_history;
mod webview2_message;
mod webview2_postmessage;
mod webview2_profile;
mod webview2_title;
pub mod webview_handle;

pub use browser_events::navigation_handler;
pub use browser_meta::PageMeta;
pub use browser_navigation::{INIT_SCRIPT, init_script_with_background, resolve_url};
pub use browser_pool::BrowserPool;
pub use browser_webview::{BROWSER_WEBVIEW_LABEL, BrowserManager, webview_label};
pub use html_meta::{extract_favicon, extract_title, html_entity_decode, origin_favicon_fallback};
pub use meta_merge::{
    META_SOURCE_COM, META_SOURCE_GOOGLE, META_SOURCE_HTTP, META_SOURCE_IFRAME,
    existing_favicon_baseline, get_favicon_quality_score, is_placeholder_title,
    should_apply_exact_match_title, should_replace_favicon,
};
pub use page_meta_service::{
    META_TTL_MS, PageMetaFetcher, PageMetaService, RETRY_BASE_MS, RETRY_MAX_MS,
};
pub use site_meta_cache::{SiteMetaCacheEntry, SiteMetaCacheStore, normalize_cache_key};
pub use webview_handle::{Bounds, EventBridgeRef, WebView2EventBridge, WebViewHandle};
pub use webview2_audio::{mute_tab, setup_audio_changed_handler};
pub use webview2_background::theme_to_rgb;
pub use webview2_cleanup::{clear_cache, clear_cookies};
pub use webview2_profile::set_profile_color_scheme as webview2_set_profile_color_scheme;

pub use browser_webview::setup_webview2_handlers;
pub use webview2_history::{can_go_back_webview2, can_go_forward_webview2};

#[cfg(windows)]
pub use webview2_background::{navigate_core, set_default_background_color};
