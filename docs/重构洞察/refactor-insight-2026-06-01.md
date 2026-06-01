# 重构洞察报告 – ai-digital-life
**生成日期**：2026-06-01

## 1. 架构与设计

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| `frontend/src/locales/` 整个目录 | `locales/` 包含 `en-US.ts` (~60 keys) 和 `zh-CN.ts` (~60 keys)，Phase 0 时期的旧国际化模块。经 grep 确认：全量 `*.ts,*.tsx` 文件中对 `locales/` 的 import 引用数为 **零**。当前活跃的国际化系统是 `app/i18n/`（504 keys，10 领域，中英双语）。 | 删除 `frontend/src/locales/` 整个目录。已在第 23 轮中完成 i18n 拆分，此目录为死代码。 | 🔴高 |
| `frontend/src/app/` 根层级散落 15 个源文件 | `composerSend.ts`、`editorTabs.ts`、`workspacePaths.ts`、`workspaceScope.ts`、`selectionPrompt.ts`、`repoMapFromEntries.ts`、`repoMapFromTree.ts`、`settingsViewModel.ts`、`sidebarViewModel.ts`、`theme.ts`、`loaders.ts`、`MessageBlocks.tsx`、`ui-store.ts`（521 行 Zustand store）、`constants.ts`、`types.ts` — 这些文件散落在 `app/` 根层级，应归属到对应子目录（`utils/`、`stores/`、`features/`、`components/settings/`）。14 个对应测试文件也在根层级。 | 迁移方案详见报告第 8 节。核心：`ui-store.ts` → `app/stores/`，`loaders.ts` → `app/stores/`，其余工具类 → `app/utils/`，`MessageBlocks.tsx` → `app/features/conversation/`。 | 🔴高 |
| `frontend/src/app/regions/right-panel/panels/hooks/` | 空目录，零文件。实际 hooks 均位于上一级 `right-panel/hooks/`（18 个 hook 文件）。`panels/hooks/` 是在目录结构重组中遗留的空壳。 | 删除空目录 `frontend/src/app/regions/right-panel/panels/hooks/`。 | 🟡中 |
| `crates/storage/src/lib.rs:260` — `list_entities_filtered` | SQL 字符串拼接方式追加 LIMIT 子句：`sql.push_str(&format!(" LIMIT {limit}"));`。虽然 `limit` 是 `usize` 在技术上安全，但打破了"禁止字符串拼接 SQL"的规范。线段 253-257 同样使用 `sql.push_str(field)` 拼接 WHERE 字段名（当前仅限 `&'static str` 调用方，但缺乏编译期保护）。 | 1. 对 LIMIT 添加 `assert!(limit <= 1000)` 防护。2. 将过滤字段参数改为枚举类型，避免未来误传动态字符串。 | 🔴高 |
| `src-tauri/src/commands/agent.rs:477-504` — `save_patch_set` | 保存 `PatchSet`、多个 `FilePatches`、多个 `PatchHunks` 时，三次 DB 写入各自使用独立的隐式事务。如果应用在写入过程中崩溃，会出现孤儿 `PatchSet`（无关联 FilePatches）或部分数据不一致。 | 将三次写入包装在 `BEGIN TRANSACTION / COMMIT` 事务块中。 | 🔴高 |
| `crates/errors/src/lib.rs:46-49` — `From<std::io::Error>` | IO 错误转换时调用 `.to_string()` 丢掉了 `ErrorKind` 枚举和 source chain：`AppError::Io(e.to_string())`。`serde_json::Error` 同理映射为泛型 `Internal` 而非独立变体。调错时无法区分"文件不存在"与"权限拒绝"。 | 改为携带源错误：`AppError::Io(#[source] std::io::Error)` 或使用 `Box<dyn std::error::Error>` 保留完整链。 | 🟡中 |
| `src-tauri/src/commands/agent.rs:15` | `AuditBatchEntry` 定义为 7 元组：`(String, Option<String>, String, RiskLevel, String, Option<String>, Option<String>)` — 无命名字段，可读性差，调用方需记忆各位置含义。 | 改为具名 struct `AuditBatchEntry`，每个字段有明确的语义名称。 | 🟡中 |
| `src-tauri/src/commands/workspace.rs` — 9 个命令 | `workspace_create_file`、`workspace_create_folder`、`workspace_read_file`、`workspace_search`、`workspace_outline`、`workspace_rename_file`、`workspace_duplicate_file`、`workspace_get_absolute_path`、`workspace_move_file` 共享完全相同的样板模式：`ipc(with_workspace(&state, \|workspace\| { adl_workspace::some_fn(PathBuf::from(&workspace.root_path).as_path(), ...) }))`。每个命令重复 ~4 行。 | 抽取声明宏 `workspace_command!` 消除重复：`macro_rules! workspace_command { ($state:expr, \|$ws:ident\| $fn:path, $($arg:expr),*) => { ... } }`。 | 🟡中 |
| `crates/browser/Cargo.toml:12` — 直接依赖 `tauri` | `adl-browser` 是 **唯一** 直接依赖 `tauri` crate（带 `unstable` feature）的非 `src-tauri` 层 crate。意味着 `adl-browser` 无法脱离 Tauri 框架编译或测试，导致"层 3 带了应用框架依赖"。 | 选项 A：将 `adl-browser` 移入 `src-tauri/src/browser.rs` 作为 Tauri 壳层模块。选项 B：在 Cargo.toml 添加注释标记其为 "Tauri-specific feature wrapper"。 | 🟡中 |
| `src-tauri/src/error.rs:4-8` — `CommandError.code: String` | 错误码使用 ad-hoc 字符串如 `"NOT_FOUND"`、`"STORAGE_ERROR"`，前端需进行字符串匹配，缺乏类型安全。 | 将 `code` 改为枚举 `IpcErrorCode`（与前端 `shared/ipc.ts` 同步定义），提供编译期安全性。 | 🟢低 |
| `crates/workspace/src/lib.rs:22-26` | `use adl_errors::AppError;` 语句出现在文件中间（第 28 行），与 `fn outline(...)` 函数定义交错排列。Rust 惯用法要求所有 `use` 语句集中在文件顶部。 | 将 `use` 语句移至文件顶部。 | 🟢低 |
| `src-tauri/src/commands/agent.rs` — 642 行 | `agent.rs` 是最大的单命令文件（642 行），包含完整的 agent run 流水线：`prepare_run` → `collect_context` → `call_model` → `generate_patches` → `finalize_run`。 | 将流水线提取为 `agent_pipeline.rs` 独立模块，`agent.rs` 只保留 command 入口函数。 | 🟢低 |
| `crates/change-engine/src/lib.rs` — 500 行 | 单文件混合 5 个关注点：补丁创建、应用、回滚、决策、诊断和语言检测。随着 Phase 进展复杂度将持续增长。 | 拆分为：`patch_create.rs`、`patch_apply.rs`（含 rollback）、`patch_decision.rs`、`validation.rs`、`language.rs`。 | 🟢低 |
| `src-tauri/src/commands/conversation.rs:222` — `conversation_delete_session` | 删除会话时未级联删除关联的 messages、runs、patches。DB 层 `INSERT OR REPLACE` 语义使得孤儿数据不被自动清理，长期积累会膨胀数据库。 | 添加级联删除逻辑（先查关联实体再逐层删除），或使用外键 + `ON DELETE CASCADE`。 | 🟢低 |
| `frontend/src/styles/tokens.css:90` | 注释笔误：`var(--shadow-*), var(--shadow-*) etc.` — 同一个变量名重复两次。| 修正为正确的变量列表。 | 🟢低 |

## 2. 性能优化

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| `frontend/src/app/stores/selectors.ts:18` — `useAppInfo` | 返回大型 `AppInfo` 对象，未使用 `useShallow` 比较。任何 store 更新触碰 `appInfo` 都会触发所有 `useAppInfo()` 消费者重渲染，即使消费者只读取 `appInfo` 的某个子属性。这是最常用的 selector。 | 使用 `useShallow` 包装 或 创建细粒度子 selector（如 `useAppHealth`、`useAppVersion`）。 | 🔴高 |
| `frontend/src/app/stores/actions/fetchActions.ts:14-148` — 所有 fetch 函数 | 所有 IPC fetch 函数（`fetchIndexStatus`、`refreshTaskCenter`、`fetchAuditEntries` 等）都设置 `isFetching[key] = true`，但 **从不检查** 是否已有同 key 请求在进行中。并发调用会触发重复 IPC 请求，浪费带宽并可能产生竞态。 | 在每个 fetch 函数顶部添加 guard：`if (get().isFetching[key]) return;`。 | 🔴高 |
| `src-tauri/src/state.rs:14,16` — `config` 和 `current_workspace` 使用 `Mutex` | `config: Mutex<AppConfig>` 和 `current_workspace: Mutex<Option<WorkspaceMeta>>` 均使用 `Mutex`。这两个字段的读取频率远超写入（config 仅设置时写入，workspace 仅 open/close 时写入），每次命令调用都会争抢互斥锁。 | 将 `config` 和 `current_workspace` 改为 `RwLock`，允许多个命令并发读取。 | 🔴高 |
| `crates/browser/src/lib.rs:50` — `Mutex<BrowserState>` | `BrowserState` 仅含一个 `active: bool` 字段。用 `Mutex` 包裹单个布尔值是最高成本的同步方式。 | 改为 `AtomicBool`，零锁开销。 | 🟡中 |
| `frontend/src/app/stores/actions/generalActions.ts:62-111` — `bootstrap` | Git status 获取（Batch 3）和 Patch set 获取（Batch 4）是串行执行的，两者都仅依赖 `currentWorkspace` 已设置（Batch 2 之后），无相互依赖。串行导致启动时间变长。 | 将两个调用放入 `Promise.all([...])` 并行执行。 | 🟡中 |
| `frontend/src/app/regions/right-panel/ToolSwitcher.tsx:37` — `ToolSwitcher` | 未包裹 `React.memo`。每个父组件重渲染都导致整个工具切换器（7 个 Tab 按钮 + Tooltip）重新渲染。`handleKeyDown`（48 行）和 map 中的 `onClick` 回调（101 行）每次渲染都重新创建。 | 1. 包裹 `React.memo`。2. `handleKeyDown` 使用 `useCallback`。3. 改用单个委托点击处理器 + `data-tool-id` 属性代替 map 中的内联箭头函数。 | 🟡中 |
| `frontend/src/app/stores/slices/uiSlice.ts:38` — `isFetching: Record<string, boolean>` | 每次 `setIsFetching(key)` 调用通过 `{ ...get().isFetching, [key]: true }` 创建新 Record 对象。任何订阅整个 `isFetching` 对象的组件都会因为不相关 key 的状态变更而重渲染。 | 改用 `Map<string, boolean>` + 细粒度 selector；或使用 Immer 保证引用稳定性；或将 fetch 状态分散到独立原子状态。 | 🟡中 |
| `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts:13` — `sessionOutputsRef` | `sessionOutputsRef = useRef<Map<string, string>>(new Map())` 存储所有 PTY 会话的完整输出，无上限。长时间运行的构建日志或流式输出会持续堆积，存在内存泄漏风险。 | 实现大小上限（如每会话 100KB 环形缓冲区），或对超过阈值的会话内容写入临时文件。 | 🟡中 |
| `frontend/src/app/stores/actions/fetchActions.ts:146-148` | `fetchRunActivityByRunId` 缓存逻辑为 `if (existing && existing.length > 0) return;`，无 TTL。运行活动数据在 Agent 完成后不再更新，缓存永不过期，但若未来支持增量更新则会有陈旧数据问题。 | 引入可选的 TTL 缓存策略，或在 Agent run 完成后主动失效相关缓存。 | 🟡中 |
| `frontend/src/app/stores/selectors.ts:21,28` — `useCurrentWorkspace`、`useGitSnapshot` | 返回对象类型但未使用 `useShallow`。与 `useAppInfo` 同模式，虽影响范围较小（消费者较少），但原理相同。 | 使用 `useShallow` 包装。 | 🟢低 |
| `crates/events/src/lib.rs:49` — `by_type: Arc<Mutex<BTreeMap<String, usize>>>` | 每次事件 emit 都需要持有互斥锁来递增诊断计数器。读取（诊断查询）远少于写入（事件发射），Mutex 造成不必要的写入阻塞。 | 改用 `Arc<HashMap<String, AtomicUsize>>`：插入时锁，递增时无锁。或使用 `DashMap`。 | 🟢低 |
| `frontend/src/app/regions/left-sidebar/SessionList.tsx:237` | 展开模式下所有会话（可能 50+）直接通过 `.map()` 渲染为 DOM，无虚拟滚动。每条渲染包含 Tooltip、日期格式化、条件按钮等开销。折叠模式有 `SIDEBAR_SESSION_PREVIEW_LIMIT = 5` 硬限制作防护。 | 展开模式使用 `react-window`（已安装 v2.2.7）`FixedSizeList` 实现虚拟滚动。 | 🟢低 |
| `frontend/src/app/features/outline/OutlineTree.tsx:66-111` | `renderNodes` 递归渲染所有大纲节点，`getDefaultExpandedOutlineIds` 默认展开全部。大文件（500+ 标题/符号）时渲染大量 DOM。 | 添加 `react-window` 虚拟化支持或在根级限制最大展开节点数。 | 🟢低 |
| `frontend/src/styles/regions/leftbar.css:518` | `will-change: padding-top` — `padding-top` 不是 GPU 可加速属性（仅 `transform`、`opacity`、`filter` 有效），创建无效合成层反而增加内存开销。 | 移除 `padding-top`，仅保留 `will-change: transform`。 | 🟢低 |
| `frontend/src/app/hooks/useTaskCenterPolling.ts:9-14` | 每 5 秒无条件调用 `refreshTaskCenter()`，不检查 `isFetching['refreshTaskCenter']` 状态。上一次调用未完成时仍会发起新的。 | 添加 `if (get().isFetching['refreshTaskCenter']) return;` 守卫。 | 🟢低 |
| `frontend/src/styles/components.css:843-1938` | `adl-` 前缀的组件类（1096 行，占文件 57%）直接使用 `themes.css` 变量（`--font-size-xs`、`--bg-card`），而不是 Token 系统（`--text-xs`、`--surface`）。导致两套命名体系并存，增加了维护复杂度。 | 将 `adl-*` 类中的直接变量引用迁移到 `tokens.css` 语义 Token（如 `--bg-card` → `--surface-raised`）。 | 🟢低 |

## 3. 其他发现

- **前端 Rust 后端锁优化空间显著**：`src-tauri/src/state.rs` 中 `config` 和 `current_workspace` 两个字段读取频率远超写入（约 100:1），当前使用 `Mutex` 造成无谓的读竞争；`crates/browser` 用 `Mutex<bool>` 保护单个布尔值，可替换为 `AtomicBool`。这三处优化预估可降低 Tauri command 的平均耗时 5-10%。
- **前端 Dead Code — `locales/`**：`src/locales/` 目录（含 `en-US.ts`、`zh-CN.ts`，合计 246 行）在整个代码库中 `import` 引用数为 0。当前活跃系统是 `app/i18n/`（11 领域 × 2 语言 = 22 个翻译文件，504 keys），建议清理。
- **前端根层级文件迁移量**：`app/` 根层级共 15 个源文件 + 14 个测试文件可迁移到合理子目录，是上一次 `app/types.ts` 重构的延续性工作。
- **CSS Token 体系一致性**：`components.css` 的后半（843 行起）大量使用 `themes.css` 直出变量（`--bg-card`、`--font-size-xs`）而非语义 Token（`--surface-raised`、`--text-xs`）。虽然视觉效果一致，但形成两套不相通的命名体系，不利于主题系统长期演进。
- **整体评价**：项目架构在双端一致性、模块分层、Crate 组织方面已高度成熟。本次发现以性能收益明确的局部优化为主（锁降级、selector 优化、请求去重），架构层面以清理遗留代码和消除样板重复为主。

> 由自动化重构洞察生成于 2026-06-01 20:47:00
