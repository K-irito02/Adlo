# 重构洞察报告 – ai-digital-life

**生成日期**：2026-05-24

## 1. 架构与设计

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| `crates/storage/src/lib.rs:382-405` `EntityTable::insert_sql` | 24 个枚举变体的 `insert_sql` 方法全部返回结构完全相同的 SQL 模板，仅表名不同。每个分支约 90 字符重复，总计约 2100 字符重复代码。`as_str` 方法存在同样问题（24 个分支仅表名不同）。 | 抽取单一静态方法 `const fn sql_for_insert(table: EntityTable) -> &'static str`，内部用 `match table { Self::Workspaces => "...", ... }` 返回对应表名。`as_str` 可复用同一逻辑。类型安全的枚举变体映射到表名字符串，消除 4000+ 字符重复。 | 🔴高 |
| `crates/storage/src/lib.rs:164-172` `load_entity` 和 `crates/storage/src/lib.rs:206-242` `list_entities_filtered` | 每次调用都执行 `format!("SELECT json FROM {table_name} WHERE id = ?1")` 字符串格式化。虽然表名来自静态枚举（无注入风险），但每次调用都重新分配字符串并让 rusqlite 重新解析 SQL。 | 使用 `lazy_static` 或 `OnceLock` 预构建所有可能的 SQL 语句。存储 `HashMap<EntityTable, Statement>` 或 `HashMap<EntityTable, &'static str>`，首次调用时编译并缓存。 | 🟡中 |
| `crates/storage/src/lib.rs:244-251` `delete_entity` | 同 `load_entity`，每次调用都 `format!` 构建 DELETE SQL。 | 同上，预编译 SQL 字符串或使用静态 HashMap。 | 🟡中 |
| `frontend/src/app/regions/right-panel/ChangesPanel.tsx`（1196 行） | 组件仍超过 1100 行，包含 Patch Review 摘要统计、Changes 文件树导航、Change Preview 编辑器、上下文菜单处理、Branch 选择、Filter 状态等多组职责。其中 `handleSelectNavigatorNode`（371-383 行）依赖 4 个外部状态，`getContextMenuItems`（423-542 行）返回 20+ 菜单项，内部混合了文件操作、剪贴板操作、确认对话框状态管理。 | 拆分为：`PatchReviewSummary`（Patch 卡片列表 + 统计）、`ChangesTreeNavigator`（文件树导航 + Branch/Filter）、`ChangePreviewEditor`（编辑器 + 预览切换）、`ChangesContextMenuProvider`（菜单逻辑）。预计削减主文件至 ~600 行。 | 🟡中 |
| `frontend/src/preview-bridge/index.ts:80,394` | 两处使用 `window as any` 强制类型断言：`(window as any).digitalLife` 设置全局桥接。两处断言方式略有不同（80 行用 `any`，394 行用 `typeof window & { digitalLife: ... }`）。 | 统一为类型安全断言：定义 `Window & { digitalLife?: DigitalLifeBridge }` 类型，使用类型守卫函数 `hasDigitalLife(window)` 检查而非强制断言。 | 🟡中 |
| `frontend/src/mock-bridge.ts:113` | `mockConversation.sendMessage` 返回值被 `as any` 强制转换为 `ConversationSendResult`，掩盖了类型不匹配。 | 定义正确的 mock 返回类型接口，明确 mock 数据结构与真实 IPC 返回类型的映射关系。 | 🟡中 |
| `src-tauri/src/setup.rs:62` 和 `src-tauri/src/commands/app.rs:72,85,126` 和 `src-tauri/src/commands/app.rs:357` | `state.config.lock().expect("config mutex poisoned")` 在 Tauri 命令中大量使用，若 mutex 中毒会导致整个命令 panic 并返回 unwrap error。Rust 标准库文档明确建议不应在生产代码中对 `Mutex` 使用 `expect`。 | 改为 `state.config.lock().map_err(\|_\| AppError::Internal("config lock poisoned".into()))?`，将错误向上传播而非 panic。 | 🟡中 |

## 2. 性能优化

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| `crates/storage/src/lib.rs:206-242` `list_entities_filtered` | 该函数每次调用都：1) `format!("SELECT json FROM {table_name}")` 动态构建 SQL；2) 编译新 Statement；3) 对每行执行 `serde_json::from_str`。对高频调用（如会话列表、消息列表）每次都有字符串分配开销。 | 对于高频表（sessions、conversation_messages），可预编译专用方法。`serde_json::from_str` 虽无法避免，但 Statement 编译可缓存。 | 🟡中 |
| `frontend/src/app/regions/right-panel/ChangesPanel.tsx:371-383` `handleSelectNavigatorNode` | 依赖项 `[activePatchSet, activePatchSets, collapsedPatchHunkIds, onSelectPatchFile]`，其中 `activePatchSets` 是对象（引用比较几乎总是触发重新创建）。每次树节点点击都会触发重新绑定。 | 将 `handleSelectNavigatorNode` 的选择逻辑提取为 `useCallback` 时，将 `activePatchSets` 解构为 `useMemo([...])` 计算的目标 patch set，而非依赖整个对象。 | 🟡中 |
| `frontend/src/app/regions/right-panel/ChangesPanel.tsx:592-611` `changesTreeData` | `useMemo` 依赖项含 `workspaceChangesExpanded`、`gitSnapshots`、`activePatchSets`、`collapsedPatchHunkIds`、`changesNavigatorMode`、`changesStatusFilter` 共 6 项，每次任一变化都重新构建整个树的 JSON 数据结构（嵌套 `Record<string, ChangeTreeNode[]>`）。 | 考虑按 workspaceId 拆分 memo：每工作区独立 `useMemo([snapshot, patchSet, filter]) => tree`，合并使用 `useDerivedFromWorkspaces` 模式。减少每次变更的重建范围。 | 🟡中 |
| `crates/storage/src/lib.rs:159-172` `load_entity` | 对每个实体的单次查询，每次都构建 SQL 并重新编译 Statement。对会话、元数据等高频读取场景有累积影响。 | 使用 `rusqlite::Statement` 的内部缓存：首次编译后持有引用，或在 `Database` 结构中存储 `OnceLock<HashMap<EntityTable, Statement>>`。`rusqlite` 支持 Statement 缓存。 | 🟡中 |
| `frontend/src/app/stores/actions/streamActions.ts:162-231` `sendMessage` | `finally` 块（221-230 行）中的 `if (get().streamingAssistantText)` 检查已比之前版本优化（避免了无条件 set），但仍有改进空间：调用 `get()` 访问 Zustand store，即使状态未变化也会触发一次额外的订阅检查。 | 使用 `getState()` 的局部引用替代 `get()`，或在 finally 开始时立即读取并清除状态，避免 try 块和 finally 块的竞态。 | 🟢低 |

## 3. 其他发现

- **代码质量亮点**：
  - 前端 `as any` 已从 13 处减少至约 7 处（4 处生产代码 + 3 处测试），包括 mock-bridge、preview-bridge、ChangesPanel context menu、editorAdapters 等位置，类型安全持续改善。
  - 零 `@ts-ignore` / `@ts-expect-error`，TypeScript 类型覆盖率优秀。
  - Rust 端：前次报告的 `Regex::new()` → `OnceLock` 优化已在 `mod.rs`、`brace.rs`、`html.rs`、`json.rs` 中完成（9 个文件使用 `OnceLock`），但 `python.rs`、`shell.rs`、`yaml.rs`、`sql.rs`、`vue.rs` 仍有待验证是否已优化。
  - `crates/workspace/src/outline/mod.rs:56-111` `detect_outline_family` 已重构为 `HashMap<&str, &str>` + `OnceLock` 静态缓存 + `rsplit_once('.')`，上次报告的高优先级建议已执行。
  - `crates/workspace/src/outline/mod.rs:113-164` `finalize_outline_items` 已使用单调栈 O(n) 算法，上次报告的 O(n²) 问题已修复。

- **Rust mutex 处理不一致**：`src-tauri/src/commands/pty_commands.rs` 已使用 `.map_err(|_| {...})` 优雅处理 mutex 中毒，但 `setup.rs`、`app.rs`、`agent.rs` 仍在使用 `.expect()` panic。标准不一致，可能导致不同模块的错误处理行为不同。

- **storage SQL 构建冗余**：`crates/storage/src/lib.rs` 中 `as_str` 和 `insert_sql` 的 24 分支 switch 既长又高度相似，可考虑用宏或 const table 数组替代 match 分支，减少维护成本。

- **preview-bridge vs mock-bridge 分工**：`preview-bridge` 大量复用了 `mockDigitalLifeBridge` 的方法（`getHealth`、`getDiagnostics`、`getModelHealth`），仅对 workspace/retrieval 模块做了真实实现。这是合理的渐进式增强模式，但注意不要在 preview-bridge 中遗漏新添加的 IPC 方法的覆盖。

> 由自动化重构洞察生成于 2026-05-24 23:55:00
