use crate::state::AppState;
use adl_browser::Bounds;
use tauri::State;

#[tauri::command]
pub fn browser_create(app: tauri::AppHandle, state: State<'_, AppState>, url: String) -> Result<(), String> {
    state.browser_manager.create(&app, &url)
}

#[tauri::command]
pub fn browser_destroy(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.browser_manager.destroy(&app)
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
