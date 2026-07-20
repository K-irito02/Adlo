use crate::commands::ipc;
use adl_context::references::{references_prompt, validate_reference};
use adl_errors::AppError;
use adl_kernel::config::{load, save};
use adl_types::IpcResult;
use adl_types::reference::ReferenceConfig;

fn list_references_inner(data_dir: &str) -> Result<Vec<ReferenceConfig>, AppError> {
    let config = load(std::path::Path::new(data_dir))?;
    Ok(config.references)
}

fn add_reference_inner(
    data_dir: &str,
    reference: &ReferenceConfig,
) -> Result<Vec<ReferenceConfig>, AppError> {
    validate_reference(reference)?;
    let mut config = load(std::path::Path::new(data_dir))?;
    config.references.push(reference.clone());
    save(std::path::Path::new(data_dir), &config)?;
    Ok(config.references)
}

fn remove_reference_inner(data_dir: &str, name: &str) -> Result<Vec<ReferenceConfig>, AppError> {
    let mut config = load(std::path::Path::new(data_dir))?;
    config.references.retain(|r| r.name != name);
    save(std::path::Path::new(data_dir), &config)?;
    Ok(config.references)
}

fn get_references_prompt_inner(data_dir: &str) -> Result<String, AppError> {
    let config = load(std::path::Path::new(data_dir))?;
    Ok(references_prompt(&config.references))
}

#[tauri::command]
pub async fn list_references(
    data_dir: String,
) -> Result<IpcResult<Vec<ReferenceConfig>>, AppError> {
    Ok(ipc(list_references_inner(&data_dir)))
}

#[tauri::command]
pub async fn add_reference(
    data_dir: String,
    reference: ReferenceConfig,
) -> Result<IpcResult<Vec<ReferenceConfig>>, AppError> {
    Ok(ipc(add_reference_inner(&data_dir, &reference)))
}

#[tauri::command]
pub async fn remove_reference(
    data_dir: String,
    name: String,
) -> Result<IpcResult<Vec<ReferenceConfig>>, AppError> {
    Ok(ipc(remove_reference_inner(&data_dir, &name)))
}

#[tauri::command]
pub async fn get_references_prompt(data_dir: String) -> Result<IpcResult<String>, AppError> {
    Ok(ipc(get_references_prompt_inner(&data_dir)))
}
