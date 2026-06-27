use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::prelude::*;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{fmt, EnvFilter, Registry};

pub fn init(level: &str) {
    init_with_log_dir(level, None);
}

pub fn init_with_log_dir(level: &str, log_dir: Option<&std::path::Path>) {
    let make_filter =
        || EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(level));

    let stdout_layer =
        fmt::layer().with_target(true).with_thread_ids(true).with_filter(make_filter());

    if let Some(dir) = log_dir {
        let log_path = dir.join("terminal-logs.txt");
        let file = std::fs::File::create(&log_path).expect("failed to create terminal-logs.txt");
        let (non_blocking, guard) = tracing_appender::non_blocking(file);
        // Leak the flush guard — it lives for the program's full lifetime,
        // ensuring the last log lines are flushed on shutdown.
        std::mem::forget(guard);

        let file_layer = fmt::layer()
            .with_target(true)
            .with_thread_ids(true)
            .with_writer(non_blocking)
            .with_filter(make_filter());

        Registry::default().with(stdout_layer).with(file_layer).init();
        return;
    }

    Registry::default().with(stdout_layer).init();
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
