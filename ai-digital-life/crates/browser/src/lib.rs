mod browser_events;
mod browser_meta;
mod browser_navigation;
mod browser_pool;
mod browser_webview;
mod webview2_audio;
mod webview2_message;
mod webview2_profile;

pub use browser_meta::PageMeta;
pub use browser_pool::BrowserPool;
pub use browser_webview::{Bounds, BrowserManager};
pub use webview2_audio::{mute_tab, setup_audio_changed_handler};
pub use webview2_profile::set_color_scheme as webview2_set_color_scheme;
