# 重构执行计划

**基于**：`docs/重构洞察/refactor-insight-2026-05-24.md`  
**执行策略**：先小后大、先独立再耦合、先基础设施再性能深水区  
**总工作量**：6 个 Phase，22 个子任务  
**测试要求**：每个 Phase 完成后必须执行 `mandatory-testing.md` 中的红绿测试

---

## Phase 0：环境验证与基线确认

**ETA**: 5 min  
**目的**：确认当前代码状态可编译、测试可通过，避免后续改出问题后找不到根因。

```bash
# 1. Node.js 环境
$env:Path = "D:\Program Files\nodejs;$env:Path"

# 2. 前端类型检查
npm --prefix frontend run typecheck

# 3. 前端测试
npm --prefix frontend test

# 4. Rust 编译检查
cargo check

# 5. Rust 测试
cargo test --workspace
```

> 若基线失败，必须先修复或记录问题，不可跳过。

---

## Phase 1：低风险独立修复（7 项）

> 均为无外部依赖的独立改动，可并行执行。

### 1.1 FileTree `collectAllNodePaths` 添加 useMemo

| 属性 | 值 |
|------|-----|
| 文件 | `frontend/src/app/features/file-tree/fileTree.tsx` |
| 位置 | ~L94-L100 函数定义 + ~L302 调用处 |
| 改动 | 将 `collectAllNodePaths(nodes)` 调用用 `useMemo` 包裹，依赖 `[nodes]` |
| 风险 | 🟢 低 — 纯内存计算，无副作用 |
| 验证 | `npm --prefix frontend test` |

### 1.2 `cmLanguages.ts` switch → Map O(1) 查找

| 属性 | 值 |
|------|-----|
| 文件 | `frontend/src/app/features/editor/cmLanguages.ts` |
| 位置 | L13-L42 `getLanguageExtension` |
| 改动 | 将 switch 替换为 `Map<string, () => Extension>`，在模块顶层构建 |
| 风险 | 🟢 低 — API 签名不变 |
| 验证 | `npm --prefix frontend run typecheck` |

### 1.3 TerminalPanel `recentCommands` useMemo 依赖优化

| 属性 | 值 |
|------|-----|
| 文件 | `frontend/src/app/features/terminal/useTerminalPanel.ts` |
| 位置 | ~L134-L151 |
| 改动 | 对 `commandHistory` 使用值比较（`JSON.stringify` 或 `useRef` 缓存 hash），避免引用变化触发重复计算 |
| 风险 | 🟢 低 — 纯优化，无功能变更 |
| 验证 | `npm --prefix frontend test` |

### 1.4 Rust `list_tree_inner` 排序上提

| 属性 | 值 |
|------|-----|
| 文件 | `crates/workspace/src/lib.rs` |
| 位置 | L530-L621 `list_tree` / `list_tree_inner` |
| 改动 | 从递归层排序改为入口层一次排序；子节点排序也委托到入口层处理 |
| 风险 | 🟡 中 — Rust 文件未拆分前需定位精确行 |
| 验证 | `cargo test --workspace` |

### 1.5 Rust `save_entity` SQL 预构建

| 属性 | 值 |
|------|-----|
| 文件 | `crates/storage/src/lib.rs` |
| 位置 | L269-L282 |
| 改动 | 在 `EntityTable` 枚举上添加 `insert_sql()` 方法，返回 `&'static str`；`save_entity` 直接用静态字符串 |
| 风险 | 🟡 中 — 需理解 EntityTable 枚举定义 |
| 验证 | `cargo test --workspace` |

### 1.6 `presentable_recent_list` 拆分（workspace.rs 第 1 刀）

| 属性 | 值 |
|------|-----|
| 文件 | `src-tauri/src/commands/workspace.rs` |
| 位置 | L122-L162 |
| 改动 | 将 `presentable_recent_list` 拆为 `load_sidebar_with_meta` + `sort_and_filter_presentable` |
| 风险 | 🟡 中 — 需确认所有调用方正确切换到新签名 |
| 验证 | `cargo test --workspace` |

### 1.7 `list_tree` 排序优化验证 + `brace_matchers` 惰性构建

| 属性 | 值 |
|------|-----|
| 文件 | `crates/workspace/src/lib.rs` |
| 位置 | L1034-L1067 `brace_matchers` |
| 改动 | 改为 `OnceLock<HashMap<&str, Vec<(Regex, &str)>>>` 按语言惰性构建，调用时按文件类型选择对应正则组 |
| 风险 | 🟡 中 — 需保证所有已使用的语言被正确映射 |
| 验证 | `cargo test --workspace` |

---

> **Phase 1 出口标准**：`npm --prefix frontend run typecheck` + `npm --prefix frontend test` + `cargo test --workspace` 全部通过。

---

## Phase 2：前端 React 组件重构（4 项）

> 聚焦长文件拆分与 prop drilling 治理。

### 2.1 RightPanel.tsx 提取 `useRightPanelLayout` + `useRightPanelViewProps`

| 属性 | 值 |
|------|-----|
| 文件 | `frontend/src/app/regions/RightPanel.tsx` |
| 位置 | 全文件 618 行 |
| 方案 | |
| 步骤 | |
| | 1. 创建 `frontend/src/app/regions/right-panel/hooks/useRightPanelLayout.ts`：抽取 resize 拖拽（mousedown/mousemove/mouseup 事件、面板宽度计算、CSS 变量同步、overlay 模式切换），约 250 行 |
| | 2. 创建 `frontend/src/app/regions/right-panel/hooks/useRightPanelViewProps.ts`：抽取 30 个 store 订阅合并为一个 `useAppStore(useShallow(...))`，构建 `viewProps` 对象，约 90 行 |
| | 3. RightPanel.tsx 本体缩减至 ~200 行 |
| 风险 | 🟡 中 — 需仔细提取，确保拖拽和状态订阅行为不变 |
| 验证 | `npm --prefix frontend test`；手动验证右侧面板拖拽和视图切换 |

### 2.2 useTerminalPanel return value 分组

| 属性 | 值 |
|------|-----|
| 文件 | `frontend/src/app/features/terminal/useTerminalPanel.ts` + `TerminalPanel.tsx` |
| 位置 | useTerminalPanel L84-L502, TerminalPanel L33-L87 |
| 方案 | 将 82 个返回值分为 4-5 个分组对象 |
| 具体分组 | `terminalState`（tabs/activeTab/profile/editingTabId/renamingTabId/terminalSize/terminals 等） |
| | `terminalActions`（createTab/selectTab/closeTab/killTerminal/renameTab/finishRenaming 等） |
| | `dragHandlers`（handleDragStart/handleDragEnd/handleDragOver/handleDrop） |
| | `menuHandlers`（handleContextMenu/handleMenuAction） |
| | `focusHandlers`（handleFocus/handleBlur） |
| 风险 | 🟡 中 — TerminalPanel 中所有解构位置需同步更新 |
| 验证 | `npm --prefix frontend test`；手动验证终端面板各项操作 |

### 2.3 StoreState Action 接口按功能域拆分

| 属性 | 值 |
|------|-----|
| 文件 | `frontend/src/app/stores/StoreState.ts` |
| 位置 | L46-L117，72 个 Action 方法签名 |
| 方案 | 拆分为 8 个子接口（与 `actions/` 目录模块一一对应）：`WorkspaceActions`、`SessionActions`、`EditorActions`、`GitActions`、`PatchActions`、`SearchActions`、`TaskActions`、`CommandActions`；`StoreState` 通过 `extends` 继承全部子接口 |
| 风险 | 🟢 低 — 纯类型重组，不影响运行时行为 |
| 验证 | `npm --prefix frontend run typecheck` |

### 2.4 MultiWorkspaceXX 三组件提取通用容器

| 属性 | 值 |
|------|-----|
| 文件 | `MultiWorkspaceFileTree.tsx`、`MultiWorkspaceChangesTree.tsx`、`MultiWorkspaceTerminal.tsx` |
| 位置 | 三个文件的公共逻辑（workspace 遍历、展开/折叠、拖拽排序） |
| 方案 | |
| 步骤 | |
| | 1. 创建 `frontend/src/app/features/multi-workspace/MultiWorkspaceContainer.tsx`，接收 `renderEntry` 和 `renderChildren` 作为 render props |
| | 2. 将三个组件中的公共模板代码替换为 `MultiWorkspaceContainer` |
| | 3. 每个组件仅保留特有的 render 逻辑 |
| 风险 | 🟡 中 — render props 类型需要正确定义 |
| 验证 | `npm --prefix frontend test`；手动验证三个面板的展开/折叠/拖拽 |

---

> **Phase 2 出口标准**：`npm --prefix frontend run typecheck` + `npm --prefix frontend test` 全部通过。

---

## Phase 3：Rust 后端 crates/workspace 长文件拆分（3 项）

> 核心基础任务，为后续所有 Rust 优化铺路。

### 3.1 `crates/workspace/src/lib.rs` 拆分为多模块

| 属性 | 值 |
|------|-----|
| 文件 | `crates/workspace/src/lib.rs`（2361 行） |
| 方案 | 按子领域拆分为以下文件，每个文件导出公有函数，`lib.rs` 用 `pub mod xxx` 重导出 |
| | |
| | `fs.rs` — 文件 CRUD 操作（`read_text_file`、`save_text_file`、`delete_entry`、`duplicate_entry`、`rename_entry`、`move_entries`、`create_file`、`create_directory` 等） |
| | `git.rs` — Git 操作（`get_git_status`、`switch_branch`、`create_branch`、`list_branches`、相关 Git diff） |
| | `search.rs` — 文本搜索（`search_text_in_files`、`search_text_in_files_parallel`） |
| | `tree.rs` — 目录树遍历（`list_tree`、`list_tree_inner`、`get_file_size`、`collect_text_files`） |
| | `outline/mod.rs` — 大纲入口（`get_outline`、`detect_outline_family`、`brace_matchers`） |
| | `outline/markdown.rs`、`outline/python.rs`、`outline/yaml.rs`、`outline/json.rs`、`outline/html.rs`、`outline/css.rs`、`outline/vue.rs`、`outline/shell.rs`、`outline/sql.rs`、`outline/brace.rs` — 各语言独立解析器 |
| | `lib.rs` — 保留：`open_workspace`、`detect_root`、`reopen_workspace`、`close_workspace` 等入口函数，约 100 行 |
| 风险 | 🔴 高 — 拆分过程中需确保所有跨模块引用和测试正确 |
| 注意 | 拆分后需更新 `crates/workspace/src/lib.rs` 的 `pub mod` 声明；所有内部调用由 `crate::` 改为 `crate::fs::` / `crate::git::` 等路径 |
| 验证 | `cargo test --workspace` |

### 3.2 `crates/workspace` 大纲解析器按语言独立文件

| 属性 | 值 |
|------|-----|
| 依赖 | 3.1 已创建 `outline/` 目录结构 |
| 改动 | 将 `parse_markdown_outline`、`parse_python_outline` 等 12 个函数分别移入对应文件，`outline/mod.rs` 中通过 `detect_outline_family` 分发 |
| 风险 | 🟡 中 — 依赖 3.1 先行完成 |
| 验证 | `cargo test --workspace` |

### 3.3 `crates/storage/src/lib.rs` schema 初始化改为外部 SQL

| 属性 | 值 |
|------|-----|
| 文件 | `crates/storage/src/lib.rs` |
| 位置 | L42-L236 `init_schema` |
| 改动 | 将 SQL 字符串移至 `crates/storage/sql/init_schema.sql`，通过 `include_str!("../sql/init_schema.sql")` 加载；或按版本拆分迁移文件 |
| 风险 | 🟢 低 — 纯文本移动不影响运行行为 |
| 验证 | `cargo test --workspace` |

---

> **Phase 3 出口标准**：`cargo test --workspace` + `cargo check` 全部通过。

---

## Phase 4：性能深水区（4 项）

### 4.1 MessageStream/MessageBlocks 虚拟滚动

| 属性 | 值 |
|------|-----|
| 文件 | `frontend/src/app/MessageStream.tsx` + `frontend/src/app/MessageBlocks.tsx` |
| 方案 | |
| 选项 A | 安装 `react-virtuoso`，用 `<Virtuoso>` 包裹消息列表，保留最近 50 条消息的 DOM |
| 选项 B | CSS `content-visibility: auto` — 零依赖、零重构、渐进式性能提升 |
| 推荐 | 选项 B（快速见效）→ 后续可演进为选项 A |
| 风险 | 🟡 中 — 选项 A 需评估虚拟列表对消息内部交互（如转译代码块）的影响 |
| 验证 | `npm --prefix frontend test`；手动测试长对话场景下的滚动 |

### 4.2 FileTree 递归渲染虚拟化

| 属性 | 值 |
|------|-----|
| 文件 | `frontend/src/app/features/file-tree/fileTree.tsx` + `TreeNodeRow.tsx` |
| 方案 | 当子节点超过 50 个时，使用 `@tanstack/react-virtual` 只渲染视口内的节点 |
| 风险 | 🟡 中 — 对递归树结构做虚拟化较 List 复杂，需计算每个节点的高度或使用动态高度估计 |
| 验证 | `npm --prefix frontend test`；手动测试大目录展开性能 |

### 4.3 `collect_text_files_inner_int` I/O 优化

| 属性 | 值 |
|------|-----|
| 文件 | `crates/workspace/src/lib.rs`（拆分后在 `tree.rs`） |
| 位置 | L1823-L1896 |
| 改动 | 先通过扩展名过滤已知二进制类型（`.png`, `.jpg`, `.exe`, `.dll`, `.ico`, `.svg`, `.woff2` 等），只对未知扩展名调用 `read_text_file`；或将 `read_text_file` 改为只读前 512 字节检测 |
| 风险 | 🟡 中 — 需维护二进制扩展名黑名单 |
| 验证 | `cargo test --workspace` |

### 4.4 `search_text_in_files` BufReader 优化

| 属性 | 值 |
|------|-----|
| 文件 | `crates/workspace/src/lib.rs`（拆分后在 `search.rs`） |
| 位置 | L852-L889（同步搜索） + L805-L850（异步搜索） |
| 改动 | 同步版本：`read_to_string` → `BufReader::read_line` 逐行匹配；异步版本：`tokio::io::BufReader` 逐行匹配 |
| 风险 | 🟡 中 — 需确保匹配行为一致（多行匹配场景可能受影响） |
| 验证 | `cargo test --workspace` |

---

> **Phase 4 出口标准**：`npm --prefix frontend test` + `cargo test --workspace` 全部通过。

---

## Phase 5：Tauri 命令层拆分 + 状态迁移（3 项）

### 5.1 `src-tauri/src/commands/workspace.rs` 拆分为多模块

| 属性 | 值 |
|------|-----|
| 文件 | `src-tauri/src/commands/workspace.rs`（821 行） |
| 方案 | 拆分为以下文件： |
| | `workspace_commands.rs` — 薄 Tauri 命令层（约 20 个 `#[tauri::command]` 函数，只做参数转换 + 委托调用 `adl_workspace` crate） |
| | `workspace_sidebar.rs` — sidebar 条目管理（`upsert_sidebar_after_open`、sidebar CRUD）+ `presentable_recent_list` 拆分后的函数 |
| | `workspace_git.rs` — Git 命令（`workspace_get_git_status`、`workspace_switch_git_branch` 等） |
| | `platform.rs` — 平台相关（`workspace_reveal_in_file_manager`、路径规范化） |
| | `mod.rs` — `pub mod` 声明 + 公共重导出 |
| 风险 | 🔴 高 — 涉及修改 `pub use` 链和 `commands/mod.rs` 的注册方式，需确保所有命令签名不变 |
| 验证 | `cargo test --workspace`；手动验证所有 workspace 命令正常工作 |

### 5.2 `editor_dirty_paths` 迁移至前端

| 属性 | 值 |
|------|-----|
| 文件 | `src-tauri/src/state.rs` L16、`frontend/src/app/stores/slices/editorSlice.ts` |
| 方案 | |
| 步骤 | |
| | 1. 在 `editorSlice` 中添加 `editorDirtyPaths: string[]` 状态 + `setEditorDirtyPaths` action |
| | 2. 删除 Tauri 命令 `workspace_set_editor_dirty_paths` 和 `state.rs` 中的 `editor_dirty_paths: Mutex<HashSet<String>>` |
| | 3. 前端使用 `useEditorStore(s => s.editorDirtyPaths)` 替代 IPC 调用 |
| 风险 | 🟡 中 — 需确认 `editor_dirty_paths` 是否被其他 Tauri 命令引用 |
| 验证 | `npm --prefix frontend test` + `cargo test --workspace` |

### 5.3 `workspace_open` 职责分离

| 属性 | 值 |
|------|-----|
| 文件 | `src-tauri/src/commands/workspace.rs`（拆分后为 `workspace_commands.rs`） |
| 位置 | L209-L210 |
| 改动 | 将 `upsert_sidebar_after_open` 调用移到命令层之外（由前端在 open 成功后主动调用），或移入 `workspace_sidebar.rs` 作为独立的编排函数 |
| 风险 | 🟡 中 — 需确认前端是否需要等待 sidebar 操作完成 |
| 验证 | `cargo test --workspace` |

---

> **Phase 5 出口标准**：`cargo test --workspace` + `npm --prefix frontend test` + `npm --prefix frontend run typecheck` 全部通过。

---

## Phase 6：目录整理与类型治理（4 项）

### 6.1 mock-bridge 按接口拆分

| 属性 | 值 |
|------|-----|
| 文件 | `frontend/src/mock-bridge.ts`（1252 行） |
| 方案 | 拆分为：`mock-workspace.ts`、`mock-conversation.ts`、`mock-patch.ts`、`mock-terminal.ts`、`mock-task.ts`、`mock-retrieval.ts` |
| | `mock-bridge.ts` 保留 `createMockBridge()` 和 `mockDigitalLifeBridge`，通过 `export * from './mock-xxx'` 导入各模块 |
| 风险 | 🟢 低 — 纯文件组织调整 |
| 验证 | `npm --prefix frontend run typecheck` |

### 6.2 right-panel/ 目录分组

| 属性 | 值 |
|------|-----|
| 文件 | `frontend/src/app/regions/right-panel/` |
| 方案 | 创建子目录： |
| | `panels/` — `FilesPanel.tsx`、`ChangesPanel.tsx`、`BrowserPanel.tsx` |
| | `editor-support/` — `agentDecorations.ts`、`stickyContext.ts`、`stickyContextView.ts`、`cmWrapColumn.ts` |
| | `hooks/` — 已有 |
| | 更新所有 import 路径 |
| 风险 | 🟢 低 — 纯文件移动 |
| 验证 | `npm --prefix frontend run typecheck` |

### 6.3 StoreState 类型安全断言

| 属性 | 值 |
|------|-----|
| 文件 | `frontend/src/app/stores/StoreState.ts` 或新增测试文件 |
| 方案 | 添加类型测试断言：`type _StoreStateCheck = typeof slicedStore.getState satisfies StoreState`；确认无遗漏 Action 方法 |
| 风险 | 🟢 低 — 纯类型添加 |
| 验证 | `npm --prefix frontend run typecheck` |

### 6.4 切片依赖关系文档化

| 属性 | 值 |
|------|-----|
| 文件 | `frontend/src/app/stores/slices.ts`（或新增 `SLICE_DEPENDENCIES.md`） |
| 方案 | 在 `slices.ts` 文件顶部添加注释文档，说明每个切片的依赖关系和影响范围，格式如下： |
| | ```typescript
| | /**
| |  * 切片依赖关系：
| |  * sessionSlice ← editorSlice (activeSessionId)
| |  * sessionSlice ← patchSlice (activeSessionId)
| |  * sessionSlice ← taskSlice (activeSessionId)
| |  * workspaceSlice ← gitSlice (currentWorkspace)
| |  * sessionSlice ← conversationSlice
| |  */
| | ``` |
| 风险 | 🟢 低 — 纯文档 |
| 验证 | 无需测试 |

---

> **Phase 6 出口标准**：`npm --prefix frontend run typecheck` 通过。

---

## 附录 A：总体执行路线图

```
Phase 0 ── 基线验证（5min）
   │
Phase 1 ── 7 项独立低风险修复（30min + 测试）
   │      ├── 1.1 FileTree useMemo
   │      ├── 1.2 cmLanguages Map
   │      ├── 1.3 recentCommands
   │      ├── 1.4 list_tree 排序
   │      ├── 1.5 save_entity SQL
   │      ├── 1.6 presentable_recent_list 拆分
   │      └── 1.7 brace_matchers 惰性构建
   │
Phase 2 ── 前端组件重构（60min + 测试）
   │      ├── 2.1 RightPanel hook 提取
   │      ├── 2.2 useTerminalPanel 分组
   │      ├── 2.3 StoreState 子接口
   │      └── 2.4 MultiWorkspacePanels
   │
Phase 3 ── Rust 后端长文件拆分（60min + 测试）
   │      ├── 3.1 workspace/lib.rs 拆分
   │      ├── 3.2 大纲按语言独立文件
   │      └── 3.3 storage/schema 外部 SQL
   │
Phase 4 ── 性能深水区（45min + 测试）
   │      ├── 4.1 MessageStream 虚拟化
   │      ├── 4.2 FileTree 虚拟化
   │      ├── 4.3 collect_text_files I/O
   │      └── 4.4 search_text BufReader
   │
Phase 5 ── Tauri 命令层拆分（45min + 测试）
   │      ├── 5.1 workspace/commands.rs 拆分
   │      ├── 5.2 editor_dirty_paths 迁移
   │      └── 5.3 workspace_open 职责分离
   │
Phase 6 ── 目录整理 + 类型治理（20min + 测试）
         ├── 6.1 mock-bridge 拆分
         ├── 6.2 right-panel 目录分组
         ├── 6.3 StoreState 类型断言
         └── 6.4 切片依赖文档化
```

## 附录 B：回滚方案

| 风险 | 方案 |
|------|------|
| Phase 1 某项改动导致测试失败 | 单项回退，先跳过，继续其他项 |
| Phase 2 组件重构导致 UI 异常 | 保留原始文件为 `.bak`，使用 React 条件编译做 A/B 对比 |
| Phase 3 文件拆分后编译失败 | 保留 `lib.rs.bak`，从各子模块 `pub use` 回退 |
| Phase 4 虚拟化导致交互问题 | CSS `content-visibility: auto` 先行，`react-virtuoso` / `@tanstack/react-virtual` 择期实施 |
| Phase 5 命令层拆分后 IPC 不通 | 保留 `workspace.rs.bak`，新增模块单独测试通过后再移除旧文件 |