//! 剪贴板写回：**单一入口**，打开剪贴板后先 `EmptyClipboard` 再按 kind 写多格式。
//!
//! 缺陷 B 根因：`clipboard-win` 的 `raw::set_bitmap` 使用 `NoClear`（不 EmptyClipboard），
//! 旧格式（如 CF_UNICODETEXT）会残留，粘贴得到「文本 + 图片」。此模块统一先清空。

use std::path::Path;

use clipboard_win::SysResult;
use clipboard_win::options::NoClear;
use clipboard_win::raw;
use clipboard_win::{Clipboard, ErrorCode, formats, register_format};

use adl_errors::AppError;
use adl_types::types::clipboard::ClipboardItem;

use crate::read::png_to_bmp24;

/// 一次写回要落到的具体格式。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FormatWrite {
    Unicode(String),
    Html(String),
    Rtf(Vec<u8>),
    Bitmap(Vec<u8>),
}

/// `plan_formats` 的输入（纯数据，便于单测）。
pub struct WriteInputs<'a> {
    pub kind: &'a str,
    pub content: Option<&'a str>,
    pub html: Option<&'a str>,
    pub rtf: Option<&'a [u8]>,
    pub bmp: Option<&'a [u8]>,
}

/// 决定一条条目要写哪些格式。载荷缺失时降级到纯文本；都不存在则返回空（不写）。
pub fn plan_formats(input: WriteInputs<'_>) -> Vec<FormatWrite> {
    let text = input.content.filter(|t| !t.is_empty());
    let unicode = || text.map(|t| FormatWrite::Unicode(t.to_string()));
    match input.kind {
        "image" => input.bmp.map(|b| vec![FormatWrite::Bitmap(b.to_vec())]).unwrap_or_default(),
        "html" => match input.html {
            Some(h) => unicode().into_iter().chain([FormatWrite::Html(h.to_string())]).collect(),
            None => unicode().into_iter().collect(),
        },
        "rtf" => match input.rtf {
            Some(r) => unicode().into_iter().chain([FormatWrite::Rtf(r.to_vec())]).collect(),
            None => unicode().into_iter().collect(),
        },
        _ => unicode().into_iter().collect(),
    }
}

/// 真正写系统剪贴板：打开 → `EmptyClipboard`（治缺陷 B）→ 逐格式写入 → 关闭。
///
/// 循环内一律使用 `raw::*_with(..., NoClear)` 变体：这些 helper 的默认变体
/// （`set_string`/`set_html`/`set`/`set_bitmap` 等）各自会调用 `EmptyClipboard`，
/// 会**清掉本循环里已经写好的先前格式**（例如 [Unicode(text), Rtf] 中 Rtf 写回时
/// 把 text 抹掉，导致「RTF + 纯文本」只剩 RTF）。因此清空只做一次——即上面的显式
/// `empty()`——循环内一律 NoClear。请勿"简化"回默认变体。
fn apply(writes: &[FormatWrite]) -> SysResult<()> {
    let _clip = Clipboard::new_attempts(10)?;
    clipboard_win::empty()?;
    for w in writes {
        match w {
            FormatWrite::Unicode(text) => raw::set_string_with(text.as_str(), NoClear)?,
            FormatWrite::Html(html) => {
                let fmt = formats::Html::new().ok_or_else(ErrorCode::last_system)?;
                raw::set_html_with(fmt.code(), html.as_str(), NoClear)?;
            },
            FormatWrite::Rtf(bytes) => {
                let code =
                    register_format("Rich Text Format").ok_or_else(ErrorCode::last_system)?;
                raw::set_without_clear(code.get(), bytes.as_slice())?;
            },
            FormatWrite::Bitmap(bytes) => raw::set_bitmap_with(bytes.as_slice(), NoClear)?,
        }
    }
    Ok(())
}

fn read_to_string(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

/// 一条 `ClipboardItem` 的完整写回：加载富文本载荷（文件缺失 / 读取失败时为 None）→ 计划 → 执行。
pub fn write_item_to_clipboard(item: &ClipboardItem) -> Result<(), AppError> {
    let html = item.html_path.as_deref().and_then(|p| read_to_string(Path::new(p)));
    let rtf = item.rtf_path.as_deref().and_then(|p| std::fs::read(Path::new(p)).ok());
    let bmp = match item.image_path.as_deref() {
        Some(p) => Some(png_to_bmp24(Path::new(p))?),
        None => None,
    };
    let writes = plan_formats(WriteInputs {
        kind: &item.kind,
        content: item.content.as_deref(),
        html: html.as_deref(),
        rtf: rtf.as_deref(),
        bmp: bmp.as_deref(),
    });
    if writes.is_empty() {
        return Err(AppError::InvalidInput("clipboard item has no writable payload".into()));
    }
    apply(&writes).map_err(|e| AppError::Io(format!("clipboard write: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_plans_only_bitmap() {
        let b = vec![1u8, 2, 3];
        let got = plan_formats(WriteInputs {
            kind: "image",
            content: None,
            html: None,
            rtf: None,
            bmp: Some(&b),
        });
        assert_eq!(got, vec![FormatWrite::Bitmap(b)]);
    }

    #[test]
    fn image_without_payload_writes_nothing() {
        let got = plan_formats(WriteInputs {
            kind: "image",
            content: Some("x"),
            html: None,
            rtf: None,
            bmp: None,
        });
        assert!(got.is_empty());
    }

    #[test]
    fn html_plans_text_then_html() {
        let got = plan_formats(WriteInputs {
            kind: "html",
            content: Some("plain"),
            html: Some("<b>hi</b>"),
            rtf: None,
            bmp: None,
        });
        assert_eq!(
            got,
            vec![FormatWrite::Unicode("plain".into()), FormatWrite::Html("<b>hi</b>".into())]
        );
    }

    #[test]
    fn rtf_plans_text_then_rtf() {
        let r = b"{\\rtf1}".to_vec();
        let got = plan_formats(WriteInputs {
            kind: "rtf",
            content: Some("plain"),
            html: None,
            rtf: Some(&r),
            bmp: None,
        });
        assert_eq!(got, vec![FormatWrite::Unicode("plain".into()), FormatWrite::Rtf(r)]);
    }

    #[test]
    fn missing_richtext_falls_back_to_text() {
        let got = plan_formats(WriteInputs {
            kind: "html",
            content: Some("t"),
            html: None,
            rtf: None,
            bmp: None,
        });
        assert_eq!(got, vec![FormatWrite::Unicode("t".into())]);
    }

    #[test]
    fn missing_rtf_falls_back_to_text() {
        let got = plan_formats(WriteInputs {
            kind: "rtf",
            content: Some("t"),
            html: None,
            rtf: None,
            bmp: None,
        });
        assert_eq!(got, vec![FormatWrite::Unicode("t".into())]);
    }

    #[test]
    fn empty_text_is_not_written() {
        let got = plan_formats(WriteInputs {
            kind: "text",
            content: Some(""),
            html: None,
            rtf: None,
            bmp: None,
        });
        assert!(got.is_empty());
    }
}
