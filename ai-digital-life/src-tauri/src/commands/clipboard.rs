use std::path::Path;

use base64::Engine;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

use crate::commands::ipc;
use adl_errors::AppError;
use adl_types::IpcResult;

/// 「保存为文件」的请求载荷。
///
/// 分工与 `workspace_pick_directory` 一致：ad-server 拥有剪贴板数据，前端已从
/// `GET /clipboard/export?id=…` 取回条目字节（base64），壳层只负责弹系统原生
/// 「另存为」对话框并把字节写到用户选定的位置。
#[derive(serde::Deserialize)]
pub struct SaveToFilePayload {
    /// 对话框预填文件名（含扩展名）。用户可在对话框中改名与改位置。
    pub suggested_name: String,
    /// 条目字节的 base64 编码（标准字母表 + padding）。
    pub data_base64: String,
}

/// 把预填文件名收敛为纯基名：剥掉任何目录成分，并把 Windows 文件名非法字符换成下划线。
///
/// 预填名来自前端（由条目 id 派生），但对话框返回的落盘路径完全由用户决定；
/// 这里只保证"预填"这一步不会把对话框带到意料之外的目录或因非法字符报错。
///
/// 目录成分按 `/` 手工切分而非走 `Path::file_name()`：后者在 Windows 上会把 `a:` 当盘符前缀、
/// 在 Unix 上不会，两端行为不一致，而本函数的输出会同时喂给两端的「另存为」对话框。
fn sanitize_suggested_name(raw: &str) -> String {
    let normalized = raw.trim().replace('\\', "/");
    // `rsplit` 恒产出至少一个子串，`next()` 永不返回 `None`；
    // 保留 `unwrap_or("")` 而不用 `expect`：后端禁止 panic 路径，
    // 空结果自然落入下方 `"clipboard"` 兜底，语义不变。
    let base = normalized.rsplit('/').next().unwrap_or("");
    let cleaned: String = base
        .chars()
        .map(|c| {
            if matches!(c, '\0' | '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.trim().to_string();
    if cleaned.is_empty() { "clipboard".to_string() } else { cleaned }
}

/// 按扩展名给出「另存为」对话框的文件类型过滤器。未知扩展名退化为按该扩展名单过滤，
/// 不静默放宽为"所有文件"——避免用户误把条目存成无扩展名文件。无扩展名时返回 `None`
///（不加过滤器），而不是塞一个空扩展名把对话框过滤成"只显示无扩展名文件"。
fn filter_extensions(file_name: &str) -> Option<Vec<String>> {
    let ext = Path::new(file_name)
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .filter(|e| !e.is_empty())?;
    let extensions = match ext.as_str() {
        // 归一化双别名（无重复项）：htm 输入同样挂 [htm, html]。
        "html" | "htm" => vec!["htm".to_string(), "html".to_string()],
        _ => vec![ext.clone()],
    };
    Some(extensions)
}

/// 系统原生「另存为」（system capability）。
///
/// 返回用户确认的绝对路径；取消对话框返回 `Ok(None)`。写盘放在
/// `spawn_blocking` 中，避免阻塞异步运行时。
#[tauri::command]
pub async fn clipboard_save_to_file(
    app: tauri::AppHandle,
    payload: SaveToFilePayload,
) -> IpcResult<Option<String>> {
    let suggested_name = sanitize_suggested_name(&payload.suggested_name);

    // base64 先解码：纯 CPU 操作无需 spawn_blocking；非法载荷直接 InvalidInput，
    // 不打扰用户选路径（与预览路由"先校验后弹框"顺序对齐）。
    let bytes =
        match base64::engine::general_purpose::STANDARD.decode(payload.data_base64.as_bytes()) {
            Ok(bytes) => bytes,
            Err(err) => {
                return ipc(Err(AppError::InvalidInput(format!("invalid base64 payload: {err}"))));
            },
        };

    let (tx, rx) = oneshot::channel();
    let mut dialog = app.dialog().file().set_file_name(&suggested_name);
    if let Some(extensions) = filter_extensions(&suggested_name) {
        // 过滤器名取扩展名本身：中性、无需 i18n 的 OS 级字符串（对话框标题同理不设）。
        let refs: Vec<&str> = extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(extensions[0].as_str(), refs.as_slice());
    }
    dialog.save_file(move |path| {
        let _ = tx.send(path);
    });
    // 发送端丢失（Err）与用户取消（Ok(None)）都按取消处理，但前者是 dialog 子系统
    // 故障，打一条 warn 供排查，而不是与正常取消完全无差别。
    let chosen = match rx.await {
        Ok(path) => path,
        Err(err) => {
            tracing::warn!("clipboard_save_to_file dialog channel failed: {err}");
            None
        },
    };

    let Some(file_path) = chosen else {
        return ipc(Ok(None));
    };
    let target = match file_path.into_path() {
        Ok(path) => path,
        Err(err) => {
            return ipc(Err(AppError::Io(format!("failed to resolve save path: {err}"))));
        },
    };

    // 落盘路径在闭包内被移动，先留一份字符串供返回值使用。
    let saved_path = target.to_string_lossy().into_owned();
    let written = tokio::task::spawn_blocking(move || std::fs::write(&target, &bytes)).await;
    match written {
        Ok(Ok(())) => ipc(Ok(Some(saved_path))),
        Ok(Err(err)) => ipc(Err(AppError::Io(err.to_string()))),
        Err(err) => ipc(Err(AppError::Io(format!("save task failed: {err}")))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_directory_components() {
        assert_eq!(sanitize_suggested_name("a/b/c.txt"), "c.txt");
        assert_eq!(sanitize_suggested_name("..\\..\\evil.txt"), "evil.txt");
    }

    #[test]
    fn sanitize_replaces_illegal_characters() {
        assert_eq!(sanitize_suggested_name("a:b*c?.txt"), "a_b_c_.txt");
        assert_eq!(sanitize_suggested_name("re|port\".txt"), "re_port_.txt");
    }

    #[test]
    fn sanitize_falls_back_when_nothing_usable_remains() {
        assert_eq!(sanitize_suggested_name("   "), "clipboard");
        assert_eq!(sanitize_suggested_name("///"), "clipboard");
    }

    #[test]
    fn filter_extensions_expands_html_aliases() {
        assert_eq!(filter_extensions("x.html").unwrap(), vec!["htm", "html"]);
        assert_eq!(filter_extensions("x.htm").unwrap(), vec!["htm", "html"]);
        assert_eq!(filter_extensions("x.txt").unwrap(), vec!["txt"]);
        assert_eq!(filter_extensions("x.png").unwrap(), vec!["png"]);
        assert_eq!(filter_extensions("x.rtf").unwrap(), vec!["rtf"]);
    }

    #[test]
    fn filter_extensions_normalizes_case_and_unknown() {
        assert_eq!(filter_extensions("x.TXT").unwrap(), vec!["txt"]);
        assert_eq!(filter_extensions("x.json").unwrap(), vec!["json"]);
        // 无扩展名 → 不加过滤器（而不是塞空扩展名）
        assert_eq!(filter_extensions("noext"), None);
        assert_eq!(filter_extensions("trailing."), None);
    }
}
