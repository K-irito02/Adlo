use adl_kernel::WorkspaceFileDocument;
use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::sync::Mutex;

struct CacheState {
    cache: HashMap<String, WorkspaceFileDocument>,
    lru_queue: VecDeque<String>,
}

pub struct FileCache {
    state: Mutex<CacheState>,
    max_entries: usize,
}

impl FileCache {
    pub fn new() -> Self {
        Self::with_max_entries(100)
    }

    pub fn with_max_entries(max_entries: usize) -> Self {
        Self {
            state: Mutex::new(CacheState {
                cache: HashMap::with_capacity(max_entries),
                lru_queue: VecDeque::with_capacity(max_entries),
            }),
            max_entries,
        }
    }

    pub fn get(&self, root: &Path, relative_path: &str) -> Option<WorkspaceFileDocument> {
        let key = Self::make_key(root, relative_path);
        let mut state = self.state.lock().expect("cache mutex poisoned");

        // Check if key exists and clone doc first to avoid borrow issues
        let doc = state.cache.get(&key)?.clone();

        // Update LRU queue
        state.lru_queue.retain(|k| k != &key);
        state.lru_queue.push_back(key);

        Some(doc)
    }

    pub fn insert(&self, root: &Path, relative_path: &str, doc: WorkspaceFileDocument) {
        if self.max_entries == 0 {
            return;
        }

        let key = Self::make_key(root, relative_path);
        let mut state = self.state.lock().expect("cache mutex poisoned");

        // If key already exists, remove old entry from queue
        if state.cache.contains_key(&key) {
            state.lru_queue.retain(|k| k != &key);
        }

        // If cache is full, remove oldest entry
        if state.cache.len() >= self.max_entries {
            if let Some(oldest_key) = state.lru_queue.pop_front() {
                state.cache.remove(&oldest_key);
            }
        }

        // Add to cache and LRU queue
        state.cache.insert(key.clone(), doc);
        state.lru_queue.push_back(key);
    }

    pub fn invalidate(&self, root: &Path, relative_path: &str) {
        let key = Self::make_key(root, relative_path);
        let mut state = self.state.lock().expect("cache mutex poisoned");
        state.cache.remove(&key);
        state.lru_queue.retain(|k| k != &key);
    }

    pub fn clear(&self) {
        let mut state = self.state.lock().expect("cache mutex poisoned");
        state.cache.clear();
        state.lru_queue.clear();
    }

    fn make_key(root: &Path, relative_path: &str) -> String {
        let normalized_root = root
            .to_string_lossy()
            .replace('\\', "/")
            .to_lowercase()
            .trim_end_matches('/')
            .to_string();
        let normalized_path = relative_path.replace('\\', "/");
        format!("{}/{}", normalized_root, normalized_path)
    }
}

impl Default for FileCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn cache_inserts_and_gets() {
        let cache = FileCache::new();
        let root = PathBuf::from("/test");
        let doc = WorkspaceFileDocument {
            path: "test.txt".into(),
            content: "hello".into(),
            last_modified_at: 1000,
        };

        cache.insert(&root, "test.txt", doc.clone());
        let retrieved = cache.get(&root, "test.txt").unwrap();
        assert_eq!(retrieved.content, "hello");
    }

    #[test]
    fn cache_evicts_old_entries() {
        let cache = FileCache::with_max_entries(2);
        let root = PathBuf::from("/test");

        for i in 0..3 {
            let doc = WorkspaceFileDocument {
                path: format!("file{}.txt", i),
                content: format!("content{}", i),
                last_modified_at: 1000,
            };
            cache.insert(&root, &format!("file{}.txt", i), doc);
        }

        // First entry should be evicted
        assert!(cache.get(&root, "file0.txt").is_none());
        assert!(cache.get(&root, "file1.txt").is_some());
        assert!(cache.get(&root, "file2.txt").is_some());
    }

    #[test]
    fn cache_invalidate_removes_entry() {
        let cache = FileCache::new();
        let root = PathBuf::from("/test");
        let doc = WorkspaceFileDocument {
            path: "test.txt".into(),
            content: "hello".into(),
            last_modified_at: 1000,
        };

        cache.insert(&root, "test.txt", doc);
        cache.invalidate(&root, "test.txt");

        assert!(cache.get(&root, "test.txt").is_none());
    }

    #[test]
    fn cache_clear_removes_all() {
        let cache = FileCache::new();
        let root = PathBuf::from("/test");

        let doc = WorkspaceFileDocument {
            path: "test.txt".into(),
            content: "hello".into(),
            last_modified_at: 1000,
        };
        cache.insert(&root, "test.txt", doc);

        cache.clear();

        assert!(cache.get(&root, "test.txt").is_none());
    }

    #[test]
    fn cache_updates_lru_on_get() {
        let cache = FileCache::with_max_entries(3);
        let root = PathBuf::from("/test");

        // Insert 3 items
        for i in 0..3 {
            let doc = WorkspaceFileDocument {
                path: format!("file{}.txt", i),
                content: format!("content{}", i),
                last_modified_at: 1000,
            };
            cache.insert(&root, &format!("file{}.txt", i), doc);
        }

        // Access file0 first to make it recently used
        cache.get(&root, "file0.txt").unwrap();

        // Insert a 4th item to trigger eviction
        let doc4 = WorkspaceFileDocument {
            path: "file3.txt".into(),
            content: "content3".into(),
            last_modified_at: 1000,
        };
        cache.insert(&root, "file3.txt", doc4);

        // Since file0 was accessed recently, file1 should be evicted instead
        assert!(cache.get(&root, "file0.txt").is_some()); // Still present
        assert!(cache.get(&root, "file1.txt").is_none()); // Should be evicted
        assert!(cache.get(&root, "file2.txt").is_some());
        assert!(cache.get(&root, "file3.txt").is_some());
    }

    #[test]
    fn cache_with_max_entries_zero_does_nothing() {
        let cache = FileCache::with_max_entries(0);
        let root = PathBuf::from("/test");
        let doc = WorkspaceFileDocument {
            path: "test.txt".into(),
            content: "hello".into(),
            last_modified_at: 1000,
        };

        cache.insert(&root, "test.txt", doc);
        assert!(cache.get(&root, "test.txt").is_none());
    }
}
