//! 应用自身更新：检查 / 下载 / 安装三段式（见 ADR-0026、ADR-0027）。
//!
//! 职责边界：本模块只负责「按来源顺序检查、择优、把进度转给前端、把下载结果留在
//! 内存里等用户点安装」。清单解析、签名校验、运行安装器都交给官方
//! `tauri-plugin-updater`；版本号比较与说明裁剪在 `adl-update` crate。
//!
//! 下载结果**不落盘**：这是有意的（ADR-0027）。用户不安装就退出应用，临时包随之
//! 消失，界面回到「可下载」状态，避免长期挂着一个「半个更新」。

use std::sync::Mutex;
use std::time::Duration;

use adl_errors::AppError;
use adl_types::IpcResult;
use adl_update::{UPDATE_SOURCES, summarize_notes};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterBuilder, UpdaterExt};
use url::Url;

use crate::commands::ipc;
use crate::state::AppState;

/// 下载进度事件：`{ downloaded: number, total: number | null }`。
/// 前端按此更新卡片进度条；下载完成后由命令返回值收尾，不依赖该事件。
pub const PROGRESS_EVENT: &str = "digital-life://app-update-progress";
/// 安装开始事件：Windows 上随后应用会退出，前端没有机会再更新界面。
pub const INSTALLING_EVENT: &str = "digital-life://app-update-installing";

/// 单源检查超时。10 秒足够拿到几 KB 清单；再长会让「启动后静默检查」拖住网络。
const CHECK_TIMEOUT: Duration = Duration::from_secs(10);
/// 卡片里展示的更新说明上限（字符）。卡片本身用两行截断 + 展开滚动来消化长文案，
/// 这里只做兜底，防止异常清单把几十 KB 的正文塞进 IPC。
const NOTES_MAX_CHARS: usize = 4000;
/// 进度事件的最小间隔字节数：避免每个网络分片都发一次 IPC（50MB 安装包约 3000 次）。
const PROGRESS_EMIT_STEP: u64 = 512 * 1024;

/// 已下载、等待用户点「安装」的更新。**只在内存里**，重启即失效。
struct DownloadedUpdate {
    update: Update,
    bytes: Vec<u8>,
}

/// 由 `main.rs` 注册的托管状态。
#[derive(Default)]
pub struct UpdateState {
    downloaded: Mutex<Option<DownloadedUpdate>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    /// 当前安装版本（来自 `package_info`，与「关于」页同源）。
    pub current_version: String,
    pub available: bool,
    pub version: Option<String>,
    /// 已裁剪为纯文本首段（卡片不渲染 Markdown）。
    pub notes: Option<String>,
    /// RFC 3339 发布时间；清单缺失时为 `None`。
    pub published_at: Option<String>,
    /// 命中的更新源 URL；`available` 为 false 时为 `None`。
    pub source: Option<String>,
    /// 仅当**所有**来源都失败时给出，用于手动检查的失败提示；自动检查忽略它。
    pub error: Option<String>,
}

struct Resolved {
    source: &'static str,
    update: Update,
}

enum ResolveOutcome {
    UpToDate,
    Found(Box<Resolved>),
    Failed(String),
}

/// 检查更新。所有失败都收敛成 `error` 字段，命令本身不失败——前端据此决定
/// 「静默」还是「提示失败并给下载页」。
#[tauri::command]
pub async fn app_update_check(app: AppHandle) -> IpcResult<UpdateCheck> {
    let current_version = app.package_info().version.to_string();
    let outcome = resolve_update(&app).await;
    let check = match outcome {
        ResolveOutcome::Found(resolved) => UpdateCheck {
            current_version,
            available: true,
            version: Some(resolved.update.version.clone()),
            notes: resolved
                .update
                .body
                .as_deref()
                .map(|body| summarize_notes(body, NOTES_MAX_CHARS))
                .filter(|notes| !notes.is_empty()),
            published_at: resolved.update.date.as_ref().map(|date| date.to_string()),
            source: Some(resolved.source.to_string()),
            error: None,
        },
        ResolveOutcome::UpToDate => UpdateCheck {
            current_version,
            available: false,
            version: None,
            notes: None,
            published_at: None,
            source: None,
            error: None,
        },
        ResolveOutcome::Failed(message) => UpdateCheck {
            current_version,
            available: false,
            version: None,
            notes: None,
            published_at: None,
            source: None,
            error: Some(message),
        },
    };
    ipc(Ok(check))
}

/// 下载最新可用的更新到内存。只下载、不安装：安装必须由用户点击驱动。
#[tauri::command]
pub async fn app_update_download(app: AppHandle) -> IpcResult<()> {
    let resolved = match resolve_update(&app).await {
        ResolveOutcome::Found(resolved) => resolved,
        ResolveOutcome::UpToDate => {
            return ipc(Err(AppError::NotFound("no update available".into())));
        },
        ResolveOutcome::Failed(message) => return ipc(Err(AppError::Network(message))),
    };

    let progress_app = app.clone();
    let mut downloaded: u64 = 0;
    let mut emitted: u64 = 0;
    let bytes = resolved
        .update
        .download(
            move |chunk_len: usize, total: Option<u64>| {
                downloaded = downloaded.saturating_add(chunk_len as u64);
                let is_last = total.is_some_and(|total| downloaded >= total);
                if is_last || downloaded.saturating_sub(emitted) >= PROGRESS_EMIT_STEP {
                    emitted = downloaded;
                    let _ = progress_app.emit(
                        PROGRESS_EVENT,
                        serde_json::json!({ "downloaded": downloaded, "total": total }),
                    );
                }
            },
            || {},
        )
        .await;

    match bytes {
        Ok(bytes) => {
            let state = app.state::<UpdateState>();
            match state.downloaded.lock() {
                Ok(mut guard) => {
                    *guard = Some(DownloadedUpdate { update: resolved.update, bytes });
                    ipc(Ok(()))
                },
                Err(_) => ipc(Err(AppError::Internal("update state lock poisoned".into()))),
            }
        },
        Err(error) => ipc(Err(AppError::Network(format!("download failed: {error}")))),
    }
}

/// 安装已下载的更新。Windows 上此调用会在启动安装器后退出当前进程；
/// 安装器的默认行为是安装完成后自动重启应用。
#[tauri::command]
pub fn app_update_install(app: AppHandle) -> IpcResult<()> {
    let state = app.state::<UpdateState>();
    let downloaded = match state.downloaded.lock() {
        Ok(mut guard) => guard.take(),
        Err(_) => return ipc(Err(AppError::Internal("update state lock poisoned".into()))),
    };
    let Some(downloaded) = downloaded else {
        return ipc(Err(AppError::NotFound("no downloaded update".into())));
    };

    // 先隐藏主窗口：下面要结束 sidecar，前端所有请求都会失败，
    // 不隐藏会看到「网络错误」卡片和一个半死的界面。
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    // 再结束 sidecar：安装器要覆盖 adl-server.exe，锁着的文件会让 NSIS 弹
    // 「Error opening file for writing」并把进度卡住（ADR-0027 的已知坑）。
    app.state::<AppState>().ad_server.terminate();
    let _ = app.emit(INSTALLING_EVENT, serde_json::json!({}));
    ipc(downloaded
        .update
        .install(&downloaded.bytes)
        .map_err(|error| AppError::Internal(format!("install failed: {error}"))))
}

/// 依次检查所有来源：任一来源报「有更新」即参与择优，全部报「已是最新」则 UpToDate，
/// 全部报错才算 Failed。
async fn resolve_update(app: &AppHandle) -> ResolveOutcome {
    let mut found: Vec<(usize, Update)> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    for (index, source) in UPDATE_SOURCES.iter().enumerate() {
        match check_one(app, source).await {
            Ok(Some(update)) => found.push((index, update)),
            Ok(None) => {},
            Err(message) => errors.push(format!("{source}: {message}")),
        }
    }

    if found.is_empty() {
        return if errors.is_empty() {
            ResolveOutcome::UpToDate
        } else {
            ResolveOutcome::Failed(errors.join(" | "))
        };
    }

    let mut best: Option<usize> = None;
    for index in 0..found.len() {
        best = match best {
            None => Some(index),
            Some(current)
                if adl_update::is_newer(&found[index].1.version, &found[current].1.version) =>
            {
                Some(index)
            },
            other => other,
        };
    }
    let Some(best) = best else {
        return ResolveOutcome::Failed("update manifest has no parsable version".into());
    };
    let (index, update) = found.swap_remove(best);

    ResolveOutcome::Found(Box::new(Resolved { source: UPDATE_SOURCES[index], update }))
}

async fn check_one(app: &AppHandle, source: &str) -> Result<Option<Update>, String> {
    let url = Url::parse(source).map_err(|error| error.to_string())?;
    let builder = apply_proxy(app, app.updater_builder())
        .endpoints(vec![url])
        .map_err(|error| error.to_string())?;
    builder
        .timeout(CHECK_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())
}

/// 让更新请求沿用应用的代理设置：关闭=直连；自定义=指定代理；自动=交给系统代理
/// （插件默认启用 `system-proxy`，同时读环境变量）。读取失败时保持默认行为，
/// 不让「配置坏了」把更新检查整体打死。
fn apply_proxy(app: &AppHandle, builder: UpdaterBuilder) -> UpdaterBuilder {
    let state = app.state::<AppState>();
    let Ok(config) = adl_download_source::load(&state.storage.paths().root) else {
        return builder;
    };
    match config.proxy.mode {
        adl_download_source::ProxyMode::None => builder.no_proxy(),
        adl_download_source::ProxyMode::Manual => {
            let endpoint =
                config.proxy.https_proxy.as_deref().or(config.proxy.http_proxy.as_deref());
            match endpoint.and_then(|endpoint| Url::parse(endpoint).ok()) {
                Some(url) => builder.proxy(url),
                None => builder.no_proxy(),
            }
        },
        adl_download_source::ProxyMode::Auto => builder,
    }
}
