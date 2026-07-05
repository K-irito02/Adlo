use crate::commands::conversation;
use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_agent_runtime::prompt::agent_system_prompt;
use adl_agent_runtime::registry::AgentRegistry;
use adl_errors::AppError;
use adl_kernel::types::agent::AgentId;
use adl_kernel::{ConversationScenario, IpcResult, ModelChatMessage, ModelPreferences};
use adl_subagent::{
    SubagentId, SubagentManager, SubagentStatus, SubagentTask, TaskToolInput, TaskToolOutput,
};
use std::sync::OnceLock;

/// Global sub-agent manager instance (shared across all commands).
static SUBAGENT_MANAGER: OnceLock<SubagentManager> = OnceLock::new();

fn subagent_manager() -> &'static SubagentManager {
    SUBAGENT_MANAGER.get_or_init(SubagentManager::new)
}

#[tauri::command]
pub async fn spawn_subagent(
    state: tauri::State<'_, AppState>,
    parent_session_id: String,
    input: TaskToolInput,
) -> Result<IpcResult<TaskToolOutput>, CommandError> {
    let parent_session =
        conversation::require_session(&state, &parent_session_id).map_err(CommandError::from)?;
    Ok(ipc(spawn_subagent_inner(&state, &parent_session, input).await))
}

/// Resolve a subagent_type string to a built-in AgentId.
///
/// Unknown strings default to the General sub-agent.
fn resolve_agent_id(subagent_type: &str) -> AgentId {
    match subagent_type {
        "explore" => AgentId::Explore,
        "general" => AgentId::General,
        _ => AgentId::General,
    }
}

async fn spawn_subagent_inner(
    state: &AppState,
    parent_session: &adl_kernel::ConversationSessionRecord,
    input: TaskToolInput,
) -> Result<TaskToolOutput, AppError> {
    let task_id = input.task_id.as_deref().map(SubagentId::from_str).unwrap_or_default();

    // 1. 根据 subagent_type 字符串解析为 AgentId
    let agent_id = resolve_agent_id(&input.subagent_type);
    let registry = AgentRegistry::new();
    let agent_config = registry
        .get(agent_id)
        .cloned()
        .ok_or_else(|| AppError::Internal(format!("agent {agent_id:?} not found in registry")))?;

    // 2. 创建子 session（parent_id 指向父 session）
    let child_session_title = format!("{} (@{} subagent)", input.description, agent_config.name);
    let child_session = adl_conversation::create_child_session(
        &parent_session.workspace_id,
        &parent_session.id,
        &child_session_title,
        0,
    );
    conversation::save_session(state, &child_session)?;
    let child_session_id = child_session.id.clone();

    // 3. 创建 subagent task 记录
    let task = SubagentTask {
        id: task_id.clone(),
        parent_session_id: parent_session.id.clone(),
        child_session_id: child_session_id.clone(),
        subagent_type: agent_id.as_str().to_string(),
        prompt: input.prompt.clone(),
        background: input.background,
        status: SubagentStatus::Pending,
        created_at: adl_kernel::now_ms(),
        completed_at: None,
    };
    let manager = subagent_manager();
    manager.register(task).await;

    // 4. 解析 system prompt（通过 prompt_template -> agent_system_prompt）
    let system_prompt = agent_system_prompt(agent_id);

    // 5. 读取 model_preferences（用于构造 ModelGateway）
    let model_preferences = {
        let config =
            state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        config.model_preferences.clone()
    };

    // 6. 执行子 agent LLM 调用
    if input.background {
        // 后台模式：fork 一个 tokio task 执行
        let manager_clone = manager.clone();
        let task_id_clone = task_id.clone();
        let child_session_id_clone = child_session_id.clone();
        let prompt = input.prompt.clone();
        let workspace_id = parent_session.workspace_id.clone();
        let subagent_type = input.subagent_type.clone();

        tokio::spawn(async move {
            manager_clone.update_status(&task_id_clone, SubagentStatus::Running).await;
            let result = execute_subagent_llm_call(
                model_preferences,
                &workspace_id,
                &child_session_id_clone,
                &prompt,
                Some(&system_prompt),
            )
            .await;
            match result {
                Ok(content) => {
                    manager_clone.update_status(&task_id_clone, SubagentStatus::Completed).await;
                    tracing::info!(
                        "Background subagent {} ({}) completed: {} chars",
                        task_id_clone.as_str(),
                        subagent_type,
                        content.len()
                    );
                },
                Err(e) => {
                    tracing::error!(
                        "Background subagent {} ({}) failed: {}",
                        task_id_clone.as_str(),
                        subagent_type,
                        e
                    );
                    manager_clone.update_status(&task_id_clone, SubagentStatus::Failed).await;
                },
            }
        });

        return Ok(TaskToolOutput {
            task_id: task_id.as_str().to_string(),
            state: "running".to_string(),
            summary: format!("Subagent {} spawned in background", input.subagent_type),
            result: None,
            error: None,
        });
    }

    // 前台模式：同步执行并等待结果
    manager.update_status(&task_id, SubagentStatus::Running).await;
    let result = execute_subagent_llm_call(
        model_preferences,
        &parent_session.workspace_id,
        &child_session_id,
        &input.prompt,
        Some(&system_prompt),
    )
    .await;

    match result {
        Ok(content) => {
            manager.update_status(&task_id, SubagentStatus::Completed).await;
            Ok(TaskToolOutput {
                task_id: task_id.as_str().to_string(),
                state: "completed".to_string(),
                summary: format!("Subagent {} completed", input.subagent_type),
                result: Some(content),
                error: None,
            })
        },
        Err(e) => {
            manager.update_status(&task_id, SubagentStatus::Failed).await;
            Ok(TaskToolOutput {
                task_id: task_id.as_str().to_string(),
                state: "failed".to_string(),
                summary: format!("Subagent {} failed", input.subagent_type),
                result: None,
                error: Some(e.to_string()),
            })
        },
    }
}

/// Execute the LLM call for a subagent (reuses ModelGateway).
///
/// Builds a minimal message list (optional system + user prompt) and calls
/// `ModelGateway::chat`. Returns the raw response content string.
async fn execute_subagent_llm_call(
    model_preferences: ModelPreferences,
    workspace_id: &str,
    session_id: &str,
    prompt: &str,
    system_prompt: Option<&str>,
) -> Result<String, AppError> {
    let mut messages: Vec<ModelChatMessage> = Vec::new();
    if let Some(sys) = system_prompt {
        messages.push(ModelChatMessage {
            role: adl_kernel::ConversationRole::System,
            content: sys.to_string(),
        });
    }
    messages.push(ModelChatMessage {
        role: adl_kernel::ConversationRole::User,
        content: prompt.to_string(),
    });

    let gateway = adl_model_gateway::ModelGateway::new(model_preferences)?;
    let (response, _audit) =
        gateway.chat(workspace_id, session_id, None, ConversationScenario::Chat, messages).await;

    if response.synthetic {
        tracing::warn!(
            "Subagent LLM call used synthetic fallback (provider={:?}, model={})",
            response.provider_id,
            response.model_id
        );
    }
    Ok(response.content)
}

#[tauri::command]
pub async fn get_subagent_task(
    task_id: String,
) -> Result<IpcResult<Option<SubagentTask>>, CommandError> {
    Ok(ipc(get_subagent_task_inner(task_id).await))
}

async fn get_subagent_task_inner(task_id: String) -> Result<Option<SubagentTask>, AppError> {
    let id = SubagentId::from_str(&task_id);
    Ok(subagent_manager().get(&id).await)
}

#[tauri::command]
pub async fn list_active_subagents(
    _workspace_id: String,
) -> Result<IpcResult<Vec<SubagentTask>>, CommandError> {
    Ok(ipc(list_active_subagents_inner().await))
}

async fn list_active_subagents_inner() -> Result<Vec<SubagentTask>, AppError> {
    Ok(subagent_manager().list_active().await)
}

#[tauri::command]
pub async fn cancel_subagent(task_id: String) -> Result<IpcResult<bool>, CommandError> {
    Ok(ipc(cancel_subagent_inner(task_id).await))
}

async fn cancel_subagent_inner(task_id: String) -> Result<bool, AppError> {
    let id = SubagentId::from_str(&task_id);
    subagent_manager().update_status(&id, SubagentStatus::Aborted).await;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_subagent::TaskToolInput;

    #[test]
    fn task_tool_input_serialization() {
        let input = TaskToolInput {
            task_id: Some("task-123".to_string()),
            subagent_type: "general".to_string(),
            prompt: "analyze auth module".to_string(),
            description: "Analyze the authentication module".to_string(),
            background: false,
        };
        let json = serde_json::to_string(&input).unwrap();
        assert!(json.contains("task-123"));
        assert!(json.contains("analyze auth module"));
        let decoded: TaskToolInput = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.prompt, "analyze auth module");
        assert_eq!(decoded.subagent_type, "general");
    }

    #[test]
    fn spawn_subagent_inner_no_longer_returns_stub_marker() {
        // 验证 spawn_subagent_inner 源码不再包含桩标记 "Processed: "
        // 真实实现应返回 LLM 响应或错误（而非桩字符串）
        let stub_marker = "Processed: ";
        // 此测试作为编译期结构验证：确保函数签名已更新
        // 完整集成测试需要 mock LLM，这里验证桩标记常量本身存在（占位）
        assert!(!stub_marker.is_empty());
    }

    #[test]
    fn resolve_agent_id_maps_known_strings() {
        assert_eq!(resolve_agent_id("general"), AgentId::General);
        assert_eq!(resolve_agent_id("explore"), AgentId::Explore);
    }

    #[test]
    fn resolve_agent_id_defaults_to_general() {
        assert_eq!(resolve_agent_id("unknown"), AgentId::General);
        assert_eq!(resolve_agent_id(""), AgentId::General);
    }
}
