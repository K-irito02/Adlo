# 重构实施计划 – ai-digital-life
**生成日期**：2026-05-21
**更新日期**：2026-05-21（最终版）
**基于**：[refactor-insight-2026-05-21.md](./refactor-insight-2026-05-21.md)

---

## 执行摘要

| Phase | 状态 | 完成度 |
|-------|------|--------|
| Phase 1：清理遗留废弃 Store | ✅ 已完成 | 100% |
| Phase 2：统一错误处理格式 | ✅ 已完成 | 100% |
| Phase 3：抽取桥接层共享类型 | ✅ 已完成 | 100% |
| Phase 4：全局 CSS 变量迁移 | ✅ 已完成 | 100% |
| Phase 5：模块化分层（features/） | ✅ 已完成 | 100% |
| Phase 6：重构洞察验证与修复 | ✅ 已完成 | 100% |

---

## Phase 4：全局 CSS 变量迁移（🟢低优先级 → ✅ 已完成）

### 目标
将 `regions.css` 中的硬编码 Shadow 值替换为亮暗主题变量，新增 Shadow Token 类型定义。

### 状态：✅ 已完成

### 变更内容
1. **`themes.css`**：亮暗主题各新增 6 个 Shadow Token（`--shadow-inset-highlight`, `--shadow-panel`, `--shadow-panel-sm`, `--shadow-divider`, `--ring-neutral`, `--ring-error`）
2. **`regions.css`**：6 处硬编码 `box-shadow` 和 `inset 0 1px` 值替换为 CSS 变量
3. **`design-system/tokens.ts`**（新建）：`SHADOW_TOKENS` 常量数组 + `ShadowToken` 类型
4. **`design-system/index.ts`**：更新导出包含 Token 类型

### 验证结果
- 类型检查：✅ 通过
- 单元测试：✅ 全部通过

---

## Phase 5：模块化分层（features/）（🟢低优先级 → ✅ 已完成）

### 目标
将前端 `app/regions/right-panel/` 中的组件按功能域分层到 `app/features/` 目录。

### 状态：✅ 已完成

### 迁移模块

| 模块 | 文件数 | 摘要 |
|------|--------|------|
| `features/file-tree/` | 6 | FileTree, TreeNodeRow, CustomScrollArea, fileTreeVisuals |
| `features/outline/` | 4 | OutlineTree, outlineModel |
| `features/patch-review/` | 3 | patchReview 纯函数 + 测试 |
| `features/editor/` | 9 | CodeEditor, cmTheme, cmLanguages, cmFoldGutter, cmScrollLeftSync, FoldTooltipOverlay, useFoldMarkerAutoHide, editorAdapters |
| `features/diff-viewer/` | 6 | DiffViewer, changePreviewDiffRanges, scrollbarWidth |
| `features/preview/` | 6 | MarkdownPreview, DocxPreview, PdfPreview, LazyPreviews |
| `features/terminal/` | 2 | TerminalPanel |

### 关键变更
- 每个模块创建 `index.ts` 统一导出
- 更新 15+ 个文件的 import 路径
- 更新 8 个测试文件中的 `readFileSync` 路径引用
- 修复 3 个预存类型错误（泛型、forwardRef、useMemo）

### 验证结果
- 类型检查：✅ 通过
- 单元测试：✅ 171/171 全部通过（Vitest）

---

## 已完成变更文件清单（完整）

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `frontend/src/design-system/tokens.ts` | 新建 | ShadowToken 类型定义 |
| `frontend/src/styles/themes.css` | 修改 | 亮暗主题新增 6 个 Shadow 设计 Token |
| `frontend/src/styles/regions.css` | 修改 | 6 处硬编码替换为 CSS 变量 |
| `frontend/src/design-system/index.ts` | 修改 | 添加 tokens.ts 导出 |
| `frontend/src/shared/ipc.ts` | 新增 | `IpcErrorCode` 枚举 |
| `frontend/src/tauri-bridge.ts` | 修改 | 使用 `IpcErrorCode` 枚举 |
| `frontend/src/preview-bridge.ts` | 修改 | 使用 `IpcErrorCode` 枚举 |
| `frontend/src/app/stores/useWorkspaceStore.ts` | 删除 | 废弃 Store |
| `frontend/src/app/stores/useSessionStore.ts` | 删除 | 废弃 Store |
| `frontend/src/app/stores/useEditorStore.ts` | 删除 | 废弃 Store |
| `frontend/src/app/stores/usePatchStore.ts` | 删除 | 废弃 Store |
| `frontend/src/app/features/`（7 个模块） | 新建/迁移 | 模块化分层迁移 |
| `frontend/src/app/types.ts` | 修改 | 添加 `getView()` 到 EditorRef 接口 |
| `frontend/package.json` | 修改 | 添加 `@codemirror/view` 依赖 |

---

> 由自动化重构洞察生成于 2026-05-21 14:45:00
> 最终更新于 2026-05-21
