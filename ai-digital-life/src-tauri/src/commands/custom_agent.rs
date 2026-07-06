use crate::commands::ipc;
use adl_errors::AppError;
use adl_kernel::config::{load, save};
use adl_kernel::types::agent::AgentConfig;
use adl_kernel::IpcResult;

fn list_custom_agents_inner(data_dir: &str) -> Result<Vec<AgentConfig>, AppError> {
    let config = load(std::path::Path::new(data_dir))?;
    Ok(config.custom_agents)
}

fn add_custom_agent_inner(
    data_dir: &str,
    agent: &AgentConfig,
) -> Result<Vec<AgentConfig>, AppError> {
    let mut config = load(std::path::Path::new(data_dir))?;
    config.custom_agents.push(agent.clone());
    save(std::path::Path::new(data_dir), &config)?;
    Ok(config.custom_agents)
}

fn delete_custom_agent_inner(data_dir: &str, name: &str) -> Result<Vec<AgentConfig>, AppError> {
    let mut config = load(std::path::Path::new(data_dir))?;
    config.custom_agents.retain(|a| a.name != name);
    save(std::path::Path::new(data_dir), &config)?;
    Ok(config.custom_agents)
}

#[tauri::command]
pub async fn list_custom_agents(data_dir: String) -> Result<IpcResult<Vec<AgentConfig>>, AppError> {
    Ok(ipc(list_custom_agents_inner(&data_dir)))
}

#[tauri::command]
pub async fn add_custom_agent(
    data_dir: String,
    agent: AgentConfig,
) -> Result<IpcResult<Vec<AgentConfig>>, AppError> {
    Ok(ipc(add_custom_agent_inner(&data_dir, &agent)))
}

#[tauri::command]
pub async fn delete_custom_agent(
    data_dir: String,
    name: String,
) -> Result<IpcResult<Vec<AgentConfig>>, AppError> {
    Ok(ipc(delete_custom_agent_inner(&data_dir, &name)))
}
