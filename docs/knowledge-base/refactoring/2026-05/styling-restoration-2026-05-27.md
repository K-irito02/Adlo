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

## 四、经验教训

### 4.1 架构设计
- **模块化CSS**：不同功能模块应有独立的样式文件或明确的类名前缀
- **样式隔离**：共享组件应避免样式耦合，使用BEM或CSS Modules等方法论
- **版本回滚能力**：重要样式变更前应记录当前状态，便于快速回滚

### 4.2 开发流程
- **渐进式修改**：每次只修改一个样式属性，验证后再继续
- **双端验证**：同时检查Tauri桌面和浏览器模式
- **自动化测试**：利用TypeScript类型检查和Vitest单元测试确保代码质量

### 4.3 CSS 调试
- **不要凭视觉猜测偏移值**——误差可能远超预期（本例猜测 1px，实际 7px）
- **使用浏览器自动化工具精确测量** `getBoundingClientRect()` 获取真实像素位置
- `outline-panel.css` 是孤立 CSS 文件（不被任何 import 引用），其中的修改不生效
- 实际加载的 CSS 链：`main.tsx → index.css → rightpanel.css → files-panel.css + file-tree.css`

### 4.4 CSS 特异性
- 当元素有多个类名时，注意 CSS 特异性冲突和加载顺序
- `.adl-tree-node::before`（特异性 0,1,1）被多处定义，需要 `:nth-child` 选择器或 `!important` 覆盖

### 4.5 文档维护
- **及时更新文档**：样式变更应同步更新相关文档
- **记录决策过程**：保存设计决策的上下文，便于后续维护
- **版本化文档**：文档应与代码版本保持同步

---

## 五、修改的文件清单

### 5.1 代码文件
- `frontend/src/app/features/file-tree/fileTree.tsx`
- `frontend/src/app/features/file-tree/TreeNodeRow.tsx`
- `frontend/src/app/features/outline/OutlineTree.tsx`
- `frontend/src/styles/regions/rightpanel/files-panel.css`
- `frontend/src/styles/regions/rightpanel/file-tree.css` — 新增 outline 子级连接竖线对齐规则

### 5.2 需要更新的文档
- `docs/specs/ui/2026-05-25-tree-layout-alignment.md`

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

## 七、后续修正（2026-06-01）

### 7.1 问题
展开/折叠按钮的折线图标箭尖与连接竖线未对齐。根级（depth=1）竖线原本应隐藏，子级（depth≥2）竖线在 `left: 13px` 处，但 toggle 按钮中心在距 `<li>` 左边缘的 **20px** 处（受 row 的 `margin-inline-start: -4px` + `padding-inline-start: 8px` 影响），偏差 **7px**。

### 7.2 修复

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

### 7.3 修改的文件
- `frontend/src/styles/regions/rightpanel/file-tree.css` — 新增 5 行，添加 outline 子级连接竖线对齐规则

### 7.4 验证
- agent-browser 测量：depth=1 `display:none`（正确隐藏），depth=2 `left:20px` + `btnCenter:20px`（完全对齐）
- TypeScript 类型检查通过

---

## 八、未来改进建议

### 8.1 CSS架构
- 引入CSS Modules或styled-components实现样式隔离
- 建立统一的样式变量系统
- 分离文件树和文档大纲的样式文件

### 8.2 测试覆盖
- 添加E2E测试验证不同功能模块的样式
- 建立视觉回归测试机制
- 记录并验证不同Git版本的样式差异

### 8.3 文档管理
- 建立变更日志，记录每次样式修改的影响范围
- 创建样式指南，定义不同组件的样式规范
- 使用文档模板，确保文档结构一致性

---

**作者**: AI Assistant
**审核**: 待完成
**状态**: ✅ 已完成
