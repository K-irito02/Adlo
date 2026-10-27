//! 剪贴板写回：**单一入口**，打开剪贴板后先 `EmptyClipboard` 再按 kind 写多格式。
//!
//! 缺陷 B 根因：`clipboard-win` 的 `raw::set_bitmap` 使用 `NoClear`（不 EmptyClipboard），
//! 旧格式（如 CF_UNICODETEXT）会残留，粘贴得到「文本 + 图片」。此模块统一先清空。

use std::io::Cursor;
use std::path::Path;

use clipboard_win::SysResult;
use clipboard_win::options::NoClear;
use clipboard_win::raw;
use clipboard_win::{Clipboard, ErrorCode, formats, register_format};

use adl_errors::AppError;
use adl_types::types::clipboard::{ClipboardItem, ClipboardKind};

/// 一次写回要落到的具体格式。
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum FormatWrite {
    Unicode(String),
    Html(String),
    Rtf(Vec<u8>),
    Bitmap(Vec<u8>),
}

/// `plan_formats` 的输入（纯数据，便于单测）。
pub(crate) struct WriteInputs<'a> {
    pub kind: ClipboardKind,
    pub content: Option<&'a str>,
    pub html: Option<&'a str>,
    pub rtf: Option<&'a [u8]>,
    pub bmp: Option<&'a [u8]>,
}

/// 决定一条条目要写哪些格式。载荷缺失**或为空**时降级到纯文本；都不存在则返回空（不写）。
pub(crate) fn plan_formats(input: WriteInputs<'_>) -> Vec<FormatWrite> {
    let text = input.content.filter(|t| !t.is_empty());
    let unicode = || text.map(|t| FormatWrite::Unicode(t.to_string()));
    match input.kind {
        // 空载荷视同缺失：否则会「清空剪贴板却返回成功」（零字节 sidecar 场景）。
        ClipboardKind::Image => input
            .bmp
            .filter(|b| !b.is_empty())
            .map(|b| vec![FormatWrite::Bitmap(b.to_vec())])
            .unwrap_or_default(),
        ClipboardKind::Html => match input.html.filter(|h| !h.is_empty()) {
            Some(h) => unicode().into_iter().chain([FormatWrite::Html(h.to_string())]).collect(),
            None => unicode().into_iter().collect(),
        },
        ClipboardKind::Rtf => match input.rtf.filter(|r| !r.is_empty()) {
            Some(r) => unicode().into_iter().chain([FormatWrite::Rtf(r.to_vec())]).collect(),
            None => unicode().into_iter().collect(),
        },
        ClipboardKind::Text => unicode().into_iter().collect(),
    }
}

/// 把落盘 PNG 编码为 **经典 24 位 BI_RGB BMP**（写回图片条目的载荷）。
///
/// `image` 0.25 的 BMP 编码器对 `Rgba8` 会输出 108 字节 BITMAPV4HEADER + `biCompression=3
/// (BI_BITFIELDS)`；而 `clipboard-win` 的 `raw::set_bitmap_inner` 只拷贝 **40 字节**
/// BITMAPINFOHEADER，颜色掩码会落到未初始化内存上被误读 → 粘贴出现随机彩色叠加层（缺陷 A）。
/// 转 `Rgb8` 后编码器改用 40 字节头 + `BI_RGB`，与 `set_bitmap_inner` 的假设一致。
/// alpha 无法在 CF_BITMAP 中保留，故透明像素合成到白底（避免透明区变黑）。
pub(crate) fn png_to_bmp24(path: &Path) -> Result<Vec<u8>, AppError> {
    let img = image::open(path).map_err(|e| AppError::Io(format!("image open: {e}")))?;
    let rgba = img.to_rgba8();
    let (width, height) = (rgba.width(), rgba.height());
    let mut rgb = image::RgbImage::new(width, height);
    for (x, y, px) in rgba.enumerate_pixels() {
        let a = u32::from(px.0[3]);
        let bg = 255 * (255 - a);
        let over_white = |c: u8| ((u32::from(c) * a + bg) / 255) as u8;
        rgb.put_pixel(
            x,
            y,
            image::Rgb([over_white(px.0[0]), over_white(px.0[1]), over_white(px.0[2])]),
        );
    }
    let mut bmp: Vec<u8> = Vec::new();
    image::DynamicImage::ImageRgb8(rgb)
        .write_to(&mut Cursor::new(&mut bmp), image::ImageFormat::Bmp)
        .map_err(|e| AppError::Io(format!("bmp encode: {e}")))?;
    Ok(bmp)
}

/// 真正写系统剪贴板：打开 → `EmptyClipboard`（治缺陷 B）→ 逐格式写入 → 关闭。
///
/// 循环内一律使用 `raw::*_with(..., NoClear)` 变体：默认变体中 `set_string`/`set` 走
/// `DoClear`（调用 `EmptyClipboard`），会**清掉本循环里已经写好的先前格式**（例如
/// [Unicode(text), Rtf] 中 Rtf 写回时把 text 抹掉，导致「RTF + 纯文本」只剩 RTF）；
/// `set_html`/`set_bitmap` 默认虽为 NoClear，仍统一走显式 NoClear 变体以保持一致。
/// 清空因此只做一次——即上面的显式 `empty()`。请勿"简化"回默认变体。
fn apply(writes: &[FormatWrite]) -> SysResult<()> {
    // 空计划绝不得清空剪贴板 —— 由函数自身保证，不依赖调用方的 `writes.is_empty()` 守卫。
    if writes.is_empty() {
        return Ok(());
    }
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

/// 读取可选 sidecar：路径为 `None` 或文件缺失 → `Ok(None)`（既定降级语义：回退纯文本）；
/// **真实**读取失败（权限/损坏等）→ `Err`，避免「再次复制」静默退化成纯文本而无任何信号。
fn read_optional_sidecar(path: Option<&str>) -> Result<Option<Vec<u8>>, AppError> {
    let Some(p) = path else {
        return Ok(None);
    };
    match std::fs::read(p) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::Io(format!("clipboard sidecar read failed: {p} ({e})"))),
    }
}

/// 一条 `ClipboardItem` 的完整写回：加载富文本载荷 → 计划 → 执行。
/// 富载荷缺失时降级为纯文本；无任何可写载荷时报错（不静默成功）。
pub fn write_item_to_clipboard(item: &ClipboardItem) -> Result<(), AppError> {
    // 富载荷读取按 kind 门控（与下方 bmp 的门控同理）：跨 kind 残留的 sidecar 路径
    // （如编辑/降级后的旧行）不去读，避免无关载荷的损坏使整次写回失败。
    // HTML sidecar 恒由 `String` 写出，故此处额外要求合法 UTF-8（损坏则显式报错）。
    let html = if item.kind == ClipboardKind::Html {
        read_optional_sidecar(item.html_path.as_deref())?
            .map(String::from_utf8)
            .transpose()
            .map_err(|e| {
                AppError::Io(format!("clipboard html sidecar not utf-8: {}", e.utf8_error()))
            })?
    } else {
        None
    };
    let rtf = if item.kind == ClipboardKind::Rtf {
        read_optional_sidecar(item.rtf_path.as_deref())?
    } else {
        None
    };
    // 仅图片条目才需要位图载荷：避免对非图片条目做无谓解码，或在 `image_path` 意外残留时
    // 因 PNG 缺失而使整次写回失败。
    let bmp = if item.kind == ClipboardKind::Image {
        item.image_path.as_deref().map(|p| png_to_bmp24(Path::new(p))).transpose()?
    } else {
        None
    };
    let writes = plan_formats(WriteInputs {
        kind: item.kind,
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
    // 剪贴板集成测试需要 `is_format_avail` / `read_clipboard` —— 二者是 trait 方法。
    use clipboard_win::{Format, Getter};

    #[test]
    fn image_plans_only_bitmap() {
        let b = vec![1u8, 2, 3];
        let got = plan_formats(WriteInputs {
            kind: ClipboardKind::Image,
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
            kind: ClipboardKind::Image,
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
            kind: ClipboardKind::Html,
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
            kind: ClipboardKind::Rtf,
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
            kind: ClipboardKind::Html,
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
            kind: ClipboardKind::Rtf,
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
            kind: ClipboardKind::Text,
            content: Some(""),
            html: None,
            rtf: None,
            bmp: None,
        });
        assert!(got.is_empty());
    }

    #[test]
    fn empty_payloads_are_treated_as_absent() {
        // 零字节 rtf/html/bmp 不得进入计划：否则会「清空剪贴板却返回成功」。
        let empty: &[u8] = &[];
        let rtf = plan_formats(WriteInputs {
            kind: ClipboardKind::Rtf,
            content: Some("t"),
            html: None,
            rtf: Some(empty),
            bmp: None,
        });
        assert_eq!(rtf, vec![FormatWrite::Unicode("t".into())]);

        let html = plan_formats(WriteInputs {
            kind: ClipboardKind::Html,
            content: Some("t"),
            html: Some(""),
            rtf: None,
            bmp: None,
        });
        assert_eq!(html, vec![FormatWrite::Unicode("t".into())]);

        let bmp = plan_formats(WriteInputs {
            kind: ClipboardKind::Image,
            content: None,
            html: None,
            rtf: None,
            bmp: Some(empty),
        });
        assert!(bmp.is_empty());
    }

    /// 写一张 3×2 的测试 PNG（含半透明红与全透明像素）到临时文件，返回其路径。
    fn sample_png(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(name);
        let mut img = image::RgbaImage::new(3, 2);
        img.put_pixel(0, 0, image::Rgba([255, 0, 0, 128])); // 半透明红 → 白底合成
        img.put_pixel(1, 0, image::Rgba([0, 255, 0, 0])); // 全透明 → 白底
        img.save(&path).unwrap();
        path
    }

    #[test]
    fn png_to_bmp24_is_classic_24bit_birgb() {
        let path = sample_png("clip-bmp24-src.png");
        let bmp = png_to_bmp24(&path).expect("encode ok");
        assert_eq!(&bmp[0..2], b"BM");
        let dib = 14usize;
        let bi_size = u32::from_le_bytes(bmp[dib..dib + 4].try_into().unwrap());
        assert_eq!(bi_size, 40, "必须是经典 BITMAPINFOHEADER（40 字节）");
        let bit_count = u16::from_le_bytes(bmp[dib + 14..dib + 16].try_into().unwrap());
        assert_eq!(bit_count, 24, "必须 24bpp");
        let compression = u32::from_le_bytes(bmp[dib + 16..dib + 20].try_into().unwrap());
        assert_eq!(compression, 0, "必须 BI_RGB（不得为 BI_BITFIELDS=3）");

        // 仅校验头部无法区分白底合成与裸 `to_rgb8()`：解码回像素逐点断言。
        let decoded = image::load_from_memory(&bmp).expect("decode ok").to_rgba8();
        assert_eq!(decoded.get_pixel(0, 0).0, [255, 127, 127, 255]); // 半透明红 → 白底合成
        assert_eq!(decoded.get_pixel(1, 0).0, [255, 255, 255, 255]); // 全透明 → 白底
        assert_eq!(decoded.get_pixel(2, 1).0, [255, 255, 255, 255]); // 未设置像素（全透明）→ 白底

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn png_to_bmp24_handles_single_pixel_opaque_and_blank_images() {
        // 1×1：最小尺寸与行补齐边界
        let one = std::env::temp_dir().join("clip-bmp24-1x1.png");
        image::RgbaImage::from_pixel(1, 1, image::Rgba([10, 20, 30, 255])).save(&one).unwrap();
        let decoded = image::load_from_memory(&png_to_bmp24(&one).expect("encode 1x1"))
            .expect("decode ok")
            .to_rgba8();
        assert_eq!((decoded.width(), decoded.height()), (1, 1));
        assert_eq!(decoded.get_pixel(0, 0).0, [10, 20, 30, 255]);

        // 全不透明：alpha=255 为恒等变换，逐像素等于原色（不得回归）
        let opaque = std::env::temp_dir().join("clip-bmp24-opaque.png");
        let mut img = image::RgbaImage::new(2, 2);
        img.put_pixel(0, 0, image::Rgba([1, 2, 3, 255]));
        img.put_pixel(1, 1, image::Rgba([200, 100, 50, 255]));
        img.save(&opaque).unwrap();
        let decoded = image::load_from_memory(&png_to_bmp24(&opaque).expect("encode opaque"))
            .expect("decode ok")
            .to_rgba8();
        assert_eq!(decoded.get_pixel(0, 0).0, [1, 2, 3, 255]);
        assert_eq!(decoded.get_pixel(1, 1).0, [200, 100, 50, 255]);

        // 全透明：整图合成到白底
        let blank = std::env::temp_dir().join("clip-bmp24-blank.png");
        image::RgbaImage::from_pixel(2, 2, image::Rgba([0, 0, 0, 0])).save(&blank).unwrap();
        let decoded = image::load_from_memory(&png_to_bmp24(&blank).expect("encode blank"))
            .expect("decode ok")
            .to_rgba8();
        assert!(decoded.pixels().all(|p| p.0 == [255, 255, 255, 255]));

        for p in [one, opaque, blank] {
            let _ = std::fs::remove_file(p);
        }
    }

    /// 系统剪贴板集成测试：验证治缺陷 B 的 `apply` 副作用序列（open → `empty()` 一次 →
    /// 逐格式 NoClear）。需要 Windows 剪贴板，会临时占用系统剪贴板。
    ///
    /// 合并为单个测试：同一 crate 内的测试默认并行，多个剪贴板测试会互相争用全局剪贴板。
    #[ignore = "requires interactive Windows clipboard session (OSError 1418 without one); OS env limitation — run manually with `cargo test -p adl-clipboard -- --ignored`"]
    #[test]
    fn apply_clears_old_formats_but_keeps_all_new_ones() {
        // (1) 多格式共存：Rtf 写入不得抹掉先前写入的 Unicode（默认变体会 EmptyClipboard）。
        apply(&[FormatWrite::Unicode("hello".into()), FormatWrite::Rtf(b"{\\rtf1}".to_vec())])
            .expect("apply multi ok");
        {
            let _clip = Clipboard::new_attempts(10).unwrap();
            let code = register_format("Rich Text Format").unwrap();
            assert!(formats::Unicode.is_format_avail(), "CF_UNICODETEXT 必须仍在");
            assert!(formats::RawData(code.get()).is_format_avail(), "RTF 必须存在");
            let mut text = String::new();
            formats::Unicode.read_clipboard(&mut text).unwrap();
            assert_eq!(text, "hello");
        }

        // (2) 先放入一段文本，再写「仅图片」计划：先前文本必须被 EmptyClipboard 清掉（缺陷 B）。
        clipboard_win::set_clipboard(formats::Unicode, "PREVIOUS").expect("seed clipboard");
        let png = sample_png("clip-apply-clear.png");
        let bmp = png_to_bmp24(&png).unwrap();
        apply(&[FormatWrite::Bitmap(bmp)]).expect("apply bitmap ok");
        {
            let _clip = Clipboard::new_attempts(10).unwrap();
            assert!(!formats::Unicode.is_format_avail(), "先前文本必须已被清空");
            assert!(formats::Bitmap.is_format_avail(), "位图必须已写入");
        }
        let _ = std::fs::remove_file(&png);
    }
}
