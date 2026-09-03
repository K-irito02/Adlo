//! Sub-agent domain HTTP handlers — migrated from `src-tauri/src/commands/
//! subagent.rs` (`spawn_subagent`, `get_subagent_task`,
//! `list_active_subagents`, `cancel_subagent`). The [`SubagentManager`] lives
//! on [`ServerState::subagent_manager`] (the Tauri original used a module-level
//! static — the field mirrors it for the standalone server). Spawning creates a
//! child session, registers a `SubagentTask`, resolves the agent system prompt
//! and executes the LLM call (synchronously, or in a background task). No
//! events are emitted by the Tauri originals — faithful parity.

use crate::ServerState;
use crate::agent_loop;
use crate::ipc;
use adl_agent_runtime::prompt::agent_system_prompt;
use adl_agent_runtime::registry::AgentRegistry;
use adl_errors::AppError;
use adl_subagent::{SubagentId, SubagentStatus, SubagentTask, TaskToolInput, TaskToolOutput};
use adl_types::agent::AgentId;
use adl_types::{
    ConversationRole, ConversationScenario, ConversationSessionRecord, ModelChatMessage,
};
use axum::extract::State;
use axum::response::IntoResponse;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpawnBody {
    parent_session_id: String,
    input: TaskToolInput,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskIdBody {
    task_id: String,
}

/// Resolve a subagent_type string to a built-in AgentId (unknown strings
/// default to the General sub-agent — faithful port).
fn resolve_agent_id(subagent_type: &str) -> AgentId {
    match subagent_type {
        "explore" => AgentId::Explore,
        _ => AgentId::General,
    }
}

/// POST `/subagent/spawn` — spawn a subagent task under a parent session (covers
/// `SubagentBridge.spawnSubagent`).
pub async fn spawn(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: SpawnBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let parent_session_id = input.parent_session_id.clone();
    let parent_session = match agent_loop::run_blocking(move || {
        agent_loop::require_session(&db, &parent_session_id)
    })
    .await
    {
        Ok(s) => s,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = spawn_subagent_inner(&state, &parent_session, input.input).await;
    match result {
        Ok(output) => match serde_json::to_value(&output) {
            Ok(v) => ipc::to_response(Ok(v)),
            Err(e) => ipc::to_response(Err(AppError::from(e))),
        },
        Err(e) => ipc::to_response(Err(e)),
    }
}

async fn spawn_subagent_inner(
    state: &ServerState,
    parent_session: &ConversationSessionRecord,
    input: TaskToolInput,
) -> Result<TaskToolOutput, AppError> {
    let task_id = input.task_id.as_deref().map(SubagentId::from_str).unwrap_or_default();

    // 1. Resolve the subagent_type string to an AgentId + config.
    let agent_id = resolve_agent_id(&input.subagent_type);
    let registry = AgentRegistry::new();
    let agent_config = registry
        .get(agent_id)
        .cloned()
        .ok_or_else(|| AppError::Internal(format!("agent {agent_id:?} not found in registry")))?;

    // 2. Create the child session (parent_id points at the parent session).
    let child_session_title = format!("{} (@{} subagent)", input.description, agent_config.name);
    let db = state.db.clone();
    let (workspace_id, parent_id) =
        (parent_session.workspace_id.clone(), parent_session.id.clone());
    let child_session =
        agent_loop::run_blocking(move || -> Result<ConversationSessionRecord, AppError> {
            let child = adl_conversation::create_child_session(
                &workspace_id,
                &parent_id,
                &child_session_title,
                0,
            );
            agent_loop::save_session(&db, &child)?;
            Ok(child)
        })
        .await?;
    let child_session_id = child_session.id.clone();

    // 3. Create + register the subagent task record.
    let task = SubagentTask {
        id: task_id.clone(),
        parent_session_id: parent_session.id.clone(),
        child_session_id: child_session_id.clone(),
        subagent_type: agent_id.as_str().to_string(),
        prompt: input.prompt.clone(),
        background: input.background,
        status: SubagentStatus::Pending,
        created_at: adl_types::now_ms(),
        completed_at: None,
    };
    let manager = state.subagent_manager.clone();
    manager.register(task).await;

    // 4. Resolve the system prompt + model preferences (for the ModelGateway).
    let system_prompt = agent_system_prompt(agent_id);
    let model_preferences = {
        let config =
            state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        config.model_preferences.clone()
    };
    let provider_registry = state.provider_registry.clone();

    // 5. Execute the LLM call.
    if input.background {
        let manager_clone = manager.clone();
        let task_id_clone = task_id.clone();
        let child_session_id_clone = child_session_id.clone();
        let prompt = input.prompt.clone();
        let workspace_id = parent_session.workspace_id.clone();
        let subagent_type = input.subagent_type.clone();

        tokio::spawn(async move {
            if let Err(e) =
                manager_clone.update_status(&task_id_clone, SubagentStatus::Running).await
            {
                tracing::error!(
                    "Failed to set subagent {} to Running: {}",
                    task_id_clone.as_str(),
                    e
                );
            }
            let result = execute_subagent_llm_call(
                model_preferences,
                provider_registry,
                &workspace_id,
                &child_session_id_clone,
                &prompt,
                Some(&system_prompt),
            )
            .await;
            match result {
                Ok(content) => {
                    if let Err(e) =
                        manager_clone.update_status(&task_id_clone, SubagentStatus::Completed).await
                    {
                        tracing::error!(
                            "Failed to set subagent {} to Completed: {}",
                            task_id_clone.as_str(),
                            e
                        );
                    }
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
                    if let Err(e) =
                        manager_clone.update_status(&task_id_clone, SubagentStatus::Failed).await
                    {
                        tracing::error!(
                            "Failed to set subagent {} to Failed: {}",
                            task_id_clone.as_str(),
                            e
                        );
                    }
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

    // Foreground: execute synchronously and return the outcome.
    manager.update_status(&task_id, SubagentStatus::Running).await?;
    let result = execute_subagent_llm_call(
        model_preferences,
        provider_registry,
        &parent_session.workspace_id,
        &child_session_id,
        &input.prompt,
        Some(&system_prompt),
    )
    .await;

    match result {
        Ok(content) => {
            manager.update_status(&task_id, SubagentStatus::Completed).await?;
            Ok(TaskToolOutput {
                task_id: task_id.as_str().to_string(),
                state: "completed".to_string(),
                summary: format!("Subagent {} completed", input.subagent_type),
                result: Some(content),
                error: None,
            })
        },
        Err(e) => {
            manager.update_status(&task_id, SubagentStatus::Failed).await?;
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

/// Execute the LLM call for a subagent (reuses the ModelGateway over the shared
/// provider registry; falls back to a synthetic response when no provider is
/// enabled — faithful port of the Tauri `execute_subagent_llm_call`).
async fn execute_subagent_llm_call(
    model_preferences: adl_types::ModelPreferences,
    provider_registry: std::sync::Arc<
        std::sync::RwLock<adl_model_gateway::registry::ProviderRegistry>,
    >,
    workspace_id: &str,
    session_id: &str,
    prompt: &str,
    system_prompt: Option<&str>,
) -> Result<String, AppError> {
    let mut messages: Vec<ModelChatMessage> = Vec::new();
    if let Some(sys) = system_prompt {
        messages
            .push(ModelChatMessage { role: ConversationRole::System, content: sys.to_string() });
    }
    messages.push(ModelChatMessage { role: ConversationRole::User, content: prompt.to_string() });

    let gateway = adl_model_gateway::ModelGateway::new(model_preferences, provider_registry)?;
    let response =
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

/// POST `/subagent/get` — a subagent task or `null` (covers
/// `SubagentBridge.getSubagentTask`).
pub async fn get(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: TaskIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let id = SubagentId::from_str(&input.task_id);
    let manager = state.subagent_manager.clone();
    let task = manager.get(&id).await;
    ipc::to_response(serde_json::to_value(task).map_err(AppError::from))
}

/// POST `/subagent/list-active` — active subagent tasks (covers
/// `SubagentBridge.listActiveSubagents`).
pub async fn list_active(State(state): State<ServerState>) -> impl IntoResponse {
    let manager = state.subagent_manager.clone();
    let tasks: Vec<SubagentTask> = manager.list_active().await;
    ipc::to_response(serde_json::to_value(tasks).map_err(AppError::from))
}

/// POST `/subagent/cancel` — abort a subagent task (covers
/// `SubagentBridge.cancelSubagent`).
pub async fn cancel(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: TaskIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let id = SubagentId::from_str(&input.task_id);
    let manager = state.subagent_manager.clone();
    let result = manager.update_status(&id, SubagentStatus::Aborted).await;
    ipc::to_response(result.map(|()| serde_json::json!(true)))
}
