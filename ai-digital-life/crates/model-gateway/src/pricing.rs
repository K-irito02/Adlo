//! Built-in model price table + cost computation (approximate, USD per 1M tokens).

use adl_types::config::ModelCost;
use adl_types::model::{ModelTokenUsage, ModelUsageCost};

/// Built-in approximate price table. Prices are USD per 1M tokens. Cache read
/// is much cheaper than input; cache write is ~1.25x input (Anthropic 5m/1h).
pub fn lookup_cost(provider_id: &str, model_id: &str) -> Option<ModelCost> {
    let prefix = |id: &str| model_id.starts_with(id);
    let cost = |i, o, r, w| ModelCost {
        input_per_mtok: Some(i),
        output_per_mtok: Some(o),
        cache_read_per_mtok: Some(r),
        cache_write_per_mtok: Some(w),
    };
    match provider_id {
        "anthropic" => {
            if prefix("claude-3-5-sonnet") || prefix("claude-3-7-sonnet") || prefix("claude-sonnet-4") {
                Some(cost(3.0, 15.0, 0.30, 3.75))
            } else if prefix("claude-3-5-haiku") {
                Some(cost(0.80, 4.0, 0.08, 1.00))
            } else if prefix("claude-3-opus") || prefix("claude-opus-4") {
                Some(cost(15.0, 75.0, 1.50, 18.75))
            } else {
                None
            }
        },
        "openai" => {
            // Cached-input rate is ~50% of the input rate.
            if prefix("gpt-4o-mini") {
                Some(cost(0.15, 0.60, 0.075, 0.19))
            } else if prefix("gpt-4o") || prefix("gpt-4.1") {
                Some(cost(2.50, 10.0, 1.25, 3.13))
            } else if prefix("o3") {
                Some(cost(2.0, 8.0, 1.0, 2.50))
            } else if prefix("o4-mini") {
                Some(cost(1.10, 4.40, 0.55, 1.38))
            } else {
                None
            }
        },
        "google" => {
            if prefix("gemini-1.5-pro") || prefix("gemini-2.5-pro") || prefix("gemini-2.0-pro") {
                Some(cost(1.25, 5.0, 0.313, 1.563))
            } else if prefix("gemini-2.0-flash") || prefix("gemini-2.5-flash") {
                Some(cost(0.10, 0.40, 0.025, 0.125))
            } else if prefix("gemini-1.5-flash") {
                Some(cost(0.075, 0.30, 0.019, 0.094))
            } else {
                None
            }
        },
        "deepseek" => {
            if prefix("deepseek-chat") {
                Some(cost(0.27, 1.10, 0.07, 0.27))
            } else if prefix("deepseek-reasoner") {
                Some(cost(0.55, 2.19, 0.14, 0.55))
            } else {
                None
            }
        },
        "openrouter" => {
            // OpenRouter proxies underlying `vendor/model` ids. Delegate to the
            // upstream provider's price table; OpenRouter uses dots where
            // upstream catalogs use hyphens, so retry with dots→hyphens on a
            // miss. Bare OpenRouter routes (e.g. `openrouter/auto`) get a cheap
            // generic default.
            match model_id.split_once('/') {
                Some(("openrouter", _)) => Some(cost(1.0, 4.0, 0.10, 1.0)),
                Some((vendor, model)) => lookup_cost(vendor, model)
                    .or_else(|| lookup_cost(vendor, &model.replace('.', "-"))),
                None if prefix("openrouter") => Some(cost(1.0, 4.0, 0.10, 1.0)),
                None => None,
            }
        },
        "ollama" => Some(cost(0.0, 0.0, 0.0, 0.0)),
        _ => None,
    }
}

fn per_mtok(tokens: Option<u32>, price: Option<f64>) -> Option<f64> {
    match (tokens, price) {
        (Some(t), Some(p)) => Some(t as f64 / 1_000_000.0 * p),
        _ => None,
    }
}

/// Compute the cost of a usage record given a price table entry.
pub fn compute_cost(usage: &ModelTokenUsage, cost: &ModelCost) -> ModelUsageCost {
    // `prompt_tokens` is inclusive of cached tokens (cache creation + cache
    // read + uncached). Bill only the uncached remainder at the input rate;
    // cached tokens are billed separately at their own rates.
    let cached_input = usage
        .cache_read_input_tokens
        .unwrap_or(0)
        .saturating_add(usage.cache_creation_input_tokens.unwrap_or(0));
    let uncached_input = usage.prompt_tokens.map(|t| t.saturating_sub(cached_input));
    let input_cost = per_mtok(uncached_input, cost.input_per_mtok);
    let output_cost = per_mtok(usage.completion_tokens, cost.output_per_mtok);
    let cache_read_cost = per_mtok(usage.cache_read_input_tokens, cost.cache_read_per_mtok);
    let cache_write_cost = per_mtok(usage.cache_creation_input_tokens, cost.cache_write_per_mtok);
    let total_cost = match (input_cost, output_cost, cache_read_cost, cache_write_cost) {
        (None, None, None, None) => None,
        _ => Some(
            input_cost.unwrap_or(0.0)
                + output_cost.unwrap_or(0.0)
                + cache_read_cost.unwrap_or(0.0)
                + cache_write_cost.unwrap_or(0.0),
        ),
    };
    ModelUsageCost { input_cost, output_cost, cache_read_cost, cache_write_cost, total_cost }
}

/// Attach a computed cost to a usage record. Unknown models → `cost` stays None.
pub fn attach_cost(provider_id: &str, model_id: &str, usage: ModelTokenUsage) -> ModelTokenUsage {
    let mut usage = usage;
    if usage.cost.is_none() {
        if let Some(cost) = lookup_cost(provider_id, model_id) {
            usage.cost = Some(compute_cost(&usage, &cost));
        }
    }
    usage
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::model::ModelTokenUsage;

    #[test]
    fn lookup_known_model() {
        let c = lookup_cost("anthropic", "claude-3-5-sonnet-20241022").expect("known");
        assert_eq!(c.input_per_mtok, Some(3.0));
        assert!(c.cache_read_per_mtok.unwrap() < c.input_per_mtok.unwrap());
    }

    #[test]
    fn lookup_unknown_returns_none() {
        assert_eq!(lookup_cost("anthropic", "claude-x-999"), None);
        assert_eq!(lookup_cost("no-such-provider", "x"), None);
    }

    #[test]
    fn ollama_is_zero_cost() {
        let c = lookup_cost("ollama", "llama3.1").expect("ollama table entry");
        assert_eq!(c.input_per_mtok, Some(0.0));
        assert_eq!(c.output_per_mtok, Some(0.0));
    }

    #[test]
    fn lookup_openrouter_delegates_to_upstream() {
        let sonnet = lookup_cost("openrouter", "anthropic/claude-3.5-sonnet")
            .expect("sonnet delegated via openrouter dot→hyphen retry");
        assert_eq!(sonnet.input_per_mtok, Some(3.0));

        let mini = lookup_cost("openrouter", "openai/gpt-4o-mini").expect("gpt-4o-mini delegated");
        assert_eq!(mini.input_per_mtok, Some(0.15));

        let auto = lookup_cost("openrouter", "openrouter/auto").expect("openrouter/auto generic");
        assert_eq!(auto.input_per_mtok, Some(1.0));

        assert_eq!(lookup_cost("openrouter", "nonesuch/x"), None);
    }

    #[test]
    fn openai_cache_read_is_half_of_input() {
        for model in ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "o3", "o4-mini"] {
            let c = lookup_cost("openai", model).expect("known openai model");
            let input = c.input_per_mtok.unwrap();
            let read = c.cache_read_per_mtok.unwrap();
            assert!(
                (read - input / 2.0).abs() < 1e-9,
                "{model}: cache_read {read} should be 50% of input {input}"
            );
        }
    }

    #[test]
    fn compute_cost_sums_components() {
        let usage = ModelTokenUsage {
            prompt_tokens: Some(11000),
            completion_tokens: Some(500),
            cache_read_input_tokens: Some(8000),
            cache_creation_input_tokens: Some(2000),
            ..Default::default()
        };
        let cost = ModelCost {
            input_per_mtok: Some(3.0),
            output_per_mtok: Some(15.0),
            cache_read_per_mtok: Some(0.30),
            cache_write_per_mtok: Some(3.75),
        };
        let c = compute_cost(&usage, &cost);
        assert_eq!(c.input_cost, Some(0.003)); // (11000 - 8000 - 2000) / 1e6 * 3
        assert_eq!(c.output_cost, Some(0.0075)); // 500 / 1e6 * 15
        assert_eq!(c.cache_read_cost, Some(0.0024)); // 8000 / 1e6 * 0.30
        assert_eq!(c.cache_write_cost, Some(0.0075)); // 2000 / 1e6 * 3.75
        let total = c.total_cost.expect("total cost present when all four components present");
        assert!((total - 0.0204).abs() < 1e-9, "total cost {total} should be ≈ 0.0204");
    }

    #[test]
    fn compute_cost_does_not_double_count_cached_tokens() {
        let usage = ModelTokenUsage {
            prompt_tokens: Some(1000),
            completion_tokens: Some(200),
            cache_read_input_tokens: Some(800),
            cache_creation_input_tokens: Some(200),
            ..Default::default()
        };
        let cost = ModelCost {
            input_per_mtok: Some(3.0),
            output_per_mtok: Some(15.0),
            cache_read_per_mtok: Some(0.30),
            cache_write_per_mtok: Some(3.75),
        };
        let c = compute_cost(&usage, &cost);
        assert_eq!(c.input_cost, Some(0.0)); // fully cached: uncached input = 0
        assert_eq!(c.cache_read_cost, Some(0.00024)); // 800 / 1e6 * 0.30
        assert_eq!(c.cache_write_cost, Some(0.00075)); // 200 / 1e6 * 3.75
        let expected = c.output_cost.unwrap() + c.cache_read_cost.unwrap() + c.cache_write_cost.unwrap();
        let total = c.total_cost.expect("total cost present");
        assert!((total - expected).abs() < 1e-9, "total cost {total} should be output + cache only");
    }

    #[test]
    fn compute_cost_handles_missing_prices() {
        let usage = ModelTokenUsage {
            prompt_tokens: Some(1000),
            completion_tokens: Some(500),
            ..Default::default()
        };
        let cost = ModelCost::default(); // all None
        let c = compute_cost(&usage, &cost);
        assert_eq!(c.total_cost, None);
    }

    #[test]
    fn attach_cost_sets_usage_cost_for_known_model() {
        let usage = ModelTokenUsage {
            prompt_tokens: Some(1000),
            completion_tokens: Some(500),
            ..Default::default()
        };
        let out = attach_cost("anthropic", "claude-3-5-sonnet-20241022", usage);
        let c = out.cost.expect("cost attached");
        assert!(c.total_cost.unwrap() > 0.0);
    }

    #[test]
    fn attach_cost_leaves_unknown_usage_cost_none() {
        let usage = ModelTokenUsage { prompt_tokens: Some(1), ..Default::default() };
        assert_eq!(attach_cost("unknown", "x", usage).cost, None);
    }
}