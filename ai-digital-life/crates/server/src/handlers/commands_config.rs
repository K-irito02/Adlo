//! Commands-config domain HTTP handlers — migrated from
//! `src-tauri/src/commands/commands_config.rs` (`list_custom_commands`,
//! `add_custom_command`, `update_custom_command`, `delete_custom_command`,
//! `render_command_template`). User-defined slash-commands live in the app
//! config on disk (`<data_dir>/config/config.json`), which the standalone
//! server owns via `state.data_dir`; an explicit `dataDir` in the request body
//! overrides it (matching the frontend `CommandsConfigBridge` contract).
//! No events are emitted by the Tauri originals — faithful parity.

use crate::ServerState;
use crate::agent_loop;
use crate::ipc;
use adl_errors::AppError;
use adl_types::CommandConfig;
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::PathBuf;

/// POST `/commands-config/list` — the configured custom slash-commands (covers
/// `CommandsConfigBridge.listCustomCommands`).
pub async fn list_commands(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: DataDirBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let config = adl_kernel::config::load(&dir)?;
        Ok(serde_json::to_value(config.commands)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/commands-config/add` — append a custom command (rejecting duplicate
/// names) and persist (covers `CommandsConfigBridge.addCustomCommand`).
pub async fn add_command(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: AddCommandBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let command = input.command;
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        if config.commands.iter().any(|c| c.name == command.name) {
            return Err(AppError::InvalidInput(format!(
                "Command '{}' already exists",
                command.name
            )));
        }
        config.commands.push(command);
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::to_value(config.commands)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/commands-config/update` — replace a command by its original name and
/// persist; unknown name → 404 (covers `CommandsConfigBridge.updateCustomCommand`).
pub async fn update_command(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: UpdateCommandBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let name = input.name;
    let command = input.command;
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        let pos = config
            .commands
            .iter()
            .position(|c| c.name == name)
            .ok_or_else(|| AppError::NotFound(format!("Command '{}' not found", name)))?;
        config.commands[pos] = command;
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::to_value(config.commands)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/commands-config/delete` — remove a command by name and persist (covers
/// `CommandsConfigBridge.deleteCustomCommand`).
pub async fn delete_command(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: DeleteCommandBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let name = input.name;
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        config.commands.retain(|c| c.name != name);
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::to_value(config.commands)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/commands-config/render` — render a command template with the given
/// args + workspace (covers `CommandsConfigBridge.renderCommandTemplate`).
pub async fn render_template(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: RenderTemplateBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let rendered = CommandConfig::render_template(&input.template, &input.args, &input.workspace);
    ipc::to_response(Ok(serde_json::json!(rendered)))
}

// ─────────────────────────────────────────────────────────────────────────────
// Bodies / helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Resolve the config data dir: an explicit body override wins, otherwise the
/// server's own `state.data_dir`.
fn data_dir(state: &ServerState, explicit: Option<String>) -> PathBuf {
    explicit.map(PathBuf::from).unwrap_or_else(|| state.data_dir.clone())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DataDirBody {
    #[serde(default)]
    data_dir: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddCommandBody {
    #[serde(default)]
    data_dir: Option<String>,
    command: CommandConfig,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCommandBody {
    #[serde(default)]
    data_dir: Option<String>,
    name: String,
    command: CommandConfig,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteCommandBody {
    #[serde(default)]
    data_dir: Option<String>,
    name: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenderTemplateBody {
    template: String,
    args: Vec<String>,
    workspace: String,
}
