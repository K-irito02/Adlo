use adl_types::now_ms;
use std::sync::atomic::{AtomicI64, Ordering};

/// Global monotonic sequence generator for `DigitalLifeRunActivityEventV1.seq`.
///
/// Why global (not per-run)?
/// - Run activity events can be emitted from multiple command entrypoints (agent/task/patch/command streams).
/// - A single global sequence guarantees uniqueness and monotonic ordering even when multiple events happen
///   within the same millisecond across different call sites/threads.
///
/// The timestamp is still carried separately in `ts`; `seq` is only for stable ordering/collision avoidance.
static RUN_ACTIVITY_SEQ: AtomicI64 = AtomicI64::new(0);

pub fn next_run_activity_seq(ts: i64) -> i64 {
    let base = ts.saturating_mul(1_000); // keep rough time ordering while leaving room for same-ms bursts
    loop {
        let current = RUN_ACTIVITY_SEQ.load(Ordering::Relaxed);
        let next = std::cmp::max(base, current.saturating_add(1));
        if RUN_ACTIVITY_SEQ
            .compare_exchange(current, next, Ordering::SeqCst, Ordering::Relaxed)
            .is_ok()
        {
            return next;
        }
    }
}

/// Ensure the global sequence has a sane starting point (called once during setup).
pub fn init_run_activity_seq_seed() {
    let ts = now_ms();
    let seed = ts.saturating_mul(1_000);
    let _ = RUN_ACTIVITY_SEQ.compare_exchange(0, seed, Ordering::SeqCst, Ordering::Relaxed);
}
