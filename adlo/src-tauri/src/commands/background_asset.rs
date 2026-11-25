//! 新建标签页「自定义背景」的本地素材托管。
//!
//! 背景图片/视频不以前端 data URL 形式持久化（大文件会让 localStorage 水位与解码时间
//! 失控）。桌面端把源文件复制到应用数据目录下的 `adl-backgrounds/`，前端只保存返回的
//! 路径，再用 Tauri asset 协议流式加载（`tauri.conf.json` 的 `assetProtocol.scope`
//! 只放行该目录）。
//!
//! 浏览器模式没有 Tauri，走前端 IndexedDB（见 `browser-landing/backgroundAssets.ts`）。

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

use crate::commands::ipc;
use adl_errors::AppError;
use adl_types::IpcResult;

/// 素材目录名（相对应用数据根）。asset 协议 scope 与清理逻辑都以它为准。
const BACKGROUND_DIR: &str = "adl-backgrounds";

const IMAGE_EXTENSIONS: [&str; 5] = ["jpg", "jpeg", "png", "gif", "webp"];
const VIDEO_EXTENSIONS: [&str; 2] = ["mp4", "webm"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackgroundKind {
    Image,
    Video,
}

impl BackgroundKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Video => "video",
        }
    }

    fn extensions(self) -> &'static [&'static str] {
        match self {
            Self::Image => &IMAGE_EXTENSIONS,
            Self::Video => &VIDEO_EXTENSIONS,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundAsset {
    /// 托管副本的绝对路径（前端存这个值，再用 asset 协议加载）。
    pub path: String,
    /// 展示用原始文件名。
    pub file_name: String,
}

fn extension_of(path: &Path) -> Option<String> {
    path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).filter(|e| !e.is_empty())
}

/// 扩展名是否属于该类型。Rust 侧（原生对话框过滤器 + 导入校验）共用本表；
/// 前端拖拽的类型推断另有一份独立列表（`backgroundAssets.ts`），改动需同步两侧。
fn is_allowed_extension(kind: BackgroundKind, extension: &str) -> bool {
    kind.extensions().contains(&extension)
}

/// import / prune 共用的串行锁：清理按「调用时刻的配置」保留文件，
/// 若与新素材复制交错，刚导入的草稿会被删掉。两者都在 blocking 线程里执行。
fn assets_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn lock_assets() -> std::sync::MutexGuard<'static, ()> {
    assets_lock().lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn display_name(path: &Path) -> String {
    path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default()
}

/// 复制源文件到托管目录，返回落点与元信息。纯文件操作，便于单测。
fn import_background_file(
    source: &Path,
    kind: BackgroundKind,
    dir: &Path,
) -> Result<BackgroundAsset, AppError> {
    let _guard = lock_assets();
    let metadata = std::fs::metadata(source)
        .map_err(|e| AppError::Io(format!("failed to read background file: {e}")))?;
    if !metadata.is_file() {
        return Err(AppError::InvalidInput("background source is not a file".to_string()));
    }

    let extension = extension_of(source)
        .ok_or_else(|| AppError::InvalidInput("background file has no extension".to_string()))?;
    if !is_allowed_extension(kind, &extension) {
        return Err(AppError::InvalidInput(format!(
            "unsupported {} extension: {extension}",
            kind.as_str()
        )));
    }

    std::fs::create_dir_all(dir)
        .map_err(|e| AppError::Io(format!("failed to create background dir: {e}")))?;
    let destination =
        dir.join(format!("bg-{}-{}.{extension}", kind.as_str(), uuid::Uuid::new_v4()));
    std::fs::copy(source, &destination)
        .map_err(|e| AppError::Io(format!("failed to copy background file: {e}")))?;

    Ok(BackgroundAsset {
        path: destination.to_string_lossy().into_owned(),
        file_name: display_name(source),
    })
}

/// 从托管目录删除不在 `keep` 里的素材（切换/重置背景后收尾）。
fn prune_background_dir(dir: &Path, keep: &[String]) -> Result<u32, AppError> {
    let _guard = lock_assets();
    if !dir.exists() {
        return Ok(0);
    }
    let keep_names: Vec<String> = keep
        .iter()
        .filter_map(|path| Path::new(path).file_name())
        .map(|name| name.to_string_lossy().into_owned())
        .collect();

    let entries = std::fs::read_dir(dir)
        .map_err(|e| AppError::Io(format!("failed to read background dir: {e}")))?;
    let mut removed = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = display_name(&path);
        if keep_names.contains(&name) {
            continue;
        }
        std::fs::remove_file(&path).map_or_else(
            |e| {
                // 单个素材删除失败（被占用/权限）不应中断整轮清理。
                tracing::warn!(path = %path.display(), error = %e, "failed to remove background asset");
            },
            |_| {
                removed += 1;
            },
        );
    }
    Ok(removed)
}

fn background_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("failed to resolve app data dir: {e}")))?;
    Ok(root.join(BACKGROUND_DIR))
}

/// 系统原生文件选择（桌面端点选上传）。
///
/// 只返回用户选中的绝对路径，**不复制**：复制放到前端显式调用
/// `browser_import_background_file` 时进行，这样系统对话框打开期间不会出现
/// 「正在读取」的加载态。取消返回 `Ok(None)`。
#[tauri::command]
pub async fn browser_pick_background_file(
    app: tauri::AppHandle,
    kind: BackgroundKind,
) -> IpcResult<Option<String>> {
    let extensions = kind.extensions();
    let (tx, rx) = oneshot::channel();
    app.dialog().file().add_filter(kind.as_str(), extensions).pick_file(move |path| {
        let _ = tx.send(path);
    });

    let chosen = match rx.await {
        Ok(path) => path,
        Err(err) => {
            tracing::warn!("browser_pick_background_file dialog channel failed: {err}");
            None
        },
    };
    let Some(file_path) = chosen else {
        return ipc(Ok(None));
    };
    let source = match file_path.into_path() {
        Ok(path) => path,
        Err(err) => {
            return ipc(Err(AppError::InvalidInput(format!(
                "failed to resolve picked path: {err}"
            ))));
        },
    };
    ipc(Ok(Some(source.to_string_lossy().into_owned())))
}

/// 取出并清空 Rust 侧记录的落点路径（`adl:file-drop` 事件失败时的兜底轮询）。
#[tauri::command]
pub async fn browser_take_pending_drop() -> IpcResult<Vec<String>> {
    ipc(Ok(crate::file_drop::take_pending_drop()))
}

/// 把拖拽落下的绝对路径复制进托管目录（桌面端原生拖放只给路径）。
#[tauri::command]
pub async fn browser_import_background_file(
    app: tauri::AppHandle,
    path: String,
    kind: BackgroundKind,
) -> IpcResult<BackgroundAsset> {
    let dir = match background_dir(&app) {
        Ok(dir) => dir,
        Err(err) => return ipc(Err(err)),
    };
    let source = PathBuf::from(path);
    let result = tokio::task::spawn_blocking(move || import_background_file(&source, kind, &dir))
        .await
        .unwrap_or_else(|err| Err(AppError::Io(format!("background import task failed: {err}"))));
    ipc(result)
}

/// 只保留 `keep` 中的托管素材（背景应用/重置后调用）。
#[tauri::command]
pub async fn browser_prune_background_assets(
    app: tauri::AppHandle,
    keep: Vec<String>,
) -> IpcResult<u32> {
    let dir = match background_dir(&app) {
        Ok(dir) => dir,
        Err(err) => return ipc(Err(err)),
    };
    let result = tokio::task::spawn_blocking(move || prune_background_dir(&dir, &keep))
        .await
        .unwrap_or_else(|err| Err(AppError::Io(format!("background prune task failed: {err}"))));
    ipc(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("adl-background-{tag}-{}", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn extension_whitelist_matches_kind() {
        assert!(is_allowed_extension(BackgroundKind::Image, "png"));
        assert!(is_allowed_extension(BackgroundKind::Image, "webp"));
        assert!(!is_allowed_extension(BackgroundKind::Image, "mp4"));
        assert!(is_allowed_extension(BackgroundKind::Video, "mp4"));
        assert!(is_allowed_extension(BackgroundKind::Video, "webm"));
        assert!(!is_allowed_extension(BackgroundKind::Video, "png"));
    }

    #[test]
    fn import_copies_file_and_reports_metadata() {
        let root = temp_dir("import");
        let source = root.join("wallpaper.PNG");
        std::fs::write(&source, b"png-bytes").unwrap();
        let dir = root.join("managed");

        let asset = import_background_file(&source, BackgroundKind::Image, &dir).unwrap();
        assert_eq!(asset.file_name, "wallpaper.PNG");
        let copied = Path::new(&asset.path);
        assert!(copied.exists());
        assert_eq!(extension_of(copied).as_deref(), Some("png"));
        assert_eq!(std::fs::read(copied).unwrap(), b"png-bytes");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn import_rejects_wrong_kind_and_missing_extension() {
        let root = temp_dir("reject");
        let video = root.join("clip.mp4");
        std::fs::write(&video, b"v").unwrap();
        let err = import_background_file(&video, BackgroundKind::Image, &root.join("managed"))
            .unwrap_err();
        assert!(err.to_string().contains("unsupported"));

        let no_ext = root.join("mystery");
        std::fs::write(&no_ext, b"x").unwrap();
        let err = import_background_file(&no_ext, BackgroundKind::Image, &root.join("managed"))
            .unwrap_err();
        assert!(err.to_string().contains("no extension"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn prune_keeps_only_listed_assets() {
        let dir = temp_dir("prune");
        let keep = dir.join("bg-image-a.png");
        let drop = dir.join("bg-video-b.mp4");
        std::fs::write(&keep, b"a").unwrap();
        std::fs::write(&drop, b"b").unwrap();

        let removed = prune_background_dir(&dir, &[keep.to_string_lossy().into_owned()]).unwrap();
        assert_eq!(removed, 1);
        assert!(keep.exists());
        assert!(!drop.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prune_missing_dir_is_noop() {
        let dir = std::env::temp_dir().join(format!("adl-bg-missing-{}", uuid::Uuid::new_v4()));
        assert_eq!(prune_background_dir(&dir, &[]).unwrap(), 0);
    }
}
