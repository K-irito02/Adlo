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

    #[test]
    fn env_filter_from_string_debug() {
        let filter = EnvFilter::new("debug");
        assert!(filter.max_level_hint().is_some());
    }

    #[test]
    fn env_filter_from_string_warn() {
        let filter = EnvFilter::new("warn");
        assert!(filter.max_level_hint().is_some());
    }

    #[test]
    fn env_filter_from_string_error() {
        let filter = EnvFilter::new("error");
        assert!(filter.max_level_hint().is_some());
    }

    #[test]
    fn env_filter_directive_format() {
        let filter = EnvFilter::new("adl_migration=debug");
        assert!(filter.max_level_hint().is_some());
    }

    #[test]
    fn env_filter_multiple_directives() {
        let filter = EnvFilter::new("info,adl_storage=debug,warn");
        assert!(filter.max_level_hint().is_some());
    }
}
