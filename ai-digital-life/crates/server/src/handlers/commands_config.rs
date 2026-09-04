use crate::ipc;
use adl_errors::AppError;
use adl_types::CommandConfig;
use axum::response::IntoResponse;
use std::path::PathBuf;

pub async fn list_commands(body: axum::body::Bytes) -> impl IntoResponse {
    let input: DataDirBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(input.data_dir);
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let config = adl_kernel::config::load(&dir)?;
        Ok(serde_json::to_value(config.commands)?)
    })
    .await;
    match result {
        Ok(inner) => ipc::to_response(inner),
        Err(e) => ipc::to_response(Err(AppError::Internal(format!("spawn_blocking failed: {e}")))),
    }
}

pub async fn add_command(body: axum::body::Bytes) -> impl IntoResponse {
    let input: AddCommandBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(input.data_dir);
    let command = input.command;
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
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
    match result {
        Ok(inner) => ipc::to_response(inner),
        Err(e) => ipc::to_response(Err(AppError::Internal(format!("spawn_blocking failed: {e}")))),
    }
}

pub async fn update_command(body: axum::body::Bytes) -> impl IntoResponse {
    let input: UpdateCommandBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(input.data_dir);
    let name = input.name;
    let command = input.command;
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
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
    match result {
        Ok(inner) => ipc::to_response(inner),
        Err(e) => ipc::to_response(Err(AppError::Internal(format!("spawn_blocking failed: {e}")))),
    }
}

pub async fn delete_command(body: axum::body::Bytes) -> impl IntoResponse {
    let input: DeleteCommandBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(input.data_dir);
    let name = input.name;
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        config.commands.retain(|c| c.name != name);
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::to_value(config.commands)?)
    })
    .await;
    match result {
        Ok(inner) => ipc::to_response(inner),
        Err(e) => ipc::to_response(Err(AppError::Internal(format!("spawn_blocking failed: {e}")))),
    }
}

pub async fn render_template(body: axum::body::Bytes) -> impl IntoResponse {
    let input: RenderTemplateBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let rendered = CommandConfig::render_template(&input.template, &input.args, &input.workspace);
    ipc::to_response(Ok(serde_json::json!(rendered)))
}

fn data_dir(explicit: Option<String>) -> PathBuf {
    explicit.map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
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
