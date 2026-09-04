use std::sync::OnceLock;

macro_rules! define_entity_table {
    ($( $(#[$attr:meta])* $variant:ident => $table_name:expr ),+ $(,)?) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum EntityTable {
            $( $(#[$attr])* $variant, )+
        }

        pub(crate) const TABLE_NAMES: &[&str] = &[$($table_name),+];
        pub(crate) const ENTITY_TABLE_COUNT: usize = TABLE_NAMES.len();

        impl EntityTable {
            pub(crate) fn table_name(self) -> &'static str {
                match self {
                    $( Self::$variant => $table_name, )+
                }
            }

            pub fn index(self) -> usize {
                self as usize
            }

            pub fn as_str(self) -> &'static str {
                self.table_name()
            }

            pub fn insert_sql(self) -> &'static str {
                get_insert_sql(self)
            }
        }
    };
}

const INSERT_SQL_TEMPLATE: &str = "INSERT OR REPLACE INTO {table} (id, workspace_id, session_id, status, updated_at, json)\n\
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)";

define_entity_table! {
    Workspaces => "workspaces",
    Sessions => "sessions",
    RetrievalSnapshots => "retrieval_snapshots",
    Tasks => "tasks",
    Approvals => "approvals",
    AuditRecords => "audit_records",
    Checkpoints => "checkpoints",
    ConversationMessages => "conversation_messages",
    AgentRuns => "agent_runs",
    AgentSteps => "agent_steps",
    ToolInvocations => "tool_invocations",
    PatchSets => "patch_sets",
    FilePatches => "file_patches",
    PatchHunks => "patch_hunks",
    CommandRequests => "command_requests",
    CommandExecutions => "command_executions",
    ValidationResults => "validation_results",
    ModelPreferences => "model_preferences",
    ModelCallAudit => "model_call_audit",
    RunActivityEvents => "run_activity_events",
    ClipboardItems => "clipboard_items",
}

pub(crate) fn get_insert_sql(table: EntityTable) -> &'static str {
    static INSERT_SQLS: [OnceLock<String>; ENTITY_TABLE_COUNT] =
        [const { OnceLock::new() }; ENTITY_TABLE_COUNT];
    let idx = table.index();
    INSERT_SQLS[idx].get_or_init(|| INSERT_SQL_TEMPLATE.replace("{table}", table.table_name()))
}

pub(crate) fn get_select_all_sql(table: EntityTable) -> &'static str {
    static SELECT_ALL_SQLS: [OnceLock<String>; ENTITY_TABLE_COUNT] =
        [const { OnceLock::new() }; ENTITY_TABLE_COUNT];
    let idx = table.index();
    SELECT_ALL_SQLS[idx].get_or_init(|| format!("SELECT json FROM {}", table.table_name()))
}

pub(crate) fn get_select_by_id_sql(table: EntityTable) -> &'static str {
    static SELECT_BY_ID_SQLS: [OnceLock<String>; ENTITY_TABLE_COUNT] =
        [const { OnceLock::new() }; ENTITY_TABLE_COUNT];
    let idx = table.index();
    SELECT_BY_ID_SQLS[idx]
        .get_or_init(|| format!("SELECT json FROM {} WHERE id = ?1", table.table_name()))
}

pub(crate) fn get_delete_by_id_sql(table: EntityTable) -> &'static str {
    static DELETE_BY_ID_SQLS: [OnceLock<String>; ENTITY_TABLE_COUNT] =
        [const { OnceLock::new() }; ENTITY_TABLE_COUNT];
    let idx = table.index();
    DELETE_BY_ID_SQLS[idx]
        .get_or_init(|| format!("DELETE FROM {} WHERE id = ?1", table.table_name()))
}
