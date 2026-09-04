# 系统实用工具后端实施计划（adl-clipboard + adl-sysmon）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为左侧边栏"剪贴板历史"与"系统监控"提供 Rust 后端能力：持久化剪贴板历史（SQLite + 图片落盘 + 硬删除）、基于 sysinfo 的系统快照，并通过 Tauri Command + ad-server HTTP handler 双端暴露。

**Architecture:** 两个新 `adl-` crate（`adl-clipboard`、`adl-sysmon`），共享 `adl-storage` 持久化与 `adl-types` 共享类型；桌面走 Tauri Command，浏览器预览走 ad-server HTTP handler（`run_blocking` + `ipc::to_response` 配方），两端调用同一套服务逻辑。

**Tech Stack:** Rust + tokio、`adl-storage`（rusqlite）、`json`（图片）、`clipboard-win`（监听）、`sysinfo`、`serde`/`serde_json`、ts-rs（Rust→TS 类型）。

## Global Constraints

- 内部 crate 命名前缀 `adl-`；新 crate 加入 `Cargo.toml` workspace members。
- 跨 IPC 共享类型用 `#[derive(serde::Serialize, serde::Deserialize, TS)]` + `#[serde(rename_all = "camelCase")]`，并 barrel 进 kernel 桶。
- 持久化实体必须加到 `adl-storage` 的 `EntityTable` 宏 + `init_schema.sql`。
- HTTP handler：`#[derive(Deserialize)] #[serde(rename_all="camelCase")]` 请求体、`ipc::json_body`、`run_blocking`、`ipc::to_response`。
- Tauri Command 命名 `{domain}_{action}` 蛇形，capability 授权。
- Rust 禁止 `unwrap()`，错误用 `AppError`；`cargo fmt --all`、`cargo clippy --workspace --all-targets --fix -- -D warnings`、`cargo check --workspace`、`cargo test --workspace` 全部通过。

> ⚠️ 本计划为**后端计划**；前端（IPC 三桥接、store slice、左侧边栏 UI、i18n）见配套前端计划。

---

### Task 1: 存储层 — 新增 `clipboard_items` 表与清空方法

**Files:**
- Modify: `ai-digital-life/crates/storage/sql/init_schema.sql`（追加建表）
- Modify: `ai-digital-life/crates/storage/src/entity_table.rs`（新增 `EntityTable::ClipboardItems` 变体）
- Modify: `ai-digital-life/crates/storage/src/entity_crud.rs`（新增 `clear_entity_table`）
- Test: `ai-digital-life/crates/storage/src/entity_crud.rs`（`#[cfg(test)]` 模块内新增测试，遵循 rust-inline-cfg-test-pattern）

**Interfaces:**
- Produces: `EntityTable::ClipboardItems`（表名 `"clipboard_items"`）；`Database::clear_entity_table(table: EntityTable) -> Result<usize, AppError>`（清空某表的 JSON 行，返回删除行数）；`clipboard_items` 表结构（id/workspace_id/session_id/status/updated_at/json）。

**设计说明**：`status` 列存剪贴板条目的 `kind`（`text`/`image`），复用 `list_entities_by_status`；`workspace_id`/`session_id` 为 `NULL`（剪贴板历史全局，不归属工作区）。

- [ ] **Step 1: 往 `init_schema.sql` 追加建表**

在 `run_activity_events` 建表之后追加：

```sql
CREATE TABLE IF NOT EXISTS clipboard_items (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clipboard_items_updated
    ON clipboard_items(updated_at);
```

- [ ] **Step 2: 在 `entity_table.rs` 宏列表新增变体**

在 `define_entity_table! { ... }` 块内最后追加一行（保持与现有风格一致）：

```rust
    RunActivityEvents => "run_activity_events",
    ClipboardItems => "clipboard_items",
}
```

5. 注意：宏以 `RunActivityEvents => "run_activity_events",` 结尾，需在其后加逗号并新增 `ClipboardItems` 行。同时 `lib.rs` 现有 `purge_workspace_cascades_all_child_tables` 测试的 `child_tables` 数组不需要改（剪贴板历史不归属工作区）。

- [ ] **Step 3: 在 `entity_crud.rs` 新增 `clear_entity_table` 方法**

在 `impl Database` 内、`delete_entities_by_workspace` 之后追加：

```rust
    /// 清空整张实体表的所有行（用于剪贴板历史"一键清空"等一删到底场景）。
    pub fn clear_entity_table(&self, table: EntityTable) -> Result<usize, AppError> {
        let sql = format!("DELETE FROM {}", table.table_name());
        let changed = self
            .conn()?
            .execute(&sql, [])
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(changed)
    }
```

- [ ] **Step 4: 新增存储层测试**

在 `entity_crud.rs` 文件末尾的 `#[cfg(test)]` 模块中新增：

```rust
#[test]
fn clear_entity_table_wipes_only_target_table() {
    let db = temp_db("clear-entity");
    // 直接写入标准实体列
    let insert = |table: &EntityTable, id: &str| {
        db.execute(
            "INSERT INTO {t} (id, workspace_id, session_id, status, updated_at, json) VALUES (?1, NULL, NULL, NULL, ?3, ?4)"
                .replace("{t}", table.as_str()),
            rusqlite::params![id, 0i64, format!(r#"{{"id":"{id}"}}"#)],
        )
        .unwrap();
    };
    insert(&EntityTable::ClipboardItems, "c-1");
    insert(&EntityTable::ClipboardItems, "c-2");
    insert(&EntityTable::Tasks, "t-1");

    assert_eq!(db.list_entities_with_limit::<serde_json::Value>(EntityTable::ClipboardItems, 100).unwrap().len(), 2);

    let removed = db.clear_entity_table(EntityTable::ClipboardItems).unwrap();
    assert_eq!(removed, 2);
    // 只清目标表，Tasks 不受影响
    assert_eq!(db.list_entities::<serde_json::Value>(EntityTable::ClipboardItems).unwrap().len(), 0);
    assert_eq!(db.list_entities::<serde_json::Value>(EntityTable::Tasks).unwrap().len(), 1);

    let _ = std::fs::remove_file(temp_dir().join("adl-storage-clear-entity.db"));
}
```

> 说明：`temp_db` helper 已在 `crates/storage/src/lib.rs` 测试模块中定义，但所在模块是 `storage::tests`。若 `entity_crud.rs` 测试模块无法访问，改为在 `crates/storage/src/lib.rs` 的 tests 模块内新增该测试（那里有现成的 `temp_db` 与 `seed_workspace_child`）。以实际编译结果为准，选择可访问 `Database` 的地方组织测试。

- [ ] **Step 5: 运行测试确认通过**

```bash
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test -p adl-storage
```
Expected: PASS（含新增的 clear 测试；若原 `purge_workspace_cascades_all_child_tables` 断言也不变则为通过）。

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/crates/storage
git commit -m "feat(storage): clipboard_items 实体表与 clear_entity_table 清空方法"
```

---

### Task 2: 共享类型 — `ClipboardItem` 与 `SystemSnapshot`（含 kernel 桶导出）

**Files:**
- Create: `ai-digital-life/crates/types/src/types/clipboard.rs`
- Create: `ai-digital-life/crates/types/src/types/system_monitor.rs`
- Modify: `ai-digital-life/crates/types/src/types/mod.rs`（barrel，追加 `pub mod clipboard; pub mod system_monitor;`）
- Modify: kernel 共享类型桶（`export *` 或 `pub use`）——按现有 workspace 共享类型的导出方式进行同步

**Interfaces:**
- Produces（输入给 Task 3/5 及前端计划使用，字段名经 `camelCase` 序列化后即前端契约）：
  - `ClipboardItem { id: String, kind: String, content: Option<String>, image_path: Option<String>, thumb_path: Option<String>, image_width: Option<u32>, image_height: Option<u32>, source_app: Option<String>, created_at: i64 }`（`createdAt` 为前端见到的字段）
  - `SystemSnapshot { cpu_total: f32, cpu_per_core: Vec<f32>, memory_used: u64, memory_total: u64, swap_used: u64, swap_total: u64, disks: Vec<DiskStat>, networks: Vec<NetStat>, processes: Vec<ProcessStat>, uptime_secs: u64 }`
  - `DiskStat { mount: String, total: u64, available: u64 }`
  - `NetStat { name: String, rx_bps: u64, tx_bps: u64 }`
  - `ProcessStat { pid: u32, name: String, cpu_usage: f32, memory: u64 }`

- [ ] **Step 1: 写 `crates/types/src/types/clipboard.rs`**

命名空间参照 `crates/types/src/types/workspace.rs`（含 `#[derive(..., TS)]` + `#[serde(rename_all = "camelCase")]`）。将 `#[derive(TS)]` 配置与现有文件保持一致（`export_to` 指向 kernel 生成目录）。最小实现：

```rust
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ClipboardItem {
    pub id: String,
    pub kind: String,
    pub content: Option<String>,
    pub image_path: Option<String>,
    pub thumb_path: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub source_app: Option<String>,
    pub created_at: i64,
}
```

> 实现时先读 `crates/types/src/types/workspace.rs` 顶部，把 `TS` 的 `#[ts(export)]`、`export_to`、crate 引用写法原样拷贝，确保生成逻辑与现有共享类型一致。

- [ ] **Step 2: 写 `crates/types/src/types/system_monitor.rs`**

```rust
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DiskStat {
    pub mount: String,
    pub total: u64,
    pub available: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NetStat {
    pub name: String,
    pub rx_bps: u64,
    pub tx_bps: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProcessStat {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SystemSnapshot {
    pub cpu_total: f32,
    pub cpu_per_core: Vec<f32>,
    pub memory_used: u64,
    pub memory_total: u64,
    pub swap_used: u64,
    pub swap_total: u64,
    pub disks: Vec<DiskStat>,
    pub networks: Vec<NetStat>,
    pub processes: Vec<ProcessStat>,
    pub uptime_secs: u64,
}
```

- [ ] **Step 3: 加入 barrel 导出**

在 `crates/types/src/types/mod.rs` 追加：

```rust
pub mod clipboard;
pub mod system_monitor;
```

并按现有 workspace 共享类型导出方式，把 `ClipboardItem`、`SystemSnapshot` 及其子结构导出进 kernel 共享类型桶（找到 `crates/types` 或 `crates/kernel` 中 re-export workspace 的地方，同样 re-export 这几个新类型，保证前端 `@ai-digital-life/kernel` 能 import）。

- [ ] **Step 4: 编译 + 类型检查**

```bash
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check --workspace
```
Expected: PASS，无未定义错误；若配置了 ts-rs 类型生成脚本，运行之确认生成出 `clipboard.ts`、`system_monitor.ts`（如存在，后续前端计划会用到）。

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/types
git commit -m "feat(types): ClipboardItem 与 SystemSnapshot 共享类型"
```

---

### Task 3: `adl-clipboard` crate — 剪贴板存储服务（含图片落盘）

**Files:**
- Create: `ai-digital-life/crates/clipboard/Cargo.toml`
- Create: `ai-digital-life/crates/clipboard/src/lib.rs`
- Create: `ai-digital-life/crates/clipboard/src/store.rs`
- Create: `ai-digital-life/crates/clipboard/src/image.rs`
- Create: `ai-digital-life/crates/clipboard/src/read.rs`（读系统剪贴板并归一化，图片转 PNG）
- Modify: `ai-digital-life/Cargo.toml`（workspace members 追加 `crates/clipboard`）
- Test: 内联 `#[cfg(test)]`

**Interfaces（输入自 Task 1/2）：**
- `EntityTable::ClipboardItems`、`Database::clear_entity_table`、`ClipboardItem`。

**Produces（供 Task 4/6/7 使用）：**
- `ClipboardStore::new(db: Database, data_dir: PathBuf) -> Self`
- `ClipboardStore::list(&self, limit: usize) -> Result<Vec<ClipboardItem>, AppError>`（`createdAt` 倒序）
- `ClipboardStore::insert_or_bump(&self, item: &ClipboardItem) -> Result<bool, AppError>`（若最新一条与 given 内容相同且为近 3s 内则视为重复，仅 `save_entity` 覆盖更新并返回 `false`；否则插入新行，返回 `true`）
- `ClipboardStore::remove(&self, id: &str) -> Result<bool, AppError>`（删 DB 行 + 删图片文件与缩略图）
- `ClipboardStore::clear(&self) -> Result<usize, AppError>`（`clear_entity_table` + 清空图片目录文件）
- `ClipboardStore::latest(&self) -> Result<Option<ClipboardItem>, AppError>`

- [ ] **Step 1: 写 `Cargo.toml`**

```toml
[package]
name = "adl-clipboard"
version = "0.1.0"
edition = "2021"

[dependencies]
adl-errors = { path = "../errors" }
adl-storage = { path = "../storage" }
adl-types = { path = "../types" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
image = { version = "0.25", default-features = false, features = ["png"] }
thiserror = "2"
tokio = { version = "1", features = ["sync"] }
uuid = { version = "1", features = ["v4"] }
```

> Cargo.toml 路径以 `crates/` 下实际所在为准；若 `adl-errors`/`adl-types` 用到此工程固定版本，照抄现有 crate 的写法定值。

- [ ] **Step 2: 写 `image.rs` — PNG 落盘 + 缩略图**

```rust
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
    img.save(original_path).map_err(|e| AppError::IO(e.to_string()))?;

    let (tw, th) = if width.max(height) > max_side {
        let scale = max_side as f32 / width.max(height) as f32;
        (((width as f32 * scale) as u32).max(1), ((height as f32 * scale) as u32).max(1))
    } else {
        (width, height)
    };
    let thumb = image::imageops::resize(&img, tw, th, image::imageops::FilterType::Triangle);
    thumb.save(thumb_path).map_err(|e| AppError::IO(e.to_string()))?;
    let bytes = std::fs::metadata(original_path).map_err(|e| AppError::IO(e.to_string()))?.len();
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
```

> 修剪占位注释，实际写盘用你工程统一的路径拼接。若 `RgbaImage` 与你的剪贴板格式不符（可能为 RGB 或 BGR），以实际读到的格式为准调整，但保持"原图 + 缩略图两文件"约定与返回 `(bytes, tw, th)` 接口不变。

- [ ] **Step 3: 写 `store.rs` — 增删查清 + 去重合并**

去重策略：`list(1)` 取最新一条；若其 `kind` 相同、`content`/`image_path` 等可比较字段与 given 一致且时间差 ≤ 3000ms，判定为重复 → `save_entity` 覆盖（更新时间戳）并返回 `false`。

```rust
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
```

> `now_ms` 从 `adl_types` 导入；若其路径不是 `adl_types::now_ms`，grep 现有 crate 的 `now_ms` 用法来修正导入。

- [ ] **Step 4: 写 `lib.rs` — barrel 导出**

```rust
pub mod image;
pub mod read;
pub mod store;

pub use store::ClipboardStore;
```

- [ ] **Step 5: 注册 workspace member**

在 `ai-digital-life/Cargo.toml` 的 `[workspace] members` 追加 `"crates/clipboard"`。

- [ ] **Step 6: 编译 + 测试**

```bash
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check -p adl-clipboard
cargo test -p adl-clipboard
```
Expected: PASS。

> **注**：本 Task 只实现存储层与图片落盘，不实现"读系统剪贴板"。`read.rs`（读剪贴板 + RGB→RgbaImage）留到 Task 4 的 monitor 一并落地，此处 `pub mod read;` 先声明，Task 4 补内容。若 `read.rs` 暂为空会编译告警，可在 Task 4 同一次提交内补上。

- [ ] **Step 7: 提交**

```bash
git add ai-digital-life/Cargo.toml ai-digital-life/crates/clipboard
git commit -m "feat(clipboard): 剪贴板存储与图片落盘服务"
```

---

### Task 4: `adl-clipboard` — 系统剪贴板监听 + 事件通知

**Files:**
- Modify: `ai-digital-life/crates/clipboard/src/read.rs`（读系统剪贴板、归一化到 `ClipboardItem`、RGB→PNG）
- Create: `ai-digital-life/crates/clipboard/src/monitor.rs`
- Modify: `ai-digital-life/crates/clipboard/src/lib.rs`（追加 `pub mod monitor;`）
- Test: 内联 `#[cfg(test)]`（read 的归一化部分）

**Interfaces（输入自 Task 3）：** `ClipboardStore`、`ClipboardItem`、`ClipboardStore::images_dir()/thumbs_dir()`、`insert_or_bump`。

**Produces（供 Task 6 桌面事件转发 / Task 7 HTTP）：**
- `ClipboardMonitor::start(store, broadcast::Sender<Option<String>>) -> io::Result<Self>`：spawn 后台线程，用 `clipboard-win` `monitor` 监听变化；变化时读剪贴板 → `insert_or_bump` → 若是新条目（返回 true）则 `sender.send(Some(id))`，否则 `send(None)`（去重合并）。提供 `spawn` 返回句柄/`join` 停止。

- [ ] **Step 1: 写 `read.rs` — 读系统剪贴板并归一化**

文本与图片两条路径：读 Unicode 文本；若存在图片（Bitmap），读 RGB 并用 Task 3 的 `write_image_files` 落盘。

```rust
use std::path::PathBuf;

use adl_errors::AppError;
use adl_types::types::clipboard::ClipboardItem;
use adl_types::now_ms;
use uuid::Uuid;

use crate::image::write_image_files;
use crate::store::ClipboardStore;

/// 读取系统剪贴板，若含图片则落盘为原图+缩略图；否则归一化为文本条目。
/// 返回 (ClipboardItem, is_new_image)。
pub fn read_current(store: &ClipboardStore) -> Result<Option<(ClipboardItem, bool)>, AppError> {
    // 检出图片优先：clipboard-win 的 formats::Bitmap read_clipboard 返回 Vec<u8> RGB
    // TODO: 依据实际 clipboard-win 版本调整 Bitmap/Unicode 读取 API
    Ok(None)
}
```

> ⚠️ **实现要求（重点）**：`clipboard-win` 的 Bitmap API 与 RGB 字节序、是否含 alpha，请以你锁定的 `clipboard-win` 版本（`Cargo.toml` 里 feature `monitor`）的 `formats` 文档为准。图片读到的 RGB buffer 需转成 `image::RgbaImage`（补 alpha）再调用 `write_image_files`。这一步骤的真实 API 调用务必读 `clipboard-win` 源码确认；若其无 Bitmap 直接读取，则退化为"仅文本 + 文件列表"，图片 v1 不采集，并在此处注释说明。**不要臆测 API**，先 `cargo doc` 或读源码。

- [ ] **Step 2: 写 `monitor.rs` — 事件驱动监听**

```rust
use std::io;
use std::sync::mpsc;

use tokio::sync::broadcast;

use crate::read::read_current;
use crate::store::ClipboardStore;

/// 监听系统剪贴板变化。变化时入库；若是新条目则向 tx 发送 Some(id)，用于前端事件推送。
pub struct ClipboardMonitor {
    tx: broadcast::Sender<Option<String>>,
}

impl ClipboardMonitor {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(128);
        Self { tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Option<String>> {
        self.tx.subscribe()
    }

    /// 在后台线程监听剪贴板。store 需可跨线程共享（内部用 adl-storage Database，需 Send+Sync 确认）。
    pub fn spawn(self, store: ClipboardStore) {
        let tx = self.tx.clone();
        std::thread::spawn(move || {
            let (rx, _) = mpsc::channel::<()>();
            // 事件回调：剪贴板变化
            let cb = || {
                let _ = rustix_or_clipboard::on_change();
                // 伪代码占位：改为 clipboard-win monitor 的真实回调签名
            };
            // TODO: 使用 clipboard-win 的 monitor feature（AddClipboardFormatListener）
            // 在真实回调里：
            //   match read_current(&store) { Ok(Some((item,true))) => { store.insert_or_bump(&item).ok(); tx.send(Some(item.id)); }
            //                                Ok(Some((item,false))) => { store.insert_or_bump(&item).ok(); tx.send(None); }
            //                                _ => {} }
            // 阻塞等待线程结束；app 关闭时由运行时回收。
            let _ = rx.recv();
        });
    }
}
```

> ⚠️ **实现要求（重点）**：`clipboard-win` 的 `monitor` feature 提供 `Monitor`/回调注册的具体签名，请读其 `docs.rs` 示例（`monitor` 模块）落地。上面的 `rx`/`cb` 是占位骨架，需替换为真实 API。这个 task 是本计划中**唯一允许有"待查证 API 后替换"**的地方，其余步骤均需写死。原因：`clipboard-win` 监控回调与 `clipboard-win`/`windows` 版本强绑定，无法在不查版本的情况下写死。**务必**：先 `cargo add clipboard-win --features monitor`，再通读 `docs.rs/clipboard-win` 的 monitor 示例，把 `spawn` 内部补成真实可编译代码，随后运行测试。

- [ ] **Step 3: 合并 Step1/2 后编译**

```bash
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check -p adl-clipboard
```
Expected: PASS（monitor 真实 API 落地后）。若 `lib.rs` 中 Task 3 曾声明的 `pub mod read;` 与本 step 冲突，以本 step 为准。

- [ ] **Step 4: 提交**

```bash
git add ai-digital-life/crates/clipboard
git commit -m "feat(clipboard): 系统剪贴板监听与变化事件"
```

---

### Task 5: `adl-sysmon` crate — 系统快照服务

**Files:**
- Create: `ai-digital-life/crates/sysmon/Cargo.toml`
- Create: `ai-digital-life/crates/sysmon/src/lib.rs`
- Create: `ai-digital-life/crates/sysmon/src/snapshot.rs`
- Modify: `ai-digital-life/Cargo.toml`（members 追加 `crates/sysmon`）
- Test: 内联 `#[cfg(test)]`

**Interfaces（输入自 Task 2）：** `SystemSnapshot`、`DiskStat`、`NetStat`、`ProcessStat`。

**Produces（供 Task 6/7）：**
- `SystemMonitor::new() -> Self`
- `SystemMonitor::snapshot(&mut self) -> SystemSnapshot`
- `TOP_N_PROCESSES: usize = 25`

- [ ] **Step 1: 写 `Cargo.toml`**

```toml
[package]
name = "adl-sysmon"
version = "0.1.0"
edition = "2021"

[dependencies]
adl-errors = { path = "../errors" }
adl-types = { path = "../types" }
serde_json = "1"
sysinfo = "0.39"
```

- [ ] **Step 2: 写 `snapshot.rs`**

单 System 实例，`refresh_specifics` 只取所需维度；进程按 CPU 降序取 Top-N（内存作次级排序）。

```rust
use adl_types::types::system_monitor::{DiskStat, NetStat, ProcessStat, SystemSnapshot};
use sysinfo::{Disks, Networks, System, refresh::ReferencedFields};

pub const TOP_N_PROCESSES: usize = 25;

pub struct SystemMonitor {
    sys: System,
    disks: Disks,
    networks: Networks,
    last_net: std::collections::HashMap<String, (u64, u64, u64)>, // name -> (total_rx, total_tx, last_ts_ms)
    last_ts_ms: u64,
}

impl SystemMonitor {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        Self {
            sys,
            disks: Disks::new_with_refreshed_list(),
            networks: Networks::new_with_refreshed_list(),
            last_net: Default::default(),
            last_ts_ms: 0,
        }
    }

    pub fn snapshot(&mut self) -> SystemSnapshot {
        // CPU
        self.sys.refresh_cpu_usage();
        let per_core: Vec<f32> = self.sys.cpus().iter().map(|c| c.cpu_usage()).collect();
        let cpu_total = per_core.iter().sum::<f32>() / (per_core.len().max(1) as f32);

        // 内存 / swap
        self.sys.refresh_memory();
        let memory_used = self.sys.used_memory() * 1024;
        let memory_total = self.sys.total_memory() * 1024;
        let swap_used = self.sys.used_swap() * 1024;
        let swap_total = self.sys.total_swap() * 1024;

        // 磁盘
        self.disks.refresh(false);
        let disks: Vec<DiskStat> = self
            .disks
            .list()
            .iter()
            .map(|d| DiskStat {
                mount: d.mount_point().to_string_lossy().to_string(),
                total: d.total_space(),
                available: d.available_space(),
            })
            .collect();

        // 网络速率（自上次采样差值）
        self.networks.refresh(false);
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let mut networks = Vec::new();
        let dt_ms = (now_ms.saturating_sub(self.last_ts_ms)).max(1) as f64;
        if self.last_ts_ms != 0 {
            for (name, data) in &self.networks {
                let rx = data.total_received();
                let tx = data.total_transmitted();
                if let Some((prx, ptx, _)) = self.last_net.get(name) {
                    networks.push(NetStat {
                        name: name.clone(),
                        rx_bps: ((rx.saturating_sub(*prx)) as f64 / dt_ms * 1000.0) as u64,
                        tx_bps: ((tx.saturating_sub(*ptx)) as f64 / dt_ms * 1000.0) as u64,
                    });
                }
                self.last_net.insert(name.clone(), (rx, tx, now_ms));
            }
        }
        self.last_ts_ms = now_ms;

        // 进程 Top-N（按 CPU 降序）
        self.sys.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::All,
            true,
            sysinfo::MINIMUM_CPU_UPDATE_INTERVAL,
        );
        let mut procs: Vec<ProcessStat> = self
            .sys
            .processes()
            .iter()
            .map(|(pid, p)| ProcessStat {
                pid: pid.as_u32(),
                name: p.name().to_string_lossy().to_string(),
                cpu_usage: p.cpu_usage(),
                memory: p.memory(),
            })
            .collect();
        procs.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));
        procs.truncate(TOP_N_PROCESSES);

        SystemSnapshot {
            cpu_total,
            cpu_per_core: per_core,
            memory_used,
            memory_total,
            swap_used,
            swap_total,
            disks,
            networks,
            processes: procs,
            uptime_secs: self.sys.uptime(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_is_well_formed() {
        let mut m = SystemMonitor::new();
        m.snapshot(); // warm-up（CPU 需前后两次采样）
        let s = m.snapshot();
        assert!(s.memory_total >= s.memory_used);
        assert!(!s.cpu_per_core.is_empty());
        assert!(s.cpu_total.is_finite());
        assert!(!s.processes.is_empty());
    }

    #[test]
    fn process_list_respects_top_n() {
        let mut m = SystemMonitor::new();
        let mut s = m.snapshot();
        assert!(s.processes.len() <= TOP_N_PROCESSES);
        // 第二次快照应有网络速率（last_ts 非 0）
        let _ = m.snapshot();
        s = m.snapshot();
        assert!(s.processes.len() <= TOP_N_PROCESSES);
    }
}
```

> 注释明确：`sysinfo` 0.39 `refresh_processes_specifics` 与 `ProcessesToUpdate` 的确切签名以你锁定的版本为准；`MINIMUM_CPU_UPDATE_INTERVAL` 用于节流进程 CPU 采样。若 0.39 改了 API，按 docs.rs 修正；网络速率首次采样为 0 是预期、可接受。

- [ ] **Step 3: 写 `lib.rs` barrel**

```rust
pub mod snapshot;

pub use snapshot::{SystemMonitor, TOP_N_PROCESSES};
```

- [ ] **Step 4: 注册 workspace member**（`ai-digital-life/Cargo.toml` members 追加 `"crates/sysmon"`）

- [ ] **Step 5: 编译 + 测试**

```bash
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check -p adl-sysmon
cargo test -p adl-sysmon
```
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/Cargo.toml ai-digital-life/crates/sysmon
git commit -m "feat(sysmon): sysinfo 系统快照服务"
```

---

### Task 6: Tauri 命令 + capability 授权 + 桌面事件转发

**Files:**
- Create: `ai-digital-life/src-tauri/src/commands/clipboard.rs`
- Create: `ai-digital-life/src-tauri/src/commands/sysmon.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/mod.rs`
- Modify: `ai-digital-life/src-tauri/src/lib.rs`（`invoke_handler` / `generate_handler` 注册）
- Modify: `ai-digital-life/src-tauri/Cargo.toml`（追加 `adl-clipboard`、`adl-sysmon` 依赖）
- Modify: `ai-digital-life/src-tauri/capabilities/*.json`（追加权限）
- Modify: `ai-digital-life/crates/kernel/src/events.rs`（`AppEvent::ClipboardChanged(String)` + `kind()` 分支）

**Interfaces（输入自 Task 3/4/5）：** `ClipboardStore::list/remove/clear/insert_or_bump`、`ClipboardMonitor`、`SystemMonitor::snapshot`、`AppEvent`/`EventBus`、`SystemSnapshot`/`ClipboardItem`。

**Produces：** Tauri command 集合（前端三桥接中的 tauri-bridge 会调用）：
- `clipboard_list(limit) -> IpcResult<Vec<ClipboardItem>>`
- `clipboard_remove(id) -> IpcResult<bool>`
- `clipboard_clear() -> IpcResult<usize>`
- `sysmon_snapshot() -> IpcResult<SystemSnapshot>`

**App 状态**：新增一个 `ManagedClipboard`/`ManagedSysmon` Tauri State（在 `app.rs` 或本文件内定义结构体持 `ClipboardStore` 与 `SystemMonitor`），在 `.setup()` 或 `manage()` 注入。

- [ ] **Step 1: kernel 事件加 `ClipboardChanged`**

在 `crates/kernel/src/events.rs` 的 `AppEvent` enum 追加：

```rust
    ClipboardChanged(String), // 剪贴板历史新增/变更，携带最新条目 id
```

在 `kind()` 追加：

```rust
            Self::ClipboardChanged(_) => "clipboard.changed",
```

编译：`cargo check -p adl-kernel`（crate 名以实际为准）。

- [ ] **Step 2: 写 `commands/clipboard.rs`**

```rust
use std::path::PathBuf;
use std::sync::Arc;

use adl_errors::AppError;
use adl_types::types::clipboard::ClipboardItem;
use adl_clipboard::ClipboardStore;
use tauri::State;

pub struct ManagedClipboard(pub Arc<ClipboardStore>);

#[tauri::command]
pub fn clipboard_list(store: State<'_, ManagedClipboard>, limit: usize) -> Result<Vec<ClipboardItem>, AppError> {
    store.0.list(limit.min(500))
}

#[tauri::command]
pub fn clipboard_remove(store: State<'_, ManagedClipboard>, id: String) -> Result<bool, AppError> {
    store.0.remove(&id)
}

#[tauri::command]
pub fn clipboard_clear(store: State<'_, ManagedClipboard>) -> Result<usize, AppError> {
    store.0.clear()
}
```

> `AppError` 需实现 `serde::Serialize` 才能在 `Result<_, AppError>` 直接返回给前端——grep 现有 command 是否直接返回 `AppError`；若现有用 `Result<T, String>` 或自定义 `ipc::to_response`，则按现有 `src-tauri/src/commands/app.rs` 的返回风格统一（保证与 `captureTypedError`/`fromIpcErrorCode` 匹配）。

- [ ] **Step 3: 写 `commands/sysmon.rs`**

```rust
use std::sync::Mutex;

use adl_errors::AppError;
use adl_sysmon::SystemMonitor;
use adl_types::types::system_monitor::SystemSnapshot;
use tauri::State;

pub struct ManagedSysmon(pub Mutex<SystemMonitor>, pub u64);

#[tauri::command]
pub fn sysmon_snapshot(state: State<'_, ManagedSysmon>) -> Result<SystemSnapshot, AppError> {
    let mut m = state.0.lock().map_err(|_| AppError::Internal("sysmon lock poisoned".into()))?;
    Ok(m.snapshot())
}
```

- [ ] **Step 4: 注册命令 + 注入 state**

在 `commands/mod.rs` 追加 `pub mod clipboard; pub mod sysmon;`。在 `lib.rs` 的 `invoke_handler(generate_handler![...])` 追加 `clipboard::clipboard_list`、`clipboard::clipboard_remove`、`clipboard::clipboard_clear`、`sysmon::sysmon_snapshot`；在 builder 构建处 `.manage(ManagedClipboard(...))` `.manage(ManagedSysmon(...))`（数据目录从现有 app data dir 获取，如 `app.path().app_data_dir()`）。监听启动与事件转发（桌面端）在 `.setup()` 内：创建 monitor、spawn 剪贴板监听，把新条目通过 `app.emit("clipboard-changed", id)` 推给前端：

```rust
// setup 内（伪结构，按现有 Builder setup 落位）
let store = app.state::<ManagedClipboard>().0.inner().clone();
let app_handle = app.handle().clone();
std::thread::spawn(move || {
    // 监听 store 侧新增事件（ClipboardMonitor 内部 broadcast 或内核 EventBus）
    // 收到 Some(id) 时执行 app_handle.emit("clipboard-changed", id)
});
```

> ⚠️ 事件转发链路（monitor → Tauri `app.emit`）的接线随 Task 4 植入的 monitor 信号机制而定。若 `ClipboardStore` 用 `Arc<ClipboardStore>` + 内部同步，则用它；否则改用内核 `EventBus`（Task 1 已允许候选）。该步骤需与任务 4 的信号方式对齐，连接时可读 Task 4 产出再补全。

- [ ] **Step 5: capability 授权**

在 `src-tauri/capabilities/*.json`（如 `default.json`）的 permissions 追加（命令名按生成器真实命名）：

```json
{ "identifier": "adl:allow-clipboard-list" },
{ "identifier": "adl:allow-clipboard-remove" },
{ "identifier": "adl:allow-clipboard-clear" },
{ "identifier": "adl:allow-sysmon-snapshot" }
```

> 权限标识符需与 `src-tauri/permissions/` 里为这些命令生成的 ACL 实际 identifier 完全一致；执行时先建 permissions 再回填此处，避免凭空编造。

- [ ] **Step 6: 编译 + 检查**

```bash
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check --workspace
cargo test -p adl-clipboard -p adl-sysmon -p adl-kernel
```
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add ai-digital-life/src-tauri ai-digital-life/crates/kernel
git commit -m "feat(ipc): 剪贴板/系统监控 Tauri 命令与事件"
```

---

### Task 7: ad-server HTTP handler + 路由（浏览器预览端）

**Files:**
- Create: `ai-digital-life/crates/server/src/handlers/clipboard.rs`
- Create: `ai-digital-life/crates/server/src/handlers/system_monitor.rs`
- Modify: `ai-digital-life/crates/server/src/handlers/mod.rs`
- Modify: `ai-digital-life/crates/server/src/router.rs`（追加路由）
- Modify: `ai-digital-life/crates/server/Cargo.toml`（追加 `adl-clipboard`、`adl-sysmon` 依赖）
- Test: 内联 `#[cfg(test)]`（简单 handler 层冒烟）

**Interfaces（输入自 Task 3/5）：** `ClipboardStore::list/remove/clear`、`SystemMonitor::snapshot`。

**Produces（前端 preview-bridge 调用的 HTTP 路由契约）：**
- `GET /clipboard/list?limit=N` → `IpcResult<Vec<ClipboardItem>>`
- `POST /clipboard/remove`  body `{ "id": string }` → `IpcResult<bool>`
- `POST /clipboard/clear`  body `{}` → `IpcResult<usize>`
- `GET /sysmon/snapshot` → `IpcResult<SystemSnapshot>`

- [ ] **Step 1: 写 `handlers/clipboard.rs`（套 server handler 配方）**

参照 `crates/server/src/handlers/workspace.rs` 的 `run_blocking` + `ipc::to_response` 结构：

```rust
use axum::body::Bytes;
use axum::extract::{Query, State};
use adl_errors::AppError;
// 复用 crate 内 run_blocking / ipc（见 workspace.rs 顶部 import）

pub async fn list(
    State(state): State<crate::state::ServerState>,
    Query(q): Query<ListQuery>,
) -> impl IntoResponse {
    let store = state.clipboard_store.clone();
    let result = run_blocking(move || -> Result<Vec<ClipboardItem>, AppError> {
        store.list(q.limit.unwrap_or(100).min(500))
    }).await;
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    #[serde(default)]
    limit: Option<usize>,
}

pub async fn remove(
    State(state): State<crate::state::ServerState>,
    body: Bytes,
) -> impl IntoResponse {
    let input: serde_json::Value = ipc::json_body(body).await.unwrap_or_default();
    let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let store = state.clipboard_store.clone();
    let result = run_blocking(move || -> Result<bool, AppError> { store.remove(&id) }).await;
    ipc::to_response(result)
}

pub async fn clear(
    State(state): State<crate::state::ServerState>,
) -> impl IntoResponse {
    let store = state.clipboard_store.clone();
    let result = run_blocking(move || -> Result<usize, AppError> { store.clear() }).await;
    ipc::to_response(result)
}
```

> ``crate::state::ServerState` 需新增字段 `clipboard_store: Arc<ClipboardStore>` 并在构造处注入。若现有 `ServerState` 结构在别处（非 `crate::state`），以实际为准改路径。``

- [ ] **Step 2: 写 `handlers/system_monitor.rs`**

```rust
pub async fn snapshot(
    State(state): State<crate::state::ServerState>,
) -> impl IntoResponse {
    let mut monitor = state.sysmon.lock().map_err(|_| AppError::Internal("sysmon lock poisoned".into())).unwrap_or_else(|_| {
        // 锁竞争极少；若中毒则新建
        Default::default()
    });
    let result = run_blocking(move || -> Result<SystemSnapshot, AppError> {
        Ok(monitor.snapshot())
    }).await;
    ipc::to_response(result)
}
```

> 需要合理确定 `ServerState` 中 `sysmon` 的类型（应为 `Arc<Mutex<SystemMonitor>>`，在 ServerState 构造时注入一次）。若 `SystemMonitor: Send`，直接放 `ServerState`；不可 `Send` 则包 `spawn_blocking` 外再包锁。以 `cargo check` 校正。

- [ ] **Step 3: 注册路由（`router.rs`）**

在对应 domain 区块追加：

```rust
.route("/clipboard/list", get(handlers::clipboard::list))
.route("/clipboard/remove", post(handlers::clipboard::remove))
.route("/clipboard/clear", post(handlers::clipboard::clear))
.route("/sysmon/snapshot", get(handlers::system_monitor::snapshot))
```

并在 `handlers/mod.rs` 追加 `pub mod clipboard; pub mod system_monitor;`。若项目用 `anyhow`/laundry 包 404/405，路由需与现有定义在同一个 `Router` builder 上；按 `router.rs` 现有 `.route(...)` 风格写。

- [ ] **Step 4: 依赖注入**：`crates/server/Cargo.toml` 追加 `adl-clipboard`、`adl-sysmon`。在 ServerState 初始化处创建 `ClipboardStore::new(db, data_dir)` 与 `Arc<Mutex<SystemMonitor>>`，为 Task 4 的 monitor 预留启动位置（浏览器端可只在 PC 上监听；若浏览器端启动 monitor 会依赖本机剪贴板，属桌面等价能力，浏览器预览场景也可开启）。

- [ ] **Step 5: 编译 + 测试**

```bash
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
cargo check --workspace
cargo test -p adl-server
```
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/crates/server
git commit -m "feat(server): 剪贴板/系统监控 HTTP handler 与路由"
```

---

### Self-Review

- **Spec 覆盖**：§3 剪贴板持久化/硬删除/去重合并（Task 1、3、4）、图片落盘（Task 3）、事件推送（Task 4、6）；§4 系统监控快照（Task 5）；§6 三桥接后端侧（Task 6 Tauri、Task 7 HTTP）、权限（Task 6 Step 5）、类型（Task 2）。完整覆盖后端部分。
- **占位符扫描**：仅 Task 4 的 `clipboard-win` 真实 API 调用允许"待查证后替换"（已标注原因与做法）；其余均有实质代码。`monitor.rs`/`read.rs` 骨架已标注必须在同提交内补成可编译代码，不得遗留。
- **类型一致性**：`ClipboardItem`/`SystemSnapshot`/`DiskStat`/`NetStat`/`ProcessStat` 字段在 Task 2 定义，Task 3/5/6/7 全程同名使用；`clipboard_list/remove/clear`、`sysmon_snapshot` 命名在 Task 6 固定，前端计划将沿用。