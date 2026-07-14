use crate::commands::ipc;
use adl_kernel::config::{load, save};
use adl_kernel::{build_ruleset, evaluate_ruleset};
use adl_types::permission_types::{PermissionDecision, PermissionRule, PermissionRulesetConfig};
use adl_types::IpcResult;
use std::path::Path;

#[tauri::command]
pub fn list_permission_rules(data_dir: String) -> IpcResult<PermissionRulesetConfig> {
    ipc(load(Path::new(&data_dir)).map(|cfg| cfg.permissions))
}

#[tauri::command]
pub fn add_permission_rule(
    data_dir: String,
    rule: PermissionRule,
) -> IpcResult<PermissionRulesetConfig> {
    ipc((|| {
        let mut config = load(Path::new(&data_dir))?;
        config.permissions.custom_rules.push(rule);
        save(Path::new(&data_dir), &config)?;
        Ok(config.permissions)
    })())
}

#[tauri::command]
pub fn delete_permission_rule(
    data_dir: String,
    index: usize,
) -> IpcResult<PermissionRulesetConfig> {
    ipc((|| {
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
    })())
}

#[tauri::command]
pub fn set_permission_include_defaults(
    data_dir: String,
    include: bool,
) -> IpcResult<PermissionRulesetConfig> {
    ipc((|| {
        let mut config = load(Path::new(&data_dir))?;
        config.permissions.include_defaults = include;
        save(Path::new(&data_dir), &config)?;
        Ok(config.permissions)
    })())
}

#[tauri::command]
pub fn evaluate_permission(
    data_dir: String,
    tool_name: String,
    command: String,
    args: Vec<String>,
) -> IpcResult<PermissionDecision> {
    ipc((|| {
        let config = load(Path::new(&data_dir))?;
        let ruleset =
            build_ruleset(&config.permissions.custom_rules, config.permissions.include_defaults);
        Ok(evaluate_ruleset(&ruleset, &tool_name, &command, &args))
    })())
}
