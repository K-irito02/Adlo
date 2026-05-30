use adl_kernel::WorkspaceFileDocument;
use std::collections::VecDeque;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

pub struct FileCache {
    cache: Mutex<HashMap<String, WorkspaceFileDocument>>,
    lru_queue: Mutex<VecDeque<String>>,
    max_entries: usize,
}

impl FileCache {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
            lru_queue: Mutex::new(VecDeque::new()),
            max_entries: 100,
        }
    }

    pub fn with_max_entries(max_entries: usize) -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
            lru_queue: Mutex::new(VecDeque::new()),
            max_entries,
        }
    }

    pub fn get(&self, root: &Path, relative_path: &str) -> Option<WorkspaceFileDocument> {
        let key = Self::make_key(root, relative_path);
        let cache = self.cache.lock().expect("cache mutex poisoned");
        let mut lru_queue = self.lru_queue.lock().expect("lru mutex poisoned");
        
        if let Some(doc) = cache.get(&key) {
            // If cache hit, remove old position and re-add to end to mark as recently used
            lru_queue.retain(|k| k != &key);
            lru_queue.push_back(key);
            Some(doc.clone())
        } else {
            None
        }
    }

    pub fn insert(&self, root: &Path, relative_path: &str, doc: WorkspaceFileDocument) {
        let key = Self::make_key(root, relative_path);
        let mut cache = self.cache.lock().expect("cache mutex poisoned");
        let mut lru_queue = self.lru_queue.lock().expect("lru mutex poisoned");
        
        // If key already exists, remove old entry from queue
        if cache.contains_key(&key) {
            // Remove from queue (linear search, but acceptable for small cache size)
            lru_queue.retain(|k| k != &key);
        }
        
        // If cache is full, remove oldest entry
        if cache.len() >= self.max_entries {
            if let Some(oldest_key) = lru_queue.pop_front() {
                cache.remove(&oldest_key);
            }
        }
        
        // Add to cache and LRU queue
        cache.insert(key.clone(), doc);
        lru_queue.push_back(key);
    }

    pub fn invalidate(&self, root: &Path, relative_path: &str) {
        let key = Self::make_key(root, relative_path);
        let mut cache = self.cache.lock().expect("cache mutex poisoned");
        let mut lru_queue = self.lru_queue.lock().expect("lru mutex poisoned");
        cache.remove(&key);
        lru_queue.retain(|k| k != &key);
    }

    pub fn clear(&self) {
        let mut cache = self.cache.lock().expect("cache mutex poisoned");
        let mut lru_queue = self.lru_queue.lock().expect("lru mutex poisoned");
        cache.clear();
        lru_queue.clear();
    }

    fn make_key(root: &Path, relative_path: &str) -> String {
        let normalized_root = root.to_string_lossy().replace('\\', "/").to_lowercase();
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
}
