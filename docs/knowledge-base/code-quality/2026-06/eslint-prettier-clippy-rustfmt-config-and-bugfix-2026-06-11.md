# ESLint/Prettier/Clippy/rustfmt 四维门禁全量检测与修复

> 日期：2026-06-11 | 来源：四维门禁清零执行 + 配置完善 + bug 修复

## 背景

对 ESLint v9（flat config）、Prettier、cargo clippy、cargo fmt 四个工具的配置文件进行全面审查与完善，并执行全量检测与修复。

## 配置文件变更

### ESLint (`frontend/eslint.config.js`)

| 变更 | 说明 |
|------|------|
| 移除冗余 `ecmaVersion` | `languageOptions.ecmaVersion: 2022` 与 `parserOptions.ecmaVersion: 'latest'` 冲突 |
| 新增 `curly` | 强制 `if/for` 使用花括号 |
| 新增 `consistent-type-definitions` | 偏好 `interface` 而非 `type` |
| 新增 `no-require-imports` | ESM 项目禁止 `require()` |
| 新增 `no-empty-object-type` | 禁止空 `{}` 类型 |
| 新增 `prefer-function-type` | 偏好函数类型别名 |
| 测试文件独立配置块 | 在全局 ignores 中删除 test/spec 文件，改为单独规则块降级 4 条规则 |

### Prettier

| 变更 | 说明 |
|------|------|
| 根 `.prettierrc` 补全 | 补充 `jsxSingleQuote`、`bracketSpacing`、`bracketSameLine`、`arrowParens`、`quoteProps`、`proseWrap` |
| 新增 `overrides` | Markdown 文件使用 `proseWrap: "always"` |
| 删除 `frontend/.prettierrc` | 与根配置完全相同，Prettier 不合并配置，冗余 |

### Clippy (`clippy.toml`)

| 变更 | 说明 |
|------|------|
| 新增 `allow-unwrap-in-tests` | 测试中允许 `unwrap()` |
| 新增 `allow-expect-in-tests` | 测试中允许 `expect()` |
| 调整 `too-many-lines-threshold` | 500→800，对带文档/派生宏的文件更合理 |

### rustfmt (`rustfmt.toml`)

| 变更 | 说明 |
|------|------|
| `newline_style` 修复 | `"Auto"`→`"Unix"`，避免 Windows CRLF |
| 新增 `match_block_trailing_comma` | match 分支末尾统一逗号 |
| 新增 `hard_tabs` | 显式 `false` |
| 移出 nightly-only 配置 | `wrap_comments`、`comment_width`、`group_imports` 仅 nightly 可用，stable 编译报错 |

## 发现并修复的 bug

### 1. React Hooks 规则违例 — `GitHubTreeEntry.tsx`

`useCallback` 被嵌套在 `renderChildMeta`（自身就是 `useCallback`）内部调用，违反 React Hooks 调用位置规则：

```
React Hook "useCallback" cannot be called inside a callback.
```

**根因**：`handleOpenChildMenu` 是遗留死代码，之前的"更多操作"按钮已改为直接调用 `setChildMenuState`，但该函数未清理。

**修复**：删除 `handleOpenChildMenu` 及另外 4 个未使用的 `handle*Click` 函数 + 未使用的 `IconTrash` 导入。

### 2. 死状态变量 — `GitHubPanel.tsx`

`deleteMenuHovering` 状态被 `setDeleteMenuHovering` 在多处赋值，但值**从未被读取**。`isMouseOverDeleteUI()` 使用 DOM `:hover` 匹配而非该状态。

**修复**：删除 `deleteMenuHovering` 状态及全部 5 处 setter 调用、`handleClearAll` 死函数、`clearAllGitHubWorkspaceConfigs` 死 store 绑定。

### 3. 大纲树 meta 悬停 CSS 被误删

**根因**：提交 `f12f3bb`（"实现虚拟化树动态连接线与悬停传播"）在清理 `files-panel.css` 时误删了约 170 行 `.adl-outline-tree__meta` 相关 CSS，包括：
- `.adl-outline-tree__meta` — 绝对定位、`opacity: 0`、`font-family: var(--font-mono)`、`box-shadow` 等
- `.adl-outline-tree__item.is-hovered > .adl-outline-tree__row .adl-outline-tree__meta` — 悬停 `opacity: 0.82`
- `.adl-outline-tree__meta-dot` — 分隔符间距

同时 `outline-panel.css` 中的 label depth 字号规则也被删除。

**修复**：从 `d20b32a` 提交（f12f3bb 的父提交）提取原始 CSS 恢复。

## 关键经验

### CSS 删除前必须 grep 全仓库引用

`f12f3bb` 删除了 `outline-panel.css` 整体文件和 `files-panel.css` 中的 `.adl-outline-tree__meta` 块，但未检查这些规则是否被实际引用。**在删除"看似无关"的 CSS 前，必须 `grep` 全仓库确认无引用**。

### Rust rustfmt nightly-only 特性需要 stable 工具链检查

`wrap_comments`、`comment_width`、`group_imports` 等 rustfmt 配置项需要 nightly 工具链。在 `rustfmt.toml` 中写入这些配置后，stable 运行 `cargo fmt` 会报 `Warning: can't set X, unstable features are only available in nightly channel`。**写入 rustfmt.toml 前应检查 `rustfmt --version` 确认 stable/nightly**。

### ESLint flat config 的 `ignores` 不能替代 test 规则降级

`eslint.config.js` 最初在 `ignores` 中屏蔽了 `**/*.test.ts`，导致测试文件完全不受 lint 保护。正确做法是移除 ignores 中的 test 模式，为 test 文件创建独立配置块并降级特定规则。

### Prettier 不合并配置，多层级配置需考虑覆盖关系

根 `.prettierrc` 和 `frontend/.prettierrc` 共存时，frontend 下的文件**完全使用** frontend 配置，根配置被忽略。反之根配置影响非 frontend 文件。**多层级 Prettier 配置必须保证根配置是完整规范，子配置仅在有真正差异时才保留**。

### `>` 直接子代选择器对树组件 hover 传播至关重要

大纲树是递归嵌套结构。CSS 选择器 `.is-hovered .adl-outline-tree__meta` 会匹配所有后代，导致父节点悬停时子节点的 meta 也显示。**必须使用 `.is-hovered > .adl-outline-tree__row .adl-outline-tree__meta` 限制仅直接行生效**。
