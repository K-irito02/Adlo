use std::path::{Path, PathBuf};

use adl_errors::AppError;
use adl_storage::{Database, EntityTable};
use adl_types::types::clipboard::ClipboardItem;

pub struct ClipboardStore {
    db: Database,
    images_dir: PathBuf,
    thumbs_dir: PathBuf,
}

impl ClipboardStore {
    pub fn new(db: Database, data_dir: impl Into<PathBuf>) -> Self {
        let data_dir = data_dir.into();
        let images_dir = data_dir.join("clipboard").join("images");
        let thumbs_dir = data_dir.join("clipboard").join("thumbs");
        std::fs::create_dir_all(&images_dir).ok();
        std::fs::create_dir_all(&thumbs_dir).ok();
        Self { db, images_dir, thumbs_dir }
    }

    pub fn list(&self, limit: usize) -> Result<Vec<ClipboardItem>, AppError> {
        self.db.list_entities_with_limit(EntityTable::ClipboardItems, limit)
    }

    pub fn latest(&self) -> Result<Option<ClipboardItem>, AppError> {
        Ok(self.list(1)?.into_iter().next())
    }

    pub fn insert_or_bump(&self, item: &ClipboardItem) -> Result<bool, AppError> {
        if let Some(prev) = self.latest()? {
            if prev.kind == item.kind
                && prev.content == item.content
                && prev.image_path == item.image_path
                && (item.created_at.saturating_sub(prev.created_at)) <= 3000
            {
                self.db.save_entity(
                    EntityTable::ClipboardItems,
                    &item.id,
                    None,
                    None,
                    Some(&item.kind),
                    item,
                )?;
                return Ok(false);
            }
        }
        self.db.save_entity(
            EntityTable::ClipboardItems,
            &item.id,
            None,
            None,
            Some(&item.kind),
            item,
        )?;
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
        Ok(n)
    }

    fn delete_files(&self, item: &ClipboardItem) {
        for p in [&item.image_path, &item.thumb_path].into_iter().flatten() {
            let _ = std::fs::remove_file(Path::new(p));
        }
    }

    pub fn images_dir(&self) -> &Path {
        &self.images_dir
    }
    pub fn thumbs_dir(&self) -> &Path {
        &self.thumbs_dir
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
            image_path: None,
            thumb_path: None,
            image_width: None,
            image_height: None,
            source_app: None,
            created_at,
        }
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
    fn dedup_consecutive_same_content() {
        let store = temp_store("dedup");
        assert!(store.insert_or_bump(&item("1", "text", now_ms())).unwrap());
        // 相同内容、紧邻时间 → 判定重复，返回 false，不新增行
        assert!(!store.insert_or_bump(&item("1", "text", now_ms() + 1)).unwrap());
        assert_eq!(store.list(10).unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(temp_dir().join("clip-data-dedup"));
        let _ = std::fs::remove_file(temp_dir().join("clip-dedup.db"));
    }
}
