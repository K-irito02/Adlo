use adl_kernel::config::{load, save};
use adl_kernel::types::commands::CommandConfig;
use adl_kernel::IpcResult;
use crate::commands::ipc;
use std::path::Path;

#[tauri::command]
pub fn list_custom_commands(data_dir: String) -> IpcResult<Vec<CommandConfig>> {
    ipc(load(Path::new(&data_dir)).map(|cfg| cfg.commands))
}

#[tauri::command]
pub fn add_custom_command(
    data_dir: String,
    command: CommandConfig,
) -> IpcResult<Vec<CommandConfig>> {
    ipc((|| {
        let mut config = load(Path::new(&data_dir))?;
        if config.commands.iter().any(|c| c.name == command.name) {
            return Err(adl_errors::AppError::InvalidInput(format!(
                "Command '{}' already exists",
                command.name
            )));
        }
        config.commands.push(command);
        save(Path::new(&data_dir), &config)?;
        Ok(config.commands)
    })())
}

#[tauri::command]
pub fn update_custom_command(
    data_dir: String,
    name: String,
    command: CommandConfig,
) -> IpcResult<Vec<CommandConfig>> {
    ipc((|| {
        let mut config = load(Path::new(&data_dir))?;
        if let Some(pos) = config.commands.iter().position(|c| c.name == name) {
            config.commands[pos] = command;
        } else {
            return Err(adl_errors::AppError::NotFound(format!(
                "Command '{}' not found",
                name
            )));
        }
        save(Path::new(&data_dir), &config)?;
        Ok(config.commands)
    })())
}

#[tauri::command]
pub fn delete_custom_command(
    data_dir: String,
    name: String,
) -> IpcResult<Vec<CommandConfig>> {
    ipc((|| {
        let mut config = load(Path::new(&data_dir))?;
        config.commands.retain(|c| c.name != name);
        save(Path::new(&data_dir), &config)?;
        Ok(config.commands)
    })())
}

#[tauri::command]
pub fn render_command_template(
    template: String,
    args: Vec<String>,
    workspace: String,
) -> IpcResult<String> {
    ipc(Ok(CommandConfig::render_template(&template, &args, &workspace)))
}
