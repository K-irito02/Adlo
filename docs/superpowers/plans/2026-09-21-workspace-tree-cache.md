# Workspace Tree Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 工作区文件树冷启动毫秒级渲染（SQLite 落盘缓存 + 后台静默校准）。

**Architecture:** 后端 `tree_cache_store.rs`（SQLite 行级缓存，仿 `site_meta_cache.rs`）接入 `list_tree_cached`（L1 内存 → L2 SQLite → L3 全量扫）；IPC 经 `TreeBody.allow_stale` 参数 + `WorkspaceTreePayload{tree, from_cache}`；前端 stale 先渲染、后台静默校准、stale 永不进目录剪枝；设置存储组加基础行（路径/统计/清除）与高级项（开关/TTL）。

**Tech Stack:** Rust (rusqlite via existing deps, serde) + Tauri 2.x + React 19 + Zustand + Vitest + pnpm. 类型前后端手工镜像（`frontend/src/kernel/types-workspace-files.ts` 手写，`crates/types` 的 `TS` 派生只覆盖部分类型——本计划新增的 Rust 侧结构体同步加 `TS` 派生，前端侧手工对齐，无代码生成步骤）。

**Spec:** `docs/superpowers/specs/2026-09-21-workspace-tree-cache-design.md`

## Global Constraints

- **TDD 红绿**：每个任务先写失败测试，跑红，再实现跑绿；每个任务结束前跑通该任务测试。
- **Conventional Commit**：`type(scope): summary`，scope 取 `workspace`/`server`/`storage`/`ipc`/`stores`/`frontend`/`settings`/`i18n`。
- **i18n**：新增展示文本必须 `zh-CN` + `en-US` 双语，跑 `pnpm --dir frontend run check:i18n`。
- **四端一致**：新增/变更 IPC 方法必须同步实现 `tauri-bridge`（经 `httpBridge` 代理的只需改 `httpBridge`）/ `mock-bridge`+`mock/mock-workspace.ts` / `preview-bridge`+`preview-workspace.ts` / `httpBridge.ts`，并更新 `storage-parity.test.ts` 或 workspace 相关 parity 测试。
- **Tauri capabilities**：新增 `storage_*` Tauri 命令必须登记到 `capabilities/*.json`（仿照既有 `storage_*` 条目）。
- **Rust 质量**：`cargo fmt --all`、`cargo clippy -p <crate> --all-targets` 零警告、`cargo test -p <crate>` 通过。
- **前端质量**：`pnpm --dir frontend run lint`、`format:check`、`typecheck` 通过。
- **禁止**数据格式兼容/旧版本迁移代码（缓存是派生数据，删文件即重建，不做迁移）。
- **命令（工作目录 `ai-digital-life/`）**：`cargo test -p <crate>`；`pnpm --dir frontend exec vitest run <路径>`；`pnpm frontend:test`；`pnpm frontend:typecheck`；`pnpm frontend:lint`。

## File Structure

**新增**

| 文件 | 职责 |
|---|---|
| `crates/workspace/src/tree_cache_store.rs` | SQLite 行级树缓存：`tree_cache` 表 + `tree_cache_meta` 表（enabled/ttl），`get/put/remove/stats/get_options/set_options` |
| `frontend/src/app/features/storage-settings/TreeCacheSection.tsx`（若既有 StorageSettings 结构适合内联则并入 `StorageSettings.tsx`，以读后决定，禁止两种并存） | 设置存储组"工作区树缓存"行（基础）与高级项 |

**主要修改**

| 文件 | 改动 |
|---|---|
| `crates/workspace/src/tree.rs` | `list_tree_cached` 接 L2；`invalidate_tree_cache` 删 SQLite 行 |
| `crates/workspace/src/lib.rs` | 导出新模块 |
| `crates/kernel/src/storage/category.rs` | 新增 `TreeCache` 变体（第 11 个）+ `key()` + `ALL` + 计数注释同步 |
| `crates/server/src/handlers/workspace.rs` | `TreeBody.allow_stale` + `TreePayload{tree, from_cache}` + `remove_from_sidebar` 删行 |
| `crates/server/src/handlers/workspace_sidebar.rs` | 同上移除逻辑落点（以实际 `purge_workspace` 调用处为准，二选一，只改一处） |
| `frontend/src/kernel/types-workspace-files.ts` | 新增 `WorkspaceTreePayload` 接口 |
| `frontend/src/shared/ipc/workspace.ts` | `listTreeForWorkspace` 加 `allow_stale` + 返回 `WorkspaceTreePayload` |
| `frontend/src/shared/ipc/storage.ts` | `StorageBridge` 加 `getTreeCacheStats/setTreeCacheOptions/clearTreeCache` |
| `frontend/src/httpBridge.ts` | 上述 4 方法实现（Tauri 经此代理，无需动 `tauri-bridge/`） |
| `frontend/src/mock/mock-workspace.ts`、`mock/mock-storage.ts` | 同上（`allow_stale` 恒 miss；tree-cache 方法内存实现） |
| `frontend/src/preview-bridge/preview-workspace.ts`、storage 对应文件 | 同上 |
| `frontend/src/app/stores/actions/generalActions.ts` | `loadBatch` stale 先行 + 静默校准 + 剪枝门控 |
| `frontend/src/app/stores/actions/workspaceTreeActions.ts` | 懒加载/刷新拆包 `payload.tree` |
| `frontend/src/app/features/storage-settings/StorageSettings.tsx` 等 | 设置行 + i18n（`i18n/zh-CN/settings.ts`、`i18n/en-US/settings.ts`） |

---

## Task 1: SQLite 行级树缓存存储层

**Files:**
- Create: `ai-digital-life/crates/workspace/src/tree_cache_store.rs`
- Modify: `ai-digital-life/crates/workspace/src/lib.rs`（加 `pub mod tree_cache_store;`，仿照既有模块声明行）

**Interfaces:**
- Consumes: `adl-kernel::storage` 解析出的目录（调用方传入 `&Path`，本模块不解析路径）、`WorkspaceTreeNode`（`crate::tree` 或 `crate::types` 现有定义，以实际为准）
- Produces:
  - `pub fn open(dir: &Path) -> Result<TreeCacheStore, AppError>`（仿 `site_meta_cache.rs:114` 的 `open`：`Mutex<Connection>` 包裝）
  - `pub fn get(&self, workspace_path: &str) -> Result<Option<CachedTreeRow>, AppError>`
  - `pub fn put(&self, workspace_path: &str, tree_json: &str, captured_at: i64) -> Result<(), AppError>`（单行 JSON 超 8MB 拒绝写入，返回 `Ok` 并记 `tracing::debug!`，不报错）
  - `pub fn remove(&self, workspace_path: &str) -> Result<(), AppError>`
  - `pub fn stats(&self) -> Result<TreeCacheStats, AppError>`（`{ workspace_count, total_bytes, oldest_captured_at, newest_captured_at }`，`#[serde(rename_all = "camelCase")]` 与前端 `TreeCacheStats` 逐字段对齐；空表时 counts 为 0、时间为 `None`）
  - `pub fn get_options/set_options`（`{ enabled: bool, ttl_minutes: u64 }`，缺省 `enabled=true, ttl_minutes=15`）
  - `pub struct CachedTreeRow { tree_json: String, captured_at: i64 }`

- [ ] **Step 1: 写失败测试**

在 `tree_cache_store.rs` 底部 `#[cfg(test)] mod tests` 写（仿 `site_meta_cache.rs:214-230` 的内存/临时目录风格，用 `tempfile` 或 `std::env::temp_dir` 唯一子目录，以该 crate 既有测试为准）：

```rust
#[test]
fn put_then_get_roundtrips() {
    let dir = unique_tmp_dir("tc-roundtrip");
    let store = TreeCacheStore::open(&dir).unwrap();
    store.put("/ws/a", r#"[{"path":"a.txt"}]"#, 1000).unwrap();
    let row = store.get("/ws/a").unwrap().expect("row must exist");
    assert_eq!(row.captured_at, 1000);
    assert!(row.tree_json.contains("a.txt"));
}

#[test]
fn remove_deletes_row() {
    let dir = unique_tmp_dir("tc-remove");
    let store = TreeCacheStore::open(&dir).unwrap();
    store.put("/ws/a", "[]", 1000).unwrap();
    store.remove("/ws/a").unwrap();
    assert!(store.get("/ws/a").unwrap().is_none());
}

#[test]
fn oversized_row_is_refused_silently() {
    let dir = unique_tmp_dir("tc-big");
    let store = TreeCacheStore::open(&dir).unwrap();
    let big = "x".repeat(8 * 1024 * 1024 + 1);
    store.put("/ws/a", &big, 1000).unwrap();
    assert!(store.get("/ws/a").unwrap().is_none());
}

#[test]
fn options_default_and_roundtrip() {
    let dir = unique_tmp_dir("tc-opts");
    let store = TreeCacheStore::open(&dir).unwrap();
    let opts = store.get_options().unwrap();
    assert!(opts.enabled);
    assert_eq!(opts.ttl_minutes, 15);
    store.set_options(false, 60).unwrap();
    let opts = store.get_options().unwrap();
    assert!(!opts.enabled);
    assert_eq!(opts.ttl_minutes, 60);
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && cargo test -p adl-workspace tree_cache_store
```

Expected: FAIL（`TreeCacheStore` 不存在，编译失败即红）。

- [ ] **Step 3: 实现 `tree_cache_store.rs`**

建表 SQL（仿 `site_meta_cache.rs:22` 的 `CREATE TABLE SQL` 风格）：

```sql
CREATE TABLE IF NOT EXISTS tree_cache (
    workspace_path TEXT PRIMARY KEY,
    tree_json      TEXT NOT NULL,
    captured_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tree_cache_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

`workspace_path` 存调用方传入的原串；`open` 内 `Mutex<Connection>`（仿 `site_meta_cache.rs:114`）。`stats()` 用 `SELECT COUNT(*), COALESCE(SUM(LENGTH(tree_json)),0), MIN(captured_at), MAX(captured_at)`。TTL 不在本文件判定（调用方按 `captured_at` 判定，见 Task 2）。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && cargo test -p adl-workspace tree_cache_store && cargo clippy -p adl-workspace --all-targets 2>&1 | tail -n 2 && cargo fmt --all -- --check
```

Expected: 4 passed；clippy 零警告；fmt 干净。

- [ ] **Step 5: 提交**

```bash
cd E:/AI-DIGITAL-LIFE/SourceWorkspace
git add ai-digital-life/crates/workspace/src/tree_cache_store.rs ai-digital-life/crates/workspace/src/lib.rs
git commit -m "feat(workspace): add SQLite row-level tree cache store"
```

---

## Task 2: `list_tree_cached` 接入 L2 + 失效删行

**Files:**
- Modify: `ai-digital-life/crates/workspace/src/tree.rs`（`list_tree_cached`、`invalidate_tree_cache`）
- Modify: `ai-digital-life/crates/workspace/src/tree.rs` tests（追加 2 用例，见 Step 1）

**Interfaces:**
- Consumes: Task 1 的 `TreeCacheStore::open/get/put/remove`；`now_ms()`（`tree.rs` 既有 helper，以实际签名为准）；DB 目录由调用方经 `adl-kernel::storage` 解析后传入——`list_tree_cached(root)` 签名**不得**改变（调用方众多），DB 目录解析收敛到一处内部 helper `tree_cache_dir()`（读 `adl-kernel::storage` 对应分类目录；解析失败则跳过 L2，行为等同现状）。
- Produces: 同名函数语义升级（L1 内存 → L2 SQLite → L3 全量扫并回写）；`invalidate_tree_cache` 附带删 SQLite 行。

- [ ] **Step 1: 写失败测试**（`tree.rs` 的 `tree_cache_tests` 模块追加）

```rust
/// L2：跨“内存清空”后仍命中（模拟进程重启后 L1 丢失，L2 落盘存活）。
#[test]
fn list_tree_cached_survives_memory_clear_via_disk_row() {
    let tmp = unique_tmp_dir("l2-survive");
    std::fs::write(tmp.join("a.txt"), b"a").unwrap();
    let first = list_tree_cached(&tmp).unwrap();
    assert!(first.iter().any(|n| n.path == "a.txt"));
    // 仅清内存代际（不删盘）：复用 invalidate 的内存部分语义——
    // 实现方式：直接调 crate 内可见的内存清理（若无则用新文件路径等价模拟）。
    // 断言：第二次调用仍返回同样节点（来自 L2），且不触发重扫。
    let second = list_tree_cached(&tmp).unwrap();
    assert_eq!(first.len(), second.len());
    cleanup(&tmp);
}

/// 失效删行：invalidate 后 L2 无行，下次调用重扫（captured_at 更新）。
#[test]
fn invalidate_removes_disk_row() {
    let tmp = unique_tmp_dir("l2-invalidate");
    std::fs::write(tmp.join("a.txt"), b"a").unwrap();
    let _ = list_tree_cached(&tmp).unwrap();
    invalidate_tree_cache(&tmp);
    assert!(tree_cache_store_row_absent(&tmp), "disk row must be gone");
    cleanup(&tmp);
}
```

注：`tree_cache_store_row_absent` 为测试内小 helper（直调 `TreeCacheStore::open(&tree_cache_dir()).get(...)` 判 `is_none`），与实现同文件，可见性无问题。若 `tree_cache_dir` 在测试上下文不可用，改用 `unique_tmp_dir` 的等价隔离（不得改生产签名）。

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && cargo test -p adl-workspace --lib tree_cache_tests::list_tree_cached_survives_memory_clear_via_disk_row tree_cache_tests::invalidate_removes_disk_row
```

Expected: FAIL（L2 不存在：第二个用例的 helper 未定义即编译失败；或行为不符）。

- [ ] **Step 3: 实现**

```rust
pub fn list_tree_cached(root: &Path) -> Result<Vec<WorkspaceTreeNode>, AppError> {
    if let Some(cached) = tree_cache_get(root) {
        return Ok(cached); // L1：行为不变
    }
    // L2：SQLite 行（进程重启后存活）
    if let Some(nodes) = read_disk_row(root) {
        // 回填 L1（沿用 put 的代际校验语义：generation_get → tree_cache_put）
        return Ok(nodes);
    }
    // L3：全量扫并回写 L1 + L2（沿用现有 generation/put 代码）
    // ...（保留现有 119-124 行逻辑，末尾加 L2 put）
}
```

`invalidate_tree_cache` 末尾加 `TreeCacheStore::open(&tree_cache_dir()).ok() → remove(normalize_cache_key(root))`（best-effort：失败只记 `debug!`，永不抛错——失效路径不得让写操作失败）。`normalize_cache_key` 复用既有函数（`tree.rs:45`），保证与 L2 读写同一键。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && cargo test -p adl-workspace && cargo clippy -p adl-workspace --all-targets 2>&1 | tail -n 2
```

Expected: 全绿（含既有 103 用例）；clippy 零警告。

- [ ] **Step 5: 提交**

```bash
cd E:/AI-DIGITAL-LIFE/SourceWorkspace
git add ai-digital-life/crates/workspace/src/tree.rs
git commit -m "feat(workspace): serve stale tree rows from disk cache"
```

---

## Task 3: 存储分类注册第 11 类

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/storage/category.rs`（变体 + `key()` + `ALL` + 计数注释）
- Modify: 所有枚举 `StorageCategory` 穷尽匹配处（编译器会指出：`cargo check` 报错即清单，逐个补 `TreeCache` 分支；若某分支是 UI 展示顺序数组，一并追加）
- Modify: 相关单测（`category.rs` 内或 `crates/storage`、`crates/migration` 中枚举总数的断言：把 10 改为 11；`StorageSettings` 的 stationary 测试若有数量断言同步改）

**Interfaces:**
- Consumes: 无（纯注册）
- Produces: `StorageCategory::TreeCache`，`key() == "tree_cache"`，`ALL` 长度 11；迁移/占用/预检 machinery 自动覆盖（通用代码按 `ALL` 遍历）。

- [ ] **Step 1: 加变体并跑出编译错误清单**

```rust
TreeCache,
```

```bash
cd ai-digital-life && cargo check --workspace 2>&1 | grep -E "^error" | head -n 20
```

Expected: 穷尽匹配错误列表（即待补清单）。

- [ ] **Step 2: 逐个补分支 + 改数断言**

`key()` 加 `"tree_cache"`；`ALL` 数组追加并改长度为 11；文件头 `10 个可配置落点` 注释改为 11；UI 展开顺序（`ALL` 即顺序）把 `TreeCache` 放 `SiteMetaDb` 之后（同类 DB 相邻）。`crates/storage` 与 `crates/migration` 的测试若断言总数，改为 11。

- [ ] **Step 3: 验证**

```bash
cd ai-digital-life && cargo check --workspace 2>&1 | tail -n 2 && cargo test -p adl-kernel -p adl-storage -p adl-migration 2>&1 | grep -E "test result" | head -n 6
```

Expected: check 通过；三 crate 测试全绿。crate 名以各自 `Cargo.toml` 的 `name` 为准（若 `adl-migration` 不存在则为实际名——先 `grep -m1 ^name crates/migration/Cargo.toml` 确认，不得臆测）。

- [ ] **Step 4: 提交**

```bash
cd E:/AI-DIGITAL-LIFE/SourceWorkspace
git add ai-digital-life/crates/kernel/src/storage/category.rs
git commit -m "feat(storage): register tree-cache as migratable category"
```

---

## Task 4: 服务端 `allow_stale` + `from_cache` + 移除删行

**Files:**
- Modify: `ai-digital-life/crates/server/src/handlers/workspace.rs`（`TreeBody` + `list_tree` handler）
- Modify: `ai-digital-life/crates/server/src/handlers/workspace_sidebar.rs`（`remove_from_sidebar` 内删缓存行，二选一落点：若 `purge_workspace`（`crates/storage/src/purge.rs`）已是统一清除口，则改那里；否则改 handler。先读 `purge.rs` 的签名再定，**只改一处**）
- Test: handler 所在文件的 `#[cfg(test)]` 或既有 handler 测试文件（仿照同目录既有 POST handler 测试写法）

**Interfaces:**
- Consumes: Task 1–2 的存储层；`run_blocking` 既有模式（`workspace.rs:423-431`）
- Produces:
  - `TreeBody { workspace_path: Option<String>, force: bool, allow_stale: bool }`（全 `#[serde(default)]`，老客户端不传即全量语义， wire 兼容）
  - `TreePayload { tree: Vec<WorkspaceTreeNode>, from_cache: bool }`（`Serialize` + `TS` 派生，与前端手工类型逐字段对齐，见 Task 5）
  - 移除工作区后该 `root_path` 的缓存行消失（best-effort）

- [ ] **Step 1: 写失败测试**

```rust
#[test]
fn stale_row_is_served_with_from_cache_true() {
    // 准备：直写一行（调 tree_cache_store::put，或先 force 扫一次再读）。
    // POST /workspace/tree { workspacePath, allowStale: true } → success 且 fromCache == true。
}

#[test]
fn allow_stale_false_ignores_disk_row() {
    // 同一工作区：allowStale 缺省 → fromCache == false（全量语义不受缓存影响）。
}

#[test]
fn remove_workspace_deletes_cache_row() {
    // 建工作区 → 写缓存行 → 调 remove_from_sidebar → 断言行消失（且移除本身成功）。
}
```

测试脚手架仿照同文件/同目录既有 handler 测试（`State` 构造与 `Bytes` body 组装抄最近的 POST 用例，不得自创 harness）。

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && cargo test -p adl-server tree_cache
```

Expected: FAIL（字段/方法不存在）。crate 名以 `crates/server/Cargo.toml` 为准（`adl-server` 存疑则先确认）。

- [ ] **Step 3: 实现**

`TreeBody` 加：

```rust
/// 为 true 时允许返回 SQLite 缓存行（stale-while-revalidate 的首包）。
#[serde(default)]
allow_stale: bool,
```

handler 内（`workspace.rs:420-431` 段改写）：

```rust
let allow_stale = input.allow_stale && !input.force;
let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
    let (tree, from_cache) = if allow_stale {
        match adl_workspace::list_tree_cached_stale_ok(path.as_path())? {
            // 返回 (tree, from_cache)；stale 命中即返回，不扫
            ...
        }
    } else if force {
        (adl_workspace::list_tree_force(path.as_path())?, false)
    } else {
        (adl_workspace::list_tree_cached(path.as_path())?, false)
    };
    Ok(serde_json::to_value(TreePayload { tree, from_cache })?)
})
.await;
```

注：`list_tree_cached_stale_ok` 需在 Task 2 的实现中一并导出（若 Task 2 未导出，在本任务补，**不得**回头改 Task 2 的测试）：语义 = L1/L2 命中即返 `(tree, true)`，miss 则全量扫返 `(tree, false)`（miss 时本次即新鲜，无需二次校准——调用方见 `from_cache:false` 即知）。tracing `debug!` 行追加 `allow_stale` 与 `from_cache` 字段（沿用既有 `elapsed_ms/force/root` 格式）。

移除删行（`workspace_sidebar.rs:222-240` 段内，`purge_workspace` 成功后）：

```rust
// 树缓存行同删（best-effort：失败只记日志，永不让移除失败）
if let Some(root) = root_path.as_deref() {
    if let Err(e) = adl_workspace::remove_tree_cache_row(root) {
        tracing::debug!(root = root, error = %e, "tree cache row removal skipped");
    }
}
```

`remove_tree_cache_row` 为 `tree.rs` 新增小函数（`invalidate_tree_cache` 的 SQLite 部分；若 Task 2 已将其拆出则直接复用，不得重复实现）。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && cargo test -p adl-server workspace 2>&1 | grep -E "test result" | head -n 4 && cargo clippy -p adl-server --all-targets 2>&1 | tail -n 2
```

Expected: 全绿；clippy 零警告。

- [ ] **Step 5: 提交**

```bash
cd E:/AI-DIGITAL-LIFE/SourceWorkspace
git add ai-digital-life/crates/server/src/handlers/workspace.rs ai-digital-life/crates/server/src/handlers/workspace_sidebar.rs ai-digital-life/crates/workspace/src/tree.rs
git commit -m "feat(server): serve stale tree rows with from-cache flag"
```

---

## Task 5: 共享 IPC 类型（payload + 桥方法签名）

**Files:**
- Modify: `ai-digital-life/frontend/src/kernel/types-workspace-files.ts`（`WorkspaceTreeNode` 接口附近追加）
- Modify: `ai-digital-life/frontend/src/shared/ipc/workspace.ts`（`listTreeForWorkspace` + `listTree` 签名）
- Modify: `ai-digital-life/frontend/src/shared/ipc/storage.ts`（`StorageBridge` 追加三方法）

**Interfaces:**
- Consumes: Task 4 的 Rust `TreePayload`（字段 `camelCase`：`tree` / `fromCache`，与 `GitSnapshot` 的 `rename_all = "camelCase"` 惯例一致）
- Produces:
  - `export interface WorkspaceTreePayload { tree: WorkspaceTreeNode[]; fromCache: boolean }`
  - `listTreeForWorkspace(workspacePath, options?: { force?: boolean; allowStale?: boolean }) => Promise<IpcResult<WorkspaceTreePayload>>`
  - `listTree(options?: { force?: boolean; allowStale?: boolean }) => Promise<IpcResult<WorkspaceTreePayload>>`（`listTree` 一并改——同命令同 handler，不改即类型分叉；其调用点在下一步任务中同步改）
  - `getTreeCacheStats() => Promise<IpcResult<TreeCacheStats>>`，`setTreeCacheOptions(opts: { enabled: boolean; ttlMinutes: number }) => Promise<IpcResult<void>>`，`clearTreeCache() => Promise<IpcResult<void>>`，其中 `export interface TreeCacheStats { workspaceCount: number; totalBytes: number; oldestCapturedAt: number | null; newestCapturedAt: number | null }`

- [ ] **Step 1: 写失败测试**（`frontend/src/shared/ipc/__tests__/tree-payload-shape.test.ts`，新建；仿 `searchWindow.test.ts` 的类型守卫风格）

```ts
import { describe, it, expect } from 'vitest';
import type { WorkspaceTreePayload, TreeCacheStats } from '@kernel/types-workspace-files';

describe('tree cache payload shape', () => {
  it('payload carries the tree and its staleness', () => {
    const payload: WorkspaceTreePayload = { tree: [], fromCache: true };
    expect(payload.fromCache).toBe(true);
  });

  it('stats shape matches the settings UI needs', () => {
    const stats: TreeCacheStats = {
      workspaceCount: 1,
      totalBytes: 1234,
      oldestCapturedAt: 100,
      newestCapturedAt: 200,
    };
    expect(stats.workspaceCount).toBe(1);
  });
});
```

`TreeCacheStats` 放 `kernel/types-workspace-files.ts` 还是 storage 相关类型文件——以后者为准（读 `shared/ipc/storage.ts` 的 `StorageStatus` 定义位置，把新接口放同一文件；测试 import 路径随之调整，**不得**臆测路径）。

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/shared/ipc/__tests__/tree-payload-shape.test.ts
```

Expected: FAIL（类型不存在，`tsc` 报错即红——vitest 的 esbuild 不查类型，故本用例的 RED 以 `pnpm --dir frontend run typecheck` 报错为准；两个命令都跑，记录两种输出）。

- [ ] **Step 3: 实施**（按 Produces 逐条加类型；`StorageBridge` 三方法附 `@command` 注释：`storage_tree_cache_stats` / `storage_tree_cache_options` / `storage_tree_cache_clear`，`@see` 四端指向 `tauri-bridge/index.ts → storage.*` / `preview-bridge/index.ts` / `mock-bridge.ts`，仿既有 `getStatus` 注释格式）

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/shared/ipc/__tests__/tree-payload-shape.test.ts && pnpm --dir frontend run typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd E:/AI-DIGITAL-LIFE/SourceWorkspace
git add ai-digital-life/frontend/src/kernel/types-workspace-files.ts ai-digital-life/frontend/src/shared/ipc/workspace.ts ai-digital-life/frontend/src/shared/ipc/storage.ts ai-digital-life/frontend/src/shared/ipc/__tests__/tree-payload-shape.test.ts
git commit -m "feat(ipc): add stale tree payload and tree-cache storage methods"
```

---

## Task 6: 四端桥实现 + parity 测试

**Files:**
- Modify: `ai-digital-life/frontend/src/httpBridge.ts`（`listTreeForWorkspace`、`listTree`：POST body 加 `allowStale`，泛型改 `WorkspaceTreePayload`；新增 storage 三方法调对应 `/storage/tree-cache/*` 路由——路由名以 Task 4 的服务端路由为准，不得臆测）
- Modify: `ai-digital-life/frontend/src/mock/mock-workspace.ts`（`listTreeForWorkspace: async (…)` 返回 `{ tree, fromCache: false }` 包裹；`allowStale` 恒 miss）
- Modify: `ai-digital-life/frontend/src/mock/mock-storage.ts`（三方法内存实现：stats 零值、options 内存保持、clear 幂等成功）
- Modify: `ai-digital-life/frontend/src/preview-bridge/preview-workspace.ts`（同 mock 语义）
- Modify: preview-bridge 的 storage 对应文件（读 `preview-bridge/index.ts` 的 storage 段定位，以实际文件名为准）
- Modify: `ai-digital-life/frontend/src/shared/ipc/__tests__/storage-parity.test.ts`（三方法四端一致行）+ workspace parity 测试文件（`workspace-freshness-parity.test.ts` 或同目录实际存在者，加 `fromCache` 恒 false 断言）
- Modify: `ai-digital-life/capabilities/*.json`（新增三条 `storage_*` 命令白名单，仿照既有 `storage_*` 条目格式；以实际 capabilities 文件名为准）

**Interfaces:**
- Consumes: Task 5 类型
- Produces: 四端 `allowStale` 透传 + payload 包裹 + storage 三方法可用；parity 全绿

- [ ] **Step 1: 写失败测试**（先加 parity 行，再实现）

```ts
// storage-parity.test.ts 追加（仿既有行格式）：
it('tree-cache methods behave identically on all bridges', async () => {
  for (const bridge of [tauriBridge, mockBridge, previewBridge, httpBridge]) {
    const stats = await bridge.storage.getTreeCacheStats();
    expect(stats.ok).toBe(true);
  }
});
```

桥变量名与取法抄该文件既有行，不得臆测。

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/shared/ipc/__tests__/storage-parity.test.ts
```

Expected: FAIL（`getTreeCacheStats is not a function`）。

- [ ] **Step 3: 实施**（httpBridge POST body：`POST(options?.force || options?.allowStale ? { workspacePath, ...(options ?? {}) } : { workspacePath })`——保持 force-only 旧调用的 body 逐字不变，避免旧快照测试抖动；mock/preview 返回 `{ ok: true, data: { tree: <原数组>, fromCache: false } }`）

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/shared/ipc/__tests__/ && pnpm --dir frontend run typecheck
```

Expected: PASS（含既有 parity）。

- [ ] **Step 5: 提交**

```bash
cd E:/AI-DIGITAL-LIFE/SourceWorkspace
git add ai-digital-life/frontend/src/httpBridge.ts ai-digital-life/frontend/src/mock/mock-workspace.ts ai-digital-life/frontend/src/mock/mock-storage.ts ai-digital-life/frontend/src/preview-bridge/ ai-digital-life/frontend/src/shared/ipc/__tests__/ ai-digital-life/capabilities/
git commit -m "feat(ipc): implement stale tree payload across all bridges"
```

---

## Task 7: `loadBatch` stale 先行 + 静默校准

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/actions/generalActions.ts`（`loadBatch` 内 `treeLoader` + 校准段）
- Modify: `ai-digital-life/frontend/src/app/stores/actions/generalActions.test.ts`（追加 3 用例，见 Step 1）

**Interfaces:**
- Consumes: Task 6 的桥（含 `fromCache`）；`refreshOneWorkspaceTree(ws, path, { silent: true })`（既有用 force 全量语义，校准复用它）；`applyTreeLoadedPrune` + `collectDirPaths`（既有，`generalActions.ts:11-12` 已导入）
- Produces: stale 首包即渲染 + 后台静默校准 + 剪枝只消费新鲜树；`workspaceTreeLoading` 在 stale 可用时永不置 true

- [ ] **Step 1: 写失败测试**（`generalActions.test.ts` 追加；store 种子与断言仿该文件既有 `loadBatch` 用例，`digitalLife` 桥 mock 仿既有写法）

```ts
it('renders the stale tree immediately without the loading flag', async () => {
  // 桥对 allowStale 首包返回 { tree: STALE, fromCache: true }。
  // 断言：首包 set 后 workspaceTrees[id] === STALE 且 workspaceTreeLoading[id] !== true。
});

it('silently calibrates after a stale first packet and prunes only on the fresh tree', async () => {
  // 首包 stale + 校准包 fresh（含新目录）。
  // 断言：最终树为 fresh；applyTreeLoadedPrune 只收到 fresh 树的目录集
  // （cap：对 pruneWiring 设 spy，或断言 expandedFileTreePaths 的剪枝结果只含 fresh 路径——
  // 以该文件既有 spy 写法为准，二选一，不得自创 harness）。
});

it('falls back to the blocking load when no stale row exists', async () => {
  // 首包 fromCache:false → loading 正常置位又清除，与现状一致。
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/actions/generalActions.test.ts
```

Expected: FAIL（`allowStale` 未透传 / 无校准逻辑）。

- [ ] **Step 3: 实施**

`treeLoader` 改为：

```ts
treeLoader: () =>
  window.digitalLife.workspace
    .listTreeForWorkspace(w.path, { allowStale: true })
    .then((r) => (r.ok ? { tree: r.data.tree, fromCache: r.data.fromCache } : undefined)),
```

`loadBatch` 内：首包 `fromCache:true` 的工作区记入 `staleIds`，其 `workspaceTreeLoading` 不置 true（跳过 154 行的该 id 置位——以 `accumulateBatch` 调用点为准改条件）；`loadBatch` 返回后，对 `staleIds` 逐个 `await get().refreshOneWorkspaceTree(id, path, { silent: true })`，成功且无 `workspaceTreeErrors[id]` 则 `applyTreeLoadedPrune(id, collectDirPaths(get().workspaceTrees[id]))`（沿用 197-204 行的成功分支形态）。TTL 窗判定在服务端（行年龄 < TTL 时服务端直接回新鲜行并标 `fromCache:false`——**前端不判 TTL**，职责切分点，见 spec §2/§4）。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/actions/generalActions.test.ts && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/pruneWiring.test.ts && pnpm frontend:test && pnpm frontend:typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd E:/AI-DIGITAL-LIFE/SourceWorkspace
git add ai-digital-life/frontend/src/app/stores/actions/generalActions.ts ai-digital-life/frontend/src/app/stores/actions/generalActions.test.ts
git commit -m "feat(stores): render stale trees first, calibrate silently"
```

---

## Task 8: 懒加载/刷新拆包适配

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/actions/workspaceTreeActions.ts`（`createLazyLoader` 的 `fetchFn` + `refreshOneWorkspaceTree` 的取值）
- Modify: 相关测试（`workspaceTreeActions` 测试文件若存在则同步；`generalActions.test.ts` 的 refresh 相关用例；`useFileCreation.test.tsx` 的 `expandFileTreePathChain` mock 不受影响——其签名未变）

**Interfaces:**
- Consumes: Task 6 类型
- Produces: 用户触发路径（展开/刷新）保持全量新鲜语义（`allowStale` 永 false），仅拆包 `payload.tree`

- [ ] **Step 1: 写失败测试**

```ts
it('unwraps the payload tree on lazy load', async () => {
  // 桥返回 { tree: NODES, fromCache: false } → workspaceTrees[id] === NODES。
});
```

落点文件：`workspaceTreeActions` 若有专属测试文件则放彼，否则放入 `generalActions.test.ts`（以实际存在为准，先 `ls` 确认，不得臆测文件名）。

- [ ] **Step 2: 运行测试确认失败**

Expected: FAIL（`workspaceTrees[id]` 被写成整个 payload 对象）。

- [ ] **Step 3: 实施**

```ts
(path) =>
  window.digitalLife.workspace.listTreeForWorkspace(path).then((r) =>
    r.ok ? { ok: true as const, data: r.data.tree } : r,
  ),
```

`refreshOneWorkspaceTree` 内 `result.data` 改为 `result.data.tree`（两处：`set workspaceTrees` 与后续使用，逐处改）。`force:true` 调用保持不变（强制语义由服务端承担）。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/actions/ && pnpm frontend:typecheck
```

Expected: PASS（`tsc` 会抓住遗漏的拆包点——类型已改，漏改即报错）。

- [ ] **Step 5: 提交**

```bash
cd E:/AI-DIGITAL-LIFE/SourceWorkspace
git add ai-digital-life/frontend/src/app/stores/actions/
git commit -m "refactor(stores): unwrap stale tree payload on fresh paths"
```

---

## Task 9: 设置存储组树缓存行（基础 + 高级）+ i18n

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/storage-settings/StorageSettings.tsx`（新增区段，仿照既有 `StorageCategoryRow` 用法；`StorageSettings.test.tsx` 同步）
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/settings.ts`、`ai-digital-life/frontend/src/app/i18n/en-US/settings.ts`（键名前缀 `treeCache`，仿邻行格式）
- Modify: `ai-digital-life/frontend/src/mock/mock-storage.ts` 的三方法（Task 6 已做内存版，本任务只消费；若 Task 6 未做则在此补，不得留空）

**Interfaces:**
- Consumes: Task 6 的 `getTreeCacheStats/setTreeCacheOptions/clearTreeCache`（经 `useAppStore` 或直调 bridge，以 `StorageSettings.tsx:57-129` 的既有 `bridge.getStatus()` 调用形态为准）
- Produces:
  - 基础行：路径（复用 `StorageCategoryRow` + 新 `TreeCache` 分类，走既有迁移对话框）、大小/工作区数/缓存时间（`stats()`）、"清除缓存"按钮（二次确认仿照既有危险操作写法）。
  - 高级：总开关（默认开）+ TTL 下拉（5/15/60 分钟/1 天，默认 15）。
  - i18n key（示例形状，以 `settings.ts` 实际导出风格为准）：
    - `treeCacheTitle` / `treeCacheClear` / `treeCacheSize` / `treeCacheWorkspaces` / `treeCacheAge` / `treeCacheEnabled` / `treeCacheTtl`

- [ ] **Step 1: 写失败测试**（`StorageSettings.test.tsx` 追加，仿既有 bridge mock 写法）

```tsx
it('shows tree-cache stats and clears on confirm', async () => {
  // bridge.storage.getTreeCacheStats mock → { workspaceCount: 2, totalBytes: 1024, oldestCapturedAt: 1, newestCapturedAt: 2 }。
  // 断言：行渲染 "2" 与大小文本；点击清除 → clearTreeCache 被调一次。
});

it('toggling the master switch calls setTreeCacheOptions', async () => {
  // 关闭 → setTreeCacheOptions({ enabled: false, ttlMinutes: 15 }) 被调一次。
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/features/storage-settings/StorageSettings.test.tsx
```

Expected: FAIL（无该区段）。

- [ ] **Step 3: 实施**（区段位置：既有分类行之后、高级折叠区内/外按该文件既有分组为准；路径行必须走 `StorageCategoryRow` + 迁移对话框，不得自制路径编辑器）

- [ ] **Step 4: 运行测试确认通过 + i18n 覆盖**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/features/storage-settings/ && pnpm --dir frontend run check:i18n && pnpm frontend:typecheck
```

Expected: PASS；i18n 无缺失。

- [ ] **Step 5: 提交**

```bash
cd E:/AI-DIGITAL-LIFE/SourceWorkspace
git add ai-digital-life/frontend/src/app/features/storage-settings/ ai-digital-life/frontend/src/app/i18n/zh-CN/settings.ts ai-digital-life/frontend/src/app/i18n/en-US/settings.ts
git commit -m "feat(settings): add tree-cache storage section"
```

---

## Task 10: 端到端验收与收尾

**Files:**
- Modify: 无（除验收发现的问题修复）
- Read: `docs/superpowers/specs/2026-09-21-workspace-tree-cache-design.md` §6

**Interfaces:**
- Consumes: Task 1–9 全部产出
- Produces: 验收记录（回填 spec §6 预留小节）+ 真机确认

- [ ] **Step 1: 冷启动验收（桌面模式）**

```bash
cd ai-digital-life && pnpm dev:tauri
```

1. 完全关闭应用 → 重启 → 工作区树**秒级**出现（stale 渲染；诊断日志应含 `fromCache:true` 首包）。
2. 数秒内无 loading 闪烁（校准静默；`workspaceTreeRefreshing` 可转，`workspaceTreeLoading` 不得置位）。
3. 控制台 `localStorage` 无新增大键（树不进前端存储）。
4. 设置 → 存储 → 工作区树缓存行显示大小/数量/时间；点清除 → 行清零；重启后重扫重建。

- [ ] **Step 2: 移除与开关验收**

1. 移除某工作区 → 该行从统计中消失（`stats()` 复查）。
2. 高级开关关闭 → 重启走全量（转圈行为与现状一致）；再打开 → 恢复 stale 即显。
3. 同路径重建工作区 → 冷扫重建（无旧树复活）。

- [ ] **Step 3: 全量门禁**

```bash
cd ai-digital-life && cargo fmt --all -- --check && cargo clippy --workspace --all-targets 2>&1 | tail -n 2 && pnpm frontend:lint && pnpm --dir frontend run format:check && pnpm frontend:typecheck && pnpm frontend:test
```

Expected: 全绿（`cargo test --workspace` 因耗时仅在有 Rust 改动时全跑——本计划有，跑 `cargo test -p adl-workspace -p adl-server -p adl-kernel -p adl-storage` 受影响 crate 全量；crate 名以 `Cargo.toml` 为准）。

- [ ] **Step 4: 回填 spec 并提交**

把验收结果写入 spec §6 末尾"验收记录"小节：

```bash
cd E:/AI-DIGITAL-LIFE/SourceWorkspace
git add docs/superpowers/specs/2026-09-21-workspace-tree-cache-design.md
git commit -m "docs(tree-cache): record acceptance results"
```

Expected: spec 含实测冷启动耗时（stale 渲染 ms + 校准完成 ms）与三项验收结论。
