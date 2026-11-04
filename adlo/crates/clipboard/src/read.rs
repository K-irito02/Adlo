//! 系统剪贴板读取与归一化（图片 / HTML / RTF / 文本 → `ClipboardItem`）。
//!
//! 依赖 Windows 剪贴板 API（通过 `clipboard-win` crate，见 `Cargo.toml`）。
//! 主类型优先级固定为 `image > html > rtf > text`：
//! - `image`（`formats::Bitmap`）：读取结果为完整 BMP 文件字节（`BITMAPFILEHEADER` +
//!   `BITMAPINFOHEADER` + BGR 像素），先用 `image` 解码为 `RgbaImage`，再调用
//!   `crate::image::write_image_files` 落盘为 PNG 原图 + 缩略图。
//! - `html`（`formats::Html`，注册格式 "HTML Format"）：其 Getter 自动剥离 CF_HTML 头，原文落盘 sidecar。
//! - `rtf`（注册格式 "Rich Text Format"，无内建类型 → `formats::RawData` 读原始字节）：落盘 sidecar。
//! - `text`（`formats::Unicode`）：去首尾空白后内联 `content`。
//!
//! 富载荷（HTML / RTF）超过 `MAX_RICH_PAYLOAD_BYTES` 时不落盘，条目降级为 `text`（无纯文本则不入库）。
//! 空剪贴板返回 `Ok(None)`。

use clipboard_win::{Clipboard, Format, Getter, formats, raw, register_format};
use image::RgbaImage;
use uuid::Uuid;

use adl_errors::AppError;
use adl_types::now_ms;
use adl_types::types::clipboard::{ClipboardItem, ClipboardKind};

use crate::image::write_image_files;
use crate::store::ClipboardStore;

/// 缩略图最长边。
const THUMB_MAX_SIDE: u32 = 256;

/// 富文本（HTML / RTF）载荷体积上限：超限则不落盘富载荷、降级为纯文本。
const MAX_RICH_PAYLOAD_BYTES: usize = 1024 * 1024;

/// 依据各格式是否存在选出主类型。优先级：`image > html > rtf > text`。
pub(crate) fn pick_kind(
    has_image: bool,
    has_html: bool,
    has_rtf: bool,
    has_text: bool,
) -> Option<ClipboardKind> {
    if has_image {
        Some(ClipboardKind::Image)
    } else if has_html {
        Some(ClipboardKind::Html)
    } else if has_rtf {
        Some(ClipboardKind::Rtf)
    } else if has_text {
        Some(ClipboardKind::Text)
    } else {
        None
    }
}

/// 读取前判断剪贴板中该格式的载荷是否在富文本上限内。
///
/// `raw::size` 在格式存在时返回 `GlobalSize`（格式不存在 / 句柄不可锁则 `None`）；调用前
/// 已用 `is_format_avail()` 确认存在，故尺寸未知一律按超限处理（跳过读取，宁缺勿 OOM）——
/// 避免把超限载荷整体读入内存后才丢弃。
fn within_rich_cap(code: u32) -> bool {
    raw::size(code).is_some_and(|n| n.get() <= MAX_RICH_PAYLOAD_BYTES)
}

/// 读取系统剪贴板并归一化，同时调用 `store.insert_or_bump` 入库。
///
/// 返回 `Ok(None)` 表示剪贴板为空 / 无图片 / 无文本（无可入库内容）。
/// 返回 `Ok(Some((item, true)))` 表示新条目已入库；`Ok(Some((item, false)))`
/// 表示触发去重合并（覆盖旧行、保旧 id，仅更新时间戳）。`bool` 供调用方决定
/// 是否对外推送 `Some(id)` 事件（Task 6 桌面事件 / Task 7 HTTP 复用）。
pub fn read_current(store: &ClipboardStore) -> Result<Option<(ClipboardItem, bool)>, AppError> {
    // 打开剪贴板并保持期间完成全部格式读取（Windows 只允许一个持有者）。
    let _clip = Clipboard::new_attempts(5)
        .map_err(|e| AppError::Io(format!("clipboard open failed: {e}")))?;

    // 1) 图片（CF_BITMAP / CF_DIB）
    let mut bmp: Vec<u8> = Vec::new();
    let has_image = formats::Bitmap.is_format_avail()
        && formats::Bitmap.read_clipboard(&mut bmp).is_ok()
        && !bmp.is_empty();

    // 图片胜出时其余格式不会被消费（`build_image_item` 只落盘位图，`content` 为 None），
    // 故直接跳过 HTML/RTF/文本的读取，避免每次复制图片都额外读入可达 1 MiB 的富载荷。
    let (html, rtf, text) = if has_image {
        (None, None, None)
    } else {
        // 2) HTML（"HTML Format" 注册格式，Getter<String> 自动剥离 CF_HTML 头）
        // 读取前用 `raw::size` 预检尺寸：超限直接跳过，避免把超限载荷整体读入内存后才丢弃。
        // 注意：此处把「HTML 缺失」与「HTML 超限」一并视为「HTML 不可用」，故超限时若 RTF 可用
        // 或纯文本存在，会**择优**保留可用格式（而非一律降级为 text）——这是有意取舍。
        let html = formats::Html::new().and_then(|fmt| {
            if !fmt.is_format_avail() || !within_rich_cap(fmt.code()) {
                return None;
            }
            let mut s = String::new();
            if fmt.read_clipboard(&mut s).is_ok() && !s.trim().is_empty() { Some(s) } else { None }
        });

        // 3) RTF（"Rich Text Format"，无内建类型 → 注册后按原始字节读）。
        // HTML 可用时 RTF 恒不会被消费（kind 固定为 html，只落盘与 kind 匹配的载荷），故仅在
        // HTML 缺失（或读后为空白）时才读取，避免多读一份可达 1 MiB 的载荷。
        let rtf = if html.is_none() {
            register_format("Rich Text Format").and_then(|code| {
                let fmt = formats::RawData(code.get());
                if !fmt.is_format_avail() || !within_rich_cap(code.get()) {
                    return None;
                }
                let mut bytes: Vec<u8> = Vec::new();
                if fmt.read_clipboard(&mut bytes).is_ok() && !bytes.is_empty() {
                    Some(bytes)
                } else {
                    None
                }
            })
        } else {
            None
        };

        // 4) 纯文本
        let mut text_raw = String::new();
        let text = if formats::Unicode.is_format_avail()
            && formats::Unicode.read_clipboard(&mut text_raw).is_ok()
        {
            normalized_text(&text_raw)
        } else {
            None
        };

        (html, rtf, text)
    };

    let kind = match pick_kind(has_image, html.is_some(), rtf.is_some(), text.is_some()) {
        Some(k) => k,
        None => return Ok(None),
    };

    let item = if kind == ClipboardKind::Image {
        build_image_item(store, &bmp)?
    } else {
        build_rich_or_text_item(store, kind, text, html, rtf)?
    };
    // 条目引用的 sidecar / 图片文件在组装时已落盘；入库失败则回滚删除刚写入的文件，
    // 避免留下无任何行引用的孤儿文件。
    let is_new = match store.insert_or_bump(&item) {
        Ok(v) => v,
        Err(e) => {
            store.delete_files(&item);
            return Err(e);
        },
    };
    Ok(Some((item, is_new)))
}

/// 文本归一化：去首尾空白；空串 / 纯空白返回 `None`（空剪贴板不入库）。
pub(crate) fn normalized_text(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
}

/// 组装 text / html / rtf 条目：纯文本内联 `content`，富载荷落盘 sidecar。
///
/// 仅落盘与所选 `kind` 匹配的富载荷（`html` 只写 HTML，`rtf` 只写 RTF），
/// 另一格式即便剪贴板同时存在也不持久化（写回只消费主类型）。
fn build_rich_or_text_item(
    store: &ClipboardStore,
    kind: ClipboardKind,
    text: Option<String>,
    html: Option<String>,
    rtf: Option<Vec<u8>>,
) -> Result<ClipboardItem, AppError> {
    let id = Uuid::new_v4().to_string();
    // 富载荷指纹：去重键需覆盖载荷本身——html/rtf 的纯文本可能相同、甚至缺失（生产者未写
    // CF_UNICODETEXT），仅比较 `content` 会把不同的富内容在时间窗内误判为重复而静默合并。
    // 该指纹在捕获时计算；文本侧编辑（`POST /clipboard/update`）不动它
    // （注意去重三元组另含 `content`，详见 `update` 注释：改后再次捕获同 HTML 会新建一行）。
    let digest = match kind {
        ClipboardKind::Html => html.as_deref().map(|h| fnv1a_digest(h.as_bytes())),
        ClipboardKind::Rtf => rtf.as_deref().map(fnv1a_digest),
        ClipboardKind::Text | ClipboardKind::Image => None,
    };
    // 下方两个 `(kind, Option)` 元组 match 的 `_` 臂是**有意保留**的防御性兜底：
    // 兜住「kind 与载荷不匹配」的非法组合（如 kind=html 却无 HTML 载荷）。新增枚举成员
    // 时必须同步在此显式扩展其载荷落盘分支，而不是依赖 `_`。
    let html_path = match (kind, html.as_deref()) {
        (ClipboardKind::Html, Some(h)) => {
            let p = store.html_dir().join(format!("{id}.html"));
            std::fs::write(&p, h).map_err(|e| AppError::Io(format!("html write: {e}")))?;
            Some(p.to_string_lossy().into_owned())
        },
        _ => None,
    };
    let rtf_path = match (kind, rtf.as_deref()) {
        (ClipboardKind::Rtf, Some(r)) => {
            let p = store.rtf_dir().join(format!("{id}.rtf"));
            std::fs::write(&p, r).map_err(|e| AppError::Io(format!("rtf write: {e}")))?;
            Some(p.to_string_lossy().into_owned())
        },
        _ => None,
    };
    Ok(ClipboardItem {
        id,
        kind,
        content: text,
        digest,
        image_path: None,
        thumb_path: None,
        image_width: None,
        image_height: None,
        image_bytes: None,
        html_path,
        rtf_path,
        source_app: None,
        created_at: now_ms(),
    })
}

/// 构造图片类型 `ClipboardItem`：解码 BMP → `RgbaImage` → 落盘 PNG 原图 + 缩略图。
/// 仅负责组装与落盘，返回后由调用方 `insert_or_bump`。
fn build_image_item(store: &ClipboardStore, bmp: &[u8]) -> Result<ClipboardItem, AppError> {
    let rgba = bitmap_to_rgba(bmp)?;
    let (width, height) = (rgba.width(), rgba.height());
    let digest = compute_digest(&rgba);

    let id = Uuid::new_v4().to_string();
    let original_path = store.images_dir().join(format!("{id}.png"));
    let thumb_path = store.thumbs_dir().join(format!("thumb-{id}.png"));

    let (bytes, _tw, _th) = write_image_files(
        rgba.as_raw(),
        width,
        height,
        &original_path,
        &thumb_path,
        THUMB_MAX_SIDE,
    )?;

    Ok(ClipboardItem {
        id,
        kind: ClipboardKind::Image,
        content: None,
        digest: Some(digest),
        image_path: Some(original_path.to_string_lossy().into_owned()),
        thumb_path: Some(thumb_path.to_string_lossy().into_owned()),
        image_width: Some(width),
        image_height: Some(height),
        image_bytes: Some(bytes),
        html_path: None,
        rtf_path: None,
        source_app: None,
        created_at: now_ms(),
    })
}

/// 把 `clipboard-win` 的 `Bitmap` Getter 产出的完整 BMP 字节解码为 `RgbaImage`。
/// 依赖 `image` 的 `bmp` 特性，正确处理 24/32 bpp 及调色板、bottom-up 布局与 BGR 通道序。
pub(crate) fn bitmap_to_rgba(bmp: &[u8]) -> Result<RgbaImage, AppError> {
    let img = image::load_from_memory(bmp).map_err(|e| AppError::Io(format!("bmp decode: {e}")))?;
    Ok(img.to_rgba8())
}

/// FNV-1a 64-bit 内容指纹（十六进制串）。
fn fnv1a_digest(bytes: &[u8]) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

/// 图片内容指纹（对解码后像素字节计算）。同一张图即使 `image_path` 每次不同，
/// 像素内容相同 → 指纹相同 → 可去重；不同尺寸/内容 → 指纹不同 → 正确区分。
fn compute_digest(rgba: &RgbaImage) -> String {
    fnv1a_digest(rgba.as_raw())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::ImageBuffer;

    /// 手工构造一张 2x2 的 24-bit BI_RGB BMP（BITMAPFILEHEADER + BITMAPINFOHEADER + BGR 像素，
    /// bottom-up 布局，行按 4 字节对齐）。
    ///
    /// 目标图像（视觉，RGB）：
    ///   Row0: 左上 RED [255,0,0]   右上 GREEN [0,255,0]
    ///   Row1: 左下 BLUE [0,0,255]  右下 WHITE [255,255,255]
    fn sample_bmp() -> Vec<u8> {
        let width = 2i32;
        let height = 2i32;
        let bpp: u16 = 24;
        let row_size = ((width * bpp as i32 + 31) / 32 * 4) as usize; // 8 bytes/row
        let pixel_size = row_size * height as usize;
        let header_size = 40u32;
        let file_header_size = 14u32;
        let file_size = file_header_size + header_size + pixel_size as u32;

        let mut bmp = Vec::new();
        bmp.extend_from_slice(b"BM");
        bmp.extend_from_slice(&file_size.to_le_bytes());
        bmp.extend_from_slice(&0u32.to_le_bytes()); // reserved
        bmp.extend_from_slice(&(file_header_size + header_size).to_le_bytes()); // data offset

        bmp.extend_from_slice(&header_size.to_le_bytes());
        bmp.extend_from_slice(&width.to_le_bytes());
        bmp.extend_from_slice(&height.to_le_bytes());
        bmp.extend_from_slice(&1u16.to_le_bytes()); // planes
        bmp.extend_from_slice(&bpp.to_le_bytes());
        bmp.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
        bmp.extend_from_slice(&(pixel_size as u32).to_le_bytes()); // sizeImage
        bmp.extend_from_slice(&2835i32.to_le_bytes()); // XPels
        bmp.extend_from_slice(&2835i32.to_le_bytes()); // YPels
        bmp.extend_from_slice(&0u32.to_le_bytes()); // clrUsed
        bmp.extend_from_slice(&0u32.to_le_bytes()); // clrImportant

        // BGR 字节序 [B,G,R]，bottom-up：先存最底行（Row1），后存顶行（Row0）。
        let stored: Vec<Vec<[u8; 3]>> = vec![
            // stored bottom row = 视觉 Row1：BLUE(0,0,255)→[255,0,0]，WHITE→[255,255,255]
            vec![[255, 0, 0], [255, 255, 255]],
            // stored top row = 视觉 Row0：RED(255,0,0)→[0,0,255]，GREEN(0,255,0)→[0,255,0]
            vec![[0, 0, 255], [0, 255, 0]],
        ];
        for row in stored {
            for px in row {
                bmp.extend_from_slice(&px); // B, G, R
            }
            // 每行补到 4 字节对齐（24bpp 行长为 width*3，2x2 时补 2 字节）。
            let per_row_bytes = (width as usize) * 3;
            let pad_len = row_size - per_row_bytes;
            if pad_len > 0 {
                bmp.extend(std::iter::repeat_n(0u8, pad_len));
            }
        }
        bmp
    }

    #[test]
    fn bitmap_to_rgba_decodes_bgr_bottom_up() {
        let bmp = sample_bmp();
        let rgba = bitmap_to_rgba(&bmp).expect("decode ok");
        assert_eq!((rgba.width(), rgba.height()), (2, 2));
        assert_eq!(rgba.get_pixel(0, 0).0, [255, 0, 0, 255]); // 左上 RED
        assert_eq!(rgba.get_pixel(1, 0).0, [0, 255, 0, 255]); // 右上 GREEN
        assert_eq!(rgba.get_pixel(0, 1).0, [0, 0, 255, 255]); // 左下 BLUE
        assert_eq!(rgba.get_pixel(1, 1).0, [255, 255, 255, 255]); // 右下 WHITE
    }

    #[test]
    fn normalized_text_trims_and_rejects_empty() {
        assert_eq!(normalized_text("  hello  ").as_deref(), Some("hello"));
        assert_eq!(normalized_text("\n\t "), None);
        assert_eq!(normalized_text(""), None);
        assert_eq!(normalized_text("a\n\nb").as_deref(), Some("a\n\nb"));
    }

    #[test]
    fn write_image_via_build_image_item_persists_png() {
        let bmp = sample_bmp();
        // 构建最小 store：仅用于拿到 images/thumbs 目录，落盘后校验存在
        let db_path = std::env::temp_dir().join("clip-read-test.db");
        let _ = std::fs::remove_file(&db_path);
        let db = adl_storage::Database::open(&db_path).unwrap();
        db.init_schema().unwrap();
        let data_dir = std::env::temp_dir().join("clip-read-data");
        let _ = std::fs::remove_dir_all(&data_dir);
        let store = ClipboardStore::new(db, &data_dir);

        let item = build_image_item(&store, &bmp).expect("build image ok");
        assert_eq!(item.kind, ClipboardKind::Image);
        assert_eq!(item.image_width, Some(2));
        assert_eq!(item.image_height, Some(2));
        // 原图字节数必须接线到 image_bytes（来自 write_image_files 的返回值）
        assert!(item.image_bytes.is_some_and(|b| b > 0));
        assert!(item.digest.is_some());
        let orig = std::path::Path::new(item.image_path.as_deref().unwrap());
        let thumb = std::path::Path::new(item.thumb_path.as_deref().unwrap());
        assert!(orig.exists());
        assert!(thumb.exists());

        let _ = std::fs::remove_dir_all(&data_dir);
        let _ = std::fs::remove_file(&db_path);
    }

    #[test]
    fn compute_digest_distinguishes_content() {
        let a: RgbaImage = ImageBuffer::from_raw(2, 2, vec![0u8; 16]).unwrap();
        let mut b: RgbaImage = ImageBuffer::from_raw(2, 2, vec![0u8; 16]).unwrap();
        b.get_pixel_mut(0, 0).0 = [255, 0, 0, 255];
        assert_eq!(compute_digest(&a), compute_digest(&a));
        assert_ne!(compute_digest(&a), compute_digest(&b));
        assert!(!compute_digest(&a).is_empty());
    }

    #[test]
    fn rgba_image_type_is_importable() {
        // 编译期确认 RgbaImage 类型可被 `image` 0.25 稳定导入（防未来 API 漂移）。
        let rgba: RgbaImage = ImageBuffer::new(1, 1);
        assert_eq!(rgba.width(), 1);
    }

    #[test]
    fn pick_kind_follows_precedence() {
        assert_eq!(pick_kind(true, true, true, true), Some(ClipboardKind::Image));
        assert_eq!(pick_kind(false, true, true, true), Some(ClipboardKind::Html));
        assert_eq!(pick_kind(false, false, true, true), Some(ClipboardKind::Rtf));
        assert_eq!(pick_kind(false, false, false, true), Some(ClipboardKind::Text));
        assert_eq!(pick_kind(false, false, false, false), None);
    }

    #[test]
    fn rich_payload_cap_is_one_mib() {
        assert_eq!(MAX_RICH_PAYLOAD_BYTES, 1024 * 1024);
    }

    #[test]
    fn rich_payload_digest_covers_payload_not_just_text() {
        // 纯文本相同、富载荷不同的两条 html：digest 必须不同，否则时间窗内会被去重静默合并。
        let db_path = std::env::temp_dir().join("clip-rich-digest.db");
        let _ = std::fs::remove_file(&db_path);
        let db = adl_storage::Database::open(&db_path).unwrap();
        db.init_schema().unwrap();
        let data_dir = std::env::temp_dir().join("clip-rich-digest-data");
        let _ = std::fs::remove_dir_all(&data_dir);
        let store = ClipboardStore::new(db, &data_dir);

        let a = build_rich_or_text_item(
            &store,
            ClipboardKind::Html,
            Some("same".into()),
            Some("<b>a</b>".into()),
            None,
        )
        .unwrap();
        let b = build_rich_or_text_item(
            &store,
            ClipboardKind::Html,
            Some("same".into()),
            Some("<b>b</b>".into()),
            None,
        )
        .unwrap();
        assert!(a.digest.is_some(), "html 条目必须带载荷指纹");
        assert_ne!(a.digest, b.digest, "不同富载荷的指纹必须不同");

        // rtf 同样按载荷而非纯文本取指纹
        let c = build_rich_or_text_item(
            &store,
            ClipboardKind::Rtf,
            None,
            None,
            Some(b"{\\rtf1 a}".to_vec()),
        )
        .unwrap();
        let d = build_rich_or_text_item(
            &store,
            ClipboardKind::Rtf,
            None,
            None,
            Some(b"{\\rtf1 b}".to_vec()),
        )
        .unwrap();
        assert_ne!(c.digest, d.digest);
        // 纯文本条目仍不携带指纹（沿用原有语义）
        let e = build_rich_or_text_item(&store, ClipboardKind::Text, Some("t".into()), None, None)
            .unwrap();
        assert!(e.digest.is_none());

        let _ = std::fs::remove_dir_all(&data_dir);
        let _ = std::fs::remove_file(&db_path);
    }
}
