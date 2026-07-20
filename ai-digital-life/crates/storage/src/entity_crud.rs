use adl_errors::AppError;
use adl_types::now_ms;
use rusqlite::{OptionalExtension, params};
use serde::{Serialize, de::DeserializeOwned};

use crate::connection::Database;
use crate::entity_table::{
    EntityTable, get_delete_by_id_sql, get_insert_sql, get_select_all_sql, get_select_by_id_sql,
};

impl Database {
    pub fn save_entity<T: Serialize>(
        &self,
        table: EntityTable,
        id: &str,
        workspace_id: Option<&str>,
        session_id: Option<&str>,
        status: Option<&str>,
        value: &T,
    ) -> Result<(), AppError> {
        let conn = self.conn()?;
        self.save_entity_on_conn(&conn, table, id, workspace_id, session_id, status, value)
    }

    pub fn save_entity_on_conn<T: Serialize>(
        &self,
        conn: &rusqlite::Connection,
        table: EntityTable,
        id: &str,
        workspace_id: Option<&str>,
        session_id: Option<&str>,
        status: Option<&str>,
        value: &T,
    ) -> Result<(), AppError> {
        let json = serde_json::to_string(value)?;
        let sql = get_insert_sql(table);
        conn.execute(sql, params![id, workspace_id, session_id, status, now_ms(), json])
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(())
    }

    pub fn load_entity<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        id: &str,
    ) -> Result<Option<T>, AppError> {
        let sql = get_select_by_id_sql(table);
        let json: Option<String> = self
            .conn()?
            .query_row(sql, params![id], |row| row.get(0))
            .optional()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        json.map(|value| serde_json::from_str(&value).map_err(AppError::from)).transpose()
    }

    pub fn list_entities<T: DeserializeOwned>(
        &self,
        table: EntityTable,
    ) -> Result<Vec<T>, AppError> {
        self.list_entities_filtered(table, None, None)
    }

    pub fn list_entities_with_limit<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        limit: usize,
    ) -> Result<Vec<T>, AppError> {
        if limit > 1000 {
            return Err(AppError::InvalidInput(format!("query limit {limit} exceeds safety cap")));
        }
        let base_sql = get_select_all_sql(table);
        let sql =
            format!("{base_sql} ORDER BY json_extract(json, '$.createdAt') DESC LIMIT {limit}");
        let conn = self.conn()?;
        let mut stmt = conn.prepare(&sql).map_err(|e| AppError::Storage(e.to_string()))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        rows.into_iter().map(|json| serde_json::from_str(&json).map_err(AppError::from)).collect()
    }

    pub fn list_entities_by_workspace<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        workspace_id: &str,
    ) -> Result<Vec<T>, AppError> {
        self.list_entities_filtered(table, Some(("workspace_id", workspace_id)), None)
    }

    pub fn list_entities_by_session<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        session_id: &str,
    ) -> Result<Vec<T>, AppError> {
        self.list_entities_filtered(table, Some(("session_id", session_id)), None)
    }

    pub fn list_entities_by_session_ordered<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        session_id: &str,
    ) -> Result<Vec<T>, AppError> {
        let base_sql = get_select_all_sql(table);
        let sql = format!(
            "{base_sql} WHERE session_id = ?1 ORDER BY json_extract(json, '$.createdAt') ASC"
        );

        let conn = self.conn()?;
        let mut stmt = conn.prepare(&sql).map_err(|e| AppError::Storage(e.to_string()))?;
        let rows = stmt
            .query_map([session_id], |row| row.get::<_, String>(0))
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        rows.into_iter().map(|json| serde_json::from_str(&json).map_err(AppError::from)).collect()
    }

    pub fn list_entities_by_status<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        status: &str,
    ) -> Result<Vec<T>, AppError> {
        self.list_entities_filtered(table, Some(("status", status)), None)
    }

    pub fn list_entities_by_run<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        run_id: &str,
    ) -> Result<Vec<T>, AppError> {
        let sql = format!(
            "SELECT json FROM {} WHERE json_extract(json, '$.runId') = ?1 \
             ORDER BY updated_at ASC",
            table.table_name()
        );
        let conn = self.conn()?;
        let mut stmt = conn.prepare(&sql).map_err(|e| AppError::Storage(e.to_string()))?;
        let rows: Vec<String> = stmt
            .query_map(params![run_id], |row| row.get::<_, String>(0))
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        rows.into_iter().map(|json| serde_json::from_str(&json).map_err(AppError::from)).collect()
    }

    pub fn delete_entity(&self, table: EntityTable, id: &str) -> Result<bool, AppError> {
        let sql = get_delete_by_id_sql(table);
        let changed =
            self.conn()?.execute(sql, params![id]).map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(changed > 0)
    }

    pub fn delete_entities_by_session(
        &self,
        table: EntityTable,
        session_id: &str,
    ) -> Result<usize, AppError> {
        let sql = format!("DELETE FROM {} WHERE session_id = ?1", table.table_name());
        let changed = self
            .conn()?
            .execute(&sql, params![session_id])
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(changed)
    }

    pub fn delete_entities_by_workspace(
        &self,
        table: EntityTable,
        workspace_id: &str,
    ) -> Result<usize, AppError> {
        let sql = format!("DELETE FROM {} WHERE workspace_id = ?1", table.table_name());
        let changed = self
            .conn()?
            .execute(&sql, params![workspace_id])
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(changed)
    }

    fn list_entities_filtered<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        filter: Option<(&'static str, &str)>,
        limit: Option<usize>,
    ) -> Result<Vec<T>, AppError> {
        let base_sql = get_select_all_sql(table);
        let mut sql = base_sql.to_string();
        if let Some((field, _)) = filter {
            sql.push_str(" WHERE ");
            sql.push_str(field);
            sql.push_str(" = ?1");
        }
        sql.push_str(" ORDER BY updated_at DESC");
        if let Some(limit) = limit {
            if limit > 1000 {
                return Err(AppError::InvalidInput(format!(
                    "query limit {limit} exceeds safety cap"
                )));
            }
            sql.push_str(&format!(" LIMIT {limit}"));
        }

        let conn = self.conn()?;
        let mut stmt = conn.prepare(&sql).map_err(|e| AppError::Storage(e.to_string()))?;
        let rows = if let Some((_, value)) = filter {
            stmt.query_map(params![value], |row| row.get::<_, String>(0))
                .map_err(|e| AppError::Storage(e.to_string()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| AppError::Storage(e.to_string()))?
        } else {
            stmt.query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| AppError::Storage(e.to_string()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| AppError::Storage(e.to_string()))?
        };
        rows.into_iter().map(|json| serde_json::from_str(&json).map_err(AppError::from)).collect()
    }
}
