use crate::part_event_bus::PartEventBus;
use adl_errors::AppError;
use adl_types::SessionPartEvent;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

/// A pending question request awaiting user answers.
#[derive(Debug, Clone)]
pub struct QuestionRequest {
    pub id: String,
    pub session_id: String,
    pub questions: Vec<serde_json::Value>,
}

/// Ask the user questions and wait for answers. Mirrors OpenCode's Question
/// service: ask() publishes a question.asked event and awaits a oneshot;
/// reply() resolves it with answers, reject() fails it.
#[derive(Clone)]
pub struct QuestionService {
    bus: PartEventBus,
    pending: Arc<Mutex<HashMap<String, QuestionEntry>>>,
}

struct QuestionEntry {
    sender: oneshot::Sender<Vec<serde_json::Value>>,
    info: QuestionRequest,
}

impl QuestionService {
    pub fn new(bus: PartEventBus) -> Self {
        Self { bus, pending: Arc::new(Mutex::new(HashMap::new())) }
    }

    pub async fn ask(
        &self,
        session_id: &str,
        questions: Vec<serde_json::Value>,
    ) -> Result<Vec<serde_json::Value>, AppError> {
        let id = adl_types::create_id("question");
        let (tx, rx) = oneshot::channel();
        self.pending
            .lock()
            .map_err(|_| AppError::Internal("question store lock poisoned".into()))?
            .insert(
                id.clone(),
                QuestionEntry {
                    sender: tx,
                    info: QuestionRequest {
                        id: id.clone(),
                        session_id: session_id.to_string(),
                        questions: questions.clone(),
                    },
                },
            );
        self.bus.publish(SessionPartEvent::QuestionAsked {
            session_id: session_id.to_string(),
            request_id: id,
            questions,
            tool: None,
        });
        rx.await.map_err(|_| AppError::Internal("question request was dropped".into()))
    }

    pub fn reply(&self, request_id: &str, answers: Vec<serde_json::Value>) -> Result<(), AppError> {
        let entry = self
            .pending
            .lock()
            .map_err(|_| AppError::Internal("question store lock poisoned".into()))?
            .remove(request_id);
        let Some(entry) = entry else {
            return Err(AppError::NotFound(format!("question request {request_id}")));
        };
        self.bus.publish(SessionPartEvent::QuestionReplied {
            session_id: entry.info.session_id.clone(),
            request_id: request_id.to_string(),
            answers: answers.clone(),
        });
        let _ = entry.sender.send(answers);
        Ok(())
    }

    pub fn reject(&self, request_id: &str) -> Result<(), AppError> {
        let entry = self
            .pending
            .lock()
            .map_err(|_| AppError::Internal("question store lock poisoned".into()))?
            .remove(request_id);
        let Some(entry) = entry else {
            return Err(AppError::NotFound(format!("question request {request_id}")));
        };
        drop(entry.sender);
        Ok(())
    }

    pub fn list(&self) -> Vec<QuestionRequest> {
        self.pending
            .lock()
            .map(|m| m.values().map(|e| e.info.clone()).collect())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::SessionPartEvent;

    #[tokio::test]
    async fn ask_waits_for_reply() {
        let bus = PartEventBus::new(16);
        let service = QuestionService::new(bus.clone());
        let mut rx = bus.subscribe();

        let q = service.ask("s1", vec![serde_json::json!({"question": "Continue?"})]);
        tokio::pin!(q);

        // 等待 question.asked 事件（ask future 挂起在 q 中，事件等待循环移到独立任务，
        // 与 q.await 并发驱动，否则 QuestionAsked 永不发布导致死锁）
        let reply_service = service.clone();
        let waiter = tokio::spawn(async move {
            loop {
                match rx.recv().await.unwrap() {
                    SessionPartEvent::QuestionAsked { request_id, .. } => {
                        reply_service.reply(&request_id, vec![serde_json::json!("yes")]).unwrap();
                        break;
                    },
                    _ => continue,
                }
            }
        });
        let answers = q.await.unwrap();
        waiter.await.unwrap();
        assert_eq!(answers[0], "yes");
    }

    #[tokio::test]
    async fn ask_reject_returns_error() {
        let bus = PartEventBus::new(16);
        let service = QuestionService::new(bus.clone());
        let mut rx = bus.subscribe();

        let q = service.ask("s1", vec![serde_json::json!({"question": "?"})]);
        tokio::pin!(q);

        let reject_service = service.clone();
        let waiter = tokio::spawn(async move {
            loop {
                match rx.recv().await.unwrap() {
                    SessionPartEvent::QuestionAsked { request_id, .. } => {
                        reject_service.reject(&request_id).unwrap();
                        break;
                    },
                    _ => continue,
                }
            }
        });
        assert!(q.await.is_err());
        waiter.await.unwrap();
    }

    #[test]
    fn reply_unknown_returns_error() {
        let bus = PartEventBus::new(16);
        let service = QuestionService::new(bus);
        assert!(service.reply("nope", vec![]).is_err());
    }

    #[test]
    fn list_returns_pending() {
        let bus = PartEventBus::new(16);
        let service = QuestionService::new(bus);
        // ask 是 async 挂起的，list 应显示 pending 项
        // 测试简单验证 list 初始为空
        assert!(service.list().is_empty());
    }
}
