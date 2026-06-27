# 第 38-39 轮重构执行报告

**日期**：2026-06-08
**关联报告**：[重构进度报告](../../重构洞察/REFACTORING_PROGRESS_REPORT.md)
**状态**：✅ 全部完成

---

## 执行概览

基于 06-08 重构洞察报告中识别的 12 项高优先级问题，分两阶段执行修复。完成后通过 `cargo clippy`（0 warnings）、`cargo test`（122/122 passed）门禁。

| 阶段 | 任务数 | 核心内容 | 文件变更 |
|------|--------|----------|---------|
| Phase A: 低风险修复 | 5 | 死代码删除、useShallow 补充、依赖倒置、store 提取、anyhow 修复 | 7 文件修改 |
| Phase B: 核心重构 | 5 | PTY Mutex 合并、3 crate 合并、ChangesPanel 拆分、storage/workspace 拆分 | 18 文件创建/修改 |
| **总计** | **10** | **crate 依赖修复 + 文件拆分 + 死代码清理** | **-6 目录 + 7 新文件** |

---

## 详细执行记录

### Phase A：低风险修复

| 任务 | 提交 | 文件变更 | 说明 |
|------|------|---------|------|
| A1 localStorageUtils 删除 | `7a94e5b` | `localStorageUtils.ts` 删除 | 重复于 shared.ts，完全相同内容 |
| A2 command→task 依赖倒置 | `138d01e` | `command_risk.rs` 新建 + `kernel/lib.rs` + `command/lib.rs` + `task/lib.rs` + `Cargo.toml` 修改 | `assess_command_risk`/`requires_approval` 移至 `kernel/src/command_risk.rs`，消除 `command → task` 循环依赖 |
| A3 useShallow 补充 | `b680d6d` | `BrowserPanel.tsx` 修改 | 2 处数组选择器（`recentWorkspaces` + `browserHistory`）包裹 useShallow |
| A4 store 订阅提取 | `d3d4287` | `useChangesPanelStore.ts` 新建 + `ChangesPanel.tsx` 修改 | 将 ChangesPanel 的 store 订阅提取为独立 hook (-34 行) |
| A5 anyhow 字符串匹配修复 | `61dd279` | `error.rs` 修改 | 从 `.to_ascii_lowercase()` 字符串匹配改为类型向下转型（`error.downcast_ref::<AppError>()`） |

### Phase B：核心重构

| 任务 | 提交 | 文件变更 | 说明 |
|------|------|---------|------|
| B1 PTY Mutex 合并 | `03e38c0` | `pty.rs` 修改 | 7 个独立 `Mutex` 字段 → 2 个分组结构体：`PtyControl`（master/child/status）+ `PtyIo`（reader/writer/cols/rows） |
| B2 3 个微型 crate 合并 | `fef23d3` | 6 目录删除 + 3 模块新建 + 所有引用更新 | `adl-logger`(44行)、`adl-config`(66行)、`adl-events`(124行) → 合并入 `adl-kernel` 的 `logger`/`config`/`events` 模块 |
| B3 ChangesPanel 拆分 | `3584ef5` | `PatchReviewSection.tsx` + `DiffEditorSection.tsx` 新建 + `ChangesPanel.tsx` 修改 | 1183→775 行 (-34%)。提取补丁审核区域 (297行) + 差异编辑器区域 (203行)。新增 `onDiffMount` prop |
| B4 storage/lib.rs 拆分 | 本会话 | 5 文件新建 + `lib.rs` 重写 | 765→715 行，单文件拆分为 `connection.rs`/`entity_table.rs`/`crud.rs`/`session.rs`/`purge.rs` |
| B5 workspace/lib.rs 拆分 | 本会话 | 2 文件新建 + `lib.rs` 修改 | 632→406 行 (测试保留)，提取 `detect.rs`/`preview.rs` |

---

## 过程中遇到的挑战

### 1. 合并 3 个 mini crate 的全局查找替换

**问题**：`adl-logger`、`adl-config`、`adl-events` 被 10+ 个 crate 引用，需要精确识别并替换所有 `use adl_logger::xxx`、`use adl_config::xxx`、`use adl_events::xxx` 为 `use adl_kernel::xxx`。

**解决**：依次 grep 每个 crate 的所有引用，逐一更新。其中 `adl-events` 的 `EventBus` 同时被前端和 Rust 端引用，需要同时更新 Tauri command 层。

**教训**：跨 crate 重命名操作必须 grep 完整路径（包括 `Cargo.toml` 中的 `[dependencies]` 声明），不能遗漏配置文件中的引用。

### 2. storage/workspace 拆分时的测试模块引用

**问题**：提取 `detect.rs` 后，`workspace` 测试模块使用 `super::*` 引用的 `WorkspaceType`、`WorkspaceChangeKind`、`WorkspaceChangeStatus` 不再在 `lib.rs` 的作用域中——这些类型仅出现在提取后的 `detect.rs`/`preview.rs` 中，不再从 `lib.rs` 重新导出。

**解决**：在测试模块中添加 `use adl_kernel::{WorkspaceType, WorkspaceChangeKind, WorkspaceChangeStatus}` 显式导入。

**教训**：Rust 的 `super::*` 仅导入父模块显式声明的项。提取功能到子模块后，即使 `pub use` 重新导出了函数，但函数签名中的参数类型不会自动成为 `super::*` 的一部分。测试模块需要补充导入被测试函数使用的依赖类型。

### 3. `impl crate::connection::Database` 跨模块 impl 语法

**问题**：在 `crud.rs`、`session.rs`、`purge.rs` 中需要为 `connection.rs` 中定义的 `Database` 结构体添加 impl 块。使用 `impl crate::connection::Database { ... }` 是有效的 Rust 语法，因为同一 crate 内的所有 impl 块由编译器合并。

**注意点**：跨模块 impl 块可以访问结构体的私有字段（`self.pool`），因为所有模块属于同一 crate。但方法仍然只能在结构体定义模块中可见——这是 Rust 特意设计的。

**教训**：这种模式是 Rust 中拆分大型 impl 块的标准做法。关键约束是所有 `impl` 块必须在同一 crate 内。

---

## 架构变化

### 新增文件

```
# storage crate
crates/storage/src/connection.rs       # 79 行 — Database 结构体 + open/conn/execute/init/state/transaction
crates/storage/src/entity_table.rs     # 78 行 — EntityTable 枚举 + define_entity_table! 宏 + SQL 生成器
crates/storage/src/crud.rs             # 145 行 — save/load/list/delete 实体 CRUD
crates/storage/src/session.rs          # 64 行 — save_session_optimized / list_sessions_by_pinned_order
crates/storage/src/purge.rs            # 197 行 — WorkspacePurgeReport + purge/prune 操作

# workspace crate
crates/workspace/src/detect.rs         # 89 行 — detect_root / workspace_type / open_workspace / stable_workspace_id
crates/workspace/src/preview.rs        # 58 行 — read_change_preview

# ChangesPanel 拆分
frontend/src/app/regions/right-panel/panels/PatchReviewSection.tsx  # 297 行
frontend/src/app/regions/right-panel/panels/DiffEditorSection.tsx   # 203 行
frontend/src/app/regions/right-panel/panels/useChangesPanelStore.ts # store 订阅 hook

# kernel crate 新模块
crates/kernel/src/command_risk.rs      # assess_command_risk / requires_approval（从 command crate 迁入）
crates/kernel/src/logger.rs            # 从 adl-logger crate 迁入
crates/kernel/src/config.rs            # 从 adl-config crate 迁入
crates/kernel/src/events.rs            # 从 adl-events crate 迁入
```

### 删除文件/目录

```
# 死代码
frontend/src/app/stores/localStorageUtils.ts

# 微型 crate 目录
crates/logger/     → kernel/src/logger.rs
crates/config/     → kernel/src/config.rs
crates/events/     → kernel/src/events.rs
```

### 修改文件

```
src-tauri/src/error.rs          # anyhow 字符串匹配 → 类型向下转型
src-tauri/Cargo.toml            # 移除已合并 crate 依赖
crates/command/Cargo.toml       # 移除 task 依赖
crates/task/Cargo.toml          # 移除 command 依赖
crates/kernel/Cargo.toml        # 新增模块文件引用
crates/kernel/src/lib.rs        # 添加模块声明
workspace/Cargo.toml            # 移除已合并 crate 依赖
crates/pty/src/pty.rs           # 7 Mutex → 2 分组结构体
frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx  # 1183→775 行
frontend/src/app/features/browser/browserpanel.tsx             # +2 处 useShallow
```

### 模块依赖简化

| crate | 之前 | 之后 |
|-------|------|------|
| `command` | 依赖 `task`、`kernel` | 依赖 `kernel` |
| `task` | 依赖 `command` | 不依赖 `command` |
| 微型 crate | `logger`/`config`/`events` 独立 | 全部合并入 `kernel` |

---

## 经验教训汇总

| # | 教训 | 场景 | 建议措施 |
|---|------|------|---------|
| 1 | 跨 crate 重命名需全局搜索 | 合并 3 个 mini crate 时遗漏 Cargo.toml 依赖声明 | grep 搜索包括 `Cargo.toml` 中的所有引用，不仅是 `use` 语句 |
| 2 | 子模块提取后测试需补充类型导入 | workspace 提取 detect.rs 后 `WorkspaceType` 不可见 | 提取 pub 函数时同时检查测试模块中使用的类型是否仍可通过 `super::*` 访问 |
| 3 | `impl crate::path::Struct` 跨模块有效 | storage 拆分使用跨模块 impl 块 | 这是 Rust 标准模式，编译器会自动合并同一 crate 内所有 impl 块 |
| 4 | PTY `std::thread::spawn` 保留 | 评估后确定为正确模式，非 bug | 长时间阻塞的 PTY reader 使用原生线程是正确的；`tokio::spawn_blocking` 无额外收益 |
| 5 | CSS `!important` 优先级降级 | 95% 为必需 CM 覆盖 | 评估收益后再决定是否修复，避免低 ROI 工作 |

---

## 文件变更统计

| 指标 | 数值 |
|------|------|
| 新增文件 | 14 个 |
| 修改文件 | 12 个 |
| 删除目录 | 6 个（3 个 crate 目录 + 1 死代码 + 相关） |
| 总拆分部件 | 5（storage）+ 2（workspace）+ 2（ChangesPanel）+ 3（kernel 模块）+ 1（hook）|
| Rust lint | ✅ 0 warnings |
| Rust 测试 | ✅ 122/122 passed |

---

## 相关文件

- [重构进度报告](../../重构洞察/REFACTORING_PROGRESS_REPORT.md)
- [实施计划](../../superpowers/plans/2026-06-08-top3-refactoring-plan.md)
- [AGENTS.md](../../../AGENTS.md) — 项目治理规则
