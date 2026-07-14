use std::sync::OnceLock;

/// Compaction thresholds (matching OpenCode defaults).
pub const PRUNE_MINIMUM: usize = 20_000;
pub const PRUNE_PROTECT: usize = 40_000;
pub const DEFAULT_TAIL_TURNS: usize = 2;
pub const TOOL_OUTPUT_MAX_CHARS: usize = 2_000;
pub const MIN_PRESERVE_RECENT_TOKENS: usize = 2_000;
pub const MAX_PRESERVE_RECENT_TOKENS: usize = 8_000;
pub const PRUNE_PROTECTED_TOOLS: &[&str] = &["skill"];

#[derive(Debug)]
pub struct TokenCounter {
    fallback: fn(&str) -> usize,
}

impl TokenCounter {
    pub fn new() -> Self {
        Self { fallback: adl_types::estimate_tokens }
    }

    pub fn count(&self, text: &str, _provider: &str) -> usize {
        (self.fallback)(text)
    }

    pub fn count_messages(&self, messages: &[String], provider: &str) -> usize {
        messages.iter().map(|m| self.count(m, provider)).sum()
    }

    pub fn needs_compaction(&self, total_tokens: usize) -> bool {
        total_tokens >= PRUNE_MINIMUM
    }

    pub fn compaction_target(&self) -> usize {
        PRUNE_MINIMUM
    }
}

impl Default for TokenCounter {
    fn default() -> Self {
        Self::new()
    }
}

static GLOBAL_COUNTER: OnceLock<TokenCounter> = OnceLock::new();

pub fn global_counter() -> &'static TokenCounter {
    GLOBAL_COUNTER.get_or_init(TokenCounter::new)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn count_returns_positive_for_nonempty() {
        let counter = TokenCounter::new();
        assert!(counter.count("Hello, world!", "openai") > 0);
    }

    #[test]
    fn count_empty_returns_minimum() {
        let counter = TokenCounter::new();
        assert_eq!(counter.count("", "openai"), 1);
    }

    #[test]
    fn cjk_text_counts_higher() {
        let counter = TokenCounter::new();
        let ascii = "a".repeat(100);
        let cjk = "字".repeat(100);
        assert!(counter.count(&cjk, "openai") > counter.count(&ascii, "openai"));
    }

    #[test]
    fn needs_compaction_at_threshold() {
        let counter = TokenCounter::new();
        assert!(counter.needs_compaction(PRUNE_MINIMUM));
        assert!(!counter.needs_compaction(PRUNE_MINIMUM - 1));
    }

    #[test]
    fn compaction_target_is_minimum() {
        let counter = TokenCounter::new();
        assert_eq!(counter.compaction_target(), PRUNE_MINIMUM);
    }

    #[test]
    fn count_messages_sums() {
        let counter = TokenCounter::new();
        let messages = vec!["Hello".to_string(), "World".to_string()];
        let sum = counter.count_messages(&messages, "openai");
        let individual = counter.count("Hello", "openai") + counter.count("World", "openai");
        assert_eq!(sum, individual);
    }

    #[test]
    fn needs_compaction_uses_prune_minimum() {
        let counter = TokenCounter::new();
        // Should trigger at PRUNE_MINIMUM (20000), not PRUNE_PROTECT (40000)
        assert!(
            counter.needs_compaction(PRUNE_MINIMUM),
            "needs_compaction should return true at PRUNE_MINIMUM"
        );
        assert!(
            !counter.needs_compaction(PRUNE_MINIMUM - 1),
            "needs_compaction should return false below PRUNE_MINIMUM"
        );
        // Values between PRUNE_MINIMUM and PRUNE_PROTECT should also trigger
        assert!(
            counter.needs_compaction(PRUNE_MINIMUM + 1000),
            "needs_compaction should return true between PRUNE_MINIMUM and PRUNE_PROTECT"
        );
    }
}
