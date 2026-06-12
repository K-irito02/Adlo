# 变更查看器空行悬停背景与滚动闪烁修复 (2026-06-13)

## 问题概述

修复并排/内联 Diff 查看器中 **空变更行悬停背景色不正确** 及 **快速滚动闪烁** 问题。涉及 3 个源代码/配置文件、2 个 CSS 文件。

## 解决的问题

### 1. 并排模式右侧面板折叠图标不出现

- **现象**：首次点击左侧变更文件后，右侧面板行号区域不显示折叠/展开图标。点击右侧内容区域后再悬停行号区才出现
- **根因**：`useFoldMarkerAutoHide` 传入 `editorViewA || editorViewB`（短路取 editorViewA），其内部 `forceParsing` + `foldGutterCompartment.reconfigure` 只对左侧视图执行。右侧视图语法树未强制解析，`foldable()` 返回 null，`lineMarker()` 不生成折叠标记 DOM
- **修复**：在 `SideBySideDiffViewer` 新增 `useEffect`，当 `editorViewB` 就绪后对其独立执行 `forceParsing` + `foldGutterCompartment.reconfigure`
- **文件**：`SideBySideDiffViewer.tsx`

### 2. 并排模式左侧红色空变更行悬停无更深背景

- **现象**：左侧红色删除行为空行时，鼠标悬停不显示更深的红背景色（非空行正常）
- **根因**：左侧悬停选择器 `.cm-merge-a .cm-line:hover:has(.cm-changedLine)` — `:has()` 只匹配子代元素，但 `.cm-changedLine` 是 `Decoration.line({ class: "cm-changedLine" })` 加在 `.cm-line` 自身，`:has()` 永远不匹配
- **修复**：新增 `.cm-merge-a .cm-changedLine:hover` 直接选择器
- **文件**：`diff-viewer.css`

### 3. 内联模式绿色空变更行显示为更深红背景

- **现象**：内联模式绿色新增行为空行时，悬停显示更深红色而非更深绿色
- **根因**：通用回退规则 `.cm-changedLine:hover` 固定使用 `--editor-diff-remove-hover`（红）。空行无 `.cm-insertedLine` 子元素，`:has(.cm-insertedLine)` 不匹配，回退到通用红色规则
- **修复**：新增 `.adl-cm-diff-viewer--inline .cm-changedLine:hover` 使用 `--editor-diff-insert-hover`（绿）。该规则特定性低于 `.cm-deletedChunk .cm-line:hover`（红），因此删除行保持正确
- **文件**：`diff-viewer.css`

### 4. 快速滚动内容延迟/闪烁（内外联均受影响）

- **现象**：快速向上或向下滚动时，内容出现延迟，产生闪烁感
- **根因**：`COLLAPSE_UNCHANGED_CONFIG.minSize: 4` 值过小，4 行以上未变更段即被折叠。快速滚动时大量折叠段需要动态创建/销毁 `Decoration.replace` 占位符，布局频繁重算
- **修复**：`minSize` 从 4 提升至 8，减少折叠段数量，降低滚动时的处理开销
- **文件**：`sharedExtensions.ts`

## 关键教训

### 1. CSS `:has()` 只匹配子代元素，不匹配元素自身

`Decoration.line({ class: "cm-changedLine" })` 将 class 加在 `.cm-line` 元素自身。CSS 选择器 `.cm-line:hover:has(.cm-changedLine)` **永远不匹配**，因为 `:has()` 只查询后代节点，不包含选择器匹配的元素本身。

而 `Decoration.mark({ class: "cm-insertedLine" })` 创建 `<ins>` 子元素，因此 `.cm-line:hover:has(.cm-insertedLine)` 有效。

**规则**：使用 `Decoration.line` 的 class 时，应直接用 `.cm-changedLine:hover` 而非 `:has(.cm-changedLine)`。

### 2. 空行场景需同时考虑 children 和 self classes

对于空行（无字符）：无 `<ins>`/`<del>` 子元素 => `:has()` 不匹配 => 需要 `.cm-changedLine:hover` 兜底。

**规则**：为变更行悬停样式始终添加 `:has(.cm-insertedLine/deletedLine/changedLine)` + `.cm-changedLine:hover` 两套选择器，覆盖非空和空行场景。

### 3. MergeView 每侧编辑器需独立配置 Compartment

`foldGutterCompartment` 是模块级单例，但 `view.dispatch({ effects: foldGutterCompartment.reconfigure(...) })` 只作用于调用 dispatch 的视图。MergeView 的 A 侧（editor A）和 B 侧（editor B）是两个独立 `EditorView`，必须分别执行 reconfigure。

### 4. `collapseUnchanged minSize` 需平衡折叠效果与滚动性能

`minSize` 决定最小折叠阈值。过小（4）导致频繁的 collapse/uncollapse 操作，滚动时产生可见延迟。增大至 8 在保持折叠效果的同时显著降低滚动处理开销。

## 最终效果验证

- ✅ 左侧红色空行悬停显示更深红背景
- ✅ 右侧绿色空行悬停显示更深绿背景（所有模式）
- ✅ 内联模式空插入行悬停显示正确绿色
- ✅ 快速滚动无内容延迟/闪烁
- ✅ 折叠段仍然有效折叠（8 行以上未变更段）