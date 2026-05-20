# 重构洞察报告 – ai-digital-life
**生成日期**：2026-05-20

## 1. 架构与设计

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| `frontend/src/app/store.ts` | 与 `slicedStore.ts` 存在大量重复代码，两者并存导致维护负担 | 完成切片模式重构后，移除旧的 `store.ts`，统一使用切片模式 | 🔴高 |
| `frontend/src/app/stores/slices/workspaceSlice.ts` | 切片仅包含简单 setters，异步操作仍在主 store 中，切片职责不完整 | 将工作区相关的异步操作（如 `openWorkspace`、`refreshWorkspaceTree`）迁移到切片中 | 🔴高 |
| `frontend/src/app/stores/slices/uiSlice.ts` | 与 `ui-store.ts` 存在重复定义，状态分散 | 整合 UI 状态管理到单一切片，移除 `ui-store.ts` | 🟡中 |
| `crates/storage/src/lib.rs:58-202` | SQLite Schema 使用 JSON blob 存储所有实体，限制了 SQL 查询能力 | 为核心实体（会话、消息、补丁）设计专用表结构，支持索引和复杂查询 | 🔴高 |
| `src-tauri/src/main.rs:20-89` | `invoke_handler` 包含 40+ 个命令，列表冗长难以维护 | 引入命令注册机制，按模块自动注册，或使用宏简化注册 | 🟡中 |
| `crates/workspace/src/lib.rs:464-555` | `list_tree` 函数逻辑复杂，与 `build_retrieval_snapshot` 存在重复的目录遍历逻辑 | 抽取通用的目录遍历工具函数，复用遍历逻辑 | 🟡中 |
| `frontend/src/preview-bridge.ts:364-372` | `pin`、`unpin`、`reorder` 方法实现为空操作，与 Tauri 桥接行为不一致 | 完善浏览器模式下的工作区固定/排序功能实现 | 🟡中 |
| `frontend/src/app/stores/shared.ts` | 请求序列号管理分散在多个地方，逻辑不够清晰 | 将请求序列号管理封装为独立的 hooks 或工具类 | 🟢低 |

## 2. 性能优化

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| `crates/workspace/src/lib.rs:145-176` | `capture_git_snapshot` 同步调用多个 Git 命令，阻塞线程 | 使用 `tokio::spawn` 并行执行多个 Git 命令，减少总耗时 | 🔴高 |
| `frontend/src/app/slicedStore.ts:316-323` | `bootstrap` 完成后立即触发多个低优先级刷新，可能造成资源竞争 | 引入请求合并机制，避免短时间内重复请求相同数据 | 🟡中 |
| `crates/workspace/src/lib.rs:598-620` | `search_text` 对每个文件同步读取并逐行匹配，大工作区性能差 | 引入异步文件读取和并行搜索，支持搜索取消 | 🔴高 |
| `crates/storage/src/lib.rs:306-366` | `list_entities_filtered` 使用 JSON 反序列化整个结果集，大数据量时性能差 | 支持分页查询，避免一次性加载大量数据 | 🟡中 |
| `frontend/src/app/slicedStore.ts:1140-1189` | `fetchGitStatus` 获取状态后可能触发 `openChangePreview`，形成级联请求 | 延迟预览加载，等待用户明确选择后再请求 | 🟢低 |
| `crates/workspace/src/lib.rs:1383-1439` | `build_retrieval_snapshot` 在主线程同步扫描整个工作区 | 将检索快照构建移至后台任务，使用 channel 异步更新 | 🔴高 |

## 3. 其他发现

- **双端一致性问题**：`preview-bridge.ts` 中的部分方法（如 `pin`、`unpin`）实现为空操作，导致浏览器模式和 Tauri 模式行为不一致
- **测试覆盖率**：Rust crates 层测试覆盖率较高，但前端状态管理的测试覆盖不够充分
- **错误处理**：部分 Tauri Command 错误处理较为简单，建议增加更详细的错误分类和日志记录

> 由自动化重构洞察生成于 2026-05-20 15:30:00