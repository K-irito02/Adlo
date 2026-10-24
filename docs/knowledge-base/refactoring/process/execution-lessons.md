# 第十轮重构执行报告 — 重构洞察修复

**日期**：2026-05-24
**关联报告**：`重构进度报告`（原文已归档）
**状态**：✅ 全部完成

---

## 执行概览

基于 2026-05-24 重构洞察报告中的 11 项发现，按 4 个 Phase 分步执行修复。全部任务完成后通过 `cargo test --workspace`（105 Rust 测试）、`npm test`（31 文件 / 183 前端测试）、`npx tsc --noEmit`（零类型错误）三重门禁。

| Phase | 任务数 | 核心内容 | 行数变化 |
|-------|--------|----------|---------|
| A：低风险清理 | 3 | 死 CSS 删除、文档注释、微优化 | -9,714 |
| B：Rust 性能优化 | 4 | Regex 缓存、HashMap 查表、字节切片、单调栈 | ~0（逻辑等效） |
| C：Store 重构 | 2 | sendMessage 拆分 + finally 条件 set | ~0（逻辑等效） |
| D：文件拆分 | 2 | rightpanel.css 5006→6 文件、ChangesPanel 1343→1101 行 | +6 新文件 |
| **总计** | **11** | **22 处 Regex 缓存 + 9,714 行死代码删除 + 8 个文件拆分** | **-9,714 + 8 新文件** |

---

## 详细执行记录

### Phase A：低风险清理

| 任务 | 文件变更 | 说明 |
|------|---------|------|
| A1 死 CSS 删除 | `regions.css`(-8144)、`sidebar.css`(-506)、`main-content.css`(-1064) | 3 文件共 9,714 行未被 `index.css` 导入链引用，属于重构拆分残留 |
| A2 文档注释 | `StoreState.ts` + `slicedStore.ts` | 头部领域分组总览表格 + create 调用处边界注释 |
| A3 微优化 | `model-gateway/src/lib.rs:235` | `model_id.to_string()` → `model_id.into()` |

### Phase B：Rust 性能优化

| 任务 | 文件变更 | 核心改进 |
|------|---------|---------|
| B1 Regex → OnceLock | `python.rs`(2处)、`shell.rs`(5处)、`yaml.rs`(3处)、`sql.rs`(4处)、`html.rs`(4处)、`json.rs`(1处)、`vue.rs`(1处)、`mod.rs`(2处) | **22 处 `Regex::new().unwrap()`** 从每次函数调用编译迁移到 **`OnceLock<Regex>` 首次编译即缓存**，消除文件打开/切换热路径上的重复正则编译 |
| B2 `detect_outline_family` | `mod.rs` | 三次堆分配（`replace` + `rsplit` + `rsplit_once`）→ **`rsplit(&['/','\\'][..])` 零分配** + **O(1) `HashMap` 查表** 替代 20 行 match 链 |
| B3 vue.rs 内存优化 | `vue.rs` | `lines[index+1..end_index].join("\n")` 二次分配 → **字节偏移切片 `&content[inner_start..inner_end]` 零分配** |
| B4 `finalize_outline_items` | `mod.rs` | **嵌套循环 O(n²) → 单调栈 O(n)**，大文件（>1000 项）end_line 计算从 ~500,000 次比较降至 ~1,000 次栈操作 |

### Phase C：Store 重构

| 任务 | 文件变更 | 说明 |
|------|---------|------|
| C1 sendMessage 拆分 | `streamActions.ts` | 140 行单体函数 → **`dispatchSlashCommand`(30行)** + **`refreshAfterSend`(40行)** + 精简后 `sendMessage`(70行)。`finally` 块增加 `if (get().streamingAssistantText)` 条件检查，避免冗余状态更新 |

### Phase D：文件拆分

| 任务 | 文件变更 | 说明 |
|------|---------|------|
| D1 rightpanel.css 拆分 | `rightpanel/` 下 6 新文件 | **5,006 行** → `files-panel.css`(2,482) + `editor-surface.css`(922) + `diff-viewer.css`(692) + `changes-panel.css`(443) + `terminal-panel.css`(254) + `browser-panel.css`(213)。原始文件改为 `@import` 聚合器(9行) |
| D2 ChangesPanel 拆分 | `ChangesToolbar.tsx`(307) + `ChangesEmptyState.tsx`(13) + `ChangesPanel.tsx`(1343→1101) | 工具栏(`TopToolbar` + `NavigatorContextToolbar`)和空状态组件独立，主文件减少 242 行 |

---

## 过程中遇到的挑战

### 1. CSS 拆分导致多行注释截断（修复 2 处）

**问题**：`rightpanel.css` 包含跨越多行的大型注释块，AI 拆分时未正确识别注释边界，导致：
- `files-panel.css` — `/* Left editor: hide...` 缺少 `*/` 闭合，并有 1 行游离文本
- `diff-viewer.css` — 注释文本缺少 `/*` 开头，esbuild minifier 报 `css-syntax-error`

**根因**：CSS 注释 `/* ... */` 可能跨越多行且内部不含 `*/`，纯文本分割算法无法区分注释内容与 CSS 代码。通用拆分策略应：
1. 先 strip 注释再按选择器分区
2. 或使用 CSS 解析器 AST 而非行级分割

**教训**：对 CSS 等非结构化文本进行模块拆分时，必须识别注释边界。本次人工审查发现并修复了 2 处，后续应使用工具化方法（如 PostCSS 插件）替代文本分割。

### 2. `refreshAfterSend` 参数类型不匹配

**问题**：拆分 `sendMessage` 后 TypeScript 报错 `AppInfo | undefined` 不可赋值给 `AppInfo`。`window.digitalLife.app.getInfo()` 可能返回 `undefined`，但 `refreshAfterSend` 最初声明为 `AppInfo`。

**修复**：将参数类型改为 `AppInfo | undefined`，函数内 `nextAppInfo?.currentWorkspace` 可选链已天然处理 undefined。

**教训**：提取函数时参数类型应与调用处精确匹配。TypeScript 的类型窄化（narrowing）在重构提取后可能失效，需要在边界处补全联合类型。

### 3. 测试文件引用旧 CSS 路径

**问题**：`cmPreviewStyling.test.ts` 通过 `import.meta.url` 相对路径引用 `regions.css`，删除旧文件后测试失败。

**修复**：将测试中的 import 路径更新为 `regions/rightpanel.css`。

**教训**：静态文件引用使用相对路径时，文件移动/删除后隐性引用容易被遗漏。应优先使用 `@/styles/` 别名或搜索所有引用后再操作。

---

## 架构变化

### 新增文件

```
frontend/src/styles/regions/rightpanel/
├── files-panel.css        # 2,482 行 — 右侧面板外壳 + 文件树 + 搜索等
├── changes-panel.css      # 443 行 — 变更面板样式
├── editor-surface.css     # 922 行 — 编辑器表面 + CM 编辑器 + 折叠标记
├── diff-viewer.css        # 692 行 — CM 差异查看器 + 合并视图
├── browser-panel.css      # 213 行 — 浏览器面板 + 多工作区文件树
└── terminal-panel.css     # 254 行 — 终端面板

frontend/src/app/regions/right-panel/panels/
├── ChangesToolbar.tsx     # 307 行 — 工具栏（分支/布局/视图切换）
└── ChangesEmptyState.tsx  # 13 行 — 无变更空状态
```

### 删除文件

```
frontend/src/styles/regions.css       # -8,144 行（死代码）
frontend/src/styles/sidebar.css       # -506 行（死代码）
frontend/src/styles/main-content.css  # -1,064 行（死代码）
```

### 修改文件

```
crates/workspace/src/outline/python.rs  # 2 处 Regex → OnceLock
crates/workspace/src/outline/shell.rs   # 5 处 Regex → OnceLock
crates/workspace/src/outline/yaml.rs    # 3 处 Regex → OnceLock
crates/workspace/src/outline/sql.rs     # 4 处 Regex → OnceLock
crates/workspace/src/outline/html.rs    # 4 处 Regex → OnceLock
crates/workspace/src/outline/json.rs    # 1 处 Regex → OnceLock
crates/workspace/src/outline/vue.rs     # 1 处 Regex → OnceLock + 字节偏移切片
crates/workspace/src/outline/mod.rs     # 2 处 Regex → OnceLock + HashMap detect + 单调栈
crates/model-gateway/src/lib.rs         # 1 行微优化
frontend/src/styles/regions/rightpanel.css  # 5006→9 行 @import 聚合器
frontend/src/app/stores/StoreState.ts       # 头部领域分组注释
frontend/src/app/stores/slicedStore.ts      # create 调用处边界注释
frontend/src/app/stores/actions/streamActions.ts  # sendMessage 拆分
frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx  # 1343→1101 行
frontend/src/app/regions/right-panel/cmPreviewStyling.test.ts # CSS 路径更新
```

---

## 经验教训汇总

| # | 教训 | 场景 | 建议措施 |
|---|------|------|---------|
| 1 | CSS 注释截断 | AI 按行分割 CSS 文件时不识别 `/* */` 边界 | 对 CSS 拆分应使用 PostCSS AST 解析，或拆分前 strip 注释 |
| 2 | 提取函数参数类型窄化失效 | sendMessage 拆分后 `AppInfo | undefined` 类型错误 | 提取时在函数签名处使用调用方实际传递的类型（含 undefined） |
| 3 | 静态文件路径隐性引用 | 删除 CSS 文件遗漏测试中的 `import.meta.url` 路径 | 删除文件前全局搜索所有引用（含测试文件） |
| 4 | OnceLock 模式已建立可推广 | brace.rs 已正确使用，其他 8 文件未对齐 | 同一模式的变体应统一复查，避免部分改进部分遗留 |
| 5 | 单调栈是 O(n²) end_line 计算的正确替代 | 嵌套循环遍历所有后续元素计算闭合范围 | 树形结构闭合区间计算场景应优先使用单调栈 |

---

> 由自动化重构洞察生成于 2026-05-24 23:45:00