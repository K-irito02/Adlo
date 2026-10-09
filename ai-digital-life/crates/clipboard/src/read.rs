//! 系统剪贴板读取与归一化（文本/图片 → `ClipboardItem`，图片转 PNG）。
//!
//! 依赖 Windows 剪贴板 API（通过 `clipboard-win` crate，见 `Cargo.toml`）。
//! 图片优先：`clipboard-win` 的 `formats::Bitmap` 读取结果为完整 BMP 文件字节
//! （`BITMAPFILEHEADER` + `BITMAPINFOHEADER` + BGR 像素）。先用 `image` 解码为
//! `RgbaImage`，再调用 `crate::image::write_image_files` 落盘为 PNG 原图 + 缩略图。
//! 否则退化为文本（`formats::Unicode`），content 存完整文本，空剪贴板返回 `Ok(None)`。

use clipboard_win::{Clipboard, Format, Getter, formats};
use image::RgbaImage;
use std::io::Cursor;
use std::path::Path;
use uuid::Uuid;

use adl_errors::AppError;
use adl_types::now_ms;
use adl_types::types::clipboard::ClipboardItem;

use crate::image::write_image_files;
use crate::store::ClipboardStore;

/// 缩略图最长边。
const THUMB_MAX_SIDE: u32 = 256;

/// 把落盘 PNG 编码为 **经典 24 位 BI_RGB BMP**。
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
        let over_white = |c: u8| ((u32::from(c) * a + 255 * (255 - a)) / 255) as u8;
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

/// 读取系统剪贴板并归一化，同时调用 `store.insert_or_bump` 入库。
///
/// 返回 `Ok(None)` 表示剪贴板为空 / 无图片 / 无文本（无可入库内容）。
/// 返回 `Ok(Some((item, true)))` 表示新条目已入库；`Ok(Some((item, false)))`
/// 表示触发去重合并（覆盖旧行、保旧 id，仅更新时间戳）。`bool` 供调用方决定
/// 是否对外推送 `Some(id)` 事件（Task 6 桌面事件 / Task 7 HTTP 复用）。
pub fn read_current(store: &ClipboardStore) -> Result<Option<(ClipboardItem, bool)>, AppError> {
    // 打开剪贴板并保持期间完成图片 / 文本两条读取路径（Windows 只允许一个持有者）。
    let _clip = Clipboard::new_attempts(5)
        .map_err(|e| AppError::Io(format!("clipboard open failed: {e}")))?;

    if formats::Bitmap.is_format_avail() {
        let mut bmp: Vec<u8> = Vec::new();
        // `read_clipboard` 会产生完整 BMP 字节（header + BGR 像素），为空代表读取失败/无内容。
        if formats::Bitmap.read_clipboard(&mut bmp).is_ok() && !bmp.is_empty() {
            let item = build_image_item(store, &bmp)?;
            let is_new = store.insert_or_bump(&item)?;
            return Ok(Some((item, is_new)));
        }
    }

    if formats::Unicode.is_format_avail() {
        let mut s = String::new();
        // 读 UTF-16 文本（`Unicode` 的 Getter<String>` 或 `Getter<Vec<u8>>` 均可）。
        if formats::Unicode.read_clipboard(&mut s).is_ok() {
            if let Some(text) = normalized_text(&s) {
                let item = build_text_item(store, &text)?;
                let is_new = store.insert_or_bump(&item)?;
                return Ok(Some((item, is_new)));
            }
        }
    }

    Ok(None)
}

/// 文本归一化：去首尾空白；空串 / 纯空白返回 `None`（空剪贴板不入库）。
pub(crate) fn normalized_text(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
}

/// 构造文本类型 `ClipboardItem`（content 存完整文本）。仅负责组装，不落库。
fn build_text_item(store: &ClipboardStore, text: &str) -> Result<ClipboardItem, AppError> {
    let _ = store; // 文本条目不落盘文件，仅占位对齐签名
    Ok(ClipboardItem {
        id: Uuid::new_v4().to_string(),
        kind: "text".into(),
        content: Some(text.to_string()),
        digest: None,
        image_path: None,
        thumb_path: None,
        image_width: None,
        image_height: None,
        html_path: None,
        rtf_path: None,
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

    let (_, _tw, _th) = write_image_files(
        rgba.as_raw(),
        width,
        height,
        &original_path,
        &thumb_path,
        THUMB_MAX_SIDE,
    )?;

    Ok(ClipboardItem {
        id,
        kind: "image".into(),
        content: None,
        digest: Some(digest),
        image_path: Some(original_path.to_string_lossy().into_owned()),
        thumb_path: Some(thumb_path.to_string_lossy().into_owned()),
        image_width: Some(width),
        image_height: Some(height),
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

/// 对解码后像素字节计算 FNV-1a 64-bit 指纹，作为图片内容指纹（用于去重）。
/// 同一张图即使文件名（image_path）每次不同，像素内容相同 → 指纹相同 → 可去重；
/// 不同尺寸/内容 → 指纹不同 → 正确区分。文本条目不使用此函数（digest 为 None）。
fn compute_digest(rgba: &RgbaImage) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in rgba.as_raw() {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
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
        assert_eq!(item.kind, "image");
        assert_eq!(item.image_width, Some(2));
        assert_eq!(item.image_height, Some(2));
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
    fn png_to_bmp24_is_classic_24bit_birgb() {
        let path = std::env::temp_dir().join("clip-bmp24-src.png");
        let mut img = image::RgbaImage::new(3, 2);
        img.put_pixel(0, 0, image::Rgba([255, 0, 0, 128])); // 半透明红 → 应合成到白底
        img.put_pixel(1, 0, image::Rgba([0, 255, 0, 0])); // 全透明 → 白底
        img.save(&path).unwrap();

        let bmp = png_to_bmp24(&path).expect("encode ok");
        assert_eq!(&bmp[0..2], b"BM");
        let dib = 14usize;
        let bi_size = u32::from_le_bytes(bmp[dib..dib + 4].try_into().unwrap());
        assert_eq!(bi_size, 40, "必须是经典 BITMAPINFOHEADER（40 字节）");
        let bit_count = u16::from_le_bytes(bmp[dib + 14..dib + 16].try_into().unwrap());
        assert_eq!(bit_count, 24, "必须 24bpp");
        let compression = u32::from_le_bytes(bmp[dib + 16..dib + 20].try_into().unwrap());
        assert_eq!(compression, 0, "必须 BI_RGB（不得为 BI_BITFIELDS=3）");

        // 断言合成结果：仅校验头部无法区分白底合成与裸 `to_rgb8()`。
        // 解码回像素，透明区必须为白、半透明红必须按公式合成（整数除法截断）。
        let decoded = image::load_from_memory(&bmp).expect("decode ok").to_rgba8();
        assert_eq!(decoded.get_pixel(0, 0).0, [255, 127, 127, 255]); // 半透明红 → 白底合成
        assert_eq!(decoded.get_pixel(1, 0).0, [255, 255, 255, 255]); // 全透明 → 白底

        let _ = std::fs::remove_file(&path);
    }
}
