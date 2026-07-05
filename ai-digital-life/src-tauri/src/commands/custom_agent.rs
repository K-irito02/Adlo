use adl_kernel::types::agent::AgentConfig;
use adl_kernel::config::{load, save};

#[tauri::command]
pub async fn list_custom_agents(data_dir: String) -> Result<Vec<AgentConfig>, adl_errors::AppError> {
    let config = load(std::path::Path::new(&data_dir))?;
    Ok(config.custom_agents)
}

#[tauri::command]
pub async fn add_custom_agent(data_dir: String, agent: AgentConfig) -> Result<Vec<AgentConfig>, adl_errors::AppError> {
    let mut config = load(std::path::Path::new(&data_dir))?;
    config.custom_agents.push(agent);
    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.custom_agents)
}

#[tauri::command]
pub async fn delete_custom_agent(data_dir: String, name: String) -> Result<Vec<AgentConfig>, adl_errors::AppError> {
    let mut config = load(std::path::Path::new(&data_dir))?;
    config.custom_agents.retain(|a| a.name != name);
    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.custom_agents)
}
