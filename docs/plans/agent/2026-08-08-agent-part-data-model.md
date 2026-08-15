# Part 数据模型层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 OpenCode 对齐的 Message + Part 数据模型（含 Tool 状态机）、事件类型定义，以及 message/part/event_log 三张 SQLite 表与 CRUD 层，全部单元测试覆盖。

**Architecture:** 在 `adl_types` 新增 Part/Message/Event 类型（`serde tag="type"`，与 OpenCode `session-message.ts` 对齐）；在 `crates/migration` 新增 v6 迁移建三张新表；在 `crates/storage` 新增 `part_crud.rs` 提供 CRUD。本计划是整体重构的最基础层，不依赖其他计划，后续 Agent Loop 与 SSE 建立在其上。

**Tech Stack:** Rust 2024 edition、serde、rusqlite、ts-rs（类型导出）、uuid。

## Global Constraints

- Rust edition 2024，rust-version 1.85
- 禁止 `unwrap_used` / `dbg_macro` / `todo`（workspace lints 为 warn；clippy 必须 `-D warnings` 0 警告）
- 未发布阶段禁止数据迁移/兼容代码（新表一次性建，旧表不读写、不加兼容层）
- 所有 UI 展示文本不得硬编码（本计划无 UI）
- 类型命名遵循 ADL 现有 `camelCase` serde 约定（`#[serde(rename_all = "camelCase")]`）
- Part 类型使用 `serde tag="type"`（对齐 OpenCode `session-message.ts` 的 tagged union）
- 表结构对齐 OpenCode `packages/core/src/session/sql.ts`：message/part 表 `data` 列为 JSON 载荷

---

### Task 1: Part 类型定义（adl_types）

**Files:**
- Create: `crates/types/src/types/part.rs`
- Modify: `crates/types/src/types/mod.rs`

**Interfaces:**
- Consumes: `adl_types::TimestampMs`, `adl_types::create_id`, `adl_types::now_ms`, `serde`
- Produces:
  - `pub enum PartType`（`text` / `reasoning` / `tool` / `file` / `step-start` / `step-finish` / `patch`）
  - `pub struct MessageRecord`（id, session_id, role, parent_id, agent, model, summary, time_created, time_completed）
  - `pub enum ToolState`（pending / running / completed / error，tagged by `status`）
  - `pub struct ToolPartData` / `pub struct TextPartData` / `pub struct ReasoningPartData` / `pub struct FilePartData` / `pub struct PatchPartData`
  - `pub struct PartRecord`（id, message_id, session_id, type, ordinal, time_created, data）
  - `pub enum SessionPartEvent`（`message.part.updated` / `message.part.delta` / `message.created` / `message.updated` / `session.status` / `question.asked` / `question.replied`，tagged by `type`）

- [ ] **Step 1: 编写失败的测试**

创建 `crates/types/src/types/part.rs`（先只写测试）:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn part_type_serializes_as_tagged_type() {
        let text = PartData::Text(TextPartData { text: "hello".into() });
        let json = serde_json::to_value(&text).unwrap();
        assert_eq!(json["type"], "text");
        assert_eq!(json["text"], "hello");
    }

    #[test]
    fn tool_state_pending_serializes_status() {
        let state = ToolState::Pending { input: json!({"url": "https://x.com"}) };
        let json = serde_json::to_value(&state).unwrap();
        assert_eq!(json["status"], "pending");
        assert_eq!(json["input"]["url"], "https://x.com");
    }

    #[test]
    fn tool_state_running_roundtrips() {
        let state = ToolState::Running {
            input: json!({"path": "a.txt"}),
            title: Some("Read a.txt".into()),
            metadata: json!({}),
        };
        let encoded = serde_json::to_string(&state).unwrap();
        let decoded: ToolState = serde_json::from_str(&encoded).unwrap();
        match decoded {
            ToolState::Running { input, title, .. } => {
                assert_eq!(input["path"], "a.txt");
                assert_eq!(title.as_deref(), Some("Read a.txt"));
            }
            _ => panic!("expected running state"),
        }
    }

    #[test]
    fn part_record_roundtrips() {
        let part = PartRecord {
            id: "part_1".into(),
            message_id: "msg_1".into(),
            session_id: "session_1".into(),
            r#type: PartType::Tool,
            ordinal: 0,
            time_created: 1700000000000,
            data: serde_json::json!({}),
        };
        let encoded = serde_json::to_string(&part).unwrap();
        let decoded: PartRecord = serde_json::from_str(&encoded).unwrap();
        assert_eq!(decoded.id, "part_1");
        assert_eq!(decoded.r#type, PartType::Tool);
    }

    #[test]
    fn event_serializes_tagged_type() {
        let event = SessionPartEvent::MessagePartUpdated {
            session_id: "s1".into(),
            message_id: "m1".into(),
            part_id: "p1".into(),
            part: serde_json::json!({}),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "message.part.updated");
        assert_eq!(json["sessionID"], "s1");
    }

    #[test]
    fn message_record_serializes_camel_case() {
        let msg = MessageRecord {
            id: "msg_1".into(),
            session_id: "s1".into(),
            role: "assistant".into(),
            parent_id: Some("msg_0".into()),
            agent: Some("build".into()),
            model: Some(serde_json::json!({"providerID": "deepseek", "id": "deepseek-chat"})),
            summary: None,
            time_created: 1700000000000,
            time_completed: Some(1700000001000),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["sessionID"], "s1");
        assert_eq!(json["parentID"], "msg_0");
        assert_eq!(json["timeCreated"], 1700000000000);
        assert_eq!(json["timeCompleted"], 1700000001000);
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl_types part::tests`
Expected: FAIL（`part` 模块不存在，编译错误 `could not find part in types`）

- [ ] **Step 3: 编写最小实现**

创建 `crates/types/src/types/part.rs` 完整实现:

```rust
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::TimestampMs;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum PartType {
    Text,
    Reasoning,
    Tool,
    File,
    StepStart,
    StepFinish,
    Patch,
}

/// A message in a session (mirrors OpenCode `Session.Message`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MessageRecord {
    pub id: String,
    pub session_id: String,
    pub role: String, // "user" | "assistant"
    pub parent_id: Option<String>,
    pub agent: Option<String>,
    pub model: Option<serde_json::Value>,
    pub summary: Option<serde_json::Value>,
    pub time_created: TimestampMs,
    pub time_completed: Option<TimestampMs>,
}

/// Tool invocation state machine (mirrors OpenCode `ToolState`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ToolState {
    Pending {
        input: serde_json::Value,
    },
    Running {
        input: serde_json::Value,
        title: Option<String>,
        #[serde(default)]
        metadata: serde_json::Value,
    },
    Completed {
        input: serde_json::Value,
        output: String,
        title: Option<String>,
        #[serde(default)]
        metadata: serde_json::Value,
        time: ToolTime,
    },
    Error {
        input: serde_json::Value,
        error: String,
        #[serde(default)]
        metadata: serde_json::Value,
        time: ToolTime,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ToolTime {
    pub start: TimestampMs,
    pub end: Option<TimestampMs>,
}

/// The payload of a Part (mirrors OpenCode `SessionV1.Part`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum PartData {
    Text {
        #[serde(default)]
        text: String,
    },
    Reasoning {
        #[serde(default)]
        text: String,
    },
    Tool {
        tool: String,
        #[serde(rename = "callID")]
        call_id: String,
        state: ToolState,
    },
    File {
        mime: String,
        filename: Option<String>,
        url: String,
    },
    StepStart,
    StepFinish,
    Patch {
        hash: String,
        files: Vec<String>,
    },
}

/// A stored Part row (mirrors OpenCode `part` table hydration).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PartRecord {
    pub id: String,
    pub message_id: String,
    pub session_id: String,
    pub r#type: PartType,
    pub ordinal: i64,
    pub time_created: TimestampMs,
    pub data: serde_json::Value,
}

/// Structured event broadcast to SSE clients (mirrors OpenCode session events).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SessionPartEvent {
    #[serde(rename = "message.part.updated")]
    MessagePartUpdated {
        session_id: String,
        message_id: String,
        part_id: String,
        part: serde_json::Value,
    },
    #[serde(rename = "message.part.delta")]
    MessagePartDelta {
        session_id: String,
        message_id: String,
        part_id: String,
        field: String,
        delta: String,
    },
    #[serde(rename = "message.created")]
    MessageCreated {
        session_id: String,
        info: serde_json::Value,
    },
    #[serde(rename = "message.updated")]
    MessageUpdated {
        session_id: String,
        info: serde_json::Value,
    },
    #[serde(rename = "session.status")]
    SessionStatus {
        session_id: String,
        status: String,
    },
    #[serde(rename = "question.asked")]
    QuestionAsked {
        session_id: String,
        request_id: String,
        questions: Vec<serde_json::Value>,
        tool: Option<serde_json::Value>,
    },
    #[serde(rename = "question.replied")]
    QuestionReplied {
        session_id: String,
        request_id: String,
        answers: Vec<serde_json::Value>,
    },
}
```

修改 `crates/types/src/types/mod.rs`，注册模块并 re-export:

```rust
pub mod part;
// ... existing modules ...

pub use part::*;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p adl_types part::tests`
Expected: PASS（6 个测试全部通过）

- [ ] **Step 5: Clippy 检查**

Run: `cargo clippy -p adl_types --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 6: 提交**

```bash
git add crates/types/src/types/part.rs crates/types/src/types/mod.rs
git commit -m "feat(types): add Part data model with tool state machine"
```

---

### Task 2: v6 迁移 —— message/part/event_log 三表

**Files:**
- Modify: `crates/migration/src/lib.rs`
- Modify: `crates/storage/sql/init_schema.sql`（新表同时加入基础 schema，保证仅 `init_schema()` 的测试库与生产新装库均有表）
- Test: `crates/migration/src/lib.rs`（内嵌 `#[cfg(test)]`）

**Interfaces:**
- Consumes: `adl_migration::Migration`, `adl_migration::MIGRATIONS`, `adl_storage::Database`
- Produces: 三张新表 `message` / `part` / `event_log`（v6 迁移），`run_pending` 应用后 `current_version == 6`

- [ ] **Step 1: 编写失败的测试**

在 `crates/migration/src/lib.rs` 的 `mod tests` 中追加:

```rust
#[test]
fn v6_creates_part_tables() {
    let path =
        std::env::temp_dir().join(format!("adl-migration-v6-{}.db", uuid::Uuid::new_v4()));
    let _ = std::fs::remove_file(&path);
    let db = adl_storage::Database::open(&path).unwrap();
    db.init_schema().unwrap();
    run_pending(&db).unwrap();
    let version = current_version(&db).unwrap();
    assert_eq!(version, 6);

    let conn = db.conn().unwrap();
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('message','part','event_log')",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 3, "v6 should create message, part, event_log tables");
    let _ = std::fs::remove_file(&path);
}

#[test]
fn run_pending_v6_is_idempotent() {
    let path =
        std::env::temp_dir().join(format!("adl-migration-v6-idem-{}.db", uuid::Uuid::new_v4()));
    let _ = std::fs::remove_file(&path);
    let db = adl_storage::Database::open(&path).unwrap();
    db.init_schema().unwrap();
    run_pending(&db).unwrap();
    run_pending(&db).unwrap();
    let version = current_version(&db).unwrap();
    assert_eq!(version, 6);
    let _ = std::fs::remove_file(&path);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl_migration`
Expected: FAIL（当前 `MIGRATIONS.len() == 5`，`current_version == 5`，断言 `version == 6` 失败）

- [ ] **Step 3: 更新 `MIGRATIONS` 数组追加 v6**

在 `crates/migration/src/lib.rs` 的 `MIGRATIONS` 数组末尾追加:

```rust
    Migration {
        version: 6,
        description: "Create OpenCode-aligned message/part/event_log tables",
        sql: r#"
            CREATE TABLE IF NOT EXISTS message (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                parent_id TEXT,
                agent TEXT,
                model TEXT,
                summary TEXT,
                time_created INTEGER NOT NULL,
                time_completed INTEGER,
                data TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_message_session_time
                ON message(session_id, time_created, id);

            CREATE TABLE IF NOT EXISTS part (
                id TEXT PRIMARY KEY,
                message_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                type TEXT NOT NULL,
                ordinal INTEGER NOT NULL,
                time_created INTEGER NOT NULL,
                data TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_part_message_id
                ON part(message_id, id);
            CREATE INDEX IF NOT EXISTS idx_part_session
                ON part(session_id);

            CREATE TABLE IF NOT EXISTS event_log (
                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                type TEXT NOT NULL,
                payload TEXT NOT NULL DEFAULT '{}',
                time_created INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_event_log_session
                ON event_log(session_id, seq);
        "#,
    },
```

同时更新 `tests::migration_records_have_correct_structure` 中 `assert_eq!(MIGRATIONS.len(), 5)` 为 `6`，并追加 v6 结构断言:

```rust
        let m6 = &MIGRATIONS[5];
        assert_eq!(m6.version, 6);
        assert_eq!(m6.description, "Create OpenCode-aligned message/part/event_log tables");
        assert!(m6.sql.contains("CREATE TABLE IF NOT EXISTS message"));
        assert!(m6.sql.contains("CREATE TABLE IF NOT EXISTS part"));
        assert!(m6.sql.contains("CREATE TABLE IF NOT EXISTS event_log"));
```

- [ ] **Step 4: 同步更新 `init_schema.sql`**

在 `crates/storage/sql/init_schema.sql` 文件末尾追加（幂等建表，与 v6 迁移一致；保证仅 `init_schema()` 的测试库与生产新装库均含三表）:

```sql
CREATE TABLE IF NOT EXISTS message (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    parent_id TEXT,
    agent TEXT,
    model TEXT,
    summary TEXT,
    time_created INTEGER NOT NULL,
    time_completed INTEGER,
    data TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_message_session_time
    ON message(session_id, time_created, id);
CREATE TABLE IF NOT EXISTS part (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    time_created INTEGER NOT NULL,
    data TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_part_message_id
    ON part(message_id, id);
CREATE INDEX IF NOT EXISTS idx_part_session
    ON part(session_id);
CREATE TABLE IF NOT EXISTS event_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    time_created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_log_session
    ON event_log(session_id, seq);
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cargo test -p adl_migration && cargo test -p adl_storage`
Expected: 全部 PASS（含新增两个 v6 迁移测试、更新的结构测试，以及既有 storage 测试——验证 `init_schema.sql` 追加未破坏既有 schema）

- [ ] **Step 6: Clippy 检查**

Run: `cargo clippy -p adl_migration --all-targets -- -D warnings && cargo clippy -p adl_storage --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 7: 提交**

```bash
git add crates/migration/src/lib.rs crates/storage/sql/init_schema.sql
git commit -m "feat(migration): add v6 message/part/event_log tables"
```

---

### Task 3: storage 层 Message/Part/EventLog CRUD

**Files:**
- Create: `crates/storage/src/part_crud.rs`
- Modify: `crates/storage/src/lib.rs`

**Interfaces:**
- Consumes: `adl_storage::Database`, `adl_types::{MessageRecord, PartRecord, PartType}`, `rusqlite`, `adl_errors::AppError`
- Produces（`impl Database` 方法）:
  - `pub fn save_message(&self, message: &MessageRecord) -> Result<(), AppError>`
  - `pub fn load_message(&self, id: &str) -> Result<Option<MessageRecord>, AppError>`
  - `pub fn list_messages(&self, session_id: &str) -> Result<Vec<MessageRecord>, AppError>`
  - `pub fn save_part(&self, part: &PartRecord) -> Result<(), AppError>`
  - `pub fn load_part(&self, id: &str) -> Result<Option<PartRecord>, AppError>`
  - `pub fn list_parts(&self, message_id: &str) -> Result<Vec<PartRecord>, AppError>`
  - `pub fn append_event_log(&self, session_id: &str, event_type: &str, payload: &serde_json::Value) -> Result<i64, AppError>`（返回新 seq）
  - `pub fn list_event_log_after(&self, session_id: &str, after_seq: i64) -> Result<Vec<(i64, String, serde_json::Value, i64)>, AppError>`

- [ ] **Step 1: 编写失败的测试**

创建 `crates/storage/src/part_crud.rs`（先只写测试）:

```rust
#[cfg(test)]
mod tests {
    use super::*;
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
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p adl_storage part_crud::tests`
Expected: FAIL（`part_crud` 模块不存在 / `save_message` 方法未定义）

- [ ] **Step 3: 编写最小实现**

创建 `crates/storage/src/part_crud.rs` 完整实现:

```rust
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
            .query_row(
                "SELECT data FROM message WHERE id = ?1",
                params![id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        row.map(|json| serde_json::from_str(&json).map_err(AppError::from)).transpose()
    }

    pub fn list_messages(&self, session_id: &str) -> Result<Vec<MessageRecord>, AppError> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare("SELECT data FROM message WHERE session_id = ?1 ORDER BY time_created ASC, id ASC")
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
        self.conn()?.execute(
            "INSERT INTO event_log (session_id, type, payload, time_created) VALUES (?1, ?2, ?3, ?4)",
            params![session_id, event_type, payload, adl_types::now_ms()],
        )?;
        self.conn()?
            .query_row("SELECT last_insert_rowid()", [], |row| row.get(0))
            .map_err(|e| AppError::Storage(e.to_string()))
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
}

#[cfg(test)]
mod tests {
    // (测试代码见 Step 1，此处为完整文件包含测试模块)
}
```

- [ ] **Step 4: 注册模块**

修改 `crates/storage/src/lib.rs`，添加 `pub mod part_crud;`（若 `part_crud.rs` 内的测试使用 `crate::crud::test_helpers`，无需额外声明——`test_helpers` 已在 `crud.rs` 中定义为 `pub(crate)` 且经 `#[cfg(test)]` 编译）。

- [ ] **Step 5: 运行测试确认通过**

Run: `cargo test -p adl_storage part_crud::tests`
Expected: PASS（6 个测试）

- [ ] **Step 6: Clippy 检查**

Run: `cargo clippy -p adl_storage --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 7: 提交**

```bash
git add crates/storage/src/part_crud.rs crates/storage/src/lib.rs
git commit -m "feat(storage): add message/part/event_log CRUD"
```

---

### Task 4: 全工作区测试 + 验证

**Files:**
- 无新增/修改（验证性任务）

**Interfaces:**
- Consumes: 全部先前任务产物

- [ ] **Step 1: 运行全工作区测试**

Run: `cargo test --workspace`
Expected: 全部通过（含既有 629 测试 + 本计划新增 ~16 测试）

- [ ] **Step 2: Clippy 全量检查**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 3: 提交（如 Step 1/2 有修复）**

若 Step 1/2 出现失败需要修复，修复后提交：
```bash
git add -A
git commit -m "test(storage): fix part CRUD edge cases"
```

---

## Self-Review 记录

**Spec coverage:**
- §3.1 表结构（message/part/event_log）→ Task 2 迁移 ✓
- §3.2 Part 类型 → Task 1 ✓
- §3.3 Tool State 状态机 → Task 1 ✓
- §6.2 事件模型（类型定义）→ Task 1 `SessionPartEvent` ✓
- §8 测试策略（Part 模型单元测试、迁移测试）→ Task 1/2/3 ✓
- §7.1 v6 迁移 → Task 2 ✓

**Gap 说明（属后续计划，不在本计划范围）**：Agent Loop（§4）、reasoning 网关（§5）、SSE 服务（§6）、旧格式清理（§7.2）分别属于计划 B / C。本计划只覆盖数据模型层，符合拆分决策。

**Placeholder scan:** 无 TBD/TODO；Task 3 的测试模块引用 Step 1 完整代码（文件内嵌，非占位）。✓

**Type consistency:** `PartRecord.r#type` 字段名在 Task 1 定义、Task 3 CRUD 使用一致；`MessageRecord` 字段在 Task 1/3 一致；`PartType` 枚举值（`text`/`reasoning`/`tool`/`file`/`step-start`/`step-finish`/`patch`）在 Task 1 定义、Task 3 `match` 一一对应。✓
