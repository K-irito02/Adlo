# 重构实施计划 – ai-digital-life
**基于**：`docs/重构洞察/refactor-insight-2026-05-22.md`
**生成日期**：2026-05-22
**实施范围**：全量修复（19 项）
**基本原则**：保持现有功能不变，避免负面改进，确保代码结构清晰

---

## 总体策略

分层实施，每层完成后运行对应测试验证：

1. **Phase 1 – 前端架构**：Store 拆分、桥接层拆分、接口类型优化（非功能性重构，仅文件拆分）
2. **Phase 2 – 前端性能**：Hook/组件层面的性能与代码质量优化
3. **Phase 3 – Rust 后端**：搜索性能、文件遍历、内存分配优化

---

## Phase 1：前端架构重构（高优先级）

### Task 1.1：拆分 `slicedStore.ts`（~1400 行 → 8 个领域文件）

**当前状态**：`frontend/src/app/stores/slicedStore.ts` 包含 11 个切片合并 + 50+ 跨切片 actions 内联定义，单文件 1465 行。

**目标**：保持 `useSlicedAppStore` 单一入口不变，将 actions 按领域提取到 `actions/` 目录下的独立工厂函数文件，每个文件 200-300 行。

**新增目录结构**：
```
stores/
├── actions/                  # 新增：跨切片 action 模块
│   ├── workspaceActions.ts   # ~250 行：openWorkspace, clearWorkspaceContext, ...
│   ├── sessionActions.ts     # ~200 行：createSession, selectSession, ...
│   ├── editorActions.ts      # ~200 行：openFile, openChangePreview, ...
│   ├── patchActions.ts       # ~180 行：setHunkDecision, applyPatchSet, ...
│   ├── gitActions.ts         # ~150 行：fetchGitStatus, switchGitBranch, ...
│   ├── fetchActions.ts       # ~200 行：fetchIndexStatus, fetchAuditEntries, ...
│   ├── streamActions.ts      # ~200 行：sendMessage, cancelActiveStream, ...
│   └── generalActions.ts     # ~150 行：bootstrap, updatePreferences, ...
├── slices/                   # 不变：11 个切片（uiSlice.ts, workspaceSlice.ts...）
├── slicedStore.ts            # 精简至 ~50 行：导入 actions 工厂函数并组合
├── StoreState.ts             # 不变
├── selectors.ts              # 不变
├── shared.ts                 # 不变
└── ...
```

**实现方式**：
- 每个 action 文件导出一个 `createXxxActions` 函数，接收 `(set, get)` 参数
- `slicedStore.ts` 中 `create()` 调用 `...createWorkspaceActions(set, get)` 等展开
- 所有 import 重定向，无运行时行为变化

**涉及改动**：
| 文件 | 操作 | 行数变化 |
|------|------|----------|
| `stores/actions/workspaceActions.ts` | 新建 | ~250 行 |
| `stores/actions/sessionActions.ts` | 新建 | ~200 行 |
| `stores/actions/editorActions.ts` | 新建 | ~200 行 |
| `stores/actions/patchActions.ts` | 新建 | ~180 行 |
| `stores/actions/gitActions.ts` | 新建 | ~150 行 |
| `stores/actions/fetchActions.ts` | 新建 | ~200 行 |
| `stores/actions/streamActions.ts` | 新建 | ~200 行 |
| `stores/actions/generalActions.ts` | 新建 | ~150 行 |
| `stores/actions/index.ts` | 新建 | ~20 行（统一导出） |
| `stores/slicedStore.ts` | 重构 | 1465 → ~50 行 |
| `stores/StoreState.ts` | 不变 | — |
| `stores/index.ts` | 更新导出 | +1 行 |

**验证**：
```bash
$env:Path = "D:\Program Files\nodejs;$env:Path"
npm --prefix frontend run typecheck
npm --prefix frontend test
```

---

### Task 1.2：拆分 `preview-bridge.ts`（~600 行 → 4 个模块）

**当前状态**：`frontend/src/preview-bridge.ts` 单一文件包含 PTY SSE 连接管理、workspace/retrieval/conversation 等完整桥接实现，600+ 行。

**目标**：按领域拆分为独立模块，保留 `setupPreviewBridge()` 入口。

**新增目录结构**：
```
frontend/src/
├── preview-bridge/            # 新增：桥接模块目录
│   ├── index.ts               # 组合入口：setupPreviewBridge()
│   ├── ptyBridge.ts           # PTY 连接管理（SSE、listeners）
│   ├── workspaceBridge.ts     # 工作区操作桥接
│   └── storage.ts             # localStorage 持久化工具
├── preview-bridge.ts          # 删除（旧文件）
```

**实现方式**：
- 将 `ptyOutputListeners`、`connectPtySse` 等提取到 `ptyBridge.ts`
- 将 `loadRecentWorkspaces`、`persistRecentWorkspaces` 等提取到 `storage.ts`
- 将 workspace/retrieval 方法提取到 `workspaceBridge.ts`
- `index.ts` 组装并导出 `setupPreviewBridge()`

**涉及改动**：
| 文件 | 操作 |
|------|------|
| `preview-bridge/index.ts` | 新建（~80 行） |
| `preview-bridge/ptyBridge.ts` | 新建（~80 行） |
| `preview-bridge/workspaceBridge.ts` | 新建（~350 行） |
| `preview-bridge/storage.ts` | 新建（~80 行） |
| `preview-bridge.ts` | 删除（旧文件） |

**验证**：类型检查 + 全量前端测试

---

### Task 1.3：拆分 `DigitalLifeBridge` 接口类型

**当前状态**：`frontend/src/shared/ipc.ts` 中单一 `DigitalLifeBridge` 接口包含 50+ 方法。

**目标**：提取领域子接口，主接口组合使用。

**实现方式**：在 `shared/ipc.ts` 中新增以下类型导出：
```typescript
export interface AppBridge { getInfo, getHealth, getDiagnostics, ... }
export interface WorkspaceBridge { open, readFile, listTree, ... }
export interface ConversationBridge { createSession, sendMessage, ... }
export interface PtyBridge { create, input, resize, ... }
// DigitalLifeBridge 保持不变，仅将属性类型改为子接口
export interface DigitalLifeBridge {
  subscribeModelStream: ...
  app: AppBridge
  workspace: WorkspaceBridge
  conversation: ConversationBridge
  pty: PtyBridge
  ...
}
```

**注意**：这是纯类型重构，不改变 `window.digitalLife` 的使用方式。

**涉及改动**：
| 文件 | 行数变化 |
|------|----------|
| `shared/ipc.ts` | +30 行（新增子接口定义） |
| `tauri-bridge.ts` | 仅 import 更新 |
| `preview-bridge/index.ts` | 仅 import 更新 |
| `mock-bridge.ts` | 仅 import 更新 |

**验证**：类型检查通过即可。

---

### Task 1.4：提取 `sendMessage` 中的流处理器

**当前状态**：`slicedStore.ts:634-816` 中的 `sendMessage` 超过 120 行，行内包含 `subscribeModelStream` 和 `subscribeRunActivity` 回调闭包。

**目标**：将流订阅处理逻辑提取为 `streamActions.ts` 中的具名函数。

**具体方案**：
- 在 `streamActions.ts` 中新增：`createModelStreamSubscriber(get, set)` 和 `createRunActivitySubscriber(set)` 工厂函数
- `sendMessage` 中直接调用这些工厂函数创建订阅器

**涉及改动**：
| 文件 | 操作 |
|------|------|
| `stores/actions/streamActions.ts` | 重构（提取流处理器） |

**验证**：确保 `npm --prefix frontend test` 中 store 测试全部通过。

---

## Phase 2：前端性能与代码质量优化（中/低优先级）

### Task 2.1：修复 `useStreamingText` 订阅清理

**文件**：`frontend/src/app/hooks/useStreamingText.ts:34-54`

**问题**：`subscribeModelStream` 回调直接修改 `bufferRef`，组件卸载时未显式重置。

**修复**：在 cleanup 函数中增加：
```typescript
return () => {
  unsubscribe();
  if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
  bufferRef.current = "";  // 新增：显式重置 buffer
  setText("");              // 新增：重置 state
};
```

---

### Task 2.2：修复 `fileTree.tsx` memo 类型断言

**文件**：`frontend/src/app/features/file-tree/fileTree.tsx:273-275`

**修复**：使用更简洁的泛型 memo 模式：
```typescript
const MemoizedFileTreeNode = memo(FileTreeNodeComponent, areFileTreeNodePropsEqual) as typeof FileTreeNodeComponent;
```

---

### Task 2.3：修复 `fileTree.tsx` useMemo 依赖

**文件**：`frontend/src/app/features/file-tree/fileTree.tsx:304`

**修复**：确保 `getAllNodePaths` 使用稳定的 `useMemo`：
```typescript
const getAllNodePaths = useMemo(() => collectAllNodePaths(props.nodes), [props.nodes]);
```
（当前已有此模式，验证依赖是否正确）

---

### Task 2.4：优化 `getMultiSelectedNodes` 低效遍历

**文件**：`frontend/src/app/features/file-tree/fileTree.tsx:321-335`

**修复**：利用 `selectedPaths` Set 直接查找，避免递归整棵树：
```typescript
const getMultiSelectedNodes = useCallback((): T[] => {
  const result: T[] = [];
  if (selectedPaths.size === 0) return result;
  const visit = (items: T[]) => {
    for (const item of items) {
      if (selectedPaths.has(item.path)) result.push(item);
      if (item.children.length > 0) visit(item.children as T[]);
    }
  };
  visit(props.nodes);
  return result;
}, [props.nodes, selectedPaths]);
```
（当前已是此模式，验证无进一步优化空间）

---

### Task 2.5：修复 `useTooltip.ts` 模块级副作用

**文件**：`frontend/src/app/hooks/useTooltip.ts:40-63`

**问题**：`scrollResizeCallbacks` Set 和 `globalListenerAttached` 标志是模块级状态。

**修复**：使用 `useEffect` 管理生命周期，将该逻辑移到 Hook 内部的 `ref` 追踪：
```typescript
// 移除模块级 scrollResizeCallbacks Set 和 globalListenerAttached
// 改为在每个 useTooltip 实例中独立管理 ResizeObserver + scroll 监听
```

实际改动较小：移除全局 Set，为每个实例独立添加/移除 scroll/resize 监听，利用已存在的 `ResizeObserver`。

---

### Task 2.6：简化 `Composer.tsx` 冗余 callback

**文件**：`frontend/src/app/components/Composer.tsx:39-51`

**修复**：移除无实际增益的 `useCallback` 包装，直接内联传递：
```tsx
<ContextBuilder
  onAddContext={onAddContext}
  activeContexts={activeContexts}
/>
<PromptInput
  value={input}
  onChange={onInputChange}
  ...
/>
```

---

### Task 2.7：增强 `shared.ts` debounce 可取消性

**文件**：`frontend/src/app/stores/shared.ts:130-140`

**修复**：添加 `cancel()` 方法和 promise 支持：
```typescript
export function createDebouncedSearch(ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastQuery = "";
  const debounced = (query: string, doSearch: () => Promise<void>) => {
    lastQuery = query;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (debounced.lastQuery !== query) return;  // 已过时则跳过
      void doSearch();
    }, ms);
  };
  debounced.cancel = () => { if (timer) { clearTimeout(timer); timer = undefined; } };
  debounced.lastQuery = "";
  return debounced;
}
```

---

### Task 2.8：优化 `searchFiles` 防抖同步

**文件**：`frontend/src/app/stores/slicedStore.ts:994-1010`

**修复**：利用 Task 2.7 增强后的 debounce 的 cancel 能力，在组件卸载时取消：
```typescript
// searchFiles 内部
debouncedSearch.cancel();
debouncedSearch(query, async () => {
  // 使用内部缓存的最新 query 而非外部状态
  const latestQuery = get().searchQuery;
  if (latestQuery !== query) return;
  ...
});
```
（此 Task 与 Task 2.7 联动）

---

### Task 2.9：`StoreState.ts` 类型交叉合并优化

**文件**：`frontend/src/app/stores/StoreState.ts:30-101`

**修复**：将交叉类型改为 `interface` 继承链：
```typescript
export interface StoreStateBase extends UISlice, WorkspaceSlice, GitSlice, ..., ClipboardSlice {
  loading: boolean;
  error?: string;
}
export interface StoreState extends StoreStateBase {
  // 跨切片 actions
  bootstrap: () => Promise<void>;
  ...
}
```

**注意**：此改动需确保 `slicedStore.ts` 中的类型引用同步更新。

---

## Phase 3：Rust 后端优化（中/高优先级）

### Task 3.1：消除 `search_text` / `search_text_async` 重复逻辑

**文件**：`crates/workspace/src/lib.rs:799-868`

**方案**：提取公共搜索循环到内部函数，async 版本复用：
```rust
fn search_text_in_files(
    files: &[PathBuf],
    root: &Path,
    query: &str,
    cancel: Option<&tokio::sync::broadcast::Receiver<()>>,
) -> Result<Vec<WorkspaceSearchHit>, AppError> { ... }

// search_text 调用 search_text_in_files(None)
// search_text_async 调用 search_text_in_files(Some(&cancellation))
```

**验证**：`cargo test --workspace` 中 `search_text_*` 相关测试全部通过。

---

### Task 3.2：消除 `collect_text_files_inner` 双重 I/O + 扩展 IGNORED_DIRS

**文件**：`crates/workspace/src/lib.rs:1804-1839`

**修复 1**：消除 `fs::metadata()` 冗余调用 —— `read_text_file()` 已经处理大小检查。
```rust
fn collect_text_files_inner(...) {
    for entry in fs::read_dir(dir)? {
        ...
        if path.is_file() {
            // 移除 fs::metadata(&path) 调用
            let relative = relative_path(root, &path);
            if adl_fs_ops::read_text_file(root, &relative, max_file_bytes).is_ok() {
                files.push(path);
            }
        }
    }
}
```

**修复 2**：扩展 `IGNORED_DIRS` 列表：
```rust
const IGNORED_DIRS: &[&str] = &[
    ".git", "target", "node_modules", "dist", "build",
    ".next", ".cache", "__pycache__", ".venv", "vendor",
    ".idea", ".vscode", ".svelte-kit", ".turbo",
    "coverage", ".nyc_output", "out", ".tox",
];
```

---

### Task 3.3：消除 `build_retrieval_snapshot` 二次遍历

**文件**：`crates/workspace/src/lib.rs:1631-1687`

**问题**：`collect_text_files()` 遍历一次文件系统收集文件，然后在上层单独循环做 extension 统计。

**修复**：在 `collect_text_files_inner` 中直接收集 extension 统计，或使用迭代器合并：
```rust
fn collect_text_files_with_stats(
    root: &Path, max_file_bytes: u64
) -> Result<(Vec<PathBuf>, BTreeMap<String, i32>), AppError> {
    let mut files = Vec::new();
    let mut extensions: BTreeMap<String, i32> = BTreeMap::new();
    collect_text_files_inner(root, root, max_file_bytes, &mut files, &mut extensions)?;
    Ok((files, extensions))
}
```

---

### Task 3.4：优化 `sanitize_brace_line` 正则编译

**文件**：`crates/workspace/src/lib.rs:1048-1054`

**问题**：`sanitize_brace_line` 每次调用都新建两个 `Regex` 实例。

**修复**：使用 `OnceLock` 缓存正则：
```rust
fn sanitize_brace_line(line_text: &str) -> String {
    static STRING_REGEX: OnceLock<Regex> = OnceLock::new();
    static COMMENT_REGEX: OnceLock<Regex> = OnceLock::new();
    let string_regex = STRING_REGEX.get_or_init(|| 
        Regex::new(r#""(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`"#).unwrap()
    );
    let comment_regex = COMMENT_REGEX.get_or_init(|| 
        Regex::new(r"//.*$|/\*.*?\*/").unwrap()
    );
    let without_strings = string_regex.replace_all(line_text, "\"\"");
    comment_regex.replace_all(&without_strings, "").into_owned()
}
```

---

### Task 3.5：优化 `finalize_outline_items` 至 O(n)

**文件**：`crates/workspace/src/lib.rs:931-973`

**方案**：使用栈实现 O(n) 的 end_line 计算：
```rust
fn finalize_outline_items(drafts: Vec<OutlineDraft>, relative_path: &str, total_lines: usize) -> Vec<FileOutlineItem> {
    let mut sorted = drafts;
    sorted.sort_by_key(|d| (d.line, d.depth, d.label.clone()));

    let mut result = Vec::with_capacity(sorted.len());
    let mut stack: Vec<(usize, usize)> = Vec::new();  // (depth, index_in_result)
    let mut line_occurrences: BTreeMap<usize, usize> = BTreeMap::new();

    for item in &sorted {
        // 当前项是栈中所有更深项的 end_line
        while let Some(&(depth, idx)) = stack.last() {
            if depth >= item.depth {
                result[idx].end_line = Some(item.line.saturating_sub(1));
                stack.pop();
            } else { break; }
        }
        let occurrence = line_occurrences.entry(item.line).or_insert(0);
        *occurrence += 1;
        let id = if *occurrence == 1 { ... } else { ... };
        result.push(FileOutlineItem { ... });
        stack.push((item.depth, result.len() - 1));
    }
    // 栈中剩余的 end_line = total_lines
    for &(_, idx) in &stack { result[idx].end_line = Some(total_lines); }

    result
}
```

**注意**：此优化复杂度从 O(n²) 降至 O(n log n)，但实际性能影响很小（n 通常 < 200）。主要收益是代码结构改善。

---

### Task 3.6：优化 `shell_command` 平台代码

**文件**：`crates/terminal/src/lib.rs:126-149`

**修复**：将 `#[cfg]` 宏分离为独立函数以减少嵌套：
```rust
#[cfg(windows)]
fn shell_command_impl(command: &str, args: &[String]) -> Command {
    let mut shell = Command::new("cmd");
    shell.arg("/C").arg(
        std::iter::once(command)
            .chain(args.iter().map(String::as_str))
            .collect::<Vec<_>>()
            .join(" "),
    );
    shell
}

#[cfg(not(windows))]
fn shell_command_impl(command: &str, args: &[String]) -> Command {
    let mut shell = Command::new("sh");
    shell.arg("-c").arg(
        std::iter::once(command)
            .chain(args.iter().map(String::as_str))
            .collect::<Vec<_>>()
            .join(" "),
    );
    shell
}

fn shell_command(command: &str, args: &[String]) -> Command {
    shell_command_impl(command, args)
}
```

---

## 验证策略

| 阶段 | 验证命令 | 触发条件 |
|------|----------|----------|
| Phase 1 完成 | `npm --prefix frontend run typecheck && npm --prefix frontend test` | 前端架构重构后 |
| Phase 2 完成 | `npm --prefix frontend run typecheck && npm --prefix frontend test` | 前端性能优化后 |
| Phase 3 每 Task | `cargo check --workspace && cargo test --workspace` | 每项 Rust 改动后 |
| Phase 3 全部完成 | `cargo clippy --workspace --all-targets -- -D warnings` | Rust 所有改动完成后 |
| 全局验收 | `npm --prefix frontend run typecheck && npm --prefix frontend test && cargo test --workspace` | 全部完成 |

---

## 排除项（明确不处理）

- 不修改 `DigitalLifeBridge` 的运行时签名（仅类型层面提取子接口）
- 不引入新的第三方依赖（如 lodash、ripgrep 等）
- 不修改 Tauri `capabilities/*.json` 或 IPC 通道
- 不修改测试文件以外的内容（除非测试过时需要更新）

---

## 任务依赖关系图

```
Phase 1:           Phase 2:              Phase 3:
Task 1.1 ─┐        Task 2.1              Task 3.1
Task 1.2 ─┤        Task 2.2              Task 3.2
Task 1.3 ─┤        Task 2.3              Task 3.3
Task 1.4 ─┤        Task 2.4              Task 3.4
           ├── 无依赖  Task 2.5           Task 3.5
           │         Task 2.6             Task 3.6
           │    ┌────Task 2.7 ──── Task 2.8 (联动)
           │         Task 2.9
           └── 均可并行 ────────── 均可并行
```

**执行建议**：Phase 1 → Phase 2 → Phase 3 顺序执行，每个 Phase 内可并行。

---

## 文件变更汇总

| 操作 | 数量 |
|------|------|
| 新建文件 | 12 |
| 修改文件 | 8 |
| 删除文件 | 1 (`preview-bridge.ts` → 替换为 `preview-bridge/` 目录) |
| **合计** | **21 文件变更** |
