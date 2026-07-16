use crate::commands::ipc;
use adl_errors::AppError;
use adl_kernel::config::{load, save};
use adl_kernel::{build_ruleset, evaluate_ruleset};
use adl_types::permission_types::{PermissionDecision, PermissionRule, PermissionRulesetConfig};
use adl_types::IpcResult;
use std::path::Path;

#[tauri::command]
pub async fn list_permission_rules(
    data_dir: String,
) -> Result<IpcResult<PermissionRulesetConfig>, AppError> {
    let config = tokio::task::spawn_blocking(move || {
        load(Path::new(&data_dir))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(config.permissions)))
}

#[tauri::command]
pub async fn add_permission_rule(
    data_dir: String,
    rule: PermissionRule,
) -> Result<IpcResult<PermissionRulesetConfig>, AppError> {
    let permissions = tokio::task::spawn_blocking(move || -> Result<PermissionRulesetConfig, AppError> {
        let mut config = load(Path::new(&data_dir))?;
        config.permissions.custom_rules.push(rule);
        save(Path::new(&data_dir), &config)?;
        Ok(config.permissions)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(permissions)))
}

#[tauri::command]
pub async fn delete_permission_rule(
    data_dir: String,
    index: usize,
) -> Result<IpcResult<PermissionRulesetConfig>, AppError> {
    let permissions = tokio::task::spawn_blocking(move || -> Result<PermissionRulesetConfig, AppError> {
        let mut config = load(Path::new(&data_dir))?;
        if index >= config.permissions.custom_rules.len() {
            return Err(adl_errors::AppError::NotFound(format!(
                "Rule index {} out of bounds",
                index
            )));
        }
        config.permissions.custom_rules.remove(index);
        save(Path::new(&data_dir), &config)?;
        Ok(config.permissions)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(permissions)))
}

#[tauri::command]
pub async fn set_permission_include_defaults(
    data_dir: String,
    include: bool,
) -> Result<IpcResult<PermissionRulesetConfig>, AppError> {
    let permissions = tokio::task::spawn_blocking(move || -> Result<PermissionRulesetConfig, AppError> {
        let mut config = load(Path::new(&data_dir))?;
        config.permissions.include_defaults = include;
        save(Path::new(&data_dir), &config)?;
        Ok(config.permissions)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(permissions)))
}

#[tauri::command]
pub async fn evaluate_permission(
    data_dir: String,
    tool_name: String,
    command: String,
    args: Vec<String>,
) -> Result<IpcResult<PermissionDecision>, AppError> {
    let decision = tokio::task::spawn_blocking(move || -> Result<PermissionDecision, AppError> {
        let config = load(Path::new(&data_dir))?;
        let ruleset =
            build_ruleset(&config.permissions.custom_rules, config.permissions.include_defaults);
        Ok(evaluate_ruleset(&ruleset, &tool_name, &command, &args))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(decision)))
}
