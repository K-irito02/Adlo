# 重构洞察修复计划 — 2026-05-24

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 2026-05-24 重构洞察报告中全部 11 项问题进行修复，涵盖 Rust 后端 Regex 缓存、大纲解析性能优化、死 CSS 清理、前端组件拆分与 store action 重构。

**Architecture:** 按影响范围和依赖关系分为 4 个阶段执行：Phase A（低风险清理）→ Phase B（Rust 性能优化）→ Phase C（前端 store 重构）→ Phase D（文件拆分）。每个 Phase 内部任务独立，可并行执行；Phase 间有验证门禁。

**Tech Stack:** Rust (crates/workspace/), TypeScript/React/Zustand (frontend/src/), CSS (styles/)

**关联报告:** `docs/refactoring-insight/report/daily-insights/2026-05/refactor-insight-2026-05-24.md`

---

## Phase A：低风险清理（独立，可最先执行）

### Task A1：删除死 CSS 文件

**背景：** `regions.css`（8144行）、`sidebar.css`（506行）、`main-content.css`（1064行）共 9714 行均未被 `index.css` 导入链引用，属于重构拆分后残留。

**文件：**
- Delete: `frontend/src/styles/regions.css`
- Delete: `frontend/src/styles/sidebar.css`
- Delete: `frontend/src/styles/main-content.css`

- [ ] **Step 1: 确认无引用**

确认这三个文件未被任何 import/require/vite 配置引用：
```powershell
cd e:\Programs\Obsidian\notes\ai-digital-life\frontend
rg "regions\.css[^/]" src --type ts --type tsx --type css
rg "sidebar\.css" src --type ts --type tsx --type css
rg "main-content\.css" src --type ts --type tsx --type css
```
预期：rg 输出为空（无引用）。

再确认 `vite.config.ts` 中无引用：
```powershell
rg "regions\.css|sidebar\.css|main-content\.css" vite.config.ts
```
预期：无匹配。

- [ ] **Step 2: 删除文件**

```powershell
Remove-Item "e:\Programs\Obsidian\notes\ai-digital-life\frontend\src\styles\regions.css"
Remove-Item "e:\Programs\Obsidian\notes\ai-digital-life\frontend\src\styles\sidebar.css"
Remove-Item "e:\Programs\Obsidian\notes\ai-digital-life\frontend\src\styles\main-content.css"
```

- [ ] **Step 3: 验证构建**

```powershell
cd e:\Programs\Obsidian\notes\ai-digital-life\frontend
npx vite build --mode development
```
预期：构建成功，无 CSS 相关错误。

- [ ] **Step 4: 验证开发模式**

```powershell
npm run dev:browser
```
预期：开发服务器正常启动，页面样式无变化（UI 视觉回归）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/
git commit -m "chore: remove 9714 lines of dead CSS (regions.css, sidebar.css, main-content.css)"
```

---

### Task A2：StoreState 文档化注释

**背景：** `StoreState.ts` 合并 12 切片 + 8 action 接口共 70+ 方法，新开发者需遍历多层继承。不改代码结构，仅补充结构化注释。

**文件：**
- Modify: `frontend/src/app/stores/StoreState.ts:1-4`（头部注释）
- Modify: `frontend/src/app/stores/slicedStore.ts:59-88`（`create` 调用处）

- [ ] **Step 1: 在 StoreState.ts 头部添加领域分组注释**

在 `frontend/src/app/stores/StoreState.ts` 第 1 行前插入：

```typescript
/**
 * 完整的 StoreState 类型定义 — 领域分组总览
 *
 * ## 领域分组
 *
 * ### 状态切片（12 个，定义在 slices/）
 * | 切片              | 关键字段                     | 文件                    |
 * |-------------------|-----------------------------|------------------------|
 * | UISlice           | leftSidebarVisible, chatMode | slices/uiSlice.ts      |
 * | WorkspaceSlice    | appInfo, workspaceTree       | slices/workspaceSlice.ts|
 * | GitSlice          | gitSnapshot, gitBranches     | slices/gitSlice.ts     |
 * | SessionSlice      | sessions, activeSessionId    | slices/sessionSlice.ts |
 * | EditorSlice       | openTabs, selectedFilePath   | slices/editorSlice.ts  |
 * | PatchSlice        | activePatchSet               | slices/patchSlice.ts   |
 * | SearchSlice       | searchQuery, searchResults   | slices/searchSlice.ts  |
 * | DiagnosticSlice   | indexingStatus, repoMap      | slices/diagnosticSlice.ts|
 * | TaskSlice         | taskCenter                   | slices/taskSlice.ts    |
 * | CommandSlice      | latestCommandRun             | slices/commandSlice.ts |
 * | ClipboardSlice    | clipboardItems               | slices/clipboardSlice.ts|
 * | TerminalSlice     | terminalSessions             | slices/terminalSlice.ts|
 *
 * ### Action 接口（8 个，定义在 actions/）
 * | 接口               | 核心方法                      | 文件                       |
 * |--------------------|------------------------------|----------------------------|
 * | WorkspaceActions   | openWorkspace, refreshTree   | actions/workspaceActions.ts |
 * | SessionActions     | sendMessage, createSession   | actions/sessionActions.ts   |
 * | EditorActions      | openFile, openChangePreview  | actions/editorActions.ts    |
 * | GitActions         | loadGitSnapshot, switchBranch| actions/gitActions.ts       |
 * | PatchActions       | applyPatchSet, setHunkDecision| actions/patchActions.ts    |
 * | SearchActions      | searchFiles                  | (内联在 StoreState.ts)      |
 * | TaskActions        | refreshTaskCenter            | (内联在 StoreState.ts)      |
 * | CommandActions     | runCommand                   | (内联在 StoreState.ts)      |
 * | DataFetchActions   | bootstrap, updatePreferences | actions/generalActions.ts   |
 *
 * ### 根级字段
 * - `loading: boolean` — 应用启动状态
 * - `error?: string` — 全局错误消息
 */
```

- [ ] **Step 2: 在 slicedStore.ts 的 create 调用处添加边界注释**

在 `frontend/src/app/stores/slicedStore.ts` 的 `create<StoreState>` 调用处（第 60 行附近），将：

```typescript
export const useSlicedAppStore = create<StoreState>((set, get) => ({
  // 合并所有基础切片
  ...createUISlice(set, get),
```

改为：

```typescript
export const useSlicedAppStore = create<StoreState>((set, get) => ({
  // ════════════════════════════════════════════════════════
  // 状态切片（12 个）— 纯状态 + 切片内 actions
  // ════════════════════════════════════════════════════════
  ...createUISlice(set, get),            // UI 状态（侧边栏、工具栏、聊天模式）
```

并在第 73 行 `...createTerminalSlice(set, get),` 后添加：

```typescript
  ...createTerminalSlice(set, get),      // 终端状态（PTY 会话管理）

  // ════════════════════════════════════════════════════════
  // 根级状态
  // ════════════════════════════════════════════════════════
```

并在第 79 行 `...createWorkspaceActions(set, get),` 前添加：

```typescript
  // ════════════════════════════════════════════════════════
  // 跨切片 Actions（8 个领域模块）
  // ════════════════════════════════════════════════════════
  ...createWorkspaceActions(set, get),   // 工作区操作
  ...createSessionActions(set, get),     // 会话操作（含 sendMessage）
  ...createEditorActions(set, get),      // 编辑器操作
  ...createPatchActions(set, get),       // 补丁操作
  ...createGitActions(set, get),         // Git 操作
  ...createFetchActions(set, get),       // 数据拉取（indexStatus, repoMap）
  ...createStreamActions(set, get),      // 流式消息（sendMessage, cancelActiveStream）
  ...createGeneralActions(set, get),     // 通用操作（bootstrap, updatePreferences）
```

- [ ] **Step 3: 类型检查**

```powershell
cd e:\Programs\Obsidian\notes\ai-digital-life\frontend
npx tsc --noEmit
```
预期：类型检查通过，无新增错误。

- [ ] **Step 4: 运行前端测试**

```powershell
npm test
```
预期：全部通过。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/stores/StoreState.ts frontend/src/app/stores/slicedStore.ts
git commit -m "docs: add domain grouping annotations to StoreState and slicedStore"
```

---

### Task A3：model-gateway unwrap 微优化

**背景：** `crates/model-gateway/src/lib.rs:234` 中 `body.model.unwrap_or_else(|| model_id.to_string())` 的闭包可简化为直接传值。

**文件：**
- Modify: `crates/model-gateway/src/lib.rs:234`

- [ ] **Step 1: 修改一行代码**

在 `crates/model-gateway/src/lib.rs` 第 234 行，将：

```rust
model_id: body.model.unwrap_or_else(|| model_id.to_string()),
```

改为：

```rust
model_id: body.model.unwrap_or_else(|| model_id.into()),
```

（利用 `String::from(&str)` 通过 `.into()` 更简洁；语义不变。）

- [ ] **Step 2: 编译检查**

```powershell
cd e:\Programs\Obsidian\notes\ai-digital-life
cargo check -p adl-model-gateway
```
预期：编译通过。

- [ ] **Step 3: 运行 model-gateway 测试**

```powershell
cargo test -p adl-model-gateway
```
预期：全部通过。

- [ ] **Step 4: Commit**

```bash
git add crates/model-gateway/src/lib.rs
git commit -m "refactor(model-gateway): simplify unwrap_or_else closure with .into()"
```

---

## Phase B：Rust 性能优化（outline 热路径）

### Task B1：8 个 outline 解析器的 Regex → OnceLock 缓存

**背景：** `python.rs`(2处)、`shell.rs`(5处)、`yaml.rs`(3处)、`sql.rs`(4处)、`html.rs`(4处)、`json.rs`(1处)、`vue.rs`(1处)、`mod.rs:parse_config_outline`(2处) 共约 22 处 `Regex::new().unwrap()` 每次函数调用重新编译。`brace.rs` 已使用 `OnceLock`，只需对齐其他文件。

**模式参考（来自 brace.rs 的正确实现）：**

```rust
use std::sync::OnceLock;

fn get_my_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"pattern").unwrap())
}
```

**文件（每个文件独立修改，互不依赖）：**
- Modify: `crates/workspace/src/outline/python.rs:7-8`
- Modify: `crates/workspace/src/outline/shell.rs:7-12`
- Modify: `crates/workspace/src/outline/yaml.rs:7-9`
- Modify: `crates/workspace/src/outline/sql.rs:7-11`
- Modify: `crates/workspace/src/outline/html.rs:55-57,76`
- Modify: `crates/workspace/src/outline/json.rs:7`
- Modify: `crates/workspace/src/outline/vue.rs:7`
- Modify: `crates/workspace/src/outline/mod.rs:131-132`

- [ ] **Step 1: 修改 python.rs**

```rust
// 文件: crates/workspace/src/outline/python.rs
// 修改前:
use regex::Regex;

pub(crate) fn parse_python_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut indent_stack: Vec<usize> = Vec::new();
    let class_regex = Regex::new(r"^class\s+([A-Za-z_][\w]*)").unwrap();
    let fn_regex = Regex::new(r"^(?:async\s+)?def\s+([A-Za-z_][\w]*)").unwrap();

// 修改后:
use regex::Regex;
use std::sync::OnceLock;

fn class_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^class\s+([A-Za-z_][\w]*)").unwrap())
}

fn fn_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(?:async\s+)?def\s+([A-Za-z_][\w]*)").unwrap())
}

pub(crate) fn parse_python_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut indent_stack: Vec<usize> = Vec::new();
```

然后在函数体内将 `class_regex.captures(...)` 改为 `class_regex().captures(...)`，`fn_regex.captures(...)` 改为 `fn_regex().captures(...)`。

- [ ] **Step 2: 修改 shell.rs**

```rust
// 文件: crates/workspace/src/outline/shell.rs
// 在 mod 顶层添加 5 个 OnceLock 函数，移除函数体内的 let 绑定

use regex::Regex;
use std::sync::OnceLock;

fn ps_function_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)^function\s+([A-Za-z_][\w-]*)").unwrap())
}

fn sh_function_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{").unwrap())
}

fn ps_block_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)^(if|foreach|for|while|switch|try|catch|finally|class|enum)\b").unwrap())
}

fn sh_block_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(if|for|while|until|case|select)\b").unwrap())
}

fn shell_close_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(fi|done|esac)\b").unwrap())
}
```

然后在 `parse_shell_outline` 函数体内：
- `ps_function_regex.captures(...)` → `ps_function_regex().captures(...)`
- `sh_function_regex.captures(...)` → `sh_function_regex().captures(...)`
- `ps_block_regex.captures(...)` → `ps_block_regex().captures(...)`
- `sh_block_regex.captures(...)` → `sh_block_regex().captures(...)`
- `shell_close_regex.is_match(...)` → `shell_close_regex().is_match(...)`

- [ ] **Step 3: 修改 yaml.rs**

```rust
// 文件: crates/workspace/src/outline/yaml.rs
// 3 个 Regex → OnceLock

fn list_key_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^-+\s*([^:#]+)\s*:\s*(.*)$").unwrap())
}

fn key_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^([^:#][^:]*?)\s*:\s*(.*)$").unwrap())
}

fn list_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^-+\s*(?:\{|\[)?\s*$").unwrap())
}
```

函数体内对应替换 `list_key_regex()` / `key_regex()` / `list_regex()`。

- [ ] **Step 4: 修改 sql.rs**

```rust
// 文件: crates/workspace/src/outline/sql.rs
// 4 个 Regex → OnceLock

fn create_table_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?i)^create\s+table\s+([A-Za-z0-9_."]+)"#).unwrap())
}

fn create_other_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?i)^create\s+(view|index|function|procedure)\s+([A-Za-z0-9_."]+)"#).unwrap())
}

fn alter_table_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?i)^alter\s+table\s+([A-Za-z0-9_."]+)"#).unwrap())
}

fn column_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"^([A-Za-z_"][\w"]*)\s+[A-Za-z_]"#).unwrap())
}
```

函数体内对应替换 `create_table_regex()` / `create_other_regex()` / `alter_table_regex()` / `column_regex()`。

- [ ] **Step 5: 修改 html.rs**

```rust
// 文件: crates/workspace/src/outline/html.rs
// format_html_tag_label 中 3 个 Regex + parse_html_outline 中 1 个 Regex → OnceLock

fn id_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"id=["']([^"']+)["']"#).unwrap())
}

fn class_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"class=["']([^"']+)["']"#).unwrap())
}

fn name_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?:name|role)=["']([^"']+)["']"#).unwrap())
}

fn tag_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"</?([A-Za-z][\w:-]*)([^>]*?)(/?)>"#).unwrap())
}
```

`format_html_tag_label` 中 `id_regex.captures(...)` → `id_regex().captures(...)` 等。
`parse_html_outline` 中 `tag_regex.captures_iter(...)` → `tag_regex().captures_iter(...)`。

- [ ] **Step 6: 修改 json.rs**

```rust
// 文件: crates/workspace/src/outline/json.rs
// 1 个 Regex → OnceLock

fn key_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"^"([^"]+)"\s*:\s*(.*)$"#).unwrap())
}
```

`key_regex.captures(...)` → `key_regex().captures(...)`。

- [ ] **Step 7: 修改 vue.rs**

```rust
// 文件: crates/workspace/src/outline/vue.rs
// 1 个 Regex → OnceLock

fn open_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\s*<(template|script|style)([^>]*)>").unwrap())
}
```

`open_regex.captures(...)` → `open_regex().captures(...)`。

- [ ] **Step 8: 修改 mod.rs 的 parse_config_outline**

```rust
// 文件: crates/workspace/src/outline/mod.rs
// parse_config_outline 中 2 个 Regex → OnceLock

fn config_section_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\[([^\]]+)\]$").unwrap())
}

fn config_entry_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^([A-Za-z0-9_.-]+)\s*=\s*(.+)$").unwrap())
}
```

`section_regex.captures(...)` → `config_section_regex().captures(...)`，`entry_regex.captures(...)` → `config_entry_regex().captures(...)`。

- [ ] **Step 9: 编译检查全量**

```powershell
cd e:\Programs\Obsidian\notes\ai-digital-life
cargo check --workspace
```
预期：全部编译通过。

- [ ] **Step 10: 运行 Rust 测试**

```powershell
cargo test --workspace
```
预期：全部通过。

- [ ] **Step 11: Commit**

```bash
git add crates/workspace/src/outline/
git commit -m "perf(workspace): cache 22 outline Regex instances with OnceLock
```

---

### Task B2：detect_outline_family → 静态 HashMap

**背景：** `detect_outline_family` 每次调用执行 `replace('\\', '/')` + `rsplit('/')` + `rsplit_once('.')` 三次堆分配。返回值是 `&'static str`，可预计算为静态 HashMap。

**文件：**
- Modify: `crates/workspace/src/outline/mod.rs:55-82`

- [ ] **Step 1: 添加 HashMap 静态缓存**

在 `detect_outline_family` 函数上方添加：

```rust
use std::collections::HashMap;
use std::sync::OnceLock;

fn outline_family_map() -> &'static HashMap<&'static str, &'static str> {
    static MAP: OnceLock<HashMap<&str, &str>> = OnceLock::new();
    MAP.get_or_init(|| {
        HashMap::from([
            ("md", "markdown"), ("markdown", "markdown"),
            ("py", "python"),
            ("yaml", "yaml"), ("yml", "yaml"),
            ("toml", "config"), ("ini", "config"), ("cfg", "config"), ("conf", "config"),
            ("json", "json"),
            ("html", "html"), ("htm", "html"), ("xml", "html"), ("svg", "html"),
            ("css", "css"), ("scss", "css"), ("less", "css"),
            ("vue", "vue"),
            ("sh", "shell"), ("bash", "shell"), ("zsh", "shell"), ("fish", "shell"),
            ("ps1", "powershell"),
            ("sql", "sql"),
            ("db", "none"), ("sqlite", "none"), ("sqlite3", "none"),
        ])
    })
}
```

- [ ] **Step 2: 重写 detect_outline_family**

将原函数替换为：

```rust
pub(crate) fn detect_outline_family(relative_path: &str) -> &'static str {
    let file_name = relative_path
        .rsplit(&['/', '\\'][..])
        .next()
        .unwrap_or(relative_path)
        .to_ascii_lowercase();

    if file_name == "dockerfile" {
        return "shell";
    }

    let extension = file_name
        .rsplit_once('.')
        .map(|(_, ext)| ext)
        .unwrap_or(file_name.as_str());

    outline_family_map()
        .get(extension)
        .copied()
        .unwrap_or("brace")
}
```

关键改进：
- `rsplit(&['/', '\\'][..])` 替代 `replace('\\', '/')` + `rsplit('/')` — 零分配
- O(1) HashMap 查表替代 O(n) match 链

- [ ] **Step 3: 编译检查**

```powershell
cargo check -p adl-workspace
```
预期：编译通过。

- [ ] **Step 4: 运行 workspace 测试**

```powershell
cargo test -p adl-workspace
```
预期：全部通过。

- [ ] **Step 5: 运行全量测试**

```powershell
cargo test --workspace
```
预期：全部通过。

- [ ] **Step 6: Commit**

```bash
git add crates/workspace/src/outline/mod.rs
git commit -m "perf(workspace): replace detect_outline_family string ops with static HashMap lookup"
```

---

### Task B3：vue.rs 内存优化

**背景：** `parse_vue_outline` 先 `.collect::<Vec<&str>>()` 拆行再 `.join("\n")` 合并，双倍内存分配。改为直接使用行号切片原始 content。

**文件：**
- Modify: `crates/workspace/src/outline/vue.rs:6-45`

- [ ] **Step 1: 用 lines() 迭代器 + 行号范围替代 Vec 收集**

```rust
// 文件: crates/workspace/src/outline/vue.rs
// 完整替换 parse_vue_outline 函数

fn open_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\s*<(template|script|style)([^>]*)>").unwrap())
}

pub(crate) fn parse_vue_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let lines: Vec<&str> = content.lines().collect(); // 保留 line-by-index 访问，但避免 join
    let mut index = 0usize;
    while index < lines.len() {
        let line = lines[index];
        let Some(captures) = open_regex().captures(line) else {
            index += 1;
            continue;
        };
        let section = captures
            .get(1)
            .map(|value| value.as_str().to_ascii_lowercase())
            .unwrap_or_else(|| "script".to_string());
        let start_line = index + 1;
        let end_tag = format!("</{section}>");
        let mut end_index = index + 1;
        while end_index < lines.len()
            && !lines[end_index].to_ascii_lowercase().contains(&end_tag)
        {
            end_index += 1;
        }

        // 计算 inner_content 的起始/结束字节偏移
        let inner_start = lines[index].len() + 1; // +1 for newline
        let inner_end = if end_index > index + 1 {
            // 行 index+1 到 end_index 对应的原始字节范围
            let mut byte_offset = 0usize;
            for (i, l) in lines.iter().enumerate() {
                if i == end_index {
                    break;
                }
                if i == index {
                    byte_offset += l.len() + 1;
                    continue;
                }
            }
            // 简化方案：直接重新 join inner 行（仅需要临时字符串，不是全文件）
            lines[index + 1..end_index].join("\n")
        } else {
            String::new()
        };

        drafts.push(OutlineDraft {
            label: section.clone(),
            kind: "heading".to_string(),
            line: start_line,
            depth: 1,
        });

        let inner_drafts = if section == "template" {
            super::html::parse_html_outline(&inner_content)
        } else if section == "style" {
            super::css::parse_css_outline(&inner_content)
        } else {
            super::brace::parse_brace_outline(&inner_content)
        };
        drafts.extend(inner_drafts.into_iter().map(|draft| OutlineDraft {
            line: draft.line + start_line,
            depth: draft.depth + 1,
            ..draft
        }));
        index = end_index + 1;
    }
    drafts
}
```

实际优化：将 `lines[index + 1..end_index].join("\n")` 改为延迟求值——仅在 section 非空时才 join，且仅 join inner 行而非全文件。

最佳方案是用字节偏移直接从原始 `content` 切片中提取 `inner_content`：

```rust
pub(crate) fn parse_vue_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let mut line_offsets: Vec<usize> = Vec::with_capacity(lines.len());

    // 预计算每行起始字节偏移
    {
        let mut offset = 0usize;
        for line in &lines {
            line_offsets.push(offset);
            offset += line.len() + 1; // +1 for '\n'
        }
    }

    let mut index = 0usize;
    while index < lines.len() {
        let line = lines[index];
        let Some(captures) = open_regex().captures(line) else {
            index += 1;
            continue;
        };
        let section = captures
            .get(1)
            .map(|value| value.as_str().to_ascii_lowercase())
            .unwrap_or_else(|| "script".to_string());
        let start_line = index + 1;
        let end_tag = format!("</{section}>");
        let mut end_index = index + 1;
        while end_index < lines.len()
            && !lines[end_index].to_ascii_lowercase().contains(&end_tag)
        {
            end_index += 1;
        }

        drafts.push(OutlineDraft {
            label: section.clone(),
            kind: "heading".to_string(),
            line: start_line,
            depth: 1,
        });

        if end_index > index + 1 {
            let inner_start = line_offsets[index + 1];
            let inner_end = if end_index < lines.len() {
                line_offsets[end_index].saturating_sub(1) // exclude trailing '\n'
            } else {
                content.len()
            };
            let inner_content = &content[inner_start..inner_end.min(content.len())];

            let inner_drafts = match section.as_str() {
                "template" => super::html::parse_html_outline(inner_content),
                "style" => super::css::parse_css_outline(inner_content),
                _ => super::brace::parse_brace_outline(inner_content),
            };
            drafts.extend(inner_drafts.into_iter().map(|draft| OutlineDraft {
                line: draft.line + start_line,
                depth: draft.depth + 1,
                ..draft
            }));
        }
        index = end_index + 1;
    }
    drafts
}
```

此方案用字节偏移切片替代 `join("\n")`，完全消除 inner 行的字符串重建分配。

- [ ] **Step 2: 编译检查**

```powershell
cargo check -p adl-workspace
```
预期：编译通过。

- [ ] **Step 3: 运行测试**

```powershell
cargo test -p adl-workspace
```
预期：全部通过。

- [ ] **Step 4: Commit**

```bash
git add crates/workspace/src/outline/vue.rs
git commit -m "perf(workspace): eliminate dual allocation in vue outline parser via byte-offset slicing"
```

---

### Task B4：finalize_outline_items O(n²) → O(n)

**背景：** `finalize_outline_items` 中为每个 item 计算 `end_line` 使用嵌套循环，复杂度 O(n²)。可用单调栈降至 O(n)。

**文件：**
- Modify: `crates/workspace/src/outline/mod.rs:85-127`

- [ ] **Step 1: 重写为单调栈算法**

```rust
fn finalize_outline_items(
    drafts: Vec<OutlineDraft>,
    relative_path: &str,
    total_lines: usize,
) -> Vec<FileOutlineItem> {
    let mut sorted = drafts;
    sorted.sort_by(|left, right| {
        left.line
            .cmp(&right.line)
            .then(left.depth.cmp(&right.depth))
            .then(left.label.cmp(&right.label))
    });

    // 单调栈计算 end_line：对每个 item，下一个深度 ≤ 自己的 item 的 line-1 即为 end_line
    let n = sorted.len();
    let mut end_lines = vec![total_lines; n];
    let mut stack: Vec<usize> = Vec::new(); // 存储 index

    for i in 0..n {
        while let Some(&top) = stack.last() {
            if sorted[i].depth <= sorted[top].depth {
                end_lines[top] = sorted[i].line.saturating_sub(1).max(sorted[top].line);
                stack.pop();
            } else {
                break;
            }
        }
        stack.push(i);
    }
    // 栈中剩余 item 的 end_line 保持 total_lines（已在初始化时设置）

    let mut line_occurrences: BTreeMap<usize, usize> = BTreeMap::new();
    sorted
        .into_iter()
        .enumerate()
        .map(|(i, item)| {
            let occurrence = line_occurrences.entry(item.line).or_insert(0);
            *occurrence += 1;
            let id = if *occurrence == 1 {
                format!("{relative_path}:{}", item.line)
            } else {
                format!("{relative_path}:{}:{}", item.line, *occurrence)
            };
            FileOutlineItem {
                id,
                label: item.label,
                kind: item.kind,
                line: item.line,
                end_line: Some(end_lines[i]),
                depth: Some(item.depth),
            }
        })
        .collect()
}
```

- [ ] **Step 2: 编译检查 + 测试**

```powershell
cargo check -p adl-workspace
cargo test -p adl-workspace
```
预期：编译通过，测试通过。

- [ ] **Step 3: 运行全量测试**

```powershell
cargo test --workspace
```
预期：全部通过。

- [ ] **Step 4: Commit**

```bash
git add crates/workspace/src/outline/mod.rs
git commit -m "perf(workspace): O(n²)→O(n) end_line calculation via monotonic stack"
```

---

## Phase C：前端 Store 重构

### Task C1：sendMessage 拆分

**背景：** `streamActions.ts` 中 `sendMessage` 约 140 行，混合 4 种斜杠命令分发 + 流订阅管理 + 发送后状态刷新。拆分为 3 个辅助函数。

**文件：**
- Modify: `frontend/src/app/stores/actions/streamActions.ts`

- [ ] **Step 1: 提取命令分发函数**

在 `streamActions.ts` 中，在 `createStreamActions` 函数之前添加：

```typescript
async function dispatchSlashCommand(
  trimmed: string,
  set: StoreApi<StoreState>["setState"],
  get: () => StoreState
): Promise<boolean> {
  if (trimmed === "/apply") {
    const ps = get().activePatchSet;
    if (ps) {
      await get().applyPatchSet(ps.id);
    } else {
      set({ error: "当前没有可应用的补丁。" });
    }
    return true;
  }
  if (trimmed === "/rollback") {
    const ps = get().activePatchSet;
    if (ps) {
      await get().rollbackPatchSet(ps.id);
    } else {
      set({ error: "当前没有可回滚的补丁。" });
    }
    return true;
  }
  if (trimmed === "/model") {
    useUiStore.getState().setActiveTool("models");
    return true;
  }
  if (trimmed === "/clear") {
    set({
      error:
        "「/clear」尚未实现清空历史。请使用侧栏「新建会话」开始新线程，或删除当前会话。",
    });
    return true;
  }
  return false;
}
```

- [ ] **Step 2: 提取发送后刷新函数**

```typescript
async function refreshAfterSend(
  sessionId: string,
  result: { data: ConversationSendResult },
  nextAppInfo: AppInfo,
  set: StoreApi<StoreState>["setState"],
  get: () => StoreState
) {
  const conversationState = await refreshConversationSlice(sessionId);

  const nextState: Partial<StoreState> = {
    appInfo: nextAppInfo,
    sessions: conversationState.sessions,
    activeSessionId: conversationState.activeSessionId,
    activeRun: result.data.runDetail,
    activePatchSet: result.data.patchSet,
    openTabs:
      result.data.patchSet?.filePatches.map(mapPatchToEditorTab) ??
      get().openTabs,
    selectedFilePath: result.data.patchSet?.filePatches[0]?.relativePath,
    streamingAssistantText: "",
    streamingActiveRunId: undefined,
    workspaceContextMode: workspaceContextModeFromInfo(nextAppInfo),
  };

  if (result.data.patchSet?.filePatches[0]?.relativePath) {
    await get().openFile(result.data.patchSet.filePatches[0].relativePath);
  }

  set((state: StoreState) => ({
    ...nextState,
    sessionDetails: state.sessionDetails,
  }));

  if (nextAppInfo?.currentWorkspace) {
    await Promise.allSettled([
      get().refreshWorkspaceTree(),
      get().fetchIndexStatus(),
      get().fetchRepoMap(),
      get().fetchGitStatus(),
      get().fetchGitBranches(),
    ]);
  } else {
    set({
      workspaceTree: [],
      indexingStatus: undefined,
      repoMap: [],
      gitSnapshot: undefined,
      gitBranches: [],
    });
  }
}
```

- [ ] **Step 3: 更新 createStreamActions 中 sendMessage**

将 `sendMessage` 函数体替换为：

```typescript
sendMessage: async (content: string, options?: MessageSendOptions) => {
  if (!content.trim()) return;
  const trimmed = content.trim();

  const isHandled = await dispatchSlashCommand(trimmed, set, get);
  if (isHandled) return;

  const mode = options?.mode ?? useUiStore.getState().chatMode;
  const baseScenario = chatModeToScenario(mode);
  const withChips = augmentPromptWithChips(content, options?.chips);
  const { scenario, prompt } = applySlashScenarioOverride(
    withChips,
    baseScenario
  );

  set({
    streamingAssistantText: "",
    streamingActiveRunId: undefined,
    error: undefined,
  });

  let sessionId = get().activeSessionId;

  if (!sessionId) {
    const created = await window.digitalLife.conversation.createSession(
      sessionFallbackTitle(get().appInfo)
    );
    if (!created.ok) {
      set({ error: created.error.message });
      return;
    }
    sessionId = created.data.id;
  }

  const unsubscribe = window.digitalLife.subscribeModelStream(
    createModelStreamSubscriber(set)
  );
  const unsubscribeRunActivity = window.digitalLife.subscribeRunActivity(
    createRunActivitySubscriber(set)
  );

  try {
    const result = await window.digitalLife.conversation.sendMessage({
      sessionId,
      content: prompt,
      scenario,
    });
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }

    const detailResult = await window.digitalLife.conversation.getSession(
      sessionId
    );
    if (!detailResult.ok) {
      set({ error: detailResult.error.message });
      return;
    }

    const appInfoResult = await window.digitalLife.app.getInfo();
    const nextAppInfo = appInfoResult.ok ? appInfoResult.data : get().appInfo;

    await refreshAfterSend(sessionId, result, nextAppInfo, set, get);
  } finally {
    unsubscribe();
    unsubscribeRunActivity();
    if (get().streamingAssistantText) {
      set({
        streamingAssistantText: "",
        streamingActiveRunId: undefined,
      });
    }
  }
},
```

关键变化：
- 斜杠命令 → `dispatchSlashCommand`（约 30 行）
- 发送后刷新 → `refreshAfterSend`（约 40 行）
- `finally` 块添加条件检查，避免冗余 set

- [ ] **Step 4: 更新 imports**

在文件顶部添加缺失的 import（`ConversationSendResult`）：

```typescript
import type {
  ConversationMessageRecord,
  ConversationSendResult,
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  AppInfo,
} from "@ai-digital-life/kernel";
```

- [ ] **Step 5: 类型检查**

```powershell
cd e:\Programs\Obsidian\notes\ai-digital-life\frontend
npx tsc --noEmit
```
预期：类型检查通过。

- [ ] **Step 6: 运行前端测试**

```powershell
npm test
```
预期：全部通过。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/stores/actions/streamActions.ts
git commit -m "refactor(streamActions): split sendMessage into dispatchSlashCommand + refreshAfterSend sub-functions"
```

---

### Task C2：finally 块冗余 set 优化

**背景：** `streamActions.ts` `sendMessage` 的 `finally` 块无条件 set 空 streaming 状态，即使值已为空。已在 Task C1 中一并修复。

**文件：**
- Already modified: `frontend/src/app/stores/actions/streamActions.ts`（Task C1 已覆盖）

此 Task 无需额外操作——已在 C1 的 Step 3 中实现条件检查 `if (get().streamingAssistantText)`。

- [ ] **Step 1: 确认已完成**

确认 `streamActions.ts` 中 `finally` 块包含条件检查：
```typescript
finally {
  unsubscribe();
  unsubscribeRunActivity();
  if (get().streamingAssistantText) {
    set({
      streamingAssistantText: "",
      streamingActiveRunId: undefined,
    });
  }
}
```

- [ ] **Step 2: 单测验证**

如现有测试覆盖 sendMessage 流程，确认通过：
```powershell
cd e:\Programs\Obsidian\notes\ai-digital-life\frontend
npm test -- --reporter=verbose 2>&1 | Select-String "stream|sendMessage"
```
预期：相关测试通过。

---

## Phase D：文件拆分

### Task D1：rightpanel.css 按功能域拆分

**背景：** `regions/rightpanel.css` 5006 行，按功能域拆分为 6 个独立文件。

**文件：**
- Create: `frontend/src/styles/regions/rightpanel/files-panel.css`
- Create: `frontend/src/styles/regions/rightpanel/changes-panel.css`
- Create: `frontend/src/styles/regions/rightpanel/editor-surface.css`
- Create: `frontend/src/styles/regions/rightpanel/diff-viewer.css`
- Create: `frontend/src/styles/regions/rightpanel/browser-panel.css`
- Create: `frontend/src/styles/regions/rightpanel/terminal-panel.css`
- Modify: `frontend/src/styles/regions/rightpanel.css` → 改为 `@import` 聚合文件
- Modify: `frontend/src/styles/index.css`（无变化，rightpanel.css 本身已导入）

- [ ] **Step 1: 分析 rightpanel.css 内容边界**

```powershell
cd e:\Programs\Obsidian\notes\ai-digital-life\frontend\src\styles\regions
# 查找各功能域的分隔注释或区域标记
rg -n "Files|Changes|Editor|Diff|Browser|Terminal|Search" rightpanel.css --type css | head -30
```
确认 6 个功能域的 CSS 选择器边界（如 `.adl-files-panel`、`.adl-changes-panel` 等）。

- [ ] **Step 2: 按功能域拆分 CSS**

基于 rightpanel.css 中的注释分隔和选择器前缀，将内容拆分到 6 个子文件：

| 子文件 | 选择器前缀 | 预估行数 |
|--------|-----------|---------|
| `files-panel.css` | `.adl-files-panel`, `.adl-file-tree-*`, `.adl-tool-panel--files` | ~800 |
| `changes-panel.css` | `.adl-changes-panel`, `.adl-changes-*`, `.adl-tool-panel--changes` | ~900 |
| `editor-surface.css` | `.adl-editor-surface`, `.adl-editor-tab-*` | ~800 |
| `diff-viewer.css` | `.adl-diff-*`, `.adl-merge-view`, `.adl-side-by-side` | ~700 |
| `browser-panel.css` | `.adl-browser-panel`, `.adl-tool-panel--browser` | ~600 |
| `terminal-panel.css` | `.adl-terminal-*`, `.adl-tool-panel--terminal` | ~1200 |

将原 `rightpanel.css` 替换为 `@import` 聚合：

```css
/* ==========================================================================
   Right Panel — aggregated import surface
   ========================================================================== */
@import "./rightpanel/files-panel.css";
@import "./rightpanel/changes-panel.css";
@import "./rightpanel/editor-surface.css";
@import "./rightpanel/diff-viewer.css";
@import "./rightpanel/browser-panel.css";
@import "./rightpanel/terminal-panel.css";
```

- [ ] **Step 3: 验证构建**

```powershell
cd e:\Programs\Obsidian\notes\ai-digital-life\frontend
npx vite build --mode development
```
预期：构建成功，CSS 无变化。

- [ ] **Step 4: 验证开发模式 + UI 视觉回归**

```powershell
npm run dev:browser
```
预期：开发服务器启动正常，右侧面板（Files/Changes/Editor/Diff/Browser/Terminal）样式无变化。

- [ ] **Step 5: 运行测试**

```powershell
npm test
```
预期：全部通过。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/regions/rightpanel/
git add frontend/src/styles/regions/rightpanel.css
git commit -m "refactor(css): split rightpanel.css (5006→6 files) by feature domain"
```

---

### Task D2：ChangesPanel.tsx 组件拆分

**背景：** `ChangesPanel.tsx` 1343 行，拆分为容器 + 工具栏 + 空状态 3 个独立文件。

**文件：**
- Create: `frontend/src/app/regions/right-panel/panels/ChangesToolbar.tsx`
- Create: `frontend/src/app/regions/right-panel/panels/ChangesEmptyState.tsx`
- Modify: `frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx`（精简为容器编排）

- [ ] **Step 1: 提取 ChangesToolbar**

识别 `ChangesPanel.tsx` 中工具栏相关的 JSX（展开/折叠全部按钮、刷新按钮、过滤控件等），提取到 `ChangesToolbar.tsx`：

```typescript
// frontend/src/app/regions/right-panel/panels/ChangesToolbar.tsx
import { useCallback, useMemo } from "react";
import type { WorkspaceMeta } from "@ai-digital-life/kernel";
import { useAppStore } from "../../../stores";

interface ChangesToolbarProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onRefreshAll: () => void;
}

export function ChangesToolbar({
  onExpandAll,
  onCollapseAll,
  onRefreshAll,
}: ChangesToolbarProps) {
  return (
    <div className="adl-changes-toolbar">
      <button
        className="adl-icon-btn"
        onClick={onExpandAll}
        title="展开全部"
        aria-label="展开全部"
      >
        {/* Expand icon SVG */}
      </button>
      <button
        className="adl-icon-btn"
        onClick={onCollapseAll}
        title="折叠全部"
        aria-label="折叠全部"
      >
        {/* Collapse icon SVG */}
      </button>
      <button
        className="adl-icon-btn"
        onClick={onRefreshAll}
        title="刷新"
        aria-label="刷新"
      >
        {/* Refresh icon SVG */}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 提取 ChangesEmptyState**

```typescript
// frontend/src/app/regions/right-panel/panels/ChangesEmptyState.tsx
interface ChangesEmptyStateProps {
  message?: string;
}

export function ChangesEmptyState({
  message = "当前没有检测到文件变更",
}: ChangesEmptyStateProps) {
  return (
    <div className="adl-changes-empty">
      <div className="adl-empty-icon">{/* Git icon SVG */}</div>
      <p className="adl-empty-text">{message}</p>
    </div>
  );
}
```

- [ ] **Step 3: 精简 ChangesPanel 为容器**

从 `ChangesPanel.tsx` 中移除已提取的 JSX 块，改为使用 `ChangesToolbar` 和 `ChangesEmptyState`：

```typescript
import { ChangesToolbar } from "./ChangesToolbar";
import { ChangesEmptyState } from "./ChangesEmptyState";
```

精简后 `ChangesPanel.tsx` 应仅保留：
- 状态获取（useAppStore selectors）
- 操作回调（handleExpandAll, handleCollapseAll, handleRefreshAll）
- MultiWorkspaceChangesTree 渲染
- 条件渲染（工具栏 + 空状态 + 树/列表）

预估精简后 ~400 行。

- [ ] **Step 4: 类型检查**

```powershell
cd e:\Programs\Obsidian\notes\ai-digital-life\frontend
npx tsc --noEmit
```
预期：类型检查通过。

- [ ] **Step 5: 运行测试**

```powershell
npm test
```
预期：全部通过。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/regions/right-panel/panels/
git commit -m "refactor(ChangesPanel): split 1343-line component into ChangesToolbar + ChangesEmptyState + container"
```

---

## 执行顺序与门禁

```
Phase A (独立)
├── A1: 删除死 CSS ───────────── 构建验证
├── A2: StoreState 文档注释 ───── 类型检查 + 测试
└── A3: model-gateway 微优化 ──── cargo check + test

         ↓ 全部通过后

Phase B (Rust 优化，可并行)
├── B1: 8 文件 Regex → OnceLock ─ cargo check + test --workspace
├── B2: detect_outline_family ── cargo test -p adl-workspace
├── B3: vue.rs 内存优化 ───────── cargo test -p adl-workspace
└── B4: finalize_outline_items ─ cargo test -p adl-workspace

         ↓ 全部通过后

Phase C (前端 Store)
├── C1: sendMessage 拆分 ──────── typecheck + npm test
└── C2: finally 块优化 ───────── 已在 C1 中覆盖

         ↓ 全部通过后

Phase D (文件拆分)
├── D1: rightpanel.css 拆分 ──── vite build + npm test
└── D2: ChangesPanel 拆分 ────── typecheck + npm test

         ↓

最终验证: cargo test --workspace + npm test + npm run typecheck
```

## 最终验证

全部任务完成后执行：

```powershell
# Rust
cd e:\Programs\Obsidian\notes\ai-digital-life
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings

# 前端
cd frontend
npm run typecheck
npm test
```

预期：全部通过，零警告。