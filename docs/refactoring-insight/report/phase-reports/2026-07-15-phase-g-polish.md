# Phase G: Low-Priority Polish 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 refactoring-insight 报告中 9 项 Low 级别的代码打磨项，覆盖前端 TODO 清理、Rust 常量提取、默认值常量化、以及分配优化。

**Architecture:** 本计划为纯重构性打磨，不改变任何功能行为或 UI/UX。所有变更均为内部代码质量改进：提取常量消除重复、收紧类型减少 `any`、使用 `&'static str` 消除堆分配、按值迭代减少冗余 `clone`。分为 5 个独立 Task，可按序或并行执行（Task 1-3 互不依赖；Task 4-5 互不依赖）。

**Tech Stack:** Rust (crates: model-gateway, agent-runtime, kernel, outline, workspace, types)、React 19 + TypeScript (frontend)

## Global Constraints

- 工作目录：`e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life`
- Rust PATH 前置：`$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`
- Node.js PATH 前置：`$env:Path = "D:\Program Files\nodejs;$env:Path"`
- 所有变更不得破坏现有功能以及 UI/UX
- 禁止 `unwrap()`，使用 `?` 或模式匹配
- 禁止 `any`（除非有 biome-ignore 且类型来自第三方库）
- Commit 信息格式：`type(scope): summary`，scope 选项：`core` / `frontend` / `rust` / `stores` / `browser` / `terminal` / `ipc` / `docs` / `deps`
- L1（route.rs Phase 3+ TODO）按 phase-boundary.md 保留标记，**不修改**

---

## Task 依赖关系

```
Task 1 (L1+L2+L3) ──┐
Task 2 (L4+L5)    ──┼── 互不依赖，可并行
Task 3 (L6)       ──┤
Task 4 (L7)       ──┤
Task 5 (L8+L9)    ──┘
```

---

## Task 1: L1 + L2 + L3 — TODO 清理与可选类型收紧

**Files:**
- Inspect: `crates/model-gateway/src/route.rs:1`（L1，仅记录，不修改）
- Modify: `frontend/src/app/components/MessageBubble.tsx:28`（L2）
- Modify: `frontend/src/components/charts/sankey/sankey-chart.tsx:159-160`（L3，可选）

**Interfaces:**
- Consumes: 无（独立打磨任务）
- Produces: 无（不改变任何公开接口）

### L1: route.rs Phase 3+ TODO（保留，不修改）

`crates/model-gateway/src/route.rs:1` 的 `// TODO: dual-path routing` 是 Phase 3+ 延迟功能标记，按 `phase-boundary.md` 规则保留。**此步骤不执行任何代码变更。**

### L2: 移除 MessageBubble.tsx 中的 stale TODO

- [ ] **Step 1: 移除 `// TODO: implement edit logic` 注释**

文件 `frontend/src/app/components/MessageBubble.tsx` 第 20-29 行，`handleEdit` 函数已有完整的时间窗口守卫逻辑，TODO 注释为 stale 标记。移除注释，保留函数结构（edit handler 为未来功能预留的占位接线）。

修改前（第 20-29 行）：
```tsx
  const handleEdit = useCallback(() => {
    if (!timestamp) {
      return;
    }
    const now = Date.now();
    if (now - new Date(timestamp).getTime() >= EDIT_WINDOW_MS) {
      return;
    }
    // TODO: implement edit logic
  }, [timestamp]);
```

修改后：
```tsx
  const handleEdit = useCallback(() => {
    if (!timestamp) {
      return;
    }
    const now = Date.now();
    if (now - new Date(timestamp).getTime() >= EDIT_WINDOW_MS) {
      return;
    }
  }, [timestamp]);
```

- [ ] **Step 2: 验证前端 Lint + 类型检查**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint:fix
pnpm --dir frontend run typecheck
```
Expected: 两者均 PASS，无新增错误

### L3: 可选 — 收紧 sankey-chart.tsx 的 `any` 类型

此步骤为可选项。`sankey-chart.tsx:160` 的 `(link: any)` 已有 biome-ignore 注释，收紧为具体类型可移除 ignore。

- [ ] **Step 3: 导入 `SankeyLink` 类型并收紧参数类型**

文件 `frontend/src/components/charts/sankey/sankey-chart.tsx`，在现有 import 块中添加 `SankeyLink` 类型导入，并修改 `createPath` 的参数类型。

在文件顶部 import 区域（第 17-23 行之后）添加：
```tsx
import type { SankeyLink } from "d3-sankey";
```

修改前（第 158-166 行）：
```tsx
  const createPath = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: d3-sankey types are complex
    (link: any) => {
      try {
        const pathGenerator = sankeyLinkHorizontal();
        return pathGenerator(link) || "";
      } catch {
        return "";
      }
    },
    [],
  );
```

修改后：
```tsx
  const createPath = useCallback(
    (link: SankeyLink<SankeyNodeDatum, SankeyLinkDatum>) => {
      try {
        const pathGenerator = sankeyLinkHorizontal();
        return pathGenerator(link) || "";
      } catch {
        return "";
      }
    },
    [],
  );
```

> **注意**：`SankeyNodeDatum` 和 `SankeyLinkDatum` 已从 `./sankey-context` 导入（第 19-21 行）。如果 `@visx/sankey` 的 `sankeyLinkHorizontal` 类型签名与 `d3-sankey` 的 `SankeyLink` 不完全匹配，可能需要回退此步骤并保留 biome-ignore。

- [ ] **Step 4: 验证前端 Lint + 类型检查**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint:fix
pnpm --dir frontend run typecheck
```
Expected: 两者均 PASS。如果 typecheck 报 `sankeyLinkHorizontal` 类型不匹配错误，回退 Step 3 的变更（恢复 `link: any` 和 biome-ignore 注释）。

- [ ] **Step 5: 运行前端测试**

Run:
```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run test
```
Expected: 全部测试 PASS

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/components/MessageBubble.tsx frontend/src/components/charts/sankey/sankey-chart.tsx
git commit -m "refactor(frontend): remove stale TODO and tighten sankey link type"
```

> 如果 L3 回退，则只 `git add frontend/src/app/components/MessageBubble.tsx`，commit message 改为 `refactor(frontend): remove stale edit-logic TODO from MessageBubble`

---

## Task 2: L4 + L5 — Provider/API URL 常量提取

**Files:**
- Modify: `crates/model-gateway/src/providers/anthropic.rs:16-22`
- Modify: `crates/model-gateway/src/providers/openai.rs:27-33`
- Modify: `crates/model-gateway/src/providers/google.rs:16-25`
- Modify: `crates/model-gateway/src/providers/openrouter.rs:16-22`
- Modify: `crates/model-gateway/src/providers/ollama.rs:16-22`
- Modify: `crates/agent-runtime/src/tools/websearch.rs:5-6,57`

**Interfaces:**
- Consumes: 无
- Produces: 无（`base_url` 字段类型保持 `String`，仅消除构造函数中的重复字面量）

### L4: 提取 5 个 Provider 的 DEFAULT_BASE_URL 常量

每个 provider 文件的 `new()` 和 `with_client()` 中重复硬编码 base URL 字符串。提取为模块级 `const DEFAULT_BASE_URL: &str`，在构造函数中使用 `.to_string()` 或 `.into()`。

- [ ] **Step 1: 修改 anthropic.rs — 提取 DEFAULT_BASE_URL**

文件 `crates/model-gateway/src/providers/anthropic.rs`，在第 9 行（`use reqwest::Client;` 之后）添加常量，并修改构造函数。

在第 9 行后添加：
```rust
const DEFAULT_BASE_URL: &str = "https://api.anthropic.com/v1";
```

修改 `impl AnthropicProvider` 块（第 15-31 行）：
```rust
impl AnthropicProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: DEFAULT_BASE_URL.to_string() }
    }

    pub fn with_client(client: Client) -> Self {
        Self { client, base_url: DEFAULT_BASE_URL.to_string() }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }

    pub fn with_client_and_base_url(client: Client, base_url: String) -> Self {
        Self { client, base_url }
    }
}
```

- [ ] **Step 2: 修改 openai.rs — 提取 DEFAULT_BASE_URL**

文件 `crates/model-gateway/src/providers/openai.rs`，在第 9 行（`use serde::Deserialize;` 之后）添加常量。

在第 9 行后添加：
```rust
const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";
```

修改 `impl OpenAIProvider` 块（第 26-42 行）：
```rust
impl OpenAIProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: DEFAULT_BASE_URL.to_string() }
    }

    pub fn with_client(client: Client) -> Self {
        Self { client, base_url: DEFAULT_BASE_URL.to_string() }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }

    pub fn with_client_and_base_url(client: Client, base_url: String) -> Self {
        Self { client, base_url }
    }
}
```

- [ ] **Step 3: 修改 google.rs — 提取 DEFAULT_BASE_URL**

文件 `crates/model-gateway/src/providers/google.rs`，在第 8 行（`use reqwest::Client;` 之后）添加常量。

在第 8 行后添加：
```rust
const DEFAULT_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta";
```

修改 `impl GoogleProvider` 块（第 15-34 行）：
```rust
impl GoogleProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            base_url: DEFAULT_BASE_URL.to_string(),
        }
    }

    pub fn with_client(client: Client) -> Self {
        Self { client, base_url: DEFAULT_BASE_URL.to_string() }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }

    pub fn with_client_and_base_url(client: Client, base_url: String) -> Self {
        Self { client, base_url }
    }
}
```

- [ ] **Step 4: 修改 openrouter.rs — 提取 DEFAULT_BASE_URL**

文件 `crates/model-gateway/src/providers/openrouter.rs`，在第 8 行（`use reqwest::Client;` 之后）添加常量。

在第 8 行后添加：
```rust
const DEFAULT_BASE_URL: &str = "https://openrouter.ai/api/v1";
```

修改 `impl OpenRouterProvider` 块（第 15-31 行）：
```rust
impl OpenRouterProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: DEFAULT_BASE_URL.to_string() }
    }

    pub fn with_client(client: Client) -> Self {
        Self { client, base_url: DEFAULT_BASE_URL.to_string() }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }

    pub fn with_client_and_base_url(client: Client, base_url: String) -> Self {
        Self { client, base_url }
    }
}
```

- [ ] **Step 5: 修改 ollama.rs — 提取 DEFAULT_BASE_URL**

文件 `crates/model-gateway/src/providers/ollama.rs`，在第 8 行（`use reqwest::Client;` 之后）添加常量。

在第 8 行后添加：
```rust
const DEFAULT_BASE_URL: &str = "http://localhost:11434";
```

修改 `impl OllamaProvider` 块（第 15-31 行）：
```rust
impl OllamaProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: DEFAULT_BASE_URL.to_string() }
    }

    pub fn with_client(client: Client) -> Self {
        Self { client, base_url: DEFAULT_BASE_URL.to_string() }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }

    pub fn with_client_and_base_url(client: Client, base_url: String) -> Self {
        Self { client, base_url }
    }
}
```

### L5: 提取 Tavily search API URL 常量

- [ ] **Step 6: 修改 websearch.rs — 提取 TAVILY_API_URL**

文件 `crates/agent-runtime/src/tools/websearch.rs`，在第 5-6 行（现有 `TIMEOUT_SECS` 和 `MAX_RESULTS` 常量之后）添加常量。

修改前（第 5-6 行）：
```rust
const TIMEOUT_SECS: u64 = 15;
const MAX_RESULTS: usize = 10;
```

修改后：
```rust
const TIMEOUT_SECS: u64 = 15;
const MAX_RESULTS: usize = 10;
const TAVILY_API_URL: &str = "https://api.tavily.com/search";
```

修改第 57 行（`websearch` 函数内）：

修改前：
```rust
    match client.post("https://api.tavily.com/search").json(&body).send().await {
```

修改后：
```rust
    match client.post(TAVILY_API_URL).json(&body).send().await {
```

- [ ] **Step 7: 运行 Rust 格式化 + Lint + 编译检查**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
```
Expected: 全部成功，无新增警告

- [ ] **Step 8: 运行 Rust 测试**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test -p adl-model-gateway
cargo test -p adl-agent-runtime
```
Expected: 全部测试 PASS（包括 `default_uses_official_endpoint` 等现有测试）

- [ ] **Step 9: Commit**

```powershell
git add crates/model-gateway/src/providers/anthropic.rs crates/model-gateway/src/providers/openai.rs crates/model-gateway/src/providers/google.rs crates/model-gateway/src/providers/openrouter.rs crates/model-gateway/src/providers/ollama.rs crates/agent-runtime/src/tools/websearch.rs
git commit -m "refactor(rust): extract provider base URLs and Tavily API URL as constants"
```

---

## Task 3: L6 — AppConfig 默认值常量化

**Files:**
- Modify: `crates/kernel/src/config.rs:47-65`

**Interfaces:**
- Consumes: 无
- Produces: 无（`AppConfig` 结构体和 `Default` trait 实现的公开行为不变）

### L6: 提取 AppConfig::default() 内联默认值为模块级常量

`AppConfig::default()` 中 `language: "zh-CN".into()` 和 `max_recent_workspaces: 10` 等值为内联字面量。提取为模块级 `const`，使默认值集中可见、可维护。

- [ ] **Step 1: 在 config.rs 中添加模块级常量**

文件 `crates/kernel/src/config.rs`，在第 10 行（`use ts_rs::TS;` 之后）添加常量块：

```rust
const DEFAULT_LANGUAGE: &str = "zh-CN";
const DEFAULT_LOG_LEVEL: &str = "info";
const DEFAULT_MAX_RECENT_WORKSPACES: usize = 10;
```

- [ ] **Step 2: 修改 AppConfig::default() 使用常量**

修改 `impl Default for AppConfig` 块（第 47-65 行）：

修改前：
```rust
impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: "zh-CN".into(),
            theme_mode: ThemeMode::System,
            log_level: "info".into(),
            terminal_log_mode: LogMode::default(),
            debug_log_mode: LogMode::default(),
            max_recent_workspaces: 10,
            model_preferences: ModelPreferences::default(),
            commands: Vec::new(),
            permissions: PermissionRulesetConfig::default(),
            references: Vec::new(),
            custom_agents: Vec::new(),
            keybinds: std::collections::BTreeMap::new(),
            fonts: adl_types::types::config::FontPreferences::default(),
        }
    }
}
```

修改后：
```rust
impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: DEFAULT_LANGUAGE.into(),
            theme_mode: ThemeMode::System,
            log_level: DEFAULT_LOG_LEVEL.into(),
            terminal_log_mode: LogMode::default(),
            debug_log_mode: LogMode::default(),
            max_recent_workspaces: DEFAULT_MAX_RECENT_WORKSPACES,
            model_preferences: ModelPreferences::default(),
            commands: Vec::new(),
            permissions: PermissionRulesetConfig::default(),
            references: Vec::new(),
            custom_agents: Vec::new(),
            keybinds: std::collections::BTreeMap::new(),
            fonts: adl_types::types::config::FontPreferences::default(),
        }
    }
}
```

- [ ] **Step 3: 运行 Rust 格式化 + Lint + 编译检查**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
```
Expected: 全部成功，无新增警告

- [ ] **Step 4: 运行 kernel crate 测试**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test -p adl-kernel
```
Expected: 全部测试 PASS（包括 `default_config_round_trips` 测试，验证 `language == "zh-CN"`）

- [ ] **Step 5: Commit**

```powershell
git add crates/kernel/src/config.rs
git commit -m "refactor(core): extract AppConfig default values as module constants"
```

---

## Task 4: L7 — Outline 解析器分配优化

**Files:**
- Modify: `crates/outline/src/lib.rs:17-23`（OutlineDraft 类型定义）、`lib.rs:148-156`（finalize_outline_items）、`lib.rs:170-202`（parse_config_outline）
- Modify: `crates/outline/src/brace.rs:88`
- Modify: `crates/outline/src/css.rs:16`
- Modify: `crates/outline/src/html.rs:133`
- Modify: `crates/outline/src/json.rs:26`
- Modify: `crates/outline/src/markdown.rs:30`
- Modify: `crates/outline/src/python.rs:31,41`
- Modify: `crates/outline/src/shell.rs:52,63`
- Modify: `crates/outline/src/sql.rs:39,64,79`
- Modify: `crates/outline/src/vue.rs:43`
- Modify: `crates/outline/src/yaml.rs:36,55,65`

**Interfaces:**
- Consumes: `FileOutlineItem`（来自 `adl_types`，`kind: String` 字段不变）
- Produces: `OutlineDraft.kind` 类型从 `String` 改为 `&'static str`（`pub(crate)` 可见性，不影响外部 crate）

### 背景

`OutlineDraft` 是 outline crate 的内部结构体（`pub(crate)`），其 `kind` 字段当前为 `String`。所有 18 处赋值均使用静态字符串字面量（`"heading"`、`"class"`、`"function"`、`"type"`、`"property"`、`"interface"`、`"enum"`、`"const"`、`"variable"`、`"method"`）。改为 `&'static str` 可消除所有解析阶段的堆分配。

> **类型选择说明**：任务描述建议 `Cow<'static, str>`，但由于所有 `kind` 值均为静态字符串字面量（无动态拼接场景），`&'static str` 是更精确的类型选择，且 `Copy` 语义更简单。`FileOutlineItem.kind` 保持 `String`（因需 `Deserialize`），在 `finalize_outline_items` 中统一 `.to_string()` 转换。

- [ ] **Step 1: 修改 lib.rs — OutlineDraft 类型定义**

文件 `crates/outline/src/lib.rs`，第 17-23 行。

修改前：
```rust
#[derive(Clone)]
pub(crate) struct OutlineDraft {
    pub(crate) label: String,
    pub(crate) kind: String,
    pub(crate) line: usize,
    pub(crate) depth: usize,
}
```

修改后：
```rust
#[derive(Clone, Copy)]
pub(crate) struct OutlineDraft {
    pub(crate) label: String,
    pub(crate) kind: &'static str,
    pub(crate) line: usize,
    pub(crate) depth: usize,
}
```

> 注意：`OutlineDraft` 现在包含 `String`（`label`），所以不能 `derive(Copy)`。修正如下：

修改后（最终版）：
```rust
#[derive(Clone)]
pub(crate) struct OutlineDraft {
    pub(crate) label: String,
    pub(crate) kind: &'static str,
    pub(crate) line: usize,
    pub(crate) depth: usize,
}
```

- [ ] **Step 2: 修改 lib.rs — finalize_outline_items 中的类型转换**

文件 `crates/outline/src/lib.rs`，第 148-156 行。`FileOutlineItem.kind` 仍为 `String`，需要将 `&'static str` 转换。

修改前（第 148-156 行）：
```rust
            FileOutlineItem {
                id,
                label: item.label,
                kind: item.kind,
                line: item.line,
                end_line: Some(end_lines[i]),
                depth: Some(item.depth),
            }
```

修改后：
```rust
            FileOutlineItem {
                id,
                label: item.label,
                kind: item.kind.to_string(),
                line: item.line,
                end_line: Some(end_lines[i]),
                depth: Some(item.depth),
            }
```

- [ ] **Step 3: 修改 lib.rs — parse_config_outline 中的两处 kind 赋值**

文件 `crates/outline/src/lib.rs`，第 183 行和第 194 行。

第 181-187 行修改前：
```rust
            drafts.push(OutlineDraft {
                label,
                kind: "heading".to_string(),
                line: index + 1,
                depth: current_section_depth,
            });
```

修改后：
```rust
            drafts.push(OutlineDraft {
                label,
                kind: "heading",
                line: index + 1,
                depth: current_section_depth,
            });
```

第 192-198 行修改前：
```rust
                drafts.push(OutlineDraft {
                    label: captures[1].to_string(),
                    kind: "heading".to_string(),
                    line: index + 1,
                    depth: current_section_depth + 1,
                });
```

修改后：
```rust
                drafts.push(OutlineDraft {
                    label: captures[1].to_string(),
                    kind: "heading",
                    line: index + 1,
                    depth: current_section_depth + 1,
                });
```

- [ ] **Step 4: 修改 markdown.rs — 移除 .to_string()**

文件 `crates/outline/src/markdown.rs`，第 28-33 行。

修改前：
```rust
        drafts.push(OutlineDraft {
            label: label.to_string(),
            kind: "heading".to_string(),
            line: index + 1,
            depth,
        });
```

修改后：
```rust
        drafts.push(OutlineDraft {
            label: label.to_string(),
            kind: "heading",
            line: index + 1,
            depth,
        });
```

- [ ] **Step 5: 修改 brace.rs — 移除 .to_string()**

文件 `crates/outline/src/brace.rs`，第 86-91 行。`kind` 来自 `brace_matchers()` 的 `&'static str` 元组元素，迭代时为 `&&'static str`，解引用一次得到 `&'static str`。

修改前：
```rust
                drafts.push(OutlineDraft {
                    label: label.to_string(),
                    kind: (*kind).to_string(),
                    line: index + 1,
                    depth: effective_depth + 1,
                });
```

修改后：
```rust
                drafts.push(OutlineDraft {
                    label: label.to_string(),
                    kind: *kind,
                    line: index + 1,
                    depth: effective_depth + 1,
                });
```

- [ ] **Step 6: 修改 python.rs — 两处 .to_string()**

文件 `crates/outline/src/python.rs`，第 31 行和第 41 行。

第 31 行修改前：`kind: "class".to_string(),`
修改后：`kind: "class",`

第 41 行修改前：`kind: "function".to_string(),`
修改后：`kind: "function",`

- [ ] **Step 7: 修改 shell.rs — 两处 .to_string()**

文件 `crates/outline/src/shell.rs`，第 52 行和第 63 行。

第 52 行修改前：`kind: "function".to_string(),`
修改后：`kind: "function",`

第 63 行修改前：`kind: "heading".to_string(),`
修改后：`kind: "heading",`

- [ ] **Step 8: 修改 sql.rs — 三处 .to_string()**

文件 `crates/outline/src/sql.rs`，第 39 行、第 64 行、第 79 行。

第 39 行修改前：`kind: "type".to_string(),`
修改后：`kind: "type",`

第 64 行修改前：`kind: "heading".to_string(),`
修改后：`kind: "heading",`

第 79 行修改前：`kind: "property".to_string(),`
修改后：`kind: "property",`

- [ ] **Step 9: 修改 css.rs — 一处 .to_string()**

文件 `crates/outline/src/css.rs`，第 16 行。

修改前：`kind: "heading".to_string(),`
修改后：`kind: "heading",`

- [ ] **Step 10: 修改 html.rs — 一处 .to_string()**

文件 `crates/outline/src/html.rs`，第 133 行。

修改前：`kind: "heading".to_string(),`
修改后：`kind: "heading",`

- [ ] **Step 11: 修改 json.rs — 一处 .to_string()**

文件 `crates/outline/src/json.rs`，第 26 行。

修改前：`kind: "heading".to_string(),`
修改后：`kind: "heading",`

- [ ] **Step 12: 修改 vue.rs — 一处 .to_string()**

文件 `crates/outline/src/vue.rs`，第 43 行。

修改前：`kind: "heading".to_string(),`
修改后：`kind: "heading",`

- [ ] **Step 13: 修改 yaml.rs — 三处 .to_string()**

文件 `crates/outline/src/yaml.rs`，第 36 行、第 55 行、第 65 行。

第 36 行修改前：`kind: "heading".to_string(),`
修改后：`kind: "heading",`

第 55 行修改前：`kind: "heading".to_string(),`
修改后：`kind: "heading",`

第 65 行修改前：`kind: "heading".to_string(),`
修改后：`kind: "heading",`

- [ ] **Step 14: 运行 Rust 格式化 + Lint + 编译检查**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
```
Expected: 全部成功，无新增警告。如果有 clippy 警告关于 `kind: "heading"` 可忽略（`&'static str` 赋值是惯用写法）。

- [ ] **Step 15: 运行 outline crate 测试**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test -p adl-outline
```
Expected: 全部测试 PASS

- [ ] **Step 16: 运行全 workspace 测试（确保 outline 变更不破坏下游）**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test --workspace
```
Expected: 全部测试 PASS

- [ ] **Step 17: Commit**

```powershell
git add crates/outline/src/lib.rs crates/outline/src/brace.rs crates/outline/src/css.rs crates/outline/src/html.rs crates/outline/src/json.rs crates/outline/src/markdown.rs crates/outline/src/python.rs crates/outline/src/shell.rs crates/outline/src/sql.rs crates/outline/src/vue.rs crates/outline/src/yaml.rs
git commit -m "refactor(rust): change OutlineDraft.kind to &'static str to reduce allocations"
```

---

## Task 5: L8 + L9 — Workspace 分配优化

**Files:**
- Modify: `crates/workspace/src/tree.rs:240-256`（L8）
- Modify: `crates/workspace/src/git.rs:124-145`（L9）

**Interfaces:**
- Consumes: `RepoMapEntry`（来自 `adl_types`，`r#type: String` 字段不变）、`GitBranchSummary`（来自 `adl_types`）
- Produces: 无（公开接口不变）

### L8: tree.rs — 移除 repo_map 中的冗余 clone

`collect_retrieval_inner` 函数中，文件分支先 `relative.clone()` 推入 `RepoMapEntry`，再用 `relative` 做文件读取检查。通过重排顺序（先检查后移动），消除一次 `String` clone。

- [ ] **Step 1: 修改 tree.rs — 重排 file 分支，移动 relative 进 RepoMapEntry**

文件 `crates/workspace/src/tree.rs`，第 240-256 行。

修改前（第 240-256 行）：
```rust
        if path.is_dir() {
            repo_map.push(RepoMapEntry { path: relative, r#type: "directory".to_string() });
            collect_retrieval_inner(root, &path, max_file_bytes, files, extensions, repo_map)?;
        } else if path.is_file() {
            repo_map.push(RepoMapEntry { path: relative.clone(), r#type: "file".to_string() });
            if files.len() < MAX_COLLECTED_FILES
                && adl_fs_ops::read_text_file(root, &relative, max_file_bytes).is_ok()
            {
                let ext = path
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("[none]")
                    .to_string();
                *extensions.entry(ext).or_insert(0) += 1;
                files.push(path);
            }
        }
```

修改后：
```rust
        if path.is_dir() {
            repo_map.push(RepoMapEntry { path: relative, r#type: "directory".to_string() });
            collect_retrieval_inner(root, &path, max_file_bytes, files, extensions, repo_map)?;
        } else if path.is_file() {
            if files.len() < MAX_COLLECTED_FILES
                && adl_fs_ops::read_text_file(root, &relative, max_file_bytes).is_ok()
            {
                let ext = path
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("[none]")
                    .to_string();
                *extensions.entry(ext).or_insert(0) += 1;
                files.push(path);
            }
            repo_map.push(RepoMapEntry { path: relative, r#type: "file".to_string() });
        }
```

> **变更说明**：
> 1. 将 `repo_map.push(...)` 移到 `if` 块之后，使 `relative` 可以被移动（而非 clone）。
> 2. `relative` 在 `if` 条件中通过 `&relative` 借用给 `read_text_file`，借用结束后在 `push` 中移动，符合 Rust 借用规则。
> 3. `"file".to_string()` 保持不变（`RepoMapEntry.r#type` 为 `String`，无法用 `&'static str` 因需 `Deserialize`）。
> 4. `"directory".to_string()` 同理保持不变。

### L9: git.rs — 按值迭代减少分支列表 clone

`list_git_branches` 函数中，`local_branches` 和 `remote_branches` 的迭代使用引用（`&local_branches`、`&remote_branches`），每个分支需要 2 次 clone（一次进 `seen`，一次进 `GitBranchSummary`）。改为按值迭代（`for name in local_branches`），将 `name` 移入结构体，仅保留 1 次 clone（进 `seen`）。

- [ ] **Step 2: 修改 git.rs — local_branches 循环按值迭代**

文件 `crates/workspace/src/git.rs`，第 124-133 行。

修改前（第 124-133 行）：
```rust
    for name in &local_branches {
        seen.insert(name.clone());
        branches.push(GitBranchSummary {
            name: name.clone(),
            is_current: name == &current_branch,
            local: true,
            remote: remote_branches.contains(name),
            has_stash: stashed_branches.contains(name.as_str()),
        });
    }
```

修改后：
```rust
    for name in local_branches {
        let is_current = name == current_branch;
        let remote = remote_branches.contains(&name);
        let has_stash = stashed_branches.contains(name.as_str());
        seen.insert(name.clone());
        branches.push(GitBranchSummary {
            name,
            is_current,
            local: true,
            remote,
            has_stash,
        });
    }
```

> **变更说明**：
> - `for name in local_branches` 按值消费 `Vec<String>`，`name: String`。
> - 先提取所有需要借用 `name` 的布尔值（`is_current`、`remote`、`has_stash`），然后 `seen.insert(name.clone())` 克隆一份，最后 `name` 移入结构体。
> - 从 2 次 clone 减少到 1 次 clone（仅 `seen.insert` 仍需 clone）。
> - `name == current_branch` 比较 `String` 与 `String`（`PartialEq<String>` 使用 `&self`/`&Rhs`，不会 move）。
> - `remote_branches.contains(&name)` 传入 `&String`，`HashSet<String>::contains` 通过 `Borrow` trait 接受 `&String`。

- [ ] **Step 3: 修改 git.rs — remote_branches 循环按值迭代**

文件 `crates/workspace/src/git.rs`，第 135-145 行。

修改前（第 135-145 行）：
```rust
    for name in &remote_branches {
        if !seen.contains(name) {
            branches.push(GitBranchSummary {
                name: name.clone(),
                is_current: false,
                local: false,
                remote: true,
                has_stash: stashed_branches.contains(name.as_str()),
            });
        }
    }
```

修改后：
```rust
    for name in remote_branches {
        if !seen.contains(&name) {
            let has_stash = stashed_branches.contains(name.as_str());
            branches.push(GitBranchSummary {
                name,
                is_current: false,
                local: false,
                remote: true,
                has_stash,
            });
        }
    }
```

> **变更说明**：
> - `for name in remote_branches` 按值消费 `HashSet<String>`，`name: String`。
> - `seen.contains(&name)` 传入 `&String`。
> - 先提取 `has_stash`（借用 `name`），然后 `name` 移入结构体。
> - 从 1 次 clone 减少到 0 次 clone。
> - `remote_branches` 在 local 循环中通过 `contains(&name)` 借用，local 循环结束后借用释放，remote 循环按值消费，无冲突。

- [ ] **Step 4: 运行 Rust 格式化 + Lint + 编译检查**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
```
Expected: 全部成功，无新增警告

- [ ] **Step 5: 运行 workspace crate 测试**

Run:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test -p adl-workspace
```
Expected: 全部测试 PASS（git 测试标记为 `#[ignore = "requires git in PATH"]`，如无 git 环境则跳过）

- [ ] **Step 6: Commit**

```powershell
git add crates/workspace/src/tree.rs crates/workspace/src/git.rs
git commit -m "refactor(rust): reduce redundant clones in workspace tree and git branches"
```

---

## Self-Review

### 1. Spec 覆盖检查

| 发现 | 优先级 | 对应 Task | 状态 |
|------|--------|----------|------|
| L1: route.rs Phase 3+ TODO | Low | Task 1 (Step 0) | ✅ 保留标记，不修改 |
| L2: MessageBubble.tsx edit-logic TODO | Low | Task 1 (Step 1-2) | ✅ 移除 TODO 注释 |
| L3: sankey-chart.tsx `any` 类型 | Low | Task 1 (Step 3-6) | ✅ 可选收紧为 `SankeyLink<...>` |
| L4: 硬编码 provider base URLs | Low | Task 2 (Step 1-5) | ✅ 提取 `DEFAULT_BASE_URL` 常量 |
| L5: Tavily search API URL 硬编码 | Low | Task 2 (Step 6) | ✅ 提取 `TAVILY_API_URL` 常量 |
| L6: AppConfig::default() 内联默认值 | Low | Task 3 (Step 1-5) | ✅ 提取模块级 `const` |
| L7: Outline 解析器 `kind: String` 分配 | Low | Task 4 (Step 1-17) | ✅ 改为 `&'static str` |
| L8: tree.rs repo_map 冗余 clone | Low | Task 5 (Step 1) | ✅ 重排顺序，移动 `relative` |
| L9: git.rs 分支列表冗余 clone | Low | Task 5 (Step 2-3) | ✅ 按值迭代，减少 clone |

所有 9 项发现均有对应 Task。

### 2. Placeholder 扫描

- ✅ 无 "TBD"、"TODO"、"implement later" 等占位符
- ✅ 所有代码步骤均包含完整代码（修改前/修改后）
- ✅ 所有验证命令均包含具体命令和预期输出
- ✅ L1 的"不修改"是明确的规格要求（phase-boundary.md），非占位符

### 3. 类型一致性检查

- `OutlineDraft.kind`：Task 4 中定义为 `&'static str`，所有 11 个 parser 文件中的赋值均改为直接使用字符串字面量（`"heading"`、`"class"` 等），`finalize_outline_items` 中使用 `.to_string()` 转换为 `FileOutlineItem.kind: String`。✅ 一致
- `DEFAULT_BASE_URL`：Task 2 中每个 provider 文件独立定义自己的 `DEFAULT_BASE_URL`（模块级私有常量），不跨文件引用。✅ 一致
- `TAVILY_API_URL`：Task 2 Step 6 中定义并使用于同一文件。✅ 一致
- `DEFAULT_LANGUAGE` / `DEFAULT_LOG_LEVEL` / `DEFAULT_MAX_RECENT_WORKSPACES`：Task 3 中定义并使用于同一文件。✅ 一致
- `RepoMapEntry.r#type`：Task 5 中保持 `String` 类型，仅优化构造方式。✅ 一致
- `GitBranchSummary.name`：Task 5 中保持 `String` 类型，仅优化迭代方式。✅ 一致

### 4. 风险评估

| 风险 | 评估 | 缓解 |
|------|------|------|
| L3 `SankeyLink` 类型与 `@visx/sankey` 不匹配 | 中 | Step 4 中明确：typecheck 失败则回退 L3，保留 biome-ignore |
| L7 `OutlineDraft` 变更影响下游 crate | 低 | `OutlineDraft` 为 `pub(crate)`，不影响外部 crate；`FileOutlineItem` 类型不变 |
| L8 重排顺序改变 `repo_map` 中条目顺序 | 低 | `repo_map` 最终被 `truncate(200)` 截断，顺序不影响功能（检索快照不依赖顺序） |
| L9 按值消费 `local_branches` / `remote_branches` | 低 | 两个集合在循环后不再使用，消费不影响后续逻辑 |

### 5. 验收流程提醒

每个 Task 完成后，执行对应的验收步骤（已在各 Task 内嵌）：
- Rust 变更：`cargo fmt` → `cargo clippy --fix` → `cargo check` → `cargo test`
- 前端变更：`pnpm lint:fix` → `pnpm format` → `pnpm typecheck` → `pnpm test`

全部 Task 完成后，执行一次全量验收：
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
cargo test --workspace
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```
