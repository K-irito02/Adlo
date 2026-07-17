use crate::commands::ipc;
use adl_agent_runtime::registry::AgentRegistry;
use adl_agent_runtime::router;
use adl_errors::AppError;
use adl_types::agent::AgentConfig;
use adl_types::{ConversationScenario, IpcResult};

#[tauri::command]
pub async fn list_agents() -> Result<IpcResult<Vec<AgentConfig>>, AppError> {
    Ok(ipc(list_agents_inner()))
}

fn list_agents_inner() -> Result<Vec<AgentConfig>, adl_errors::AppError> {
    let registry = AgentRegistry::new();
    Ok(registry.list_primary().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn select_agent(
    scenario: String,
    user_prompt: String,
) -> Result<IpcResult<AgentConfig>, AppError> {
    Ok(ipc(select_agent_inner(&scenario, &user_prompt)))
}

fn select_agent_inner(
    scenario: &str,
    user_prompt: &str,
) -> Result<AgentConfig, adl_errors::AppError> {
    let conv_scenario = match scenario {
        "plan" => ConversationScenario::Plan,
        "code_edit" => ConversationScenario::CodeEdit,
        _ => ConversationScenario::Chat,
    };
    let agent_id = router::select(conv_scenario, user_prompt);
    let registry = AgentRegistry::new();
    registry
        .get(agent_id)
        .cloned()
        .ok_or_else(|| adl_errors::AppError::Internal(format!("agent {:?} not found", agent_id)))
}

#[cfg(test)]
mod multi_agent_tests {
    use super::*;

    #[test]
    fn list_agents_returns_built_in() {
        let result = list_agents_inner();
        assert!(result.is_ok());
        let agents = result.unwrap();
        let names: Vec<&str> = agents.iter().map(|a| a.name.as_str()).collect();
        assert!(names.contains(&"build"));
        assert!(names.contains(&"plan"));
    }

    #[test]
    fn select_agent_for_plan_scenario() {
        let result = select_agent_inner("plan", "analyze auth");
        assert!(result.is_ok());
        let agent = result.unwrap();
        assert_eq!(agent.id, adl_types::types::agent::AgentId::Plan);
    }
}
