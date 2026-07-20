use adl_errors::AppError;
use adl_types::{TaskRecord, TaskStatus};

use crate::connection::Database;
use crate::entity_table::EntityTable;

fn task_status_str(status: &TaskStatus) -> &'static str {
    match status {
        TaskStatus::Pending => "pending",
        TaskStatus::WaitingApproval => "waiting-approval",
        TaskStatus::Approved => "approved",
        TaskStatus::Running => "running",
        TaskStatus::Completed => "completed",
        TaskStatus::Failed => "failed",
        TaskStatus::Rejected => "rejected",
        TaskStatus::RolledBack => "rolled-back",
    }
}

impl Database {
    pub fn save_task(&self, task: &TaskRecord) -> Result<(), AppError> {
        self.save_entity(
            EntityTable::Tasks,
            &task.id,
            None,
            None,
            Some(task_status_str(&task.status)),
            task,
        )
    }

    pub fn load_task(&self, id: &str) -> Result<Option<TaskRecord>, AppError> {
        self.load_entity(EntityTable::Tasks, id)
    }

    pub fn list_tasks(&self) -> Result<Vec<TaskRecord>, AppError> {
        self.list_entities(EntityTable::Tasks)
    }
}
