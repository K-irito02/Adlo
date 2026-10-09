use std::path::{Path, PathBuf};

use adl_errors::AppError;
use adl_storage::{Database, EntityTable};
use adl_types::types::clipboard::ClipboardItem;

pub struct ClipboardStore {
    db: Database,
    images_dir: PathBuf,
    thumbs_dir: PathBuf,
    html_dir: PathBuf,
    rtf_dir: PathBuf,
}

impl ClipboardStore {
    pub fn new(db: Database, clipboard_dir: impl Into<PathBuf>) -> Self {
        let clipboard_dir = clipboard_dir.into();
        let images_dir = clipboard_dir.join("images");
        let thumbs_dir = clipboard_dir.join("thumbs");
        let html_dir = clipboard_dir.join("html");
        let rtf_dir = clipboard_dir.join("rtf");
        std::fs::create_dir_all(&images_dir).ok();
        std::fs::create_dir_all(&thumbs_dir).ok();
        std::fs::create_dir_all(&html_dir).ok();
        std::fs::create_dir_all(&rtf_dir).ok();
        Self { db, images_dir, thumbs_dir, html_dir, rtf_dir }
    }

    pub fn list(&self, limit: usize) -> Result<Vec<ClipboardItem>, AppError> {
        self.db.list_entities_with_limit(EntityTable::ClipboardItems, limit)
    }

    /// 按 id 加载单条剪贴板条目（不存在返回 `None`）。
    pub fn get(&self, id: &str) -> Result<Option<ClipboardItem>, AppError> {
        self.db.load_entity(EntityTable::ClipboardItems, id)
    }

    pub fn latest(&self) -> Result<Option<ClipboardItem>, AppError> {
        Ok(self.list(1)?.into_iter().next())
    }

    /// 原地覆盖一条已有条目（保持其 `created_at`，仅供编辑保存使用）。
    pub fn save(&self, item: &ClipboardItem) -> Result<(), AppError> {
        self.db.save_entity(
            EntityTable::ClipboardItems,
            &item.id,
            None,
            None,
            Some(&item.kind),
            item,
        )
    }

    pub fn insert_or_bump(&self, item: &ClipboardItem) -> Result<bool, AppError> {
        if let Some(prev) = self.latest()? {
            // 去重：同 kind 且内容/指纹相同 + 时间窗内即判定重复。
            // 文本比较 content；图片每次复制文件名不同（image_path 恒变），
            // 故按像素指纹 digest 比较，同一张图可正确去重。
            if prev.kind == item.kind
                && prev.content == item.content
                && prev.digest == item.digest
                && (item.created_at.saturating_sub(prev.created_at)) <= 3000
            {
                // 去重命中：旧条目被 merged 顶替，先删除旧条目引用的图片文件，
                // 避免其成为孤儿文件（新条目 image_path 每次复制都不同）。
                // 覆盖旧行：保留旧行 id，避免同内容累积为新行导致去重失效
                let mut merged = item.clone();
                merged.id = prev.id.clone();
                self.save(&merged)?;
                // 落库成功后再删除旧条目引用的文件：顺序反了会在 save 失败时删掉仍被旧行引用的文件。
                self.delete_files(&prev);
                return Ok(false);
            }
        }
        self.save(item)?;
        Ok(true)
    }

    pub fn remove(&self, id: &str) -> Result<bool, AppError> {
        if let Some(item) = self.db.load_entity::<ClipboardItem>(EntityTable::ClipboardItems, id)? {
            self.delete_files(&item);
        }
        self.db.delete_entity(EntityTable::ClipboardItems, id)
    }

    pub fn clear(&self) -> Result<usize, AppError> {
        let n = self.db.clear_entity_table(EntityTable::ClipboardItems)?;
        if let Ok(rd) = std::fs::read_dir(&self.images_dir) {
            for e in rd.flatten() {
                let _ = std::fs::remove_file(e.path());
            }
        }
        if let Ok(rd) = std::fs::read_dir(&self.thumbs_dir) {
            for e in rd.flatten() {
                let _ = std::fs::remove_file(e.path());
            }
        }
        for dir in [&self.html_dir, &self.rtf_dir] {
            if let Ok(rd) = std::fs::read_dir(dir) {
                for e in rd.flatten() {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
        Ok(n)
    }

    /// 删除条目引用的落盘文件（不存在则忽略）。供读取管线在入库失败时回滚刚写入的
    /// sidecar / 图片，避免留下无任何行引用的孤儿文件。
    pub(crate) fn delete_item_files(&self, item: &ClipboardItem) {
        self.delete_files(item);
    }

    fn delete_files(&self, item: &ClipboardItem) {
        for p in [&item.image_path, &item.thumb_path, &item.html_path, &item.rtf_path]
            .into_iter()
            .flatten()
        {
            let _ = std::fs::remove_file(Path::new(p));
        }
    }

    pub fn images_dir(&self) -> &Path {
        &self.images_dir
    }
    pub fn thumbs_dir(&self) -> &Path {
        &self.thumbs_dir
    }
    pub fn html_dir(&self) -> &Path {
        &self.html_dir
    }
    pub fn rtf_dir(&self) -> &Path {
        &self.rtf_dir
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::now_ms;
    use std::env::temp_dir;

    fn temp_store(name: &str) -> ClipboardStore {
        let db_path = temp_dir().join(format!("clip-{name}.db"));
        let _ = std::fs::remove_file(&db_path);
        let db = Database::open(&db_path).unwrap();
        db.init_schema().unwrap();
        let dir = temp_dir().join(format!("clip-data-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        ClipboardStore::new(db, &dir)
    }

    fn item(id: &str, kind: &str, created_at: i64) -> ClipboardItem {
        ClipboardItem {
            id: id.into(),
            kind: kind.into(),
            content: Some(format!("content-{id}")),
            digest: None,
            image_path: None,
            thumb_path: None,
            image_width: None,
            image_height: None,
            image_bytes: None,
            html_path: None,
            rtf_path: None,
            source_app: None,
            created_at,
        }
    }

    #[test]
    fn new_uses_clipboard_dir_directly() {
        // `new` 接收的已是分类目录本身（engine 传入 `storage.paths().clipboard_dir`），
        // 不得再拼接 "clipboard"：统一模式下图片必须落在 `<root>/clipboard/images`。
        let db_path = temp_dir().join("clip-layout.db");
        let _ = std::fs::remove_file(&db_path);
        let db = Database::open(&db_path).unwrap();
        db.init_schema().unwrap();
        let dir = temp_dir().join("clip-layout");
        let _ = std::fs::remove_dir_all(&dir);
        let store = ClipboardStore::new(db, &dir);
        assert_eq!(store.images_dir().to_path_buf(), dir.join("images"));
        assert_eq!(store.thumbs_dir().to_path_buf(), dir.join("thumbs"));
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(&db_path);
    }

    #[test]
    fn insert_list_remove_clear() {
        let store = temp_store("crud");
        assert!(store.insert_or_bump(&item("1", "text", now_ms())).unwrap());
        assert!(store.insert_or_bump(&item("2", "text", now_ms() + 100)).unwrap());
        assert_eq!(store.list(10).unwrap().len(), 2);
        assert!(store.remove("1").unwrap());
        assert_eq!(store.list(10).unwrap().len(), 1);
        assert_eq!(store.clear().unwrap(), 1);
        assert_eq!(store.list(10).unwrap().len(), 0);
        let _ = std::fs::remove_dir_all(temp_dir().join("clip-data-crud"));
        let _ = std::fs::remove_file(temp_dir().join("clip-crud.db"));
    }

    #[test]
    fn image_remove_clear_deletes_files() {
        let store = temp_store("image");
        // 用 write_image_files 生成两张真实 PNG（原图 + 缩略图）
        let orig = store.images_dir().join("img-1.png");
        let thumb = store.thumbs_dir().join("thumb-1.png");
        let rgba = vec![0xFFu8; 32 * 24 * 4];
        crate::image::write_image_files(&rgba, 32, 24, &orig, &thumb, 16).unwrap();
        assert!(orig.exists());
        assert!(thumb.exists());

        let mut im = item("img-1", "image", now_ms());
        im.image_path = Some(orig.to_string_lossy().into_owned());
        im.thumb_path = Some(thumb.to_string_lossy().into_owned());
        assert!(store.insert_or_bump(&im).unwrap());
        assert!(store.list(10).unwrap().len() == 1);

        // remove 后物理文件应被删除
        assert!(store.remove("img-1").unwrap());
        assert!(!orig.exists());
        assert!(!thumb.exists());
        assert_eq!(store.list(10).unwrap().len(), 0);

        // 重新写入两张图，clear 后 images/thumbs 目录文件应被清空
        let orig2 = store.images_dir().join("img-2.png");
        let thumb2 = store.thumbs_dir().join("thumb-2.png");
        crate::image::write_image_files(&rgba, 32, 24, &orig2, &thumb2, 16).unwrap();
        let mut im2 = item("img-2", "image", now_ms());
        im2.image_path = Some(orig2.to_string_lossy().into_owned());
        im2.thumb_path = Some(thumb2.to_string_lossy().into_owned());
        assert!(store.insert_or_bump(&im2).unwrap());
        assert_eq!(store.clear().unwrap(), 1);
        assert!(std::fs::read_dir(store.images_dir()).unwrap().next().is_none());
        assert!(std::fs::read_dir(store.thumbs_dir()).unwrap().next().is_none());

        let _ = std::fs::remove_dir_all(temp_dir().join("clip-data-image"));
        let _ = std::fs::remove_file(temp_dir().join("clip-image.db"));
    }

    #[test]
    fn dedup_consecutive_same_content() {
        let store = temp_store("dedup");
        assert!(store.insert_or_bump(&item("1", "text", now_ms())).unwrap());
        // 模拟真实读取：内容相同但每次生成新 id，紧邻时间 → 判定重复，覆盖旧行
        let mut dup = item("2", "text", now_ms() + 1);
        dup.content = Some("content-1".into());
        assert!(!store.insert_or_bump(&dup).unwrap());
        let rows = store.list(10).unwrap();
        assert_eq!(rows.len(), 1);
        // 覆盖旧行生效：保留首次插入的 id（"1"），而非新 id（"2"）
        assert_eq!(rows[0].id, "1");
        let _ = std::fs::remove_dir_all(temp_dir().join("clip-data-dedup"));
        let _ = std::fs::remove_file(temp_dir().join("clip-dedup.db"));
    }

    #[test]
    fn dedup_image_by_digest_ignores_path() {
        let store = temp_store("img-dedup");
        let now = now_ms();
        // 同一张图：image_path（文件名/UUID）每次都不同，但像素 digest 相同 + 时间窗内 → 重复
        // 为 path-1 造真实物理文件，用于后续断言去重顶替后已被删除
        let path1 = store.images_dir().join("path-1.png");
        std::fs::write(&path1, b"png-1-bytes").unwrap();
        assert!(path1.exists());
        let mut img1 = item("img-1", "image", now);
        img1.content = None;
        img1.digest = Some("deadbeef".into());
        img1.image_path = Some(path1.to_string_lossy().into_owned());
        assert!(store.insert_or_bump(&img1).unwrap());

        // 为 path-2 造真实物理文件（merged 引用的新文件，去重后应保留）
        let path2 = store.images_dir().join("path-2.png");
        std::fs::write(&path2, b"png-2-bytes").unwrap();
        let mut img2 = item("img-2", "image", now + 1);
        img2.content = None;
        img2.digest = Some("deadbeef".into());
        img2.image_path = Some("path-2.png".into());
        assert!(!store.insert_or_bump(&img2).unwrap());
        let rows = store.list(10).unwrap();
        assert_eq!(rows.len(), 1);
        // 覆盖旧行生效：保留首次插入 id，内容用新条目（含新的 image_path）
        assert_eq!(rows[0].id, "img-1");
        assert_eq!(rows[0].image_path.as_deref(), Some("path-2.png"));
        // 旧条目的物理文件在去重顶替时已被删除，避免孤儿文件累积
        assert!(!path1.exists());
        // merged 引用的新文件保留，不被误删
        assert!(path2.exists());

        // 不同 digest 的同 kind 图片 → 判定为新条目
        let mut img3 = item("img-3", "image", now + 2);
        img3.content = None;
        img3.digest = Some("cafebabe".into());
        img3.image_path = Some("path-3.png".into());
        assert!(store.insert_or_bump(&img3).unwrap());
        assert_eq!(store.list(10).unwrap().len(), 2);

        let _ = std::fs::remove_dir_all(temp_dir().join("clip-data-img-dedup"));
        let _ = std::fs::remove_file(temp_dir().join("clip-img-dedup.db"));
    }

    #[test]
    fn html_rtf_dirs_created_and_cleaned() {
        let store = temp_store("richtext");
        assert_eq!(
            store.html_dir().to_path_buf(),
            temp_dir().join("clip-data-richtext").join("html")
        );
        assert!(store.html_dir().exists());
        assert!(store.rtf_dir().exists());

        let hp = store.html_dir().join("a.html");
        let rp = store.rtf_dir().join("a.rtf");
        std::fs::write(&hp, b"<b>x</b>").unwrap();
        std::fs::write(&rp, b"{\\rtf1}").unwrap();
        let mut it = item("rt-1", "html", now_ms());
        it.content = Some("x".into());
        it.html_path = Some(hp.to_string_lossy().into_owned());
        it.rtf_path = Some(rp.to_string_lossy().into_owned());
        assert!(store.insert_or_bump(&it).unwrap());

        // 删除单条 → 富文本文件一并删除
        assert!(store.remove("rt-1").unwrap());
        assert!(!hp.exists());
        assert!(!rp.exists());

        // clear → 目录清空
        std::fs::write(&hp, b"y").unwrap();
        let mut it2 = item("rt-2", "html", now_ms());
        it2.content = Some("y".into());
        it2.html_path = Some(hp.to_string_lossy().into_owned());
        assert!(store.insert_or_bump(&it2).unwrap());
        assert_eq!(store.clear().unwrap(), 1);
        assert!(std::fs::read_dir(store.html_dir()).unwrap().next().is_none());

        let _ = std::fs::remove_dir_all(temp_dir().join("clip-data-richtext"));
        let _ = std::fs::remove_file(temp_dir().join("clip-richtext.db"));
    }
}
