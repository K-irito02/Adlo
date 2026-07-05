use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Buffers output from background sub-agents so the parent can read it later.
#[derive(Debug, Clone)]
pub struct OutputBuffer {
    chunks: Arc<Mutex<VecDeque<String>>>,
    closed: Arc<Mutex<bool>>,
}

impl OutputBuffer {
    pub fn new() -> Self {
        Self { chunks: Arc::new(Mutex::new(VecDeque::new())), closed: Arc::new(Mutex::new(false)) }
    }

    pub async fn push(&self, chunk: String) {
        self.chunks.lock().await.push_back(chunk);
    }

    pub async fn drain(&self) -> Vec<String> {
        self.chunks.lock().await.drain(..).collect()
    }

    pub async fn close(&self) {
        *self.closed.lock().await = true;
    }

    pub async fn is_closed(&self) -> bool {
        *self.closed.lock().await
    }
}

impl Default for OutputBuffer {
    fn default() -> Self {
        Self::new()
    }
}
