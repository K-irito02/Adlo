use tracing_subscriber::{fmt, EnvFilter};

pub fn init(level: &str) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(level));
    fmt().with_env_filter(filter).with_target(true).with_thread_ids(true).init();
}

pub use tracing::{debug, error, info, trace, warn};

#[cfg(test)]
mod tests {
    use tracing_subscriber::EnvFilter;

    #[test]
    fn env_filter_from_string() {
        let filter = EnvFilter::new("info");
        assert!(filter.max_level_hint().is_some());
    }
}
