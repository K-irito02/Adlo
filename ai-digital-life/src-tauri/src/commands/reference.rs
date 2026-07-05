use adl_kernel::types::reference::ReferenceConfig;
use adl_context::references::{validate_reference, references_prompt};
use adl_kernel::config::{load, save};

#[tauri::command]
pub async fn list_references(data_dir: String) -> Result<Vec<ReferenceConfig>, adl_errors::AppError> {
    let config = load(std::path::Path::new(&data_dir))?;
    Ok(config.references)
}

#[tauri::command]
pub async fn add_reference(data_dir: String, reference: ReferenceConfig) -> Result<Vec<ReferenceConfig>, adl_errors::AppError> {
    validate_reference(&reference)?;
    let mut config = load(std::path::Path::new(&data_dir))?;
    config.references.push(reference);
    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.references)
}

#[tauri::command]
pub async fn remove_reference(data_dir: String, name: String) -> Result<Vec<ReferenceConfig>, adl_errors::AppError> {
    let mut config = load(std::path::Path::new(&data_dir))?;
    config.references.retain(|r| r.name != name);
    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.references)
}

#[tauri::command]
pub async fn get_references_prompt(data_dir: String) -> Result<String, adl_errors::AppError> {
    let config = load(std::path::Path::new(&data_dir))?;
    Ok(references_prompt(&config.references))
}
