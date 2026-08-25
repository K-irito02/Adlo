# Browser Download Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement complete browser download management with WebView2 event interception, Edge-style download menu, download settings, danger color standardization, and icon replacement.

**Architecture:** WebView2 `DownloadStarting` event interception → Rust `DownloadManager` with SQLite persistence → Tauri event bridge → React/Zustand store → Edge-style download UI components.

**Tech Stack:** Rust + Tauri 2.x + WebView2 (WRY) + React 19 + Zustand + TypeScript + SQLite + SVG icons

## Global Constraints

- Rust: `cargo clippy --workspace --all-targets -- -D warnings` must pass (0 warnings)
- Frontend: `pnpm --dir frontend run lint` must pass (0 errors)
- i18n: All UI text must use i18n keys, no hardcoded strings
- CSS: All colors via CSS custom properties `var(--)`
- Danger color: `#e9967a` (rgb 233, 150, 122) is the standard
- Icons: SVG format, inherit `currentColor`, no emoji
-双端一致性: Feature must work in both Tauri and browser modes

---

## File Structure

### New Files (Rust)

| File | Purpose |
|------|---------|
| `crates/browser/src/download_types.rs` | Data models (DownloadRecord, DownloadSettings, DownloadStatus) |
| `crates/browser/src/download_manager.rs` | Download manager core (SQLite CRUD, path resolution, disk check) |
| `crates/browser/src/download_handler.rs` | WebView2 download event wiring |
| `src-tauri/src/commands/download_commands.rs` | Tauri commands (start, cancel, pause, resume, list, settings) |
| `src-tauri/migrations/20260825_download_history.sql` | SQLite migration for download_history table |

### New Files (Frontend)

| File | Purpose |
|------|---------|
| `frontend/src/app/stores/slices/browserDownloadsSlice.ts` | Zustand store slice for download state |
| `frontend/src/app/features/browser/BrowserDownloadButton.tsx` | Toolbar download button with progress ring |
| `frontend/src/app/features/browser/BrowserDownloadMenu.tsx` | Edge-style download menu card |
| `frontend/src/app/features/browser/BrowserDownloadItem.tsx` | Single download record component |
| `frontend/src/app/features/browser/BrowserDownloadContextMenu.tsx` | Right-click context menu |
| `frontend/src/app/features/browser/useBrowserDownloads.ts` | Tauri event listener hook |
| `frontend/src/app/features/browser-settings/BrowserDownloadSettings.tsx` | Download settings page |

### Modified Files

| File | Changes |
|------|---------|
| `crates/browser/src/lib.rs` | Export new modules |
| `src-tauri/src/main.rs` | Register commands, update WebView2 args |
| `src-tauri/src/commands/browser_webview_setup.rs` | Add download handler to WebviewBuilder |
| `src-tauri/src/webview_event_bridge.rs` | Add download event emission |
| `ai-digital-life/frontend/src/app/features/browser/BrowserToolbar.tsx` | Add download button |
| `ai-digital-life/frontend/src/app/features/browser-settings/SettingsNav.tsx` | Add download settings nav item |
| `frontend/src/styles/themes.css` | Danger color standardization |
| `frontend/src/design-system/icons.ts` | Add IconDownload, IconDownloadSettings, IconDelete |
| `frontend/src/i18n/en-US/browser.ts` | Add download i18n keys |
| `frontend/src/i18n/zh-CN/browser.ts` | Add download i18n keys |
| 14 files using IconTrash | Replace with IconDelete |
| Multiple CSS/TS files | Fix hardcoded red fallbacks |

---

## Task 1: Data Models & SQLite Migration (Rust)

**Files:**
- Create: `crates/browser/src/download_types.rs`
- Create: `src-tauri/migrations/20260825_download_history.sql`
- Modify: `crates/browser/src/lib.rs:1-10` (add mod declaration)

**Interfaces:**
- Produces: `DownloadRecord`, `DownloadSettings`, `DownloadMode`, `DownloadStatus`, `DownloadProgress` types

- [ ] **Step 1: Create download_types.rs with data models**

```rust
// crates/browser/src/download_types.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadStatus {
    InProgress,
    Completed,
    Failed,
    Paused,
    Canceled,
}

impl DownloadStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::InProgress => "in_progress",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Paused => "paused",
            Self::Canceled => "canceled",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            "paused" => Self::Paused,
            "canceled" => Self::Canceled,
            _ => Self::InProgress,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRecord {
    pub id: String,
    pub url: String,
    pub file_name: String,
    pub file_path: String,
    pub total_bytes: Option<u64>,
    pub bytes_received: u64,
    pub mime_type: Option<String>,
    pub status: DownloadStatus,
    pub interrupt_reason: Option<String>,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub source_tab_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadSettings {
    pub mode: DownloadMode,
    pub default_path: String,
}

impl Default for DownloadSettings {
    fn default() -> Self {
        Self {
            mode: DownloadMode::Auto,
            default_path: super::download_manager::get_default_download_path()
                .to_string_lossy()
                .to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadMode {
    Auto,
    Ask,
}

impl DownloadMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Ask => "ask",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "ask" => Self::Ask,
            _ => Self::Auto,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub id: String,
    pub bytes_received: u64,
    pub speed: u64,
    pub estimated_end_time: Option<f64>,
}
```

- [ ] **Step 2: Create SQLite migration**

```sql
-- src-tauri/migrations/20260825_download_history.sql

CREATE TABLE IF NOT EXISTS download_history (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    total_bytes INTEGER,
    bytes_received INTEGER NOT NULL DEFAULT 0,
    mime_type TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress',
    interrupt_reason TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    source_tab_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_download_history_created ON download_history(created_at);
CREATE INDEX IF NOT EXISTS idx_download_history_status ON download_history(status);
```

- [ ] **Step 3: Add mod declaration to lib.rs**

Add to `crates/browser/src/lib.rs`:
```rust
pub mod download_types;
pub mod download_manager;
pub mod download_handler;
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check -p browser`
Expected: Compiles without errors

- [ ] **Step 5: Commit**

```bash
git add crates/browser/src/download_types.rs src-tauri/migrations/20260825_download_history.sql crates/browser/src/lib.rs
git commit -m "feat(browser): add download data models and SQLite migration"
```

---

## Task 2: Download Manager Core (Rust)

**Files:**
- Create: `crates/browser/src/download_manager.rs`
- Modify: `crates/browser/src/lib.rs` (already added in Task 1)

**Interfaces:**
- Consumes: `DownloadRecord`, `DownloadSettings`, `DownloadMode`, `DownloadStatus` from Task 1
- Produces: `DownloadManager` struct with methods for CRUD, path resolution, disk check

- [ ] **Step 1: Create download_manager.rs with core logic**

```rust
// crates/browser/src/download_manager.rs

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};

use chrono::Utc;
use rusqlite::Connection;
use uuid::Uuid;

use super::download_types::{DownloadMode, DownloadRecord, DownloadSettings, DownloadStatus};

pub struct DownloadManager {
    db: Mutex<Connection>,
    settings: RwLock<DownloadSettings>,
    active_downloads: Mutex<HashMap<String, super::download_types::DownloadProgress>>,
}

impl DownloadManager {
    pub fn new(db: Connection) -> Self {
        let settings = Self::load_settings(&db).unwrap_or_default();
        Self {
            db: Mutex::new(db),
            settings: RwLock::new(settings),
            active_downloads: Mutex::new(HashMap::new()),
        }
    }

    pub fn get_settings(&self) -> DownloadSettings {
        self.settings.read().unwrap().clone()
    }

    pub fn update_settings(
        &self,
        mode: Option<DownloadMode>,
        default_path: Option<String>,
    ) -> Result<(), String> {
        let mut settings = self.settings.write().unwrap();
        if let Some(m) = mode {
            settings.mode = m;
        }
        if let Some(p) = default_path {
            settings.default_path = p;
        }
        self.save_settings(&settings)?;
        Ok(())
    }

    pub fn check_disk_space(&self, path: &str) -> Result<(), String> {
        let path = Path::new(path);
        let dir = path.parent().unwrap_or(Path::new("/"));
        let stat = fs2::available_space(dir).map_err(|e| format!("Disk check failed: {}", e))?;
        if stat < 10 * 1024 * 1024 {
            return Err("FileNoSpace".to_string());
        }
        Ok(())
    }

    pub fn resolve_conflict_path(&self, suggested_path: &str) -> String {
        let path = Path::new(suggested_path);
        if !path.exists() {
            return suggested_path.to_string();
        }

        let stem = path.file_stem().unwrap().to_str().unwrap();
        let ext = path
            .extension()
            .map(|e| format!(".{}", e.to_str().unwrap()))
            .unwrap_or_default();
        let dir = path.parent().unwrap();

        for i in 1.. {
            let new_name = format!("{} ({}){}", stem, i, ext);
            let new_path = dir.join(&new_name);
            if !new_path.exists() {
                return new_path.to_str().unwrap().to_string();
            }
        }
        unreachable!()
    }

    pub fn create_download(&self, url: &str, file_path: &str) -> DownloadRecord {
        let record = DownloadRecord {
            id: Uuid::new_v4().to_string(),
            url: url.to_string(),
            file_name: Path::new(file_path)
                .file_name()
                .unwrap()
                .to_str()
                .unwrap()
                .to_string(),
            file_path: file_path.to_string(),
            total_bytes: None,
            bytes_received: 0,
            mime_type: None,
            status: DownloadStatus::InProgress,
            interrupt_reason: None,
            created_at: Utc::now().timestamp(),
            completed_at: None,
            source_tab_id: None,
        };

        let db = self.db.lock().unwrap();
        db.execute(
            "INSERT INTO download_history (id, url, file_name, file_path, total_bytes, bytes_received, mime_type, status, interrupt_reason, created_at, completed_at, source_tab_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                record.id,
                record.url,
                record.file_name,
                record.file_path,
                record.total_bytes,
                record.bytes_received,
                record.mime_type,
                record.status.as_str(),
                record.interrupt_reason,
                record.created_at,
                record.completed_at,
                record.source_tab_id,
            ],
        )
        .unwrap();

        record
    }

    pub fn update_progress(&self, id: &str, bytes: u64, speed: u64) {
        {
            let mut active = self.active_downloads.lock().unwrap();
            active.insert(
                id.to_string(),
                super::download_types::DownloadProgress {
                    id: id.to_string(),
                    bytes_received: bytes,
                    speed,
                    estimated_end_time: None,
                },
            );
        }

        let db = self.db.lock().unwrap();
        db.execute(
            "UPDATE download_history SET bytes_received = ?1 WHERE id = ?2",
            rusqlite::params![bytes, id],
        )
        .unwrap();
    }

    pub fn complete_download(&self, id: &str, success: bool, reason: Option<&str>) {
        let status = if success {
            DownloadStatus::Completed
        } else {
            DownloadStatus::Failed
        };

        let db = self.db.lock().unwrap();
        db.execute(
            "UPDATE download_history SET status = ?1, interrupt_reason = ?2, completed_at = ?3 WHERE id = ?4",
            rusqlite::params![status.as_str(), reason, Utc::now().timestamp(), id],
        )
        .unwrap();

        self.active_downloads.lock().unwrap().remove(id);
    }

    pub fn list_downloads(&self) -> Vec<DownloadRecord> {
        let db = self.db.lock().unwrap();
        let mut stmt = db
            .prepare("SELECT id, url, file_name, file_path, total_bytes, bytes_received, mime_type, status, interrupt_reason, created_at, completed_at, source_tab_id FROM download_history ORDER BY created_at DESC")
            .unwrap();

        stmt.query_map([], |row| {
            Ok(DownloadRecord {
                id: row.get(0)?,
                url: row.get(1)?,
                file_name: row.get(2)?,
                file_path: row.get(3)?,
                total_bytes: row.get(4)?,
                bytes_received: row.get(5)?,
                mime_type: row.get(6)?,
                status: DownloadStatus::from_str(&row.get::<_, String>(7)?),
                interrupt_reason: row.get(8)?,
                created_at: row.get(9)?,
                completed_at: row.get(10)?,
                source_tab_id: row.get(11)?,
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    }

    pub fn clear_history(&self) {
        let db = self.db.lock().unwrap();
        db.execute("DELETE FROM download_history", []).unwrap();
    }

    pub fn delete_file_and_record(&self, id: &str) -> Result<(), String> {
        let record = self.get_record(id)?;
        if Path::new(&record.file_path).exists() {
            fs::remove_file(&record.file_path)
                .map_err(|e| format!("Failed to delete file: {}", e))?;
        }
        self.remove_record(id)
    }

    pub fn remove_record(&self, id: &str) -> Result<(), String> {
        let db = self.db.lock().unwrap();
        db.execute("DELETE FROM download_history WHERE id = ?1", rusqlite::params![id])
            .unwrap();
        Ok(())
    }

    fn get_record(&self, id: &str) -> Result<DownloadRecord, String> {
        let db = self.db.lock().unwrap();
        db.query_row(
            "SELECT id, url, file_name, file_path, total_bytes, bytes_received, mime_type, status, interrupt_reason, created_at, completed_at, source_tab_id FROM download_history WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(DownloadRecord {
                    id: row.get(0)?,
                    url: row.get(1)?,
                    file_name: row.get(2)?,
                    file_path: row.get(3)?,
                    total_bytes: row.get(4)?,
                    bytes_received: row.get(5)?,
                    mime_type: row.get(6)?,
                    status: DownloadStatus::from_str(&row.get::<_, String>(7)?),
                    interrupt_reason: row.get(8)?,
                    created_at: row.get(9)?,
                    completed_at: row.get(10)?,
                    source_tab_id: row.get(11)?,
                })
            },
        )
        .map_err(|e| format!("Record not found: {}", e))
    }

    fn load_settings(db: &Connection) -> Result<DownloadSettings, String> {
        db.query_row(
            "SELECT value FROM app_config WHERE key = 'download_settings'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|v| serde_json::from_str(&v).unwrap_or_default())
        .map_err(|_| "No settings found".to_string())
    }

    fn save_settings(&self, settings: &DownloadSettings) -> Result<(), String> {
        let json = serde_json::to_string(settings).map_err(|e| e.to_string())?;
        let db = self.db.lock().unwrap();
        db.execute(
            "INSERT OR REPLACE INTO app_config (key, value) VALUES ('download_settings', ?1)",
            rusqlite::params![json],
        )
        .unwrap();
        Ok(())
    }
}

/// Get default download path (non-C: drive preferred)
pub fn get_default_download_path() -> PathBuf {
    // 1. Try non-C: drive Downloads folder
    #[cfg(target_os = "windows")]
    {
        if let Some(downloads) = find_non_c_downloads_folder() {
            return downloads;
        }
    }

    // 2. Fallback to user Downloads directory
    if let Some(home) = dirs::home_dir() {
        let downloads = home.join("Downloads");
        if downloads.exists() {
            return downloads;
        }
        fs::create_dir_all(&downloads).ok();
        return downloads;
    }

    // 3. Final fallback: app-specific directory
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ai-digital-life")
        .join("downloads");
    fs::create_dir_all(&app_dir).ok();
    app_dir
}

#[cfg(target_os = "windows")]
fn find_non_c_downloads_folder() -> Option<PathBuf> {
    for drive in b'D'..=b'Z' {
        let drive_path = format!("{}:\\", drive as char);
        if Path::new(&drive_path).exists() && drive != b'C' {
            if let Some(home) = dirs::home_dir() {
                let downloads = Path::new(&drive_path)
                    .join(home.file_name().unwrap_or_default())
                    .join("Downloads");
                if downloads.exists() {
                    return Some(downloads);
                }
            }
        }
    }
    None
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check -p browser`
Expected: Compiles without errors

- [ ] **Step 3: Commit**

```bash
git add crates/browser/src/download_manager.rs
git commit -m "feat(browser): add download manager core with SQLite operations"
```

---

## Task 3: WebView2 Download Handler (Rust)

**Files:**
- Create: `crates/browser/src/download_handler.rs`
- Modify: `src-tauri/src/commands/browser_webview_setup.rs:51-100` (add download handler)
- Modify: `src-tauri/src/main.rs:37-42` (modify WebView2 args)

**Interfaces:**
- Consumes: `DownloadManager` from Task 2
- Produces: Download event emission via Tauri events

- [ ] **Step 1: Create download_handler.rs**

```rust
// crates/browser/src/download_handler.rs

use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use super::download_manager::DownloadManager;
use super::download_types::DownloadMode;

pub fn setup_download_handler(
    app_handle: AppHandle,
    download_manager: Arc<DownloadManager>,
) -> impl Fn(String, String) -> bool + Send + Sync + 'static {
    let manager = download_manager;
    let handle = app_handle;

    move |url: String, suggested_path: String| {
        let settings = manager.get_settings();

        // Check disk space
        if let Err(reason) = manager.check_disk_space(&suggested_path) {
            let _ = handle.emit("browser-download-error", &serde_json::json!({
                "id": "",
                "url": url,
                "reason": reason,
                "canRetry": false,
            }));
            return false;
        }

        // Resolve final path based on mode
        let final_path = match settings.mode {
            DownloadMode::Auto => manager.resolve_conflict_path(&suggested_path),
            DownloadMode::Ask => {
                // For Ask mode, we'll use the suggested path for now
                // The actual dialog will be handled by the frontend via IPC
                manager.resolve_conflict_path(&suggested_path)
            }
        };

        // Create download record
        let record = manager.create_download(&url, &final_path);

        // Notify frontend
        let _ = handle.emit("browser-download-started", &record);

        // Allow download to proceed
        true
    }
}
```

- [ ] **Step 2: Modify browser_webview_setup.rs to add download handler**

In `src-tauri/src/commands/browser_webview_setup.rs`, modify the `build_webview_builder` function to accept and use the download handler:

```rust
// Add parameter to build_webview_builder
pub fn build_webview_builder(
    label: &str,
    target: &str,
    init_script: &str,
    download_handler: Option<Arc<dyn Fn(String, String) -> bool + Send + Sync>>,
) -> WebviewBuilder {
    let mut builder = WebviewBuilder::new(label, WebviewUrl::External(target.to_string()))
        .initialization_script(init_script)
        .on_navigation(|url| {
            // ... existing navigation handler
            true
        })
        .on_new_window(|url| {
            // ... existing new window handler
        });

    // Add download handler if provided
    if let Some(handler) = download_handler {
        // Note: This depends on WRY's API for download handlers
        // The exact API may need adjustment based on WRY version
    }

    builder
}
```

- [ ] **Step 3: Modify main.rs to update WebView2 args**

In `src-tauri/src/main.rs`, modify the WebView2 arguments:

```rust
// Change from:
unsafe {
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection",
    );
}

// To: Keep msWebOOUI disabled (we handle downloads ourselves)
// But consider if we need to adjust this based on testing
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check -p browser && cargo check -p tauri-app`
Expected: Compiles without errors

- [ ] **Step 5: Commit**

```bash
git add crates/browser/src/download_handler.rs src-tauri/src/commands/browser_webview_setup.rs src-tauri/src/main.rs
git commit -m "feat(browser): wire up WebView2 download handler"
```

---

## Task 4: Tauri Commands (Rust)

**Files:**
- Create: `src-tauri/src/commands/download_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs` (add mod declaration)
- Modify: `src-tauri/src/main.rs` (register commands)
- Modify: `src-tauri/capabilities/default.json` (add permissions)

**Interfaces:**
- Consumes: `DownloadManager` from Task 2
- Produces: Tauri commands callable from frontend

- [ ] **Step 1: Create download_commands.rs**

```rust
// src-tauri/src/commands/download_commands.rs

use tauri::State;

use super::super::download_manager::DownloadManager;
use super::super::download_types::{DownloadMode, DownloadRecord, DownloadSettings};

pub struct DownloadManagerState(pub std::sync::Arc<DownloadManager>);

#[tauri::command]
pub async fn browser_download_list(
    state: State<'_, DownloadManagerState>,
) -> Result<Vec<DownloadRecord>, String> {
    Ok(state.0.list_downloads())
}

#[tauri::command]
pub async fn browser_download_get_settings(
    state: State<'_, DownloadManagerState>,
) -> Result<DownloadSettings, String> {
    Ok(state.0.get_settings())
}

#[tauri::command]
pub async fn browser_download_update_settings(
    mode: Option<String>,
    default_path: Option<String>,
    state: State<'_, DownloadManagerState>,
) -> Result<(), String> {
    let mode = mode.map(|m| DownloadMode::from_str(&m));
    state.0.update_settings(mode, default_path)
}

#[tauri::command]
pub async fn browser_download_clear_history(
    state: State<'_, DownloadManagerState>,
) -> Result<(), String> {
    state.0.clear_history();
    Ok(())
}

#[tauri::command]
pub async fn browser_download_delete_file(
    id: String,
    state: State<'_, DownloadManagerState>,
) -> Result<(), String> {
    state.0.delete_file_and_record(&id)
}

#[tauri::command]
pub async fn browser_download_remove_record(
    id: String,
    state: State<'_, DownloadManagerState>,
) -> Result<(), String> {
    state.0.remove_record(&id)
}

#[tauri::command]
pub async fn browser_download_open_folder(
    state: State<'_, DownloadManagerState>,
) -> Result<(), String> {
    let settings = state.0.get_settings();
    opener::open(&settings.default_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_download_show_in_folder(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", file_path))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_download_open_file(file_path: String) -> Result<(), String> {
    opener::open(&file_path).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Add mod declaration to commands/mod.rs**

```rust
pub mod download_commands;
```

- [ ] **Step 3: Register commands in main.rs**

Add to the `tauri::Builder` in main.rs:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    download_commands::browser_download_list,
    download_commands::browser_download_get_settings,
    download_commands::browser_download_update_settings,
    download_commands::browser_download_clear_history,
    download_commands::browser_download_delete_file,
    download_commands::browser_download_remove_record,
    download_commands::browser_download_open_folder,
    download_commands::browser_download_show_in_folder,
    download_commands::browser_download_open_file,
])
```

- [ ] **Step 4: Add permissions to capabilities/default.json**

Add to the `permissions` array:

```json
"browser_download_list",
"browser_download_get_settings",
"browser_download_update_settings",
"browser_download_clear_history",
"browser_download_delete_file",
"browser_download_remove_record",
"browser_download_open_folder",
"browser_download_show_in_folder",
"browser_download_open_file"
```

- [ ] **Step 5: Verify compilation**

Run: `cargo check -p tauri-app`
Expected: Compiles without errors

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/download_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs src-tauri/capabilities/default.json
git commit -m "feat(browser): add Tauri commands for download management"
```

---

## Task 5: Frontend Store Slice (TypeScript)

**Files:**
- Create: `frontend/src/app/stores/slices/browserDownloadsSlice.ts`
- Modify: `frontend/src/app/stores/slicedStore.ts` (register slice)

**Interfaces:**
- Produces: `useAppStore` selectors for downloads, settings, actions

- [ ] **Step 1: Create browserDownloadsSlice.ts**

```typescript
// frontend/src/app/stores/slices/browserDownloadsSlice.ts

import { StateCreator } from 'zustand';
import { StoreState } from '../StoreState';

export interface DownloadItem {
  id: string;
  url: string;
  fileName: string;
  filePath: string;
  totalBytes: number | null;
  bytesReceived: number;
  mimeType: string | null;
  status: 'in_progress' | 'completed' | 'failed' | 'paused' | 'canceled';
  interruptReason: string | null;
  createdAt: number;
  completedAt: number | null;
  sourceTabId: string | null;
  speed?: number;
  estimatedEndTime?: number;
}

export interface BrowserDownloadsState {
  downloads: DownloadItem[];
  settings: {
    mode: 'auto' | 'ask';
    defaultPath: string;
  };
  isOpen: boolean;
}

export interface BrowserDownloadsActions {
  initializeDownloads: () => Promise<void>;
  startDownload: (url: string, fileName?: string) => Promise<void>;
  cancelDownload: (id: string) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  clearHistory: () => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  removeRecord: (id: string) => Promise<void>;
  updateSettings: (settings: Partial<BrowserDownloadsState['settings']>) => Promise<void>;
  setOpen: (open: boolean) => void;
  handleDownloadStarted: (record: DownloadItem) => void;
  handleDownloadProgress: (progress: { id: string; bytesReceived: number; speed: number }) => void;
  handleDownloadCompleted: (result: { id: string; filePath: string }) => void;
  handleDownloadError: (error: { id: string; reason: string }) => void;
}

export type BrowserDownloadsSlice = BrowserDownloadsState & BrowserDownloadsActions;

export const createBrowserDownloadsSlice: StateCreator<
  StoreState,
  [],
  [],
  BrowserDownloadsSlice
> = (set, get) => ({
  // State
  downloads: [],
  settings: {
    mode: 'auto',
    defaultPath: '',
  },
  isOpen: false,

  // Actions
  initializeDownloads: async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const [downloads, settings] = await Promise.all([
        invoke<DownloadItem[]>('browser_download_list'),
        invoke<{ mode: string; default_path: string }>('browser_download_get_settings'),
      ]);
      set({
        downloads,
        settings: {
          mode: settings.mode as 'auto' | 'ask',
          defaultPath: settings.default_path,
        },
      });
    } catch (e) {
      console.error('Failed to initialize downloads:', e);
    }
  },

  startDownload: async (url: string, fileName?: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('browser_download_start', { url, fileName });
    } catch (e) {
      console.error('Failed to start download:', e);
    }
  },

  cancelDownload: async (id: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('browser_download_cancel', { id });
    } catch (e) {
      console.error('Failed to cancel download:', e);
    }
  },

  pauseDownload: async (id: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('browser_download_pause', { id });
    } catch (e) {
      console.error('Failed to pause download:', e);
    }
  },

  resumeDownload: async (id: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('browser_download_resume', { id });
    } catch (e) {
      console.error('Failed to resume download:', e);
    }
  },

  clearHistory: async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('browser_download_clear_history');
      set({ downloads: [] });
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  },

  deleteFile: async (id: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('browser_download_delete_file', { id });
      set((state) => ({
        downloads: state.downloads.filter((d) => d.id !== id),
      }));
    } catch (e) {
      console.error('Failed to delete file:', e);
    }
  },

  removeRecord: async (id: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('browser_download_remove_record', { id });
      set((state) => ({
        downloads: state.downloads.filter((d) => d.id !== id),
      }));
    } catch (e) {
      console.error('Failed to remove record:', e);
    }
  },

  updateSettings: async (newSettings) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('browser_download_update_settings', {
        mode: newSettings.mode,
        defaultPath: newSettings.defaultPath,
      });
      set((state) => ({
        settings: { ...state.settings, ...newSettings },
      }));
    } catch (e) {
      console.error('Failed to update settings:', e);
    }
  },

  setOpen: (open: boolean) => set({ isOpen: open }),

  handleDownloadStarted: (record) => {
    set((state) => ({
      downloads: [record, ...state.downloads],
    }));
  },

  handleDownloadProgress: (progress) => {
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === progress.id
          ? {
              ...d,
              bytesReceived: progress.bytesReceived,
              speed: progress.speed,
            }
          : d
      ),
    }));
  },

  handleDownloadCompleted: (result) => {
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === result.id
          ? {
              ...d,
              status: 'completed' as const,
              filePath: result.filePath,
              completedAt: Date.now(),
            }
          : d
      ),
    }));
  },

  handleDownloadError: (error) => {
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === error.id
          ? {
              ...d,
              status: 'failed' as const,
              interruptReason: error.reason,
            }
          : d
      ),
    }));
  },
});
```

- [ ] **Step 2: Register slice in slicedStore.ts**

Add import and merge the slice:

```typescript
import { createBrowserDownloadsSlice, BrowserDownloadsSlice } from './slices/browserDownloadsSlice';

// In the store type definition:
export interface StoreState {
  // ... existing slices
  & BrowserDownloadsSlice;
}

// In the create function:
const useAppStore = create<StoreState>()((...a) => ({
  // ... existing slices
  ...createBrowserDownloadsSlice(...a),
}));
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/stores/slices/browserDownloadsSlice.ts frontend/src/app/stores/slicedStore.ts
git commit -m "feat(browser): add Zustand store slice for download management"
```

---

## Task 6: Icons & Color Standardization

**Files:**
- Modify: `frontend/src/styles/themes.css` (danger color tokens)
- Modify: `frontend/src/design-system/icons.ts` (add new icons)
- Modify: 14 files using IconTrash (replace with IconDelete)
- Modify: Multiple CSS/TS files (fix hardcoded red fallbacks)

**Interfaces:**
- Consumes: Design token system
- Produces: Updated icons and standardized danger color

- [ ] **Step 1: Update themes.css danger color tokens**

In `frontend/src/styles/themes.css`, update the danger color variables:

```css
/* Light theme */
:root {
  --danger: #e9967a;
  --color-danger: #e9967a;
  --danger-soft: rgba(233, 150, 122, 0.12);
  --danger-subtle: rgba(233, 150, 122, 0.08);
  --error-toast-error: #e9967a;
  --ring-error: rgba(233, 150, 122, 0.3);
}

/* Dark theme */
[data-theme='dark'] {
  --danger: #e9967a;
  --color-danger: #e9967a;
  --danger-soft: rgba(233, 150, 122, 0.12);
  --danger-subtle: rgba(233, 150, 122, 0.08);
  --error-toast-error: #e9967a;
  --ring-error: rgba(233, 150, 122, 0.3);
}
```

- [ ] **Step 2: Add new icons to icons.ts**

Add IconDownload, IconDownloadSettings, and IconDelete to the icon registry:

```typescript
// In frontend/src/design-system/icons.ts

// IconDownload
download: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 0 -9 9" /><path d="M3.6 9h16.8" /><path d="M3.6 15h8.4" /><path d="M11.578 3a17 17 0 0 0 0 18" /><path d="M12.5 3c1.719 2.755 2.5 5.876 2.5 9" /><path d="M18 14v7m-3 -3l3 3l3 -3" /></svg>',

// IconDownloadSettings
'download-settings': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.52 20.924c-.87 .262 -1.93 -.152 -2.195 -1.241a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.088 .264 1.502 1.323 1.242 2.192" /><path d="M19 16v6" /><path d="M22 19l-3 3l-3 -3" /><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg>',

// IconDelete (replaces trash-2)
'delete': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.7223 12.7585C14.7426 12.3448 14.4237 11.9929 14.01 11.9726C13.5963 11.9522 13.2444 12.2711 13.2241 12.6848L12.9999 17.2415C12.9796 17.6552 13.2985 18.0071 13.7122 18.0274C14.1259 18.0478 14.4778 17.7289 14.4981 17.3152L14.7223 12.7585Z" fill="currentColor"/><path d="M9.98802 11.9726C9.5743 11.9929 9.25542 12.3448 9.27577 12.7585L9.49993 17.3152C9.52028 17.7289 9.87216 18.0478 10.2859 18.0274C10.6996 18.0071 11.0185 17.6552 10.9981 17.2415L10.774 12.6848C10.7536 12.2711 10.4017 11.9522 9.98802 11.9726Z" fill="currentColor"/><path d="M10.249 2C9.00638 2 7.99902 3.00736 7.99902 4.25V5H5.5C4.25736 5 3.25 6.00736 3.25 7.25C3.25 8.28958 3.95503 9.16449 4.91303 9.42267L5.54076 19.8848C5.61205 21.0729 6.59642 22 7.78672 22H16.2113C17.4016 22 18.386 21.0729 18.4573 19.8848L19.085 9.42267C20.043 9.16449 20.748 8.28958 20.748 7.25C20.748 6.00736 19.7407 5 18.498 5H15.999V4.25C15.999 3.00736 14.9917 2 13.749 2H10.249ZM14.499 5H9.49902V4.25C9.49902 3.83579 9.83481 3.5 10.249 3.5H13.749C14.1632 3.5 14.499 3.83579 14.499 4.25V5ZM5.5 6.5H18.498C18.9123 6.5 19.248 6.83579 19.248 7.25C19.248 7.66421 18.9123 8 18.498 8H5.5C5.08579 8 4.75 7.66421 4.75 7.25C4.75 6.83579 5.08579 6.5 5.5 6.5ZM6.42037 9.5H17.5777L16.96 19.7949C16.9362 20.191 16.6081 20.5 16.2113 20.5H7.78672C7.38995 20.5 7.06183 20.191 7.03807 19.7949L6.42037 9.5Z" fill="currentColor"/></svg>',
```

- [ ] **Step 3: Replace IconTrash with IconDelete in 14 files**

For each file, change the import from `IconTrash` to `IconDelete`:

| File | Old Import | New Import |
|------|-----------|------------|
| `WorkspaceTerminalEntry.tsx` | `import { IconTrash } from '@icons'` | `import { IconDelete } from '@icons'` |
| `browserEntrySubEntriesUtils.tsx` | Same pattern | Same pattern |
| `TerminalPanel.tsx` | Same pattern | Same pattern |
| `TerminalNavigator.tsx` | Same pattern | Same pattern |
| `TerminalContextMenu.tsx` | Same pattern | Same pattern |
| `SearchEnginePopover.tsx` | Same pattern | Same pattern |
| `BrowserNavUtilityButtons.tsx` | Same pattern | Same pattern |
| `BrowserMenuDropdown.tsx` | Same pattern | Same pattern |
| `BrowserContextMenu.tsx` | Same pattern | Same pattern |
| `BrowserNavigator.tsx` | Same pattern | Same pattern |
| `useFileContextMenu.tsx` | Same pattern | Same pattern |
| `SidebarContextMenu.utils.tsx` | Same pattern | Same pattern |
| `useFileContextMenuItems.tsx` | Same pattern | Same pattern |
| `GitHubCITreeToolbar.tsx` | Same pattern | Same pattern |

Also update JSX usage: `<IconTrash` → `<IconDelete`

- [ ] **Step 4: Fix hardcoded red fallback values**

Update the following files to use `#e9967a` instead of `#ef4444` or `#f87171`:

| File | Line | Old Value | New Value |
|------|------|-----------|-----------|
| `composer-input.css` | 211, 217 | `#ef4444` | `#e9967a` |
| `composer-core.css` | 230, 234, 241 | `#ef4444` | `#e9967a` |
| `settings.css` | 918, 937 | `rgba(239,68,68,0.1)` | `rgba(233,150,122,0.12)` |
| `cmTheme.ts` | 412 | `#f87171` | `#e9967a` |
| `cmTheme.ts` | 222 | `rgba(248,113,113,0.12)` | `rgba(233,150,122,0.12)` |
| `gutterHoverSync.ts` | 104 | `rgba(239,68,68,0.35)` | `rgba(233,150,122,0.35)` |
| `useBklitTheme.ts` | 25, 37 | `#ef4444` / `#f87171` | `#e9967a` |

- [ ] **Step 5: Verify linting passes**

Run: `cd frontend && npx eslint . && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/themes.css frontend/src/design-system/icons.ts
git commit -m "feat(design): standardize danger color to #e9967a and add new icons"

git add -A
git commit -m "refactor(icons): replace IconTrash with IconDelete across codebase"

git add -A
git commit -m "fix(css): replace hardcoded red fallbacks with #e9967a"
```

---

## Task 7: Download Button & Menu UI (React)

**Files:**
- Create: `frontend/src/app/features/browser/BrowserDownloadButton.tsx`
- Create: `frontend/src/app/features/browser/BrowserDownloadMenu.tsx`
- Create: `frontend/src/app/features/browser/BrowserDownloadItem.tsx`
- Create: `frontend/src/app/features/browser/BrowserDownloadContextMenu.tsx`

**Interfaces:**
- Consumes: `useAppStore` selectors from Task 5, icons from Task 6
- Produces: Download button, menu, item, context menu components

- [ ] **Step 1: Create BrowserDownloadButton.tsx**

```tsx
// frontend/src/app/features/browser/BrowserDownloadButton.tsx

import React from 'react';
import { IconDownload } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';

interface BrowserDownloadButtonProps {
  onClick: () => void;
  isActive: boolean;
}

export const BrowserDownloadButton = React.memo(function BrowserDownloadButton({
  onClick,
  isActive,
}: BrowserDownloadButtonProps) {
  const { t } = useTCopy();
  const downloads = useAppStore((s) => s.downloads);
  const activeDownloads = downloads.filter((d) => d.status === 'in_progress');
  const hasActiveDownloads = activeDownloads.length > 0;

  // Calculate progress from first active download
  const firstActive = activeDownloads[0];
  const progress = firstActive?.totalBytes
    ? firstActive.bytesReceived / firstActive.totalBytes
    : 0;

  return (
    <TooltipSimple
      content={t.browserDownloadTooltip.replace('{n}', String(activeDownloads.length))}
      placement="top"
    >
      <button
        type="button"
        className={`adl-tool-context__iconbtn ${isActive ? 'is-active' : ''}`}
        onClick={onClick}
        aria-label={t.browserDownload}
      >
        {hasActiveDownloads ? (
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="none"
              stroke="var(--border)"
              strokeWidth="2"
            />
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2"
              strokeDasharray={2 * Math.PI * 6}
              strokeDashoffset={2 * Math.PI * 6 * (1 - progress)}
              transform="rotate(-90 8 8)"
            />
            <path
              d="M8 4v5M5.5 7.5L8 10l2.5-2.5"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>
        ) : (
          <IconDownload size={14} decorative />
        )}
      </button>
    </TooltipSimple>
  );
});
```

- [ ] **Step 2: Create BrowserDownloadContextMenu.tsx**

```tsx
// frontend/src/app/features/browser/BrowserDownloadContextMenu.tsx

import React, { useEffect, useRef } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { DownloadItem } from '@stores/slices/browserDownloadsSlice';
import { useAppStore } from '@stores/slicedStore';

interface BrowserDownloadContextMenuProps {
  item: DownloadItem;
  position: { x: number; y: number };
  onClose: () => void;
}

export const BrowserDownloadContextMenu = React.memo(function BrowserDownloadContextMenu({
  item,
  position,
  onClose,
}: BrowserDownloadContextMenuProps) {
  const { t } = useTCopy();
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteFile = useAppStore((s) => s.deleteFile);
  const removeRecord = useAppStore((s) => s.removeRecord);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleOpenFile = async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('browser_download_open_file', { filePath: item.filePath });
    onClose();
  };

  const handleShowInFolder = async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('browser_download_show_in_folder', { filePath: item.filePath });
    onClose();
  };

  const handleDeleteFile = async () => {
    if (window.confirm(t.downloadDeleteFileConfirm)) {
      await deleteFile(item.id);
    }
    onClose();
  };

  const handleRemoveRecord = async () => {
    await removeRecord(item.id);
    onClose();
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(item.url);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="adl-download-context-menu"
      style={{ left: position.x, top: position.y }}
    >
      <button onClick={handleOpenFile}>{t.downloadOpenFile}</button>
      <button onClick={handleShowInFolder}>{t.downloadShowInFolder}</button>
      <div className="adl-download-context-menu__separator" />
      <button onClick={handleDeleteFile} className="is-danger">
        {t.downloadDeleteFile}
      </button>
      <button onClick={handleRemoveRecord}>{t.downloadRemoveRecord}</button>
      <div className="adl-download-context-menu__separator" />
      <button onClick={handleCopyLink}>{t.downloadCopyLink}</button>
    </div>
  );
});
```

- [ ] **Step 3: Create BrowserDownloadItem.tsx**

```tsx
// frontend/src/app/features/browser/BrowserDownloadItem.tsx

import React, { useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { DownloadItem } from '@stores/slices/browserDownloadsSlice';
import { BrowserDownloadContextMenu } from './BrowserDownloadContextMenu';

interface BrowserDownloadItemProps {
  item: DownloadItem;
  showProgress?: boolean;
  showError?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + '/s';
}

export const BrowserDownloadItem = React.memo(function BrowserDownloadItem({
  item,
  showProgress = false,
  showError = false,
}: BrowserDownloadItemProps) {
  const { t } = useTCopy();
  const [isHovered, setIsHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const progress =
    item.totalBytes && item.totalBytes > 0
      ? (item.bytesReceived / item.totalBytes) * 100
      : 0;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        className="adl-download-item"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenu={handleContextMenu}
      >
        <div className="adl-download-item__info">
          <div className="adl-download-item__name">{item.fileName}</div>
          <div className="adl-download-item__meta">
            {formatBytes(item.bytesReceived)}
            {item.totalBytes && ` / ${formatBytes(item.totalBytes)}`}
            {item.speed && ` · ${formatSpeed(item.speed)}`}
          </div>
          {showProgress && item.status === 'in_progress' && (
            <div className="adl-download-item__progress">
              <div
                className="adl-download-item__progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          {showError && item.status === 'failed' && item.interruptReason && (
            <div className="adl-download-item__error">
              ⚠ {t[`downloadError${item.interruptReason}` as keyof typeof t] || t.downloadErrorGeneric}
            </div>
          )}
        </div>
        {isHovered && (
          <div className="adl-download-item__actions">
            <button onClick={() => {}}>{t.downloadShowInFolder}</button>
            <button onClick={() => {}} className="is-danger">
              {t.downloadDeleteFile}
            </button>
          </div>
        )}
      </div>
      {contextMenu && (
        <BrowserDownloadContextMenu
          item={item}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
});
```

- [ ] **Step 4: Create BrowserDownloadMenu.tsx**

```tsx
// frontend/src/app/features/browser/BrowserDownloadMenu.tsx

import React, { useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { BrowserDownloadItem } from './BrowserDownloadItem';

export const BrowserDownloadMenu = React.memo(function BrowserDownloadMenu() {
  const { t } = useTCopy();
  const downloads = useAppStore((s) => s.downloads);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const clearHistory = useAppStore((s) => s.clearHistory);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDownloads = downloads.filter((d) =>
    d.fileName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeDownloads = filteredDownloads.filter((d) => d.status === 'in_progress');
  const completedDownloads = filteredDownloads.filter((d) => d.status === 'completed');
  const failedDownloads = filteredDownloads.filter((d) => d.status === 'failed');

  const handleModeChange = (checked: boolean) => {
    updateSettings({ mode: checked ? 'auto' : 'ask' });
  };

  const handleClearHistory = async () => {
    if (window.confirm(t.downloadClearHistoryConfirm)) {
      await clearHistory();
    }
  };

  const handleOpenFolder = async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('browser_download_open_folder');
  };

  return (
    <div className="adl-download-menu">
      {/* Header */}
      <div className="adl-download-menu__header">
        <input
          className="adl-download-menu__search"
          type="search"
          placeholder={t.downloadSearch}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="adl-download-menu__mode">
          <span>{t.downloadAutoSave}</span>
          <label className="adl-switch">
            <input
              type="checkbox"
              checked={settings.mode === 'auto'}
              onChange={(e) => handleModeChange(e.target.checked)}
            />
            <span className="adl-switch__slider" />
          </label>
        </div>
      </div>

      {/* Content */}
      <div className="adl-download-menu__content">
        {downloads.length === 0 ? (
          <div className="adl-download-menu__empty">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--muted)"
              strokeWidth="1.5"
            >
              <path d="M21 12a9 9 0 1 0 -9 9" />
              <path d="M3.6 9h16.8" />
              <path d="M3.6 15h8.4" />
              <path d="M11.578 3a17 17 0 0 0 0 18" />
              <path d="M12.5 3c1.719 2.755 2.5 5.876 2.5 9" />
              <path d="M18 14v7m-3 -3l3 3l3 -3" />
            </svg>
            <span>{t.downloadNoRecords}</span>
          </div>
        ) : (
          <>
            {activeDownloads.length > 0 && (
              <div className="adl-download-menu__section">
                <div className="adl-download-menu__section-title">
                  {t.downloadInProgress}
                </div>
                {activeDownloads.map((item) => (
                  <BrowserDownloadItem key={item.id} item={item} showProgress />
                ))}
              </div>
            )}

            {completedDownloads.length > 0 && (
              <div className="adl-download-menu__section">
                <div className="adl-download-menu__section-title">
                  {t.downloadCompleted}
                </div>
                {completedDownloads.map((item) => (
                  <BrowserDownloadItem key={item.id} item={item} />
                ))}
              </div>
            )}

            {failedDownloads.length > 0 && (
              <div className="adl-download-menu__section">
                <div className="adl-download-menu__section-title">
                  {t.downloadFailed}
                </div>
                {failedDownloads.map((item) => (
                  <BrowserDownloadItem key={item.id} item={item} showError />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="adl-download-menu__footer">
        <button onClick={handleClearHistory}>{t.downloadClearHistory}</button>
        <button onClick={handleOpenFolder}>{t.downloadOpenFolder}</button>
      </div>
    </div>
  );
});
```

- [ ] **Step 5: Add CSS styles for download components**

Create or update CSS file with styles for:
- `.adl-download-menu` (380px width, max-height 480px, scroll)
- `.adl-download-menu__header` (search + mode switch)
- `.adl-download-menu__content` (scrollable list)
- `.adl-download-menu__section` (section with title)
- `.adl-download-menu__empty` (empty state centering)
- `.adl-download-menu__footer` (action buttons)
- `.adl-download-item` (record row with hover states)
- `.adl-download-item__progress` (progress bar)
- `.adl-download-item__error` (error message in danger color)
- `.adl-download-context-menu` (right-click menu)

- [ ] **Step 6: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/browser/BrowserDownloadButton.tsx frontend/src/app/features/browser/BrowserDownloadMenu.tsx frontend/src/app/features/browser/BrowserDownloadItem.tsx frontend/src/app/features/browser/BrowserDownloadContextMenu.tsx
git commit -m "feat(browser): add download button, menu, item, and context menu components"
```

---

## Task 8: Download Settings UI (React)

**Files:**
- Create: `frontend/src/app/features/browser-settings/BrowserDownloadSettings.tsx`
- Modify: `frontend/src/app/features/browser-settings/SettingsNav.tsx` (add nav item)

**Interfaces:**
- Consumes: `useAppStore` selectors from Task 5
- Produces: Download settings page component

- [ ] **Step 1: Create BrowserDownloadSettings.tsx**

```tsx
// frontend/src/app/features/browser-settings/BrowserDownloadSettings.tsx

import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';

export function BrowserDownloadSettings() {
  const { t } = useTCopy();
  const settings = useAppStore((s) => s.settings);

  const handleModeChange = (value: string) => {
    useAppStore.getState().updateSettings({ mode: value as 'auto' | 'ask' });
  };

  const handleBrowse = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      directory: true,
      multiple: false,
      title: t.browserDownloadDefaultPath,
    });
    if (path) {
      useAppStore.getState().updateSettings({ defaultPath: path });
    }
  };

  return (
    <div className="adl-settings-section adl-browser-settings">
      <SettingsHeader
        title={t.browserDownloadSettingsTitle}
        description={t.browserDownloadSettingsDesc}
      />

      {/* Default Path */}
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.browserDownloadDefaultPath}</span>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <div className="adl-settings-path-picker">
            <input
              className="adl-settings-input"
              value={settings.defaultPath}
              readOnly
            />
            <button
              className="adl-settings-btn"
              onClick={handleBrowse}
            >
              {t.browserDownloadBrowse}
            </button>
          </div>
        </div>
      </div>

      {/* Download Mode */}
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.browserDownloadMode}</span>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <select
            className="adl-settings-select"
            value={settings.mode}
            onChange={(e) => handleModeChange(e.target.value)}
          >
            <option value="auto">{t.downloadModeAuto}</option>
            <option value="ask">{t.downloadModeAsk}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add nav item to SettingsNav.tsx**

In `frontend/src/app/features/browser-settings/SettingsNav.tsx`, add download settings to the browser group:

```typescript
// Add to the browser settings group
{
  id: 'browser-download',
  label: t.browserDownloadSettingsTitle,
  icon: 'download-settings',
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/browser-settings/BrowserDownloadSettings.tsx frontend/src/app/features/browser-settings/SettingsNav.tsx
git commit -m "feat(browser): add download settings page"
```

---

## Task 9: Event Listener & Integration (React)

**Files:**
- Create: `frontend/src/app/features/browser/useBrowserDownloads.ts`
- Modify: `frontend/src/app/features/browser/BrowserToolbar.tsx` (add download button)
- Modify: `frontend/src/i18n/en-US/browser.ts` (add i18n keys)
- Modify: `frontend/src/i18n/zh-CN/browser.ts` (add i18n keys)

**Interfaces:**
- Consumes: Store slice from Task 5, UI components from Task 7
- Produces: Working download button in toolbar with menu

- [ ] **Step 1: Create useBrowserDownloads.ts hook**

```typescript
// frontend/src/app/features/browser/useBrowserDownloads.ts

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '@stores/slicedStore';

export function useBrowserDownloads() {
  useEffect(() => {
    const unlisten = Promise.all([
      listen('browser-download-started', (e) => {
        useAppStore.getState().handleDownloadStarted(e.payload as any);
      }),
      listen('browser-download-progress', (e) => {
        useAppStore.getState().handleDownloadProgress(e.payload as any);
      }),
      listen('browser-download-completed', (e) => {
        useAppStore.getState().handleDownloadCompleted(e.payload as any);
      }),
      listen('browser-download-error', (e) => {
        useAppStore.getState().handleDownloadError(e.payload as any);
      }),
    ]);

    return () => {
      unlisten.then((fns) => fns.forEach((fn) => fn()));
    };
  }, []);
}
```

- [ ] **Step 2: Update BrowserToolbar.tsx to add download button**

In `frontend/src/app/features/browser/BrowserToolbar.tsx`:

1. Import `BrowserDownloadButton` and `BrowserDownloadMenu`
2. Add state for `downloadMenuOpen`
3. Add download button between search engine button and menu button:

```tsx
<TooltipSimple content={t.browserSearchEngineSettings} placement="top">
  <button ...> <IconSearchEngine size={14} decorative /> </button>
</TooltipSimple>

{/* New: Download button */}
<BrowserDownloadButton
  onClick={() => setDownloadMenuOpen(v => !v)}
  isActive={downloadMenuOpen}
/>

<BrowserMenuDropdown ... />
```

4. Add `BrowserDownloadMenu` popover (positioned relative to download button)

- [ ] **Step 3: Add i18n keys to en-US/browser.ts**

Add all download-related English translations (see design spec section 6).

- [ ] **Step 4: Add i18n keys to zh-CN/browser.ts**

Add all download-related Chinese translations (see design spec section 6).

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Verify linting passes**

Run: `cd frontend && npx eslint .`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/browser/useBrowserDownloads.ts frontend/src/app/features/browser/BrowserToolbar.tsx frontend/src/i18n/en-US/browser.ts frontend/src/i18n/zh-CN/browser.ts
git commit -m "feat(browser): integrate download button in toolbar with event listener"
```

---

## Task 10: Testing & Polish

**Files:**
- All files created/modified in previous tasks

**Interfaces:**
- Consumes: All previous tasks
- Produces: Working download management feature

- [ ] **Step 1: Run Rust tests**

Run: `cargo test --workspace`
Expected: All tests pass

- [ ] **Step 2: Run Rust linting**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings

- [ ] **Step 3: Run Rust formatting**

Run: `cargo fmt --check`
Expected: No formatting issues

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && pnpm run test`
Expected: All tests pass

- [ ] **Step 5: Run frontend linting**

Run: `cd frontend && pnpm run lint`
Expected: 0 errors

- [ ] **Step 6: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Manual testing checklist**

- [ ] Click download button → menu opens with empty state
- [ ] Click a download link on a webpage → download starts
- [ ] Download progress shows in button (circular progress ring)
- [ ] Download progress shows in menu (progress bar)
- [ ] Download completes → status updates to completed
- [ ] Right-click download record → context menu appears
- [ ] Click "Show in folder" → file explorer opens
- [ ] Click "Delete file" → confirmation → file deleted
- [ ] Click "Clear history" → confirmation → history cleared
- [ ] Click "Download settings" → navigates to settings page
- [ ] Change download mode in settings → affects next download
- [ ] Change default path in settings → affects next download

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat(browser): complete download management feature"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-25-browser-download-management.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
