# 文件树与文档大纲样式优化总结

**日期**: 2026-05-27
**任务**: 优化"文件"和"变更"功能的文件树层级结构，同时恢复"文档大纲"的原有样式

---

## 一、问题背景

### 1.1 用户需求
用户希望在"文件"功能和"变更"功能下的文件树中：
- 移除文件类型节点的连接竖线
- 调整文件节点logo与父文件夹名称的对齐方式

### 1.2 遇到的问题
在实施过程中：
- 对"文件"功能和"变更"功能的文件树样式修改影响了"文档大纲"的显示效果
- 包括层级缩进、折叠/展开按钮大小、连接竖线等样式都被错误地改变了

---

## 二、解决方案

### 2.1 核心策略
**双端一致性原则**：通过CSS类名隔离，确保不同功能模块的样式互不影响

### 2.2 文件树优化（保留）

在 `files-panel.css` 中添加了文件节点的特定样式：

```css
/* 隐藏文件节点的连接竖线 */
.adl-filetree__node--file::before {
  display: none;
}

/* 文件节点icon模拟展开按钮位置 */
.adl-filetree__node--file > .adl-tree-node__row > .adl-tree-node__icon-before {
  width: 16px !important;
  height: 16px;
  margin-left: 6px;
  margin-right: 2px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

在 `fileTree.tsx` 中添加了文件节点类名：

```tsx
itemClassName={`adl-filetree__item${isDirectory ? " adl-filetree__node--directory" : " adl-filetree__node--file"}${nodeClassName ? ` ${nodeClassName}` : ""}`}
```

### 2.3 文档大纲恢复（回滚到63c4579版本）

**恢复的样式**：

1. **OutlineTree.tsx** - 行偏移量
   - `rowOffset` 恢复为 `((depth - 1) * 14) + 4`

2. **files-panel.css** - 多项样式恢复：
   - 子节点缩进 `padding-left: 14px`
   - 连接竖线位置 `left: 13px`
   - 按钮和缩进尺寸 `20px`
   - 行对齐方式 `align-items: flex-start`
   - 文档大纲按钮悬停效果 `color-mix(in srgb, var(--surface-hover) 88%, transparent)`

---

## 三、技术要点

### 3.1 CSS选择器特异性
- 使用 `!important` 确保关键样式生效
- 使用更具体的选择器链避免样式冲突

### 3.2 样式隔离策略
- 文件树和文档大纲使用不同的CSS类名
- 通过 `rowOffset` 动态控制缩进量
- 避免样式合并导致的意外影响

### 3.3 Git版本管理
- 通过 `git show <commit>:<file>` 查看历史版本
- 对比差异，精准恢复需要的样式

---

> **经验总结**：模块化CSS隔离、渐进式修改、双端验证、及时更新文档。完整经验见 [知识沉淀/重构/styling-restoration-2026-05-27.md](../../知识沉淀/重构/styling-restoration-2026-05-27.md)

---

## 五、修改的文件清单

### 5.1 代码文件
- `frontend/src/app/features/file-tree/fileTree.tsx`
- `frontend/src/app/features/file-tree/TreeNodeRow.tsx`
- `frontend/src/app/features/outline/OutlineTree.tsx`
- `frontend/src/styles/regions/rightpanel/files-panel.css`

### 5.2 需要更新的文档
- `docs/superpowers/specs/2026-05-25-tree-layout-alignment.md` - 需要补充说明文件树优化
- `UIOperationManual/rightpanel/tools/files.md` - 更新文件树操作说明
- `UIOperationManual/rightpanel/tools/changes.md` - 更新变更面板说明

---

## 六、验证结果

### 6.1 TypeScript类型检查
```
npm run typecheck - 全部通过
```

### 6.2 单元测试
```
npm test - 183项测试全部通过
```

### 6.3 效果确认
- ✅ 文件树保持优化效果（文件节点无连线、logo对齐正确）
- ✅ 文档大纲恢复到63c4579版本效果（层级缩进14px、按钮20px、悬停效果正常）
- ✅ 文件树和文档大纲样式完全隔离，互不影响

---

## 八、后续修正（2026-06-01）

### 8.1 问题
展开/折叠按钮的折线图标箭尖与连接竖线未对齐。根级（depth=1）竖线原本应隐藏，子级（depth≥2）竖线在 `left: 13px` 处，但 toggle 按钮中心在距 `<li>` 左边缘的 **20px** 处（受 row 的 `margin-inline-start: -4px` + `padding-inline-start: 8px` 影响），偏差 **7px**。

### 8.2 修复

在 `file-tree.css`（最后加载的 CSS 文件）末尾添加精确选择器：

```css
/* outline 非根节点的连接竖线与展开/折叠按钮对齐 */
.adl-outline-tree__children .adl-outline-tree__item::before {
  left: 20px !important;
}
```

**关键点**：
- 选择器 `.adl-outline-tree__children .adl-outline-tree__item` 只匹配非根节点（depth≥2），根级不受影响
- 双类选择器 + `!important` + 放末尾文件，三层保障确保不被覆盖
- 使用 `agent-browser`（Chrome DevTools Protocol 自动化工具）精确测量像素位置

> **经验总结**：CSS 偏移不靠视觉猜测，用浏览器自动化工具精确测量；注意 CSS 加载链和特异性冲突。完整经验见 [知识沉淀/重构/styling-restoration-2026-05-27.md](../../知识沉淀/重构/styling-restoration-2026-05-27.md)

### 8.4 修改的文件
- `frontend/src/styles/regions/rightpanel/file-tree.css` — 新增 5 行，添加 outline 子级连接竖线对齐规则

### 8.5 验证
- agent-browser 测量：depth=1 `display:none`（正确隐藏），depth=2 `left:20px` + `btnCenter:20px`（完全对齐）
- TypeScript 类型检查通过

---

## 七、未来改进建议（原始内容）

### 7.1 CSS架构
- 引入CSS Modules或styled-components实现样式隔离
- 建立统一的样式变量系统
- 分离文件树和文档大纲的样式文件

### 7.2 测试覆盖
- 添加E2E测试验证不同功能模块的样式
- 建立视觉回归测试机制
- 记录并验证不同Git版本的样式差异

### 7.3 文档管理
- 建立变更日志，记录每次样式修改的影响范围
- 创建样式指南，定义不同组件的样式规范
- 使用文档模板，确保文档结构一致性

---

**作者**: AI Assistant
**审核**: 待完成
**状态**: ✅ 已完成
