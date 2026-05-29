use adl_pty::PtyEventEmitter;
use std::sync::Arc;
use tauri::Emitter;

pub struct TauriEventEmitter {
    app: tauri::AppHandle,
}

impl TauriEventEmitter {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }

    pub fn into_arc(self) -> Arc<dyn PtyEventEmitter> {
        Arc::new(self)
    }
}

impl PtyEventEmitter for TauriEventEmitter {
    fn emit_output(&self, session_id: &str, data: &str) {
        let _ = self.app.emit(
            "digital-life://pty-output",
            serde_json::json!({
                "sessionId": session_id,
                "data": data,
            }),
        );
    }
}
