# Diff Viewer Gutter Hover 颜色修复 (2026-06-08)

## 问题概述

并排模式下，鼠标悬停在左侧（A 侧/删除）红色变更行的**内容区域**时，行号区（gutter）错误地显示为绿色背景，而非红色。

## 根因

`gutterHoverSync.ts` 中判断当前编辑器是 A 侧（删除）还是 B 侧（插入）的逻辑使用了错误的 DOM 祖先。

### DOM 结构真相

```javascript
// @codemirror/merge 源码 (dist/index.js)
EditorView.editorAttributes.of({ class: "cm-merge-a" })  // → .cm-editor 加类
```

`.cm-merge-a` / `.cm-merge-b` 通过 `EditorView.editorAttributes` 添加，即类在 **`.cm-editor`** 元素上，**不在** `.cm-mergeViewEditor` 上。

| 版本 | 代码 | 检查的 DOM 元素 | 结果 |
|------|------|-----------------|------|
| 原代码 | `mergeViewEditor.parentElement.classList.contains('cm-merge-a')` | `.cm-mergeViewEditors` | ❌ 永为 false |
| 第一次修复 | `mergeViewEditor.classList.contains('cm-merge-a')` | `.cm-mergeViewEditor` | ❌ 永为 false |
| **最终修复** | **`editor.classList.contains('cm-merge-a')`** | **`.cm-editor`** | **✅ 正确** |

### 两次修复失败的原因

第一次修复只改了对 `parentElement` 的访问，但没有验证 `.cm-merge-a` 到底在哪个元素上，而是通过 CSS 选择器 ` .cm-merge-a .cm-changedLineGutter` 错误地推断 `.cm-merge-a` 在 `.cm-mergeViewEditor` 上。

## 经验教训

### 1. CSS 选择器不能推断 DOM 结构

CSS 选择器 `.cm-merge-a .cm-changedLineGutter` 只要求 `.cm-merge-a` 是 `.cm-changedLineGutter` 的祖先，但不指定在哪一层。以下所有结构都匹配同一个 CSS 选择器：

```
❌ 推断的结构：          ✅ 实际的结构：
.cm-mergeViewEditor     .cm-mergeViewEditor
  └─ .cm-merge-a ← 猜错  └─ .cm-editor.cm-merge-a ← 真相
       └─ 子元素              └─ 子元素
```

**规则**：不要根据 CSS 选择器推断 DOM 类归属，必须查阅库源代码或通过 DevTools 验证。

### 2. 验证第三方库的 DOM 类添加方式

`@codemirror/merge` 使用 `EditorView.editorAttributes` 添加类，这是 CodeMirror 6 特有的 API，不同于常规的 DOM `className` 赋值。不熟悉 CM6 的 API 设计就容易猜错。

**最佳实践**：在 `node_modules` 中搜索目标类名（如 `cm-merge-a`）确认添加方式。

### 3. 修改后验证的内容不能变

第一次修复后用户反馈"问题未解决"，因为修复假设错误。修改代码后应：
- 不只看测试是否通过
- 手动在浏览器中验证实际效果
- 或通过代码审查确认逻辑正确性

## 涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/app/features/editor/gutterHoverSync.ts` | 第 87-91 行：`mergeViewEditor.parentElement?.classList.contains('cm-merge-a')` → `editor.classList.contains('cm-merge-a')` |