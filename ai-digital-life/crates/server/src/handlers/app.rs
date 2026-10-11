//! App / preferences domain HTTP handlers — the browser-mode mirror of the shell's
//! `app_get_info` / `app_update_preferences` Tauri commands.
//!
//! Why this domain exists on ad-server: the browser (preview) surface has no Tauri
//! invoke, so `AppBridge.getInfo` / `AppBridge.updatePreferences` previously
//! resolved to `httpBridge` `NOT_SUPPORTED` stubs — which left `appInfo` undefined
//! and made the settings panel render nothing. `config.json` is the single source
//! of truth for these preferences on both surfaces, so the server reads/writes the
//! same file the shell does.
//!
//! Recipe (rust-server-handler-recipe-pattern): `State` extraction → body parse →
//! blocking I/O in `spawn_blocking` → [`crate::ipc::to_response`].

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_kernel::events::AppEvent;
use adl_types::types::config::AppPreferencePatch;
use axum::body::Bytes;
use axum::extract::State;
use axum::response::IntoResponse;
use std::sync::Mutex as StdMutex;

/// 串行化 config.json 的 read-modify-write（同进程并发请求时避免丢更新）。
///
/// 已知限制（Phase 4 F11）：此锁仅进程内有效。桌面 `app_update_preferences`
/// （壳落盘）与浏览器 `/app/preferences`（server 落盘）仍可跨进程并发写同一文件
/// → read-modify-write 交叉 → last-writer-wins 丢字段。触发需双端同时操作，
/// 概率低；`/app/log-settings` 不落盘已消除桌面 UI 路径的竞写。根治需文件锁
/// 或落盘真源收敛到单一进程（架构决策，本次不做）。
static CONFIG_WRITE_LOCK: StdMutex<()> = StdMutex::new(());

/// 落盘失败后的运行期回滚（best-effort，忽略回滚错误，仅告警）。
/// `ctx` 标记触发来源（persist/join），便于日志区分。
fn rollback_runtime(
    log_manager: &adl_logging::LogManager,
    previous: &Option<adl_logging::config::LogConfig>,
    ctx: &str,
) {
    if let Some(previous) = previous {
        let rollback = adl_logging::LogSettingsChange {
            log_level: Some(previous.log_level),
            terminal_log_mode: Some(previous.terminal_log_mode),
            debug_log_mode: Some(previous.debug_log_mode),
        };
        if let Err(e) = log_manager.apply_change(&rollback) {
            tracing::warn!(ctx, error = %e, "persist failed and runtime rollback failed");
        }
    }
}

/// GET `/app/info` — 当前 `AppInfo`（config + 活动工作区）。
pub async fn get_info(State(state): State<ServerState>) -> impl IntoResponse {
    let result = (|| -> Result<serde_json::Value, AppError> {
        let config = state
            .config
            .read()
            .map_err(|_| AppError::Internal("config lock poisoned".into()))?
            .clone();
        let workspace = state
            .current_workspace
            .read()
            .map_err(|_| AppError::Internal("workspace lock poisoned".into()))?
            .clone();
        Ok(serde_json::to_value(adl_kernel::app_info::build(&config, workspace))?)
    })();
    ipc::to_response(result)
}

/// POST `/app/preferences` — 应用偏好补丁：日志字段先运行时生效，再把 config.json
/// 落盘并广播 `ConfigChanged`，最后返回更新后的 `AppInfo` + 被会话覆盖锁定的字段。
///
/// 顺序语义（all-or-nothing 未声明即默认整补丁语义）：日志字段先行校验，失败则
/// 整个补丁被拒绝（含无关字段）；落盘失败时 best-effort 回滚已应用的运行期变更。
pub async fn update_preferences(
    State(state): State<ServerState>,
    body: Bytes,
) -> impl IntoResponse {
    let patch: AppPreferencePatch = match ipc::json_body(body).await {
        Ok(p) => p,
        Err((status, message)) => {
            return (
                status,
                axum::Json(serde_json::json!({
                    "ok": false,
                    "error": { "code": "INVALID_INPUT", "message": message },
                })),
            );
        },
    };

    // 会话覆盖锁定见 `adl_logging::{lock_out_session_overrides,
    // session_locked_field_names}`（双端单一真源，Phase 4 D5）。
    let locked_fields = adl_logging::session_locked_field_names(&patch, &state.log_overrides);
    let change = adl_logging::lock_out_session_overrides(
        &adl_logging::LogSettingsChange::from_patch(&patch),
        &state.log_overrides,
    );
    // 回滚锚点：落盘失败时把运行期恢复到补丁前的值（best-effort，忽略回滚错误）。
    let previous_log_config = state.log_manager.config().ok();
    if let Err(e) = state.log_manager.apply_change(&change) {
        return ipc::to_response(Err(AppError::Internal(format!(
            "failed to apply log settings: {e}"
        ))));
    }

    let config_dir = state.storage.paths().config_dir.clone();
    let config_arc = state.config.clone();
    let spawned = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let _guard = CONFIG_WRITE_LOCK
            .lock()
            .map_err(|_| AppError::Internal("config write lock poisoned".into()))?;
        let mut config = config_arc
            .read()
            .map_err(|_| AppError::Internal("config lock poisoned".into()))?
            .clone();
        config.apply_patch(&patch);
        // 落盘错误直接透传（UI 错误卡可见原始根因）；调用方凭 Err 即回滚，
        // 不再用字符串前缀判别（Phase 4 D6 已消除）。
        adl_kernel::config::save_to(&config_dir, &config)?;
        *config_arc.write().map_err(|_| AppError::Internal("config lock poisoned".into()))? =
            config.clone();
        // workspace 快照与 config 同一次锁内读取：避免与并发的
        // `/workspace/open` 竞争导致响应中的 currentWorkspace 过期（Phase 4 F5）。
        // （current_workspace 另有独立 RwLock；此处读到的值至多略旧，
        // 下次 get_info 自愈，故不引入跨锁排序。）
        let workspace = state.current_workspace.read().ok().and_then(|w| w.clone());
        let info = adl_kernel::app_info::build(&config, workspace);
        let result = adl_types::types::config::UpdatePreferencesResult {
            info,
            session_locked_fields: locked_fields,
        };
        serde_json::to_value(&result).map_err(AppError::from)
    })
    .await;

    let value = match spawned {
        Ok(inner) => inner,
        Err(e) => {
            // Join 失败意味着落盘状态未知而运行期已变 —— 同样回滚运行期
            // （Phase 4 R2；概率极低：需闭包 panic/取消）。
            rollback_runtime(&state.log_manager, &previous_log_config, "join");
            return ipc::to_response(Err(AppError::Internal(format!(
                "spawn_blocking failed: {e}"
            ))));
        },
    };
    // spawn 链上任何失败（落盘/锁/序列化）→ 回滚运行期，避免"运行期新 +
    // 磁盘旧"的三方漂移（Phase 4 F2；"凡非成功值即回滚"，不再用字符串判别）。
    if value.is_err() {
        rollback_runtime(&state.log_manager, &previous_log_config, "persist");
        return ipc::to_response(value.map(|_| serde_json::json!(null)));
    }
    state.event_bus.emit(AppEvent::ConfigChanged);
    ipc::to_response(value)
}

/// POST `/app/log-settings` — **仅运行时**应用日志设置（不触碰 `config.json`）。
///
/// 桌面壳在 UI 改设置后用它把日志字段推给 adl-server 子进程（该进程只在启动时读
/// `config.json`，运行中不跟随）。刻意**不落盘**：`config.json` 的写入真源是调用方
/// （壳），若此处再落盘会用 server 的旧内存快照覆盖调用方刚写的其它字段。
/// 全锁定时返回裸 `null` 成功体（不做可区分体）：壳从同一份 env 继承了同样的
/// overrides，能自行算出锁定集并提示用户，无需 server 回传（Phase 4 F3 结论）。
pub async fn apply_log_settings(
    State(state): State<ServerState>,
    body: Bytes,
) -> impl IntoResponse {
    let patch: AppPreferencePatch = match ipc::json_body(body).await {
        Ok(p) => p,
        Err((status, message)) => {
            return (
                status,
                axum::Json(serde_json::json!({
                    "ok": false,
                    "error": { "code": "INVALID_INPUT", "message": message },
                })),
            );
        },
    };

    let change = adl_logging::lock_out_session_overrides(
        &adl_logging::LogSettingsChange::from_patch(&patch),
        &state.log_overrides,
    );
    // 非日志字段被静默忽略：打一条 warn 避免调用方误以为整补丁生效
    // （Phase 4 F4；不直接 400 —— 壳的最小体 + 未来扩展不应被误伤）。
    if patch.language.is_some()
        || patch.theme_mode.is_some()
        || patch.keybinds.is_some()
        || patch.fonts.is_some()
        || patch.max_concurrent_workspaces.is_some()
        || patch.workspace_priority_ids.is_some()
        || patch.workspace_deferred_ids.is_some()
        || patch.workspace_natural_order.is_some()
        || patch.browser_inactive_tab_suspend_ms.is_some()
    {
        tracing::warn!("/app/log-settings ignores non-log fields (runtime-only endpoint)");
    }
    if change.is_empty() {
        return ipc::to_response(Ok(serde_json::json!(null)));
    }
    if let Err(e) = state.log_manager.apply_change(&change) {
        return ipc::to_response(Err(AppError::Internal(format!(
            "failed to apply log settings: {e}"
        ))));
    }
    ipc::to_response(Ok(serde_json::json!(null)))
}
