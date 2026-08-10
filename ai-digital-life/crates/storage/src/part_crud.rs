use adl_errors::AppError;
use adl_types::{MessageRecord, PartRecord, PartType};
use rusqlite::OptionalExtension;
use rusqlite::params;

use crate::connection::Database;

impl Database {
    pub fn save_message(&self, message: &MessageRecord) -> Result<(), AppError> {
        let data = serde_json::to_string(&message)?;
        self.execute(
            "INSERT OR REPLACE INTO message \
             (id, session_id, role, parent_id, agent, model, summary, time_created, time_completed, data) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            &[
                &message.id as &dyn rusqlite::types::ToSql,
                &message.session_id,
                &message.role,
                &message.parent_id,
                &message.agent,
                &message.model,
                &message.summary,
                &message.time_created,
                &message.time_completed,
                &data,
            ],
        )?;
        Ok(())
    }

    pub fn load_message(&self, id: &str) -> Result<Option<MessageRecord>, AppError> {
        let conn = self.conn()?;
        let row = conn
            .query_row("SELECT data FROM message WHERE id = ?1", params![id], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        row.map(|json| serde_json::from_str(&json).map_err(AppError::from)).transpose()
    }

    pub fn list_messages(&self, session_id: &str) -> Result<Vec<MessageRecord>, AppError> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT data FROM message WHERE session_id = ?1 ORDER BY time_created ASC, id ASC",
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let rows = stmt
            .query_map(params![session_id], |row| row.get::<_, String>(0))
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        rows.into_iter().map(|json| serde_json::from_str(&json).map_err(AppError::from)).collect()
    }

    pub fn save_part(&self, part: &PartRecord) -> Result<(), AppError> {
        let data = serde_json::to_string(&part.data)?;
        let type_str = match part.r#type {
            PartType::Text => "text",
            PartType::Reasoning => "reasoning",
            PartType::Tool => "tool",
            PartType::File => "file",
            PartType::StepStart => "step-start",
            PartType::StepFinish => "step-finish",
            PartType::Patch => "patch",
            PartType::Snapshot => "snapshot",
        };
        self.execute(
            "INSERT OR REPLACE INTO part \
             (id, message_id, session_id, type, ordinal, time_created, data) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            &[
                &part.id as &dyn rusqlite::types::ToSql,
                &part.message_id,
                &part.session_id,
                &type_str,
                &part.ordinal,
                &part.time_created,
                &data,
            ],
        )?;
        Ok(())
    }

    pub fn load_part(&self, id: &str) -> Result<Option<PartRecord>, AppError> {
        let conn = self.conn()?;
        let row = conn
            .query_row(
                "SELECT id, message_id, session_id, type, ordinal, time_created, data \
                 FROM part WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, String>(6)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        row.map(|(id, message_id, session_id, type_str, ordinal, time_created, data)| {
            let r#type = match type_str.as_str() {
                "text" => PartType::Text,
                "reasoning" => PartType::Reasoning,
                "tool" => PartType::Tool,
                "file" => PartType::File,
                "step-start" => PartType::StepStart,
                "step-finish" => PartType::StepFinish,
                "patch" => PartType::Patch,
                "snapshot" => PartType::Snapshot,
                other => return Err(AppError::Storage(format!("unknown part type: {other}"))),
            };
            Ok(PartRecord {
                id,
                message_id,
                session_id,
                r#type,
                ordinal,
                time_created,
                data: serde_json::from_str(&data).map_err(AppError::from)?,
            })
        })
        .transpose()
    }

    pub fn list_parts(&self, message_id: &str) -> Result<Vec<PartRecord>, AppError> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare("SELECT id FROM part WHERE message_id = ?1 ORDER BY ordinal ASC, id ASC")
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let ids: Vec<String> = stmt
            .query_map(params![message_id], |row| row.get::<_, String>(0))
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let mut out = Vec::with_capacity(ids.len());
        for id in ids {
            out.push(self.load_part(&id)?.ok_or_else(|| {
                AppError::Storage(format!("part {id} listed but failed to load"))
            })?);
        }
        Ok(out)
    }

    pub fn append_event_log(
        &self,
        session_id: &str,
        event_type: &str,
        payload: &serde_json::Value,
    ) -> Result<i64, AppError> {
        let payload = serde_json::to_string(payload)?;
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO event_log (session_id, type, payload, time_created) VALUES (?1, ?2, ?3, ?4)",
            params![session_id, event_type, payload, adl_types::now_ms()],
        )
        .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(conn.last_insert_rowid())
    }
    pub fn list_event_log_after(
        &self,
        session_id: &str,
        after_seq: i64,
    ) -> Result<Vec<(i64, String, serde_json::Value, i64)>, AppError> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT seq, type, payload, time_created FROM event_log \
                 WHERE session_id = ?1 AND seq > ?2 ORDER BY seq ASC",
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let raw: Vec<(i64, String, String, i64)> = stmt
            .query_map(params![session_id, after_seq], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        raw.into_iter()
            .map(|(seq, event_type, payload, time_created)| {
                let value = serde_json::from_str(&payload).map_err(AppError::from)?;
                Ok((seq, event_type, value, time_created))
            })
            .collect()
    }

    /// List event_log rows with `seq > after_seq` across **all** sessions,
    /// ascending by seq. Used by the global SSE stream to replay the durable
    /// event_log when the in-memory history is exhausted or on restart.
    pub fn list_event_log_after_global(
        &self,
        after_seq: i64,
    ) -> Result<Vec<(i64, String, serde_json::Value, i64)>, AppError> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT seq, type, payload, time_created FROM event_log \
                 WHERE seq > ?1 ORDER BY seq ASC",
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let raw: Vec<(i64, String, String, i64)> = stmt
            .query_map(params![after_seq], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        raw.into_iter()
            .map(|(seq, event_type, payload, time_created)| {
                let value = serde_json::from_str(&payload).map_err(AppError::from)?;
                Ok((seq, event_type, value, time_created))
            })
            .collect()
    }

    /// Latest durable event_log seq across all sessions (`NULL` when the table
    /// is empty). Used by the SSE `?after=latest` live-only sentinel so a cold
    /// subscriber skips the whole history even after a server restart (when the
    /// in-memory replay cache is empty but the DB still holds rows).
    pub fn max_event_log_seq(&self) -> Result<Option<i64>, AppError> {
        let conn = self.conn()?;
        conn.query_row("SELECT MAX(seq) FROM event_log", [], |row| row.get(0))
            .map_err(|e| AppError::Storage(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use crate::crud::test_helpers::open_test_db;
    use adl_types::{MessageRecord, PartRecord, PartType};

    fn sample_message(id: &str) -> MessageRecord {
        MessageRecord {
            id: id.to_string(),
            session_id: "session_1".to_string(),
            role: "user".to_string(),
            parent_id: None,
            agent: None,
            model: None,
            summary: None,
            time_created: 1700000000000,
            time_completed: None,
        }
    }

    fn sample_part(id: &str, message_id: &str, ordinal: i64) -> PartRecord {
        PartRecord {
            id: id.to_string(),
            message_id: message_id.to_string(),
            session_id: "session_1".to_string(),
            r#type: PartType::Text,
            ordinal,
            time_created: 1700000000000,
            data: serde_json::json!({"type": "text", "text": "hi"}),
        }
    }

    #[test]
    fn save_and_load_message() {
        let db = open_test_db("adl-part-crud");
        let msg = sample_message("msg_1");
        db.save_message(&msg).unwrap();
        let loaded = db.load_message("msg_1").unwrap().expect("message should exist");
        assert_eq!(loaded.id, "msg_1");
        assert_eq!(loaded.session_id, "session_1");
        assert_eq!(loaded.role, "user");
    }

    #[test]
    fn list_messages_returns_created_order() {
        let db = open_test_db("adl-part-crud");
        db.save_message(&sample_message("msg_1")).unwrap();
        db.save_message(&sample_message("msg_2")).unwrap();
        let msgs = db.list_messages("session_1").unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].id, "msg_1");
        assert_eq!(msgs[1].id, "msg_2");
    }

    #[test]
    fn save_and_load_part_with_ordinal() {
        let db = open_test_db("adl-part-crud");
        db.save_message(&sample_message("msg_1")).unwrap();
        db.save_part(&sample_part("part_1", "msg_1", 0)).unwrap();
        db.save_part(&sample_part("part_2", "msg_1", 1)).unwrap();
        let parts = db.list_parts("msg_1").unwrap();
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].ordinal, 0);
        assert_eq!(parts[1].ordinal, 1);
        assert_eq!(parts[0].r#type, PartType::Text);
    }

    #[test]
    fn load_missing_part_returns_none() {
        let db = open_test_db("adl-part-crud");
        assert!(db.load_part("nope").unwrap().is_none());
    }

    #[test]
    fn full_field_message_roundtrips() {
        let db = open_test_db("adl-part-crud");
        let msg = MessageRecord {
            id: "msg_full".to_string(),
            session_id: "session_full".to_string(),
            role: "assistant".to_string(),
            parent_id: Some("msg_0".to_string()),
            agent: Some("build".to_string()),
            model: Some(serde_json::json!({"providerID": "deepseek", "id": "deepseek-chat"})),
            summary: Some(serde_json::json!({"count": 3, "tokens": 1200})),
            time_created: 1700000000000,
            time_completed: Some(1700000001000),
        };
        db.save_message(&msg).unwrap();
        let loaded = db.load_message("msg_full").unwrap().expect("message should exist");
        assert_eq!(loaded, msg);
    }

    #[test]
    fn tool_part_roundtrips() {
        let db = open_test_db("adl-part-crud");
        db.save_message(&sample_message("msg_1")).unwrap();
        let part = PartRecord {
            id: "part_tool".to_string(),
            message_id: "msg_1".to_string(),
            session_id: "session_1".to_string(),
            r#type: PartType::Tool,
            ordinal: 0,
            time_created: 1700000000000,
            data: serde_json::json!({
                "type": "tool",
                "tool": "read",
                "callID": "call_1",
                "state": {
                    "status": "running",
                    "input": {"path": "a.txt"},
                    "title": "Read a.txt",
                    "metadata": {}
                }
            }),
        };
        db.save_part(&part).unwrap();
        let loaded = db.load_part("part_tool").unwrap().expect("part should exist");
        assert_eq!(loaded.r#type, PartType::Tool);
        assert_eq!(loaded.data, part.data);
    }

    #[test]
    fn append_and_list_event_log() {
        let db = open_test_db("adl-part-crud");
        let s1 = db
            .append_event_log("session_1", "session.status", &serde_json::json!({"status": "busy"}))
            .unwrap();
        let s2 = db
            .append_event_log("session_1", "message.updated", &serde_json::json!({"info": {}}))
            .unwrap();
        assert!(s2 > s1);
        let events = db.list_event_log_after("session_1", 0).unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].1, "session.status");
        assert_eq!(events[1].1, "message.updated");
        let after = db.list_event_log_after("session_1", s1).unwrap();
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].1, "message.updated");
    }

    #[test]
    fn list_event_log_after_global_spans_sessions() {
        let db = open_test_db("adl-part-crud");
        let s1 = db
            .append_event_log("session_1", "session.status", &serde_json::json!({"status": "busy"}))
            .unwrap();
        let s2 = db
            .append_event_log("session_2", "message.updated", &serde_json::json!({"info": {}}))
            .unwrap();
        assert!(s2 > s1);
        let all = db.list_event_log_after_global(0).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].1, "session.status");
        assert_eq!(all[1].1, "message.updated");
        let after = db.list_event_log_after_global(s1).unwrap();
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].1, "message.updated");
        assert_eq!(after[0].2, serde_json::json!({"info": {}}));
        assert_eq!(db.list_event_log_after_global(s2).unwrap().len(), 0);
    }

    #[test]
    fn max_event_log_seq_tracks_latest_row() {
        let db = open_test_db("adl-part-crud");
        assert_eq!(db.max_event_log_seq().unwrap(), None, "empty event_log has no max");
        let s1 = db
            .append_event_log("session_1", "session.status", &serde_json::json!({"status": "busy"}))
            .unwrap();
        assert_eq!(db.max_event_log_seq().unwrap(), Some(s1));
        let s2 = db
            .append_event_log("session_2", "message.updated", &serde_json::json!({"info": {}}))
            .unwrap();
        assert_eq!(db.max_event_log_seq().unwrap(), Some(s2));
    }
}
