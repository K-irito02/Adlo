use crate::state::AppState;
use adl_browser::Bounds;
use tauri::{Manager, State};

#[tauri::command]
pub async fn browser_create(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let app_inner = app.clone();

    app.run_on_main_thread(move || {
        let state = app_inner.state::<AppState>();
        let result = state.browser_manager.create(&app_inner, &url);
        let _ = tx.send(result);
    })
    .map_err(|e| format!("main thread dispatch failed: {e}"))?;

    rx.await.map_err(|e| format!("creation channel error: {e}"))?
}

#[tauri::command]
pub fn browser_destroy(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.browser_manager.destroy(&app)
}

#[tauri::command]
pub fn browser_hide(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.browser_manager.hide(&app)
}

#[tauri::command]
pub fn browser_show(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.browser_manager.show(&app)
}

#[tauri::command]
pub fn browser_navigate(app: tauri::AppHandle, state: State<'_, AppState>, url: String) -> Result<(), String> {
    state.browser_manager.navigate(&app, &url)
}

#[tauri::command]
pub fn browser_go_back(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    state.browser_manager.go_back(&app)
}

#[tauri::command]
pub fn browser_go_forward(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    state.browser_manager.go_forward(&app)
}

#[tauri::command]
pub fn browser_reload(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.browser_manager.reload(&app)
}

#[tauri::command]
pub fn browser_set_bounds(app: tauri::AppHandle, state: State<'_, AppState>, bounds: Bounds) -> Result<(), String> {
    state.browser_manager.set_bounds(&app, bounds)
}

#[tauri::command]
pub fn browser_eval(app: tauri::AppHandle, state: State<'_, AppState>, script: String) -> Result<(), String> {
    state.browser_manager.eval(&app, &script)
}
