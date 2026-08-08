use adl_types::SessionPartEvent;
use tokio::sync::broadcast;

/// Broadcast bus for structured Part/session events (mirrors kernel EventBus
/// but carries `SessionPartEvent` for the Agent Loop + SSE consumers).
#[derive(Clone)]
pub struct PartEventBus {
    tx: broadcast::Sender<SessionPartEvent>,
}

impl PartEventBus {
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self { tx }
    }

    pub fn publish(&self, event: SessionPartEvent) {
        let _ = self.tx.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<SessionPartEvent> {
        self.tx.subscribe()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::SessionPartEvent;

    #[tokio::test]
    async fn bus_broadcasts_and_subscribes() {
        let bus = PartEventBus::new(16);
        let mut rx = bus.subscribe();
        bus.publish(SessionPartEvent::SessionStatus {
            session_id: "s1".into(),
            status: "busy".into(),
        });
        let event = rx.recv().await.expect("should receive event");
        match event {
            SessionPartEvent::SessionStatus { session_id, status } => {
                assert_eq!(session_id, "s1");
                assert_eq!(status, "busy");
            },
            _ => panic!("expected SessionStatus"),
        }
    }

    #[tokio::test]
    async fn bus_multiple_subscribers() {
        let bus = PartEventBus::new(16);
        let mut rx1 = bus.subscribe();
        let mut rx2 = bus.subscribe();
        bus.publish(SessionPartEvent::MessageCreated {
            session_id: "s1".into(),
            info: serde_json::json!({}),
        });
        let _ = rx1.recv().await;
        let _ = rx2.recv().await;
    }
}
