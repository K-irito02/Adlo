//! 系统剪贴板变化监听器。
//!
//! 基于 `clipboard-win` 的 `monitor` feature（`AddClipboardFormatListener` 消息窗口）。
//! `Monitor` 必须在其自身线程中创建并消费（不可跨线程移动），因此 `spawn` 在后台线程
//! 内新建 `Monitor`，并把 `Shutdown` 句柄经通道回传给外部用于优雅停止。变化事件到达时
//! 调用 `crate::read::read_current` 读取并入库，新条目对外广播 `Some(id)`，去重合并广播
//! `None`。

use std::sync::{Arc, mpsc};
use std::thread::{self, JoinHandle};

use clipboard_win::monitor::{Monitor, Shutdown};
use tokio::sync::broadcast;

use crate::read::read_current;
use crate::store::ClipboardStore;

/// 监听系统剪贴板变化；变化时入库，并通过 broadcast 对外发布新条目 id。
pub struct ClipboardMonitor {
    tx: broadcast::Sender<Option<String>>,
}

impl ClipboardMonitor {
    /// 创建监听器（尚未启动）。`broadcast` 容量取 128，落后消费者会被 `Lagged` 跳过。
    pub fn new() -> Self {
        let (tx, _rx) = broadcast::channel(128);
        Self { tx }
    }

    /// 订阅剪贴板变化事件：`Some(id)` 表示新条目，`None` 表示去重合并。
    pub fn subscribe(&self) -> broadcast::Receiver<Option<String>> {
        self.tx.subscribe()
    }

    /// 在后台线程启动监听。`store` 需可跨线程共享（`adl-storage::Database` 为 r2d2 连接池，
    /// `ClipboardStore` 是 `Send + Sync`）。
    ///
    /// 返回句柄；调用 `ClipboardMonitorHandle::stop()`（或让其 Drop）可请求停止并回收线程。
    pub fn spawn(self, store: Arc<ClipboardStore>) -> ClipboardMonitorHandle {
        let tx = self.tx;
        let (stop_tx, stop_rx) = mpsc::channel::<Shutdown>();

        let handle = thread::spawn(move || {
            // Monitor 必须在创建它的线程中消费；无法创建则静默退出（剪贴板监听不可用）。
            let mut monitor = match Monitor::new() {
                Ok(m) => m,
                Err(_) => return,
            };
            // 把 Shutdown 句柄交给外部，便于外部 drop 触发优雅停止。
            if stop_tx.send(monitor.shutdown_channel()).is_err() {
                return;
            }
            loop {
                match monitor.recv() {
                    // Ok(true)：收到新的剪贴板变化事件 → 读取入库并广播。
                    Ok(true) => handle_change(&tx, &store),
                    // Ok(false)：Shutdown 已触发，退出循环。
                    Ok(false) => break,
                    // 监听错误：记录后退出，避免空转。
                    Err(_) => break,
                }
            }
        });

        ClipboardMonitorHandle { stop_rx: Some(stop_rx), handle: Some(handle) }
    }
}

impl Default for ClipboardMonitor {
    fn default() -> Self {
        Self::new()
    }
}

/// 处理一次剪贴板变化：读取入库并按新/旧广播。
fn handle_change(tx: &broadcast::Sender<Option<String>>, store: &ClipboardStore) {
    match read_current(store) {
        Ok(Some((item, true))) => {
            let _ = tx.send(Some(item.id));
        },
        Ok(Some((_, false))) => {
            let _ = tx.send(None);
        },
        // Ok(None)：剪贴板无内容，忽略。
        Ok(None) => {},
        Err(_e) => {
            // 读取/入库失败不中断监听。
            let _ = _e;
        },
    }
}

/// 监听线程句柄：持有 `Shutdown` 接收端与 `JoinHandle`，用于优雅停止与回收。
pub struct ClipboardMonitorHandle {
    stop_rx: Option<mpsc::Receiver<Shutdown>>,
    handle: Option<JoinHandle<()>>,
}

impl ClipboardMonitorHandle {
    /// 请求停止监听并等待线程退出。
    pub fn stop(mut self) {
        self.request_stop();
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
    }

    fn request_stop(&mut self) {
        // 取出外发的 Shutdown 并 drop：drop 会 PostMessage 触发监听窗停止。
        if let Some(rx) = self.stop_rx.take() {
            if let Ok(shutdown) = rx.recv() {
                drop(shutdown);
            }
        }
    }
}

impl Drop for ClipboardMonitorHandle {
    fn drop(&mut self) {
        // 有线程存活时非阻塞尝试触发停止，避免监听线程遗留。
        if self.handle.as_ref().is_some_and(JoinHandle::is_finished) {
            return;
        }
        self.request_stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    /// 构造一个可安全丢弃的临时 `ClipboardStore`（复用 store::tests 的建库逻辑）。
    fn temp_store(name: &str) -> ClipboardStore {
        let db_path = std::env::temp_dir().join(format!("clip-monitor-{name}.db"));
        let _ = std::fs::remove_file(&db_path);
        let db = adl_storage::Database::open(&db_path).unwrap();
        db.init_schema().unwrap();
        let dir = std::env::temp_dir().join(format!("clip-monitor-data-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        ClipboardStore::new(db, &dir)
    }

    #[test]
    fn subscribe_returns_a_receiver() {
        let m = ClipboardMonitor::new();
        let mut rx = m.subscribe();
        // 尚无事件广播 → 空。
        assert!(matches!(rx.try_recv(), Err(broadcast::error::TryRecvError::Empty)));
    }

    #[test]
    fn spawn_can_be_stopped_without_hanging() {
        let store = temp_store("stop");
        let monitor = ClipboardMonitor::new();
        let handle = monitor.spawn(Arc::new(store));
        // 给监听线程一点时间创建消息窗口并进入 recv。
        thread::sleep(Duration::from_millis(50));
        handle.stop(); // 不应挂起（存在收敛的 Shutdown / join）
        let dir = std::env::temp_dir().join("clip-monitor-data-stop");
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(std::env::temp_dir().join("clip-monitor-stop.db"));
    }

    #[test]
    fn handle_drop_signals_shutdown() {
        let store = temp_store("drop");
        let monitor = ClipboardMonitor::new();
        let handle = monitor.spawn(Arc::new(store));
        thread::sleep(Duration::from_millis(30));
        drop(handle); // Drop 应触发 request_stop，不挂起
        let dir = std::env::temp_dir().join("clip-monitor-data-drop");
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(std::env::temp_dir().join("clip-monitor-drop.db"));
    }

    #[test]
    fn store_is_send_sync() {
        // 编译期确认 ClipboardStore 可跨线程共享（监听线程持有其引用）。
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<Arc<ClipboardStore>>();
        assert_sync::<Arc<ClipboardStore>>();
    }
}
