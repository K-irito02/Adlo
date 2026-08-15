# Provider API Caching & Cost Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce API spend by adding Anthropic prompt caching (cache_control breakpoints), OpenAI-compatible cache-token recognition, real usage parsing, per-call cost computation, and frontend cost display — aligned with the OpenCode reference implementation.

**Architecture:** A "cost optimization layer" inside `crates/model-gateway` between `ModelGateway` and the provider adapters. `cache-policy.rs` allocates Anthropic breakpoints (cap 4, mirroring OpenCode `ANTHROPIC_BREAKPOINT_CAP`); `anthropic.rs` injects `cache_control` into system + latest user message when the session has >1 user message; `pricing.rs` holds a built-in per-model price table and computes `ModelUsageCost` from parsed usage; providers parse `cache_creation_input_tokens` / `cache_read_input_tokens` / OpenAI-compatible `cached_tokens` family. Cost is attached centrally in `provider.rs` (non-streaming) and via a stream map (streaming), so no provider repeats pricing logic.

**Tech Stack:** Rust (adl-types, adl-model-gateway, serde_json, ts-rs), React 19 + TypeScript (kernel types, TokenUsage.tsx, i18n).

## Global Constraints

- Test-first (red-green) per `mandatory-testing`; every task ends with a commit.
- All new types are NEW fields — no back-compat migration code (per `AGENTS.md` 禁止项).
- Anthropic `cache_control` must NEVER change message semantics — only add breakpoints; when breakpoints are exhausted, drop (never error).
- All UI text must use i18n keys (en-US + zh-CN parity, enforced by `keys.test.ts`).
- Rust: `cargo clippy --workspace --all-targets -- -D warnings` must stay at 0 warnings.
- Frontend: `pnpm --dir frontend run lint` must stay at 0 errors.
- Baseline test counts: 629 Rust + 1260 frontend tests. Run `cargo test --workspace` and `pnpm --dir frontend run test` to verify.
- Work inside `ai-digital-life/` for all code changes; docs/specs live at repo root.
- ts-rs v10: `ipc-types.generated.ts` is maintained MANUALLY (not generated) — edit it by hand.
- Frontend `ModelTokenUsage` lives in `frontend/src/kernel/types-model.ts` and is re-exported via `frontend/src/shared/ipc/conversation.ts` (no change needed there).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `crates/types/src/types/model.rs` | Extend `ModelTokenUsage` (+`cache_creation_input_tokens`, `cache_read_input_tokens`, `cost: Option<ModelUsageCost>`), add `ModelUsageCost`, add `#[derive(Default)]` |
| `crates/types/src/types/config.rs` | Add `ModelCost` struct; add `cost: Option<ModelCost>` to `ModelDefinition` |
| `crates/model-gateway/src/cache-policy.rs` | NEW: `CacheBreakpoints`, `ttl_bucket` (mirror OpenCode cache-policy) |
| `crates/model-gateway/src/adapter.rs` | Add `CachePolicy` enum + `cache_policy` field on `ChatOptions`; update stub usage constructors |
| `crates/model-gateway/src/pricing.rs` | NEW: `lookup_cost`, `compute_cost`, `attach_cost` + price table |
| `crates/model-gateway/src/providers/base.rs` | `SseEvent::Usage(ModelTokenUsage)` variant; `parse_sse_stream` records pending usage into `StreamChunk::Done` |
| `crates/model-gateway/src/providers/anthropic.rs` | Inject `cache_control` in chat + chat_stream; parse cache usage (non-stream + stream via `message_delta`) |
| `crates/model-gateway/src/providers/openai.rs` | Parse OpenAI-compatible cache usage; `stream_options.include_usage` for stream |
| `crates/model-gateway/src/providers/openrouter.rs` | Same OpenAI-compatible cache usage + `include_usage` |
| `crates/model-gateway/src/providers/google.rs` / `ollama.rs` | Add `..Default::default()` to usage constructors (new fields default None) |
| `crates/model-gateway/src/provider.rs` | Attach cost centrally in `dispatch_to_provider` + `call_provider_stream` (stream map) |
| `frontend/src/kernel/types-model.ts` | Sync `ModelTokenUsage`; add `ModelUsageCost` |
| `frontend/src/shared/ipc-types.generated.ts` | Sync `ModelDefinition`; add `ModelCost` |
| `frontend/src/app/components/conversation/TokenUsage.tsx` | Render cache read/write rows + cost row |
| `frontend/src/app/i18n/en-US/conversation.ts` / `zh-CN/conversation.ts` | New keys |
| `frontend/src/app/stores/activityUtils.ts` | `sumUsageCost` helper for session-level accumulation |
| `frontend/src/app/components/MessageStream.tsx` | Session cost summary line |

---

### Task 1: Rust types — ModelTokenUsage cache+cost fields, ModelCost, ModelUsageCost

**Files:**
- Modify: `crates/types/src/types/model.rs:15-22`
- Modify: `crates/types/src/types/config.rs:75-92`
- Test: inline `#[cfg(test)]` in `crates/types/src/types/model.rs`

**Interfaces:**
- Consumes: existing `ModelTokenUsage`, `ModelDefinition`.
- Produces: `ModelTokenUsage` gains `cache_creation_input_tokens: Option<u32>`, `cache_read_input_tokens: Option<u32>`, `cost: Option<ModelUsageCost>` and derives `Default`. New `ModelUsageCost { input_cost, output_cost, cache_read_cost, cache_write_cost, total_cost: Option<f64> }` (all fields `Option<f64>`, camelCase serde + TS). New `ModelCost { input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok: Option<f64> }` in config.rs; `ModelDefinition` gains `cost: Option<ModelCost>`.

- [ ] **Step 1: Write the failing test**

Add to `crates/types/src/types/model.rs` test module:

```rust
#[test]
fn model_token_usage_default_and_cache_fields() {
    let u = ModelTokenUsage::default();
    assert_eq!(u.cache_creation_input_tokens, None);
    assert_eq!(u.cache_read_input_tokens, None);
    assert_eq!(u.cost, None);
}

#[test]
fn model_usage_cost_roundtrips_camel_case() {
    let c = ModelUsageCost {
        input_cost: Some(0.001),
        output_cost: None,
        cache_read_cost: Some(0.0001),
        cache_write_cost: None,
        total_cost: Some(0.0011),
    };
    let encoded = serde_json::to_string(&c).unwrap();
    assert!(encoded.contains("\"inputCost\""));
    assert!(encoded.contains("\"totalCost\""));
    let decoded: ModelUsageCost = serde_json::from_str(&encoded).unwrap();
    assert_eq!(decoded.input_cost, Some(0.001));
}
```

Add to `crates/types/src/types/config.rs` test module (create one if absent):

```rust
#[test]
fn model_definition_cost_field_defaults_none() {
    let m = ModelDefinition::default();
    assert_eq!(m.cost, None);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-types`
Expected: FAIL — `ModelTokenUsage` has no `Default`, `cache_creation_input_tokens`/`cost` fields, `ModelUsageCost`/`ModelCost` undefined.

- [ ] **Step 3: Write minimal implementation**

In `crates/types/src/types/model.rs`, replace the `ModelTokenUsage` struct:

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelTokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
    pub cache_creation_input_tokens: Option<u32>,
    pub cache_read_input_tokens: Option<u32>,
    pub estimated: Option<bool>,
    pub cost: Option<ModelUsageCost>,
}
```

Add below `ModelTokenUsage`:

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsageCost {
    pub input_cost: Option<f64>,
    pub output_cost: Option<f64>,
    pub cache_read_cost: Option<f64>,
    pub cache_write_cost: Option<f64>,
    pub total_cost: Option<f64>,
}
```

In `crates/types/src/types/config.rs`, add before `ModelDefinition`:

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelCost {
    pub input_per_mtok: Option<f64>,
    pub output_per_mtok: Option<f64>,
    pub cache_read_per_mtok: Option<f64>,
    pub cache_write_per_mtok: Option<f64>,
}
```

Add field to `ModelDefinition` (config.rs:77):

```rust
    #[ts(optional)]
    pub cost: Option<ModelCost>,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-types`
Expected: PASS (all existing tests still pass; new fields default).

- [ ] **Step 5: Fix all downstream constructors**

`cargo check -p adl-model-gateway` will now fail at every explicit `ModelTokenUsage { ... }` literal. In each, add `..Default::default()` after the last existing field:
- `crates/model-gateway/src/adapter.rs:125`
- `crates/model-gateway/src/fallback.rs:46`
- `crates/model-gateway/src/registry.rs:140`
- `crates/model-gateway/src/stream_adapter.rs:143`
- `crates/model-gateway/src/providers/openrouter.rs:208`
- `crates/model-gateway/src/providers/openai.rs:258`
- `crates/model-gateway/src/providers/ollama.rs:205,250`
- `crates/model-gateway/src/providers/google.rs:244`
- `crates/model-gateway/src/providers/base.rs:24,54,66`
- `crates/model-gateway/src/providers/anthropic.rs:238`

Run: `cargo check --workspace` → expect success with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add crates/types/src/types/model.rs crates/types/src/types/config.rs crates/model-gateway/src/adapter.rs crates/model-gateway/src/fallback.rs crates/model-gateway/src/registry.rs crates/model-gateway/src/stream_adapter.rs crates/model-gateway/src/providers
git commit -m "feat(types): add cache tokens and cost fields to ModelTokenUsage and ModelDefinition"
```

---

### Task 2: Frontend type sync — ModelTokenUsage, ModelUsageCost, ModelCost

**Files:**
- Modify: `frontend/src/kernel/types-model.ts:21-26`
- Modify: `frontend/src/shared/ipc-types.generated.ts` (ModelDefinition block + append ModelCost)

**Interfaces:**
- Consumes: Rust type shapes from Task 1.
- Produces: `ModelTokenUsage` with `cacheCreationInputTokens?`, `cacheReadInputTokens?`, `cost?: ModelUsageCost`; new `ModelUsageCost` interface in types-model.ts; `ModelCost` interface + `cost?: ModelCost` on `ModelDefinition` in ipc-types.generated.ts.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/kernel/__tests__/types-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ModelTokenUsage, ModelUsageCost } from '../types-model';

describe('types-model cost surface', () => {
  it('ModelUsageCost exposes camelCase fields', () => {
    const cost: ModelUsageCost = { inputCost: 0.001, totalCost: 0.0011 };
    expect(cost.inputCost).toBe(0.001);
    expect(cost.totalCost).toBe(0.0011);
  });
  it('ModelTokenUsage accepts cache + cost fields', () => {
    const usage: ModelTokenUsage = {
      promptTokens: 10,
      cacheReadInputTokens: 8,
      cacheCreationInputTokens: 2,
      cost: { totalCost: 0.0003 },
    };
    expect(usage.cacheReadInputTokens).toBe(8);
    expect(usage.cost?.totalCost).toBe(0.0003);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend run test -- --run src/kernel/__tests__/types-model.test.ts`
Expected: FAIL — TS compile error (fields do not exist).

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/kernel/types-model.ts`, replace `ModelTokenUsage`:

```ts
export interface ModelTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  estimated?: boolean;
  cost?: ModelUsageCost;
}

export interface ModelUsageCost {
  inputCost?: number;
  outputCost?: number;
  cacheReadCost?: number;
  cacheWriteCost?: number;
  totalCost?: number;
}
```

In `frontend/src/shared/ipc-types.generated.ts`, after the `ModelDefinition` interface:

```ts
export interface ModelCost {
  inputPerMtok?: number;
  outputPerMtok?: number;
  cacheReadPerMtok?: number;
  cacheWritePerMtok?: number;
}
```

And inside `ModelDefinition` add:

```ts
  cost?: ModelCost;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend run test -- --run src/kernel/__tests__/types-model.test.ts` then `pnpm --dir frontend run lint`
Expected: PASS; lint 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/kernel/types-model.ts frontend/src/shared/ipc-types.generated.ts frontend/src/kernel/__tests__/types-model.test.ts
git commit -m "feat(frontend): sync model usage cost types"
```

---

### Task 3: pricing.rs — price table + cost computation

**Files:**
- Create: `crates/model-gateway/src/pricing.rs`
- Modify: `crates/model-gateway/src/lib.rs` (add `pub mod pricing;`)

**Interfaces:**
- Consumes: `ModelTokenUsage`, `ModelUsageCost`, `ModelCost` (Task 1).
- Produces:
  - `pub fn lookup_cost(provider_id: &str, model_id: &str) -> Option<ModelCost>`
  - `pub fn compute_cost(usage: &ModelTokenUsage, cost: &ModelCost) -> ModelUsageCost`
  - `pub fn attach_cost(provider_id: &str, model_id: &str, usage: ModelTokenUsage) -> ModelTokenUsage`

- [ ] **Step 1: Write the failing test**

```rust
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
    fn compute_cost_sums_components() {
        let usage = ModelTokenUsage {
            prompt_tokens: Some(1000),
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
        assert_eq!(c.input_cost, Some(0.003)); // 1000 / 1e6 * 3
        assert_eq!(c.output_cost, Some(0.0075)); // 500 / 1e6 * 15
        assert_eq!(c.cache_read_cost, Some(0.0024)); // 8000 / 1e6 * 0.30
        assert_eq!(c.cache_write_cost, Some(0.0075)); // 2000 / 1e6 * 3.75
        assert_eq!(c.total_cost, Some(0.0204));
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-model-gateway pricing`
Expected: FAIL — `pricing` module does not exist.

- [ ] **Step 3: Write minimal implementation**

```rust
//! Built-in model price table + cost computation (approximate, USD per 1M tokens).

use adl_types::config::ModelCost;
use adl_types::model::{ModelTokenUsage, ModelUsageCost};

/// Built-in approximate price table. Prices are USD per 1M tokens. Cache read
/// is much cheaper than input; cache write is ~1.25x input (Anthropic 5m/1h).
pub fn lookup_cost(provider_id: &str, model_id: &str) -> Option<ModelCost> {
    let prefix = |id: &str| model_id.starts_with(id);
    let table: Option<(f64, f64, f64, f64)> = match provider_id {
        "anthropic" => {
            if prefix("claude-3-5-sonnet") || prefix("claude-3-7-sonnet") || prefix("claude-sonnet-4") {
                Some((3.0, 15.0, 0.30, 3.75))
            } else if prefix("claude-3-5-haiku") {
                Some((0.80, 4.0, 0.08, 1.00))
            } else if prefix("claude-3-opus") || prefix("claude-opus-4") {
                Some((15.0, 75.0, 1.50, 18.75))
            } else {
                None
            }
        },
        "openai" => {
            if prefix("gpt-4o-mini") {
                Some((0.15, 0.60, 0.15, 0.19))
            } else if prefix("gpt-4o") || prefix("gpt-4.1") {
                Some((2.50, 10.0, 2.50, 3.13))
            } else if prefix("o3") {
                Some((2.0, 8.0, 2.0, 2.50))
            } else if prefix("o4-mini") {
                Some((1.10, 4.40, 1.10, 1.38))
            } else {
                None
            }
        },
        "google" => {
            if prefix("gemini-1.5-pro") || prefix("gemini-2.5-pro") || prefix("gemini-2.0-pro") {
                Some((1.25, 5.0, 0.313, 1.563))
            } else if prefix("gemini-2.0-flash") || prefix("gemini-2.5-flash") {
                Some((0.10, 0.40, 0.025, 0.125))
            } else if prefix("gemini-1.5-flash") {
                Some((0.075, 0.30, 0.019, 0.094))
            } else {
                None
            }
        },
        "deepseek" => {
            if prefix("deepseek-chat") {
                Some((0.27, 1.10, 0.07, 0.27))
            } else if prefix("deepseek-reasoner") {
                Some((0.55, 2.19, 0.14, 0.55))
            } else {
                None
            }
        },
        "openrouter" => {
            // OpenRouter proxies underlying models; cheapest common default.
            if prefix("openrouter") { Some((1.0, 4.0, 0.10, 1.0)) } else { None }
        },
        "ollama" => Some((0.0, 0.0, 0.0, 0.0)),
        _ => None,
    };
    table.map(|(i, o, r, w)| ModelCost {
        input_per_mtok: Some(i),
        output_per_mtok: Some(o),
        cache_read_per_mtok: Some(r),
        cache_write_per_mtok: Some(w),
    })
}

fn per_mtok(tokens: Option<u32>, price: Option<f64>) -> Option<f64> {
    match (tokens, price) {
        (Some(t), Some(p)) => Some(t as f64 / 1_000_000.0 * p),
        _ => None,
    }
}

/// Compute the cost of a usage record given a price table entry.
pub fn compute_cost(usage: &ModelTokenUsage, cost: &ModelCost) -> ModelUsageCost {
    let input_cost = per_mtok(usage.prompt_tokens, cost.input_per_mtok);
    let output_cost = per_mtok(usage.completion_tokens, cost.output_per_mtok);
    let cache_read_cost = per_mtok(usage.cache_read_input_tokens, cost.cache_read_per_mtok);
    let cache_write_cost = per_mtok(usage.cache_creation_input_tokens, cost.cache_write_per_mtok);
    let total_cost = match (input_cost, output_cost, cache_read_cost, cache_write_cost) {
        (Some(i), Some(o), Some(r), Some(w)) => Some(i + o + r + w),
        _ => None,
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
```

In `crates/model-gateway/src/lib.rs`, add `pub mod pricing;` after `mod provider;` (keep `mod` for internal-only modules; `pricing` is `pub mod` so `provider.rs` and tests can use it).

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-model-gateway pricing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/model-gateway/src/pricing.rs crates/model-gateway/src/lib.rs
git commit -m "feat(model-gateway): add built-in price table and cost computation"
```

---

### Task 4: cache-policy.rs + ChatOptions.cache_policy

**Files:**
- Create: `crates/model-gateway/src/cache-policy.rs`
- Modify: `crates/model-gateway/src/adapter.rs` (`ChatOptions`), `crates/model-gateway/src/lib.rs` (module decl)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `pub enum CachePolicy { Auto, Off }` (in adapter.rs, `#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]`, `Default = Auto`)
  - `pub struct CacheBreakpoints { remaining: u32, dropped: u32 }` with `new() -> Self` (cap 4), `allocate() -> bool`, `dropped() -> u32`
  - `pub fn ttl_bucket(ttl_seconds: Option<u64>) -> Option<&'static str>` (`>=3600` → `Some("1h")`, else `Some("5m")`)

- [ ] **Step 1: Write the failing test**

`crates/model-gateway/src/cache-policy.rs` inline tests:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn breakpoints_start_at_cap() {
        let mut b = CacheBreakpoints::new();
        for _ in 0..4 {
            assert!(b.allocate(), "should allocate within cap");
        }
        assert!(!b.allocate(), "cap reached");
        assert_eq!(b.dropped(), 1);
    }

    #[test]
    fn allocate_after_full_drops() {
        let mut b = CacheBreakpoints::new();
        for _ in 0..8 {
            b.allocate();
        }
        assert_eq!(b.dropped(), 4);
    }

    #[test]
    fn ttl_bucket_maps_hour_and_minute() {
        assert_eq!(ttl_bucket(Some(3600)), Some("1h"));
        assert_eq!(ttl_bucket(Some(7200)), Some("1h"));
        assert_eq!(ttl_bucket(Some(300)), Some("5m"));
        assert_eq!(ttl_bucket(None), Some("5m"));
    }

    #[test]
    fn cache_policy_default_is_auto() {
        assert_eq!(CachePolicy::default(), CachePolicy::Auto);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-model-gateway cache_policy`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

`crates/model-gateway/src/cache-policy.rs`:

```rust
//! Anthropic cache breakpoint allocation, mirroring OpenCode's
//! `ANTHROPIC_BREAKPOINT_CAP` (cap 4). Breakpoints are ephemeral TTL cache
//! markers: exhausting them is safe — callers simply drop the marker.

/// Anthropic only accepts `5m` / `1h` cache TTLs.
pub fn ttl_bucket(ttl_seconds: Option<u64>) -> Option<&'static str> {
    match ttl_seconds {
        Some(s) if s >= 3600 => Some("1h"),
        _ => Some("5m"),
    }
}

/// Tracks how many Anthropic cache breakpoints remain and how many were dropped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CacheBreakpoints {
    remaining: u32,
    dropped: u32,
}

impl CacheBreakpoints {
    pub const CAP: u32 = 4;

    pub fn new() -> Self {
        Self { remaining: Self::CAP, dropped: 0 }
    }

    /// Try to reserve a breakpoint. Returns `true` if granted, `false` if the
    /// cap was reached (and the caller should skip marking).
    pub fn allocate(&mut self) -> bool {
        if self.remaining == 0 {
            self.dropped += 1;
            false
        } else {
            self.remaining -= 1;
            true
        }
    }

    pub fn dropped(&self) -> u32 {
        self.dropped
    }
}

impl Default for CacheBreakpoints {
    fn default() -> Self {
        Self::new()
    }
}
```

In `crates/model-gateway/src/adapter.rs`, add above `ChatOptions`:

```rust
/// Whether to auto-inject Anthropic cache breakpoints (cache_control).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CachePolicy {
    #[default]
    Auto,
    Off,
}
```

Add field to `ChatOptions`:

```rust
    pub cache_policy: CachePolicy,
```

In `crates/model-gateway/src/lib.rs` add `pub mod cache_policy;` (alphabetical, near `adapter`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-model-gateway cache_policy && cargo check --workspace`
Expected: PASS; `cargo check` succeeds (defaults cover new field).

- [ ] **Step 5: Commit**

```bash
git add crates/model-gateway/src/cache-policy.rs crates/model-gateway/src/adapter.rs crates/model-gateway/src/lib.rs
git commit -m "feat(model-gateway): add cache breakpoint policy and ChatOptions cache_policy"
```

---

### Task 5: Anthropic cache_control injection (chat + chat_stream)

**Files:**
- Modify: `crates/model-gateway/src/providers/anthropic.rs` (`chat`, `chat_stream`, add pure body builder + test)
- Modify: `crates/model-gateway/src/provider.rs` (thread options through)

**Interfaces:**
- Consumes: `CachePolicy`, `CacheBreakpoints` (Task 4), `ModelChatMessage`.
- Produces: pure helper `fn build_anthropic_body(model: &str, messages: &[ModelChatMessage], options: &ChatOptions, stream: bool) -> serde_json::Value` and `fn anthropic_system_and_messages(messages: &[ModelChatMessage], cache_policy: CachePolicy) -> (Option<serde_json::Value>, Vec<serde_json::Value>)`. Both `chat` and `chat_stream` must build their body through these so tests can assert structure without HTTP.

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn anthropic_body_injects_cache_control_on_multi_turn() {
    let msgs = vec![
        ModelChatMessage { role: ConversationRole::System, content: "sys".into() },
        ModelChatMessage { role: ConversationRole::User, content: "first".into() },
        ModelChatMessage { role: ConversationRole::Assistant, content: "hi".into() },
        ModelChatMessage { role: ConversationRole::User, content: "latest".into() },
    ];
    let body = build_anthropic_body("claude-3-5-sonnet", &msgs, &ChatOptions::default(), false);
    // system is a content-block array with cache_control
    let sys = body["system"].as_array().expect("system array");
    assert_eq!(sys[0]["type"], "text");
    assert_eq!(sys[0]["cache_control"]["type"], "ephemeral");
    // only the latest user message becomes a content-block array
    let msgs_arr = body["messages"].as_array().unwrap();
    let latest = msgs_arr.last().unwrap();
    assert_eq!(latest["content"][0]["cache_control"]["type"], "ephemeral");
    // middle user message stays a plain string
    let middle = &msgs_arr[0];
    assert!(middle["content"].is_string(), "non-latest user stays string");
}

#[test]
fn anthropic_body_no_cache_for_single_turn() {
    let msgs = vec![ModelChatMessage { role: ConversationRole::User, content: "hi".into() }];
    let body = build_anthropic_body("m", &msgs, &ChatOptions::default(), false);
    assert!(body["system"].is_null() || body["system"].is_string());
    assert!(body["messages"][0]["content"].is_string());
}

#[test]
fn anthropic_body_cache_policy_off_disables_injection() {
    let msgs = vec![
        ModelChatMessage { role: ConversationRole::User, content: "a".into() },
        ModelChatMessage { role: ConversationRole::User, content: "b".into() },
    ];
    let opts = ChatOptions { cache_policy: CachePolicy::Off, ..Default::default() };
    let body = build_anthropic_body("m", &msgs, &opts, false);
    assert!(body["messages"][1]["content"].is_string());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-model-gateway anthropic_body`
Expected: FAIL — `build_anthropic_body` undefined.

- [ ] **Step 3: Write minimal implementation**

In `anthropic.rs`, add a pure builder:

```rust
/// Split messages into (system_value, body_messages) where the system prompt
/// and the latest user message become Anthropic content-block arrays carrying
/// an ephemeral cache breakpoint when caching is Auto and the session has more
/// than one message (mirrors OpenCode `buildAnthropicMessages`).
fn anthropic_system_and_messages(
    messages: &[ModelChatMessage],
    cache_policy: CachePolicy,
) -> (Option<serde_json::Value>, Vec<serde_json::Value>) {
    let mut breakpoints = CacheBreakpoints::new();
    let multi_turn = messages.len() > 1 && cache_policy == CachePolicy::Auto;

    let mut system: Option<serde_json::Value> = None;
    let user_texts: Vec<&ModelChatMessage> =
        messages.iter().filter(|m| m.role == ConversationRole::User).collect();
    let last_user = user_texts.last().copied();

    let mut out: Vec<serde_json::Value> = Vec::with_capacity(messages.len());
    for m in messages {
        match m.role {
            ConversationRole::System => {
                if multi_turn && breakpoints.allocate() {
                    system = Some(serde_json::json!([{
                        "type": "text",
                        "text": m.content,
                        "cache_control": { "type": "ephemeral" },
                    }]));
                } else {
                    system = Some(serde_json::Value::String(m.content.clone()));
                }
            },
            ConversationRole::User => {
                let is_last_user = last_user.map(|u| std::ptr::eq(u, m)).unwrap_or(false);
                let content = if multi_turn && is_last_user && breakpoints.allocate() {
                    serde_json::json!([{
                        "type": "text",
                        "text": m.content,
                        "cache_control": { "type": "ephemeral" },
                    }])
                } else {
                    serde_json::Value::String(m.content.clone())
                };
                out.push(serde_json::json!({ "role": "user", "content": content }));
            },
            ConversationRole::Assistant => {
                out.push(serde_json::json!({ "role": "assistant", "content": m.content }));
            },
            ConversationRole::Tool => {
                // Anthropic embeds tool results as user messages (existing behavior).
                out.push(serde_json::json!({ "role": "user", "content": m.content }));
            },
        }
    }
    (system, out)
}

fn build_anthropic_body(
    model: &str,
    messages: &[ModelChatMessage],
    options: &ChatOptions,
    stream: bool,
) -> serde_json::Value {
    let (system, messages_arr) =
        anthropic_system_and_messages(messages, options.cache_policy);
    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": 4096,
        "stream": stream,
        "messages": messages_arr,
    });
    if let Some(sys) = system {
        body["system"] = sys;
    }
    body
}
```

Rewrite `chat` to use the builder (replace the manual `system_text` + `messages_arr` + `body` construction, lines 182-212):

```rust
    async fn chat(
        &self,
        model: &str,
        messages: &[ModelChatMessage],
        options: &ChatOptions,
        api_key: &str,
    ) -> Result<ModelResponse, AppError> {
        let body = build_anthropic_body(model, messages, options, false);
        // ... existing URL/builder/send path unchanged ...
```

Rewrite `chat_stream` to use the builder (replace `chat_messages`/`body` construction, lines 254-282):

```rust
        let body = build_anthropic_body(model, messages, options, true);
        // ... existing URL/builder/send path unchanged ...
```

Note `chat_stream`'s existing `_options: &ChatOptions` param must be renamed to `options`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-model-gateway anthropic`
Expected: PASS (new + existing anthropic tests).

- [ ] **Step 5: Commit**

```bash
git add crates/model-gateway/src/providers/anthropic.rs
git commit -m "feat(model-gateway): inject anthropic cache_control breakpoints"
```

---

### Task 6: Stream usage plumbing — SseEvent::Usage + parse_sse_stream pending usage

**Files:**
- Modify: `crates/model-gateway/src/providers/base.rs` (`SseEvent`, `parse_sse_stream`, `sse_event_to_chunk`)
- Modify: `crates/model-gateway/src/providers/anthropic.rs` (`extract_anthropic_event` — handle `message_delta`)

**Interfaces:**
- Consumes: `ModelTokenUsage` (Default now exists).
- Produces: `SseEvent::Usage(ModelTokenUsage)` variant; `parse_sse_stream` records the last `Usage` and emits it inside `StreamChunk::Done` at `[DONE]` / `SseEvent::Done`. `extract_anthropic_event` returns `SseEvent::Usage(usage)` on `message_delta`.

- [ ] **Step 1: Write the failing test**

In `base.rs` tests:

```rust
#[test]
fn sse_event_usage_variant_roundtrips() {
    let usage = ModelTokenUsage {
        cache_read_input_tokens: Some(7),
        ..Default::default()
    };
    match SseEvent::Usage(usage.clone()) {
        SseEvent::Usage(u) => assert_eq!(u.cache_read_input_tokens, Some(7)),
        other => panic!("expected Usage, got {other:?}"),
    }
}
```

In `anthropic.rs` tests:

```rust
#[test]
fn extract_anthropic_message_delta_usage() {
    let json = serde_json::json!({
        "type": "message_delta",
        "message": {
            "usage": {
                "input_tokens": 10,
                "output_tokens": 5,
                "cache_creation_input_tokens": 2,
                "cache_read_input_tokens": 8,
            }
        }
    });
    match extract_anthropic_event(&json) {
        SseEvent::Usage(u) => {
            assert_eq!(u.prompt_tokens, Some(10));
            assert_eq!(u.completion_tokens, Some(5));
            assert_eq!(u.cache_creation_input_tokens, Some(2));
            assert_eq!(u.cache_read_input_tokens, Some(8));
        },
        other => panic!("expected Usage, got {other:?}"),
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-model-gateway sse_event`
Expected: FAIL — `SseEvent::Usage` undefined.

- [ ] **Step 3: Write minimal implementation**

In `base.rs`, add variant to `SseEvent`:

```rust
pub enum SseEvent {
    Delta(String),
    Reasoning(String),
    /// A usage payload observed mid-stream (e.g. Anthropic `message_delta`).
    /// Recorded and attached to the next `Done`.
    Usage(ModelTokenUsage),
    Done,
    Skip,
}
```

Rewrite `parse_sse_stream` to hold pending usage across chunks (a `FnMut` `map` closure capturing `pending_usage`):

```rust
pub fn parse_sse_stream<F>(
    response: reqwest::Response,
    extract: F,
) -> Result<StreamReader, AppError>
where
    F: Fn(&serde_json::Value) -> SseEvent + Send + 'static,
{
    use tokio_stream::StreamExt;

    let mut pending_usage: Option<ModelTokenUsage> = None;
    let stream = response.bytes_stream().map(move |chunk| {
        let chunk = chunk.map_err(|e| AppError::Model(e.to_string()))?;
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    return Ok(StreamChunk::Done(pending_usage.clone().unwrap_or_default()));
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    match extract(&json) {
                        SseEvent::Usage(u) => pending_usage = Some(u),
                        SseEvent::Delta(d) => return Ok(StreamChunk::Delta(d)),
                        SseEvent::Reasoning(r) => return Ok(StreamChunk::ReasoningDelta(r)),
                        SseEvent::Done => {
                            return Ok(StreamChunk::Done(pending_usage.clone().unwrap_or_default()));
                        },
                        SseEvent::Skip => {},
                    }
                }
            }
        }
        Ok(StreamChunk::Delta(String::new()))
    });
    Ok(Box::pin(stream))
}
```

Update `sse_event_to_chunk` to handle `Usage`:

```rust
pub fn sse_event_to_chunk(event: SseEvent) -> Option<StreamChunk> {
    match event {
        SseEvent::Delta(d) => Some(StreamChunk::Delta(d)),
        SseEvent::Reasoning(r) => Some(StreamChunk::ReasoningDelta(r)),
        SseEvent::Done => Some(StreamChunk::Done(ModelTokenUsage::default())),
        SseEvent::Usage(_) => None,
        SseEvent::Skip => None,
    }
}
```

In `anthropic.rs` `extract_anthropic_event`, add the `message_delta` arm:

```rust
        Some("message_delta") => {
            let u = &json["message"]["usage"];
            if u.is_object() {
                let prompt_tokens = u["input_tokens"].as_u64().map(|v| v as u32);
                let completion_tokens = u["output_tokens"].as_u64().map(|v| v as u32);
                let total_tokens = match (prompt_tokens, completion_tokens) {
                    (Some(p), Some(c)) => Some(p + c),
                    _ => None,
                };
                SseEvent::Usage(ModelTokenUsage {
                    prompt_tokens,
                    completion_tokens,
                    total_tokens,
                    cache_creation_input_tokens: u["cache_creation_input_tokens"]
                        .as_u64()
                        .map(|v| v as u32),
                    cache_read_input_tokens: u["cache_read_input_tokens"]
                        .as_u64()
                        .map(|v| v as u32),
                    ..Default::default()
                })
            } else {
                SseEvent::Skip
            }
        },
```

Also update the non-stream `chat` usage parsing in `anthropic.rs` (lines 224-229) to parse cache fields:

```rust
        let cache_creation_input_tokens =
            json["usage"]["cache_creation_input_tokens"].as_u64().map(|v| v as u32);
        let cache_read_input_tokens =
            json["usage"]["cache_read_input_tokens"].as_u64().map(|v| v as u32);
```

and add them to the `ModelTokenUsage` literal (line 238) plus `..Default::default()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-model-gateway sse_event && cargo test -p adl-model-gateway anthropic`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/model-gateway/src/providers/base.rs crates/model-gateway/src/providers/anthropic.rs
git commit -m "feat(model-gateway): parse anthropic stream usage and thread cache tokens"
```

---

### Task 7: OpenAI-compatible cache usage parsing (openai.rs + openrouter.rs)

**Files:**
- Modify: `crates/model-gateway/src/providers/openai.rs` (`extract_openai_delta`, `chat` usage, `chat_stream` body)
- Modify: `crates/model-gateway/src/providers/openrouter.rs` (`chat` usage, `chat_stream` body)

**Interfaces:**
- Consumes: `SseEvent::Usage` (Task 6).
- Produces: shared pure `fn parse_openai_compat_usage(json: &serde_json::Value) -> Option<ModelTokenUsage>` in openai.rs (pub), mapping the field table from the spec: `prompt_tokens_details.cached_tokens`, top-level `cached_tokens`, `prompt_cache_hit_tokens`/`prompt_cache_miss_tokens`, `prompt_tokens_details.cache_creation_input_tokens`. `chat_stream` body gains `stream_options.include_usage: true`. `extract_openai_delta` returns `SseEvent::Usage(..)` for a chunk that carries usage (e.g. final chunk with empty choices).

- [ ] **Step 1: Write the failing test**

In `openai.rs` tests:

```rust
#[test]
fn parse_openai_compat_usage_deepseek_cache_hit() {
    let json = serde_json::json!({
        "usage": {
            "prompt_tokens": 100,
            "completion_tokens": 50,
            "total_tokens": 150,
            "prompt_cache_hit_tokens": 80,
            "prompt_cache_miss_tokens": 20,
        }
    });
    let u = parse_openai_compat_usage(&json).expect("usage");
    assert_eq!(u.prompt_tokens, Some(100));
    assert_eq!(u.cache_read_input_tokens, Some(80));
}

#[test]
fn parse_openai_compat_usage_details_cached() {
    let json = serde_json::json!({
        "usage": {
            "prompt_tokens": 100,
            "prompt_tokens_details": {
                "cached_tokens": 40,
                "cache_creation_input_tokens": 5,
            },
            "completion_tokens": 10,
        }
    });
    let u = parse_openai_compat_usage(&json).expect("usage");
    assert_eq!(u.cache_read_input_tokens, Some(40));
    assert_eq!(u.cache_creation_input_tokens, Some(5));
}

#[test]
fn extract_openai_delta_usage_chunk() {
    let json = serde_json::json!({
        "choices": [],
        "usage": { "prompt_tokens": 5, "completion_tokens": 3 }
    });
    match extract_openai_delta(&json) {
        SseEvent::Usage(u) => {
            assert_eq!(u.prompt_tokens, Some(5));
            assert_eq!(u.completion_tokens, Some(3));
        },
        other => panic!("expected Usage, got {other:?}"),
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-model-gateway openai`
Expected: FAIL — `parse_openai_compat_usage` undefined.

- [ ] **Step 3: Write minimal implementation**

In `openai.rs`, add:

```rust
/// Parse an OpenAI-compatible `usage` payload, normalizing the many cache
/// token field spellings (DeepSeek, xAI, Alibaba, moonshot) into our
/// `ModelTokenUsage`. Mirrors OpenCode `oaCompatHelper.normalizeUsage`.
pub fn parse_openai_compat_usage(json: &serde_json::Value) -> Option<ModelTokenUsage> {
    let u = json["usage"]?; // ? on Value indexing yields Value; use is_object check below
    if !u.is_object() {
        return None;
    }
    let prompt_tokens = u["prompt_tokens"].as_u64().map(|v| v as u32);
    let completion_tokens = u["completion_tokens"].as_u64().map(|v| v as u32);
    let total_tokens = u["total_tokens"].as_u64().map(|v| v as u32);
    let details = &u["prompt_tokens_details"];
    let cache_read = details["cached_tokens"]
        .as_u64()
        .or_else(|| u["cached_tokens"].as_u64())
        .or_else(|| u["prompt_cache_hit_tokens"].as_u64());
    let cache_write = details["cache_creation_input_tokens"].as_u64();
    Some(ModelTokenUsage {
        prompt_tokens,
        completion_tokens,
        total_tokens,
        cache_creation_input_tokens: cache_write.map(|v| v as u32),
        cache_read_input_tokens: cache_read.map(|v| v as u32),
        ..Default::default()
    })
}
```

Note: replace the `?`-on-index idiom with an explicit `if !u.is_object()` guard; `json["usage"]` never errors in serde_json, so `?` would always succeed — write:

```rust
    let u = &json["usage"];
    if !u.is_object() {
        return None;
    }
```

Update `extract_openai_delta` so a usage-only chunk yields `Usage`:

```rust
pub fn extract_openai_delta(json: &serde_json::Value) -> SseEvent {
    // A final chunk with empty choices carries the stream usage.
    let choices = json["choices"].as_array();
    if choices.map(|c| c.is_empty()).unwrap_or(false) {
        if let Some(usage) = parse_openai_compat_usage(json) {
            return SseEvent::Usage(usage);
        }
    }
    let delta = &json["choices"][0]["delta"];
    // ... existing reasoning/content logic unchanged ...
}
```

In `chat` (openai.rs), after parsing prompt/completion/total (line 259-261), add cache fields from `parse_openai_compat_usage`:

```rust
        let cache_usage = parse_openai_compat_usage(&json);
        // usage literal gains:
        //   cache_creation_input_tokens: cache_usage.as_ref().and_then(|u| u.cache_creation_input_tokens),
        //   cache_read_input_tokens: cache_usage.as_ref().and_then(|u| u.cache_read_input_tokens),
        //   ..Default::default()
```

In `chat_stream` (openai.rs), add `stream_options`:

```rust
        let body = build_request_body(
            model,
            messages,
            true,
            Some(serde_json::json!({"stream_options": { "include_usage": true }})),
        );
```

In `openrouter.rs`, apply the same usage cache parsing in `chat` (lines 208-213) and the same `stream_options` in `chat_stream` (line 225). OpenRouter also returns OpenAI-shaped usage.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-model-gateway openai && cargo test -p adl-model-gateway openrouter && cargo check --workspace`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/model-gateway/src/providers/openai.rs crates/model-gateway/src/providers/openrouter.rs
git commit -m "feat(model-gateway): parse openai-compatible cache tokens and stream usage"
```

---

### Task 8: Central cost attachment in provider.rs

**Files:**
- Modify: `crates/model-gateway/src/provider.rs` (`dispatch_to_provider`, `call_provider_stream`)
- Test: inline test in `provider.rs`

**Interfaces:**
- Consumes: `pricing::attach_cost` (Task 3).
- Produces: every non-stream `ModelResponse.usage` carries `cost`; every `StreamChunk::Done(usage)` in the returned stream carries `cost`.

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn attach_cost_to_stream_done_chunk() {
    let stream = crate::adapter::StreamReader::from(Box::pin(tokio_stream::iter(vec![
        Ok(crate::adapter::StreamChunk::Done(ModelTokenUsage {
            prompt_tokens: Some(1000),
            completion_tokens: Some(500),
            ..Default::default()
        })),
    ])));
    let mapped = with_stream_cost("anthropic", "claude-3-5-sonnet-20241022", stream);
    let mut pinned = mapped;
    // consume and assert via stream_adapter-style loop (use tokio_stream::StreamExt)
}
```

Use a simpler assert by exposing a small test-only helper `fn with_stream_cost(provider: &str, model: &str, stream: StreamReader) -> StreamReader` and consuming it:

```rust
#[tokio::test]
async fn stream_done_chunk_gets_cost() {
    let stream: StreamReader = Box::pin(tokio_stream::iter(vec![
        Ok(StreamChunk::Done(ModelTokenUsage {
            prompt_tokens: Some(1000),
            completion_tokens: Some(500),
            ..Default::default()
        })),
    ]));
    let mut pinned = with_stream_cost("anthropic", "claude-3-5-sonnet-20241022", stream);
    let item = tokio_stream::StreamExt::next(&mut pinned).await.unwrap().unwrap();
    match item {
        StreamChunk::Done(usage) => assert!(usage.cost.is_some()),
        _ => panic!("expected Done"),
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p adl-model-gateway stream_done_chunk_gets_cost`
Expected: FAIL — `with_stream_cost` undefined.

- [ ] **Step 3: Write minimal implementation**

In `provider.rs`:

```rust
use tokio_stream::StreamExt;

/// Attach cost to every `Done` chunk in a stream for the given (provider, model).
fn with_stream_cost(provider: &str, model: &str, stream: StreamReader) -> StreamReader {
    Box::pin(stream.map(move |chunk| {
        chunk.map(|c| match c {
            StreamChunk::Done(usage) => StreamChunk::Done(crate::pricing::attach_cost(provider, model, usage)),
            other => other,
        })
    }))
}
```

In `dispatch_to_provider` (after `adapter.chat(...).await`):

```rust
    let mut resp = adapter.chat(model_id, messages, &options, api_key).await?;
    if let Some(usage) = resp.usage.take() {
        resp.usage = Some(crate::pricing::attach_cost(provider, model_id, usage));
    }
    Ok(resp)
```

In `call_provider_stream` (replace the `adapter.chat_stream(...).await` return):

```rust
    let stream = adapter.chat_stream(model_id, messages, &options, &api_key).await?;
    Ok(with_stream_cost(provider, model_id, stream))
```

Add missing imports if needed (`StreamChunk`, `tokio_stream::StreamExt`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-model-gateway stream_done_chunk_gets_cost && cargo test -p adl-model-gateway`
Expected: PASS (full crate suite green).

- [ ] **Step 5: Commit**

```bash
git add crates/model-gateway/src/provider.rs
git commit -m "feat(model-gateway): attach computed cost to all provider responses"
```

---

### Task 9: Frontend cost display — TokenUsage.tsx + i18n + session accumulation

**Files:**
- Modify: `frontend/src/app/components/conversation/TokenUsage.tsx`
- Modify: `frontend/src/app/i18n/en-US/conversation.ts`, `frontend/src/app/i18n/zh-CN/conversation.ts`
- Modify: `frontend/src/app/stores/activityUtils.ts` (add `sumUsageCost`)
- Modify: `frontend/src/app/components/MessageStream.tsx` (session cost line)

**Interfaces:**
- Consumes: `ModelTokenUsage.cost` + cache fields (Task 2 types).
- Produces: TokenUsage renders cache read/write token rows + a cost row (formatted, "≈$0.0003"); `sumUsageCost(usages: (ModelTokenUsage | undefined)[]): number` for session accumulation; MessageStream shows a session total.

- [ ] **Step 1: Write the failing test**

`frontend/src/app/stores/__tests__/activityUtils.test.ts` (create if missing):

```ts
import { describe, it, expect } from 'vitest';
import type { ModelTokenUsage } from '@ai-digital-life/kernel';
import { sumUsageCost } from '../activityUtils';

describe('sumUsageCost', () => {
  it('sums totalCost across usages, ignoring undefined', () => {
    const usages: (ModelTokenUsage | undefined)[] = [
      { totalTokens: 10, cost: { totalCost: 0.0003 } },
      undefined,
      { totalTokens: 5, cost: { totalCost: 0.0001 } },
    ];
    expect(sumUsageCost(usages)).toBeCloseTo(0.0004, 6);
  });
  it('returns 0 for empty input', () => {
    expect(sumUsageCost([])).toBe(0);
  });
  it('ignores usages without cost', () => {
    expect(sumUsageCost([{ totalTokens: 3 }, { cost: { totalCost: 0.5 } }])).toBeCloseTo(0.5, 6);
  });
});
```

Add i18n key test to `frontend/src/app/i18n/__tests__/keys.test.ts`:

```ts
  it('includes token usage cost keys', () => {
    expect(enUS).toHaveProperty('tokenUsageCacheRead');
    expect(enUS).toHaveProperty('tokenUsageCacheWrite');
    expect(enUS).toHaveProperty('tokenUsageCost');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend run test -- --run src/app/stores/__tests__/activityUtils.test.ts src/app/i18n/__tests__/keys.test.ts`
Expected: FAIL — `sumUsageCost` undefined; new i18n keys missing.

- [ ] **Step 3: Write minimal implementation**

`activityUtils.ts` — add:

```ts
/** Sum the total cost (USD) across run usages. */
export function sumUsageCost(usages: (ModelTokenUsage | undefined)[]): number {
  return usages.reduce((acc, u) => acc + (u?.cost?.totalCost ?? 0), 0);
}
```

`en-US/conversation.ts` — after `tokenUsageTotal` add:

```ts
  tokenUsageCacheRead: 'Cache read',
  tokenUsageCacheWrite: 'Cache write',
  tokenUsageCost: 'Cost',
```

`zh-CN/conversation.ts` — after `tokenUsageTotal` add:

```ts
  tokenUsageCacheRead: '缓存读取',
  tokenUsageCacheWrite: '缓存写入',
  tokenUsageCost: '成本',
```

`TokenUsage.tsx` — extend the detail section (keep existing structure/classes):

```tsx
          <span>
            {t.tokenUsageInput}: {(usage.promptTokens ?? 0).toLocaleString()}
          </span>
          <span>
            {t.tokenUsageOutput}: {(usage.completionTokens ?? 0).toLocaleString()}
          </span>
          {usage.cacheReadInputTokens ? (
            <span>
              {t.tokenUsageCacheRead}: {usage.cacheReadInputTokens.toLocaleString()}
            </span>
          ) : null}
          {usage.cacheCreationInputTokens ? (
            <span>
              {t.tokenUsageCacheWrite}: {usage.cacheCreationInputTokens.toLocaleString()}
            </span>
          ) : null}
          {usage.cost?.totalCost ? (
            <span>
              {t.tokenUsageCost}: ≈${usage.cost.totalCost.toFixed(4)}
            </span>
          ) : null}
```

`MessageStream.tsx` — compute session cost in the top-level component (where `runUsageByRunId` is destructured, ~line 209) and render a line above the list:

```tsx
  const sessionCost = useMemo(
    () => sumUsageCost(Object.values(runUsageByRunId)),
    [runUsageByRunId],
  );
```

Render (near the list container) only when `sessionCost > 0`:

```tsx
  {sessionCost > 0 ? (
    <div className="adl-session-cost">
      {t.tokenUsageCost}: ≈${sessionCost.toFixed(4)}
    </div>
  ) : null}
```

Import `sumUsageCost` from `../../stores/activityUtils` (adjust relative path to actual location).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend run test -- --run src/app/stores/__tests__/activityUtils.test.ts src/app/i18n/__tests__/keys.test.ts` then `pnpm --dir frontend run lint`
Expected: PASS; lint 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/conversation/TokenUsage.tsx frontend/src/app/components/MessageStream.tsx frontend/src/app/stores/activityUtils.ts frontend/src/app/i18n/en-US/conversation.ts frontend/src/app/i18n/zh-CN/conversation.ts frontend/src/app/stores/__tests__/activityUtils.test.ts frontend/src/app/i18n/__tests__/keys.test.ts
git commit -m "feat(frontend): display cache tokens and call cost in usage summary"
```

---

### Task 10: Full quality gates

**Files:** none (verification only).

- [ ] **Step 1: Run Rust checks**

```bash
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: all pass; clippy 0 warnings. Fix any clippy nits introduced by the plan (e.g. `ptr::eq` in Task 5 could trigger a clippy lint — if so, replace with an index-based comparison of the message position).

- [ ] **Step 2: Run frontend checks**

```bash
pnpm --dir frontend run test
pnpm --dir frontend run lint
```
Expected: all pass; lint 0 errors (pre-existing warnings acceptable).

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "chore: satisfy quality gates after caching cost work"
```

---

## Self-Review Notes

- **Spec coverage:** ① breakpoints → Tasks 4+5; ② OpenAI-compatible cache → Task 7 (and Task 6 for anthropic stream); ③ pricing/cost → Tasks 3+8; ④ frontend → Tasks 2+9. All four confirmed capabilities covered.
- **Type consistency:** `ModelTokenUsage` gains 3 fields once (Task 1) and is threaded via `..Default::default()` everywhere. `ModelUsageCost`/`ModelCost` names match across Rust, TS, and the generated file. `SseEvent::Usage` is the single mid-stream usage carrier. `attach_cost`/`with_stream_cost` signatures are consistent between Task 3 and Task 8.
- **No placeholders:** every step has concrete code. Anthropic price values in Task 3 are approximations and flagged as such in UI ("≈").
- **Dependency order:** Task 1 → 2 (types), 3 → 8 (pricing), 4 → 5 (policy), 6 → 7 (stream usage). No forward references.
