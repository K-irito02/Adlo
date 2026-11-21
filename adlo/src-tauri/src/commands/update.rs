//! 应用自身更新：检查 / 下载 / 安装三段式（见 ADR-0026、ADR-0027）。
//!
//! 职责边界：本模块只负责「按来源顺序检查、合并结论、把进度转给前端、把下载结果留在
//! 内存里等用户点安装」。清单解析、签名校验、运行安装器都交给官方
//! `tauri-plugin-updater`；多源结论合并与说明裁剪在 `adl-update` crate（带单测）。
//!
//! 下载结果**不落盘**：这是有意的（ADR-0027）。用户不安装就退出应用，临时包随之
//! 消失，界面回到「可下载」状态。

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use adl_errors::AppError;
use adl_types::IpcResult;
use adl_update::{
    Decision, SourceState, UPDATE_SOURCES, decide, is_newer, summarize_notes, target_key,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterBuilder, UpdaterExt};
use url::Url;

use crate::commands::ipc;
use crate::state::AppState;

/// 下载进度事件：`{ downloaded: number, total: number | null }`。
pub const PROGRESS_EVENT: &str = "digital-life://app-update-progress";
/// 安装开始事件：Windows 上随后应用会退出，前端没有机会再更新界面。
pub const INSTALLING_EVENT: &str = "digital-life://app-update-installing";

/// 单源清单检查超时。
const CHECK_TIMEOUT: Duration = Duration::from_secs(10);
/// 安装包下载的整体超时：CDN 半挂（连上但不发数据）时不能无限停在某个百分比。
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(900);
/// 卡片里展示的更新说明上限（字符）。卡片自己用两行截断 + 展开滚动消化长文案。
const NOTES_MAX_CHARS: usize = 4000;
/// 进度事件的最小间隔字节数。
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
    /// 下载重入保护：重复点击/并发 IPC 只会启动一次下载。
    downloading: AtomicBool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    pub current_version: String,
    pub available: bool,
    pub version: Option<String>,
    /// 已裁剪为纯文本首段（卡片不渲染 Markdown）。
    pub notes: Option<String>,
    /// 插件给出的时间字符串（不保证 RFC 3339）；前端目前不渲染。
    pub published_at: Option<String>,
    pub source: Option<String>,
    /// 仅当**所有**来源都不可用时给出。
    pub error: Option<String>,
}

#[tauri::command]
pub async fn app_update_check(app: AppHandle) -> IpcResult<UpdateCheck> {
    let current_version = app.package_info().version.to_string();
    let outcome = resolve_update(&app).await;
    let check = match outcome {
        Ok(ResolveOutcome::Found(found)) => UpdateCheck {
            current_version,
            available: true,
            version: Some(found.update.version.clone()),
            notes: found
                .update
                .body
                .as_deref()
                .map(|body| summarize_notes(body, NOTES_MAX_CHARS))
                .filter(|notes| !notes.is_empty()),
            published_at: found.update.date.as_ref().map(|date| date.to_string()),
            source: Some(found.source.to_string()),
            error: None,
        },
        Ok(ResolveOutcome::UpToDate) => UpdateCheck {
            current_version,
            available: false,
            version: None,
            notes: None,
            published_at: None,
            source: None,
            error: None,
        },
        Err(message) => UpdateCheck {
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

#[tauri::command]
pub async fn app_update_download(app: AppHandle) -> IpcResult<()> {
    let state = app.state::<UpdateState>();
    if state.downloading.swap(true, Ordering::SeqCst) {
        return ipc(Err(AppError::InvalidInput("update download already in progress".into())));
    }
    let result = download_inner(&app).await;
    state.downloading.store(false, Ordering::SeqCst);
    ipc(result)
}

async fn download_inner(app: &AppHandle) -> Result<(), AppError> {
    let resolved = match resolve_update(app).await {
        Ok(ResolveOutcome::Found(found)) => {
            // 只回落到**同一个版本**：不同版本的备用源会让「卡片显示 v0.3.0、实际装 v0.2.0」。
            let target_version = found.update.version.clone();
            let mut candidates: Vec<Update> = vec![found.update];
            candidates.extend(
                found.alternates.into_iter().filter(|update| update.version == target_version),
            );
            candidates
        },
        Ok(ResolveOutcome::UpToDate) => {
            return Err(AppError::NotFound("no update available".into()));
        },
        Err(message) => return Err(AppError::Network(message)),
    };

    // 逐个来源尝试：清单版本更高的源附件 404/被墙时，回落到另一源的同一版本。
    let mut last_error = None;
    for update in resolved {
        let progress_app = app.clone();
        let mut downloaded: u64 = 0;
        let mut emitted: u64 = 0;
        let attempt = tokio::time::timeout(
            DOWNLOAD_TIMEOUT,
            update.download(
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
            ),
        )
        .await;

        match attempt {
            Ok(Ok(bytes)) => {
                let state = app.state::<UpdateState>();
                match state.downloaded.lock() {
                    Ok(mut guard) => {
                        *guard = Some(DownloadedUpdate { update, bytes });
                        return Ok(());
                    },
                    Err(_) => return Err(AppError::Internal("update state lock poisoned".into())),
                }
            },
            Ok(Err(error)) => last_error = Some(error.to_string()),
            Err(_) => last_error = Some("download timed out".into()),
        }
    }

    // 全部失败：清掉可能残留的旧字节，避免之后装到过期版本。
    if let Ok(mut guard) = app.state::<UpdateState>().downloaded.lock() {
        *guard = None;
    }
    Err(AppError::Network(format!(
        "download failed: {}",
        last_error.unwrap_or_else(|| "no candidate".into())
    )))
}

/// 安装已下载的更新。Windows 上此调用会在启动安装器后退出当前进程。
///
/// 隐藏窗口与结束 sidecar 放在 `on_before_exit`（插件在「安装包已解出、安装器即将启动」
/// 时调用），这样安装包解压失败时不会留下「窗口已隐藏 + sidecar 已死」的半死状态。
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

    let _ = app.emit(INSTALLING_EVENT, serde_json::json!({}));
    match downloaded.update.install(&downloaded.bytes) {
        Ok(()) => ipc(Ok(())),
        Err(error) => {
            // 解压或启动安装器失败时，on_before_exit 可能已经隐藏窗口并结束了 sidecar：
            // 直接重启应用，避免把用户留在不可恢复的半死状态。
            //
            // 注意用 `get_window` 而不是 `get_webview_window`：浏览器标签是挂在主窗口上的
            // 子 WebView，只要存在一个，Tauri 的 `is_webview_window()` 就为 false，
            // `get_webview_window("main")` 会恒返回 None（2026-11-21 实测）。
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
            }
            tracing::error!("[update] install failed, restarting app: {error}");
            app.restart();
        },
    }
}

struct ResolveFound {
    source: &'static str,
    update: Update,
    /// 备用来源（同一次检查里其它回答「有更新」的来源，按版本降序）。
    alternates: Vec<Update>,
}

enum ResolveOutcome {
    UpToDate,
    Found(Box<ResolveFound>),
}

/// 依次检查所有来源，按 `adl_update::decide` 合并结论：
/// 任一来源报「有更新」→ 取最高版本；否则只要有一源说「已是最新」就是已是最新；
/// 全部不可用才返回 `Err`。
async fn resolve_update(app: &AppHandle) -> Result<ResolveOutcome, String> {
    let mut results: Vec<Result<Option<Update>, String>> = Vec::new();
    for source in UPDATE_SOURCES {
        results.push(check_one(app, source).await);
    }

    let states: Vec<SourceState<'_>> = results
        .iter()
        .map(|result| match result {
            Ok(Some(update)) => SourceState::Update(update.version.as_str()),
            Ok(None) => SourceState::UpToDate,
            Err(_) => SourceState::Unavailable,
        })
        .collect();

    match decide(&states) {
        Decision::UpToDate => Ok(ResolveOutcome::UpToDate),
        Decision::Unavailable => {
            let messages: Vec<String> =
                results.iter().filter_map(|result| result.as_ref().err().cloned()).collect();
            Err(messages.join(" | "))
        },
        Decision::Found(index) => {
            // 取出所有「有更新」的来源，索引对应 `decide` 的选择。
            let mut updates: Vec<Option<Update>> =
                results.into_iter().map(|result| result.ok().flatten()).collect();
            let Some(best_update) = updates.get_mut(index).and_then(|slot| slot.take()) else {
                return Err("update selection failed".into());
            };
            // 其它来源按版本降序排队，下载失败时依次回落（同一版本最常见）。
            let mut alternates: Vec<Update> = updates.into_iter().flatten().collect();
            alternates.sort_by(|left, right| {
                if is_newer(&left.version, &right.version) {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Greater
                }
            });
            Ok(ResolveOutcome::Found(Box::new(ResolveFound {
                source: UPDATE_SOURCES[index],
                update: best_update,
                alternates,
            })))
        },
    }
}

async fn check_one(app: &AppHandle, source: &str) -> Result<Option<Update>, String> {
    let url = Url::parse(source).map_err(|error| error.to_string())?;
    // 显式钉住目标平台键：清单里必须存在 `windows-x86_64` 这类条目，否则插件会判「已是最新」。
    let target = target_key(std::env::consts::OS, std::env::consts::ARCH)
        .map_err(|error| error.to_string())?;
    let builder = apply_proxy(app, app.updater_builder())?;
    let builder = builder.target(target).endpoints(vec![url]).map_err(|error| error.to_string())?;
    builder
        .timeout(CHECK_TIMEOUT)
        .on_before_exit(before_install_hook(app))
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())
}

/// 安装器即将启动时的收尾：先隐藏窗口（避免满屏网络错误），再结束 sidecar
/// （否则 NSIS 覆盖 `adl-server.exe` 会被文件锁拦住）。
///
/// `get_window` 同理不能用 `get_webview_window`：存在浏览器标签（主窗口的子 WebView）时
/// `get_webview_window("main")` 恒为 None，窗口就不会被隐藏（2026-11-21 实测）。
fn before_install_hook(app: &AppHandle) -> impl Fn() + Send + Sync + 'static {
    let handle = app.clone();
    move || {
        if let Some(window) = handle.get_window("main") {
            let _ = window.hide();
        }
        handle.state::<AppState>().ad_server.terminate();
    }
}

/// 让更新请求沿用应用的代理设置。
///
/// 与 `adl-download-source` 的差异（有据保留）：这里不实现 `no_proxy` 与自动直连回退——
/// `UpdaterBuilder` 只接受单个代理 URL，做不到按目标匹配/回退；手动模式端点解析失败时
/// 选择直连而不是整体失败，避免一个可选字段写错就让「检查更新」永久报错。
fn apply_proxy(app: &AppHandle, builder: UpdaterBuilder) -> Result<UpdaterBuilder, String> {
    let state = app.state::<AppState>();
    let Ok(config) = adl_download_source::load(&state.storage.paths().root) else {
        return Ok(builder);
    };
    match config.proxy.mode {
        adl_download_source::ProxyMode::None => Ok(builder.no_proxy()),
        adl_download_source::ProxyMode::Manual => {
            // https 只认 https_proxy：不做跨字段回退（与 download-source 同语义）。
            match config.proxy.https_proxy.as_deref().and_then(|value| Url::parse(value).ok()) {
                Some(url) => Ok(builder.proxy(url)),
                None => Ok(builder.no_proxy()),
            }
        },
        adl_download_source::ProxyMode::Auto => Ok(builder),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_newer_used_for_alternate_ordering() {
        assert!(is_newer("0.2.0", "0.1.9"));
    }
}
