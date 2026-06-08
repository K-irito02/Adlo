# 文档大纲导航与刷新按钮修复经验

## 问题

本次会话修复了四个问题：
1. 变更面板差异查看器中，文档大纲导航无法展开折叠的未变更区域
2. 文件面板 / 变更面板 / 编辑器表面的刷新按钮被懒加载守卫阻挡
3. 文件面板 Markdown 预览中大纲导航使用已卸载的编辑器引用
4. 变更面板 Markdown 预览缺少大纲导航 DOM 回退

## 根因分析

### 问题 1：`uncollapseUnchanged` 传参错误

`@codemirror/merge` v6.12.1 的 `CollapsedRanges` StateField 存储格式如下：

```js
// 创建折叠装饰时，from = 折叠区域起始位置的文档偏移量
builder.add(
    state.doc.line(collapseFrom).from,  // 折叠区域首行的文档位置
    state.doc.line(collapseTo).to,
    Decoration.replace({ widget: new CollapseWidget(lines), block: true })
);
```

`uncollapseUnchanged` StateEffect 的过滤器匹配的是装饰的 **`from` 属性**：

```js
update(deco, tr) {
    deco = deco.map(tr.changes);
    for (let e of tr.effects)
        if (e.is(uncollapseUnchanged))
            deco = deco.update({ filter: from => from != e.value });
    return deco;
}
```

**关键陷阱**：`e.value`（`uncollapseUnchanged.of(value)` 的参数）必须等于折叠装饰的 `from` 值——即折叠区域的 **第一行的文档位置**（`line(collapseFrom).from`），而不是任意行在区域内的位置。

我们的代码传入 `line(targetLine).from`（目标行的文档位置），但装饰的 `from` 是 `line(collapseFrom).from`（折叠区域首行）。除非目标行恰好是折叠区域的首行，否则两者不相等→过滤器永远无法匹配→折叠永不展开。

**修复**：通过 `getChunks(view.state)` 获取合并分块，按相同算法重建折叠区域范围，找到包含目标行的区域，取其首行位置作为 `uncollapseUnchanged` 的参数。

### 问题 2：懒加载守卫阻挡刷新

`createLazyLoader` 工厂的守卫条件为 `if (guard.hasData && !guard.isLoading) return;`——如果数据已存在且不在加载中，则跳过加载。刷新按钮调用相同的加载函数，导致数据已存在时刷新被静默忽略。

**修复**：创建 `refreshOneWorkspaceTree` action，直接调用 IPC 的 `readWorkspaceTree` 命令，绕过懒加载守卫。该 action 同时更新 `workspaceTrees` 和 `expandedPaths` 状态。

### 问题 3：Markdown 预览使用已卸载的编辑器引用

`FilesPanel.tsx` 的大纲导航硬编码使用 `editor.revealLineInCenter(line)`，但 Markdown 预览模式下的编辑器引用可能已从 DOM 中卸载，导致导航无效。

**修复**：添加 `fileCategory === 'markdown' && previewEnabled` 守卫，Markdown/预览组合下直接通过 DOM 选择器 `[data-source-line="N"]` 滚动到标题，跳过编辑器引用。

### 问题 4：变更面板 Markdown 预览缺少 DOM 回退

`ChangesPanel.tsx` 的大纲导航只实现了编辑器跳转，没有为 Markdown 预览提供 DOM 滚动回退。

**修复**：添加 `changesPreviewContainerRef` DOM 引用，通过 `DiffEditorSection` 回调 ref 暴露预览容器，在编辑器跳转不可用时回退到 `querySelector('[data-source-line="N"]')` DOM 滚动。

## 教训

1. **`uncollapseUnchanged` 接收文档位置而非行号**：StateEffect 类型 `StateEffect<number>` 的值是文档**偏移量**，而非行号。需要 `view.state.doc.line(collapseSectionStartLine).from` 转换。

2. **折叠装饰的 `from` 是区域首行位置**：`Decoration.replace` 的 `from` 是折叠区域第一行的文档位置，不是目标行或被点击行的位置。

3. **展开折叠区域与 `getChunks` 算法一致**：要正确计算 `uncollapseUnchanged` 的目标位置，需用 `getChunks(state)` 获取合并分块，按 `{ margin: 3, minSize: 4 }` 配置重建折叠区域范围。

4. **比对 A/B 侧需独立计算**：在并排模式（side-by-side）中，A 侧（原始）和 B 侧（修改）的文档长度、分块位置不同，需用各自视图的 `state` 和 `getChunks` 分别计算。

5. **懒加载守卫是双刃剑**：`createLazyLoader` 的 `hasData && !isLoading` 守卫能防重复请求，但也会阻止刷新操作。刷新功能必须绕过该守卫。

6. **编辑器引用的生命周期**：Markdown 预览模式下编辑器 DOM 可能已卸载，大纲导航应有 DOM 回退方案。

## 涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx` | 添加 `findCollapsedSectionStart` 工具函数；修正 `uncollapseUnchanged` 传参；添加原始侧（A）展开；添加 `changesPreviewContainerRef` DOM 回退；导入 `getChunks` |
| `frontend/src/app/regions/right-panel/panels/FilesPanel.tsx` | Markdown 预览守卫 + DOM 回退 |
| `frontend/src/app/regions/right-panel/panels/DiffEditorSection.tsx` | 暴露 `previewContainerRef` 回调 ref |
| `frontend/src/app/stores/actions/workspaceActions.ts` | 新增 `refreshOneWorkspaceTree` action，绕过懒加载守卫 |
| `frontend/src/app/stores/StoreState.ts` | 添加 `refreshOneWorkspaceTree` 类型签名 |
| `frontend/src/app/regions/hooks/useFilesPanelProps.ts` | 连接 `refreshOneWorkspaceTree` |
