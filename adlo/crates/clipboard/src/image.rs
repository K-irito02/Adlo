use std::path::Path;

use adl_errors::AppError;

/// 把位图 RGBA 数据保存为 PNG 原图与缩略图（最长边 max_side）。
/// 返回 (原图字节数, 缩略图宽, 缩略图高)。
pub fn write_image_files(
    rgba: &[u8],
    width: u32,
    height: u32,
    original_path: &Path,
    thumb_path: &Path,
    max_side: u32,
) -> Result<(u64, u32, u32), AppError> {
    let img = image::RgbaImage::from_raw(width, height, rgba.to_vec())
        .ok_or_else(|| AppError::Internal("invalid image buffer".into()))?;
    img.save(original_path).map_err(|e| AppError::Io(e.to_string()))?;

    let (tw, th) = if width.max(height) > max_side {
        let scale = max_side as f32 / width.max(height) as f32;
        (((width as f32 * scale) as u32).max(1), ((height as f32 * scale) as u32).max(1))
    } else {
        (width, height)
    };
    let thumb = image::imageops::resize(&img, tw, th, image::imageops::FilterType::Triangle);
    thumb.save(thumb_path).map_err(|e| AppError::Io(e.to_string()))?;
    let bytes = std::fs::metadata(original_path).map_err(|e| AppError::Io(e.to_string()))?.len();
    Ok((bytes, tw, th))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn writes_png_and_thumbnail() {
        let dir = temp_dir();
        let orig = dir.join("clip-img-test.png");
        let thumb = dir.join("clip-thumb-test.png");
        let rgba = vec![0u8; 64 * 48 * 4];
        let (bytes, tw, th) = write_image_files(&rgba, 64, 48, &orig, &thumb, 32).unwrap();
        assert!(bytes > 0);
        assert!(orig.exists());
        assert!(thumb.exists());
        assert_eq!(tw, 32);
        assert_eq!(th, 24);
        let _ = std::fs::remove_file(&orig);
        let _ = std::fs::remove_file(&thumb);
    }
}
