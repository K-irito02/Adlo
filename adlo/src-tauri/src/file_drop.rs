//! 窗口级文件拖放的兜底通道。
//!
//! Tauri/wry 的原生拖放回调在该环境没有触发（桌面日志无 `[ADL-DROP]`），因此由
//! `drop_target.rs` 的自有 OLE target 记录落点；这里保存最近一次落点，供前端在
//! `adl:file-drop` 事件丢失时用 `browser_take_pending_drop` 轮询兜底。
//!
//! 落点只在短时间内有效：弹窗关闭期间落下的文件不能被下次打开弹窗时误当成新拖拽。

use std::sync::Mutex;
use std::time::{Duration, Instant};

/// 落点保留时长：足够前端一次轮询周期，过期后丢弃。
const MAX_AGE: Duration = Duration::from_secs(3);

struct PendingDrop {
    paths: Vec<String>,
    at: Instant,
}

static PENDING_DROP: Mutex<Option<PendingDrop>> = Mutex::new(None);

fn lock_pending() -> std::sync::MutexGuard<'static, Option<PendingDrop>> {
    match PENDING_DROP.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            tracing::warn!("[ADL-DROP] pending drop mutex poisoned; recovering");
            poisoned.into_inner()
        },
    }
}

/** 记录一次落点（覆盖未消费的旧值：拖放是瞬时动作）。 */
pub(crate) fn record_drop(paths: &[String]) {
    if paths.is_empty() {
        return;
    }
    let mut pending = lock_pending();
    *pending = Some(PendingDrop { paths: paths.to_vec(), at: Instant::now() });
}

fn take_if_fresh(pending: Option<PendingDrop>, now: Instant) -> Vec<String> {
    match pending {
        Some(drop) if now.duration_since(drop.at) <= MAX_AGE => drop.paths,
        _ => Vec::new(),
    }
}

/** 取出并清空落点路径；过期落点直接丢弃。 */
pub(crate) fn take_pending_drop() -> Vec<String> {
    let mut guard = lock_pending();
    let pending = guard.take();
    take_if_fresh(pending, Instant::now())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn record_and_take_round_trip() {
        record_drop(&["C:/a.png".to_string(), "C:/b.mp4".to_string()]);
        assert_eq!(take_pending_drop(), vec!["C:/a.png".to_string(), "C:/b.mp4".to_string()]);
        assert!(take_pending_drop().is_empty());
    }

    #[test]
    fn record_replaces_previous_drop() {
        record_drop(&["C:/a.png".to_string()]);
        record_drop(&["C:/b.mp4".to_string()]);
        assert_eq!(take_pending_drop(), vec!["C:/b.mp4".to_string()]);
    }

    #[test]
    fn empty_drop_is_ignored() {
        record_drop(&[]);
        assert!(take_pending_drop().is_empty());
    }

    #[test]
    fn stale_drop_is_discarded() {
        let recorded = Instant::now();
        let pending = Some(PendingDrop { paths: vec!["C:/old.png".to_string()], at: recorded });
        let later = recorded + MAX_AGE + Duration::from_millis(1);
        assert!(take_if_fresh(pending, later).is_empty());
    }

    #[test]
    fn fresh_drop_is_returned() {
        let recorded = Instant::now();
        let pending = Some(PendingDrop { paths: vec!["C:/new.png".to_string()], at: recorded });
        assert_eq!(take_if_fresh(pending, recorded + Duration::from_millis(10)).len(), 1);
    }
}
