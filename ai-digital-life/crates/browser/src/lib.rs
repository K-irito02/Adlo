#![allow(unreachable_pub)]

mod browser_events;
mod browser_meta;
mod browser_navigation;
mod browser_pool;
mod browser_webview;
pub mod html_meta;
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
pub use html_meta::{
    extract_favicon, extract_title, google_favicon_url, html_entity_decode, origin_favicon_fallback,
};
pub use site_meta_cache::{SiteMetaCacheEntry, SiteMetaCacheStore};
pub use webview_handle::{Bounds, EventBridgeRef, WebView2EventBridge, WebViewHandle};
pub use webview2_audio::{mute_tab, setup_audio_changed_handler};
pub use webview2_background::theme_to_rgb;
pub use webview2_cleanup::{clear_cache, clear_cookies};
pub use webview2_profile::set_profile_color_scheme as webview2_set_profile_color_scheme;

pub use browser_webview::setup_webview2_handlers;

#[cfg(windows)]
pub use webview2_background::{navigate_core, set_default_background_color};
