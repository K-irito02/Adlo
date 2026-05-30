# 工作区头部行文字重叠修复计划

## 问题分析

当鼠标悬停在"工作区头部行"上时，右侧出现的操作按钮会与工作区名称文字产生重叠效果。当前实现中，按钮使用 `position: absolute` 浮动在文字上方，但文字没有正确被裁剪，导致视觉上的重叠。

### 受影响区域

| 区域 | 组件文件 | CSS 文件 | 当前实现 |
|------|----------|----------|----------|
| 左侧边栏工作区 | `WorkspaceList.tsx` | `workspace-list.css` | `text-overflow: ellipsis` + `padding-right: 104px` |
| 右侧文件面板 | `WorkspaceFileTreeEntry.tsx` | `file-tree.css` | `text-overflow: ellipsis`（默认） |
| 右侧变更面板 | `WorkspaceChangesEntry.tsx` | `file-tree.css` | 共用文件面板样式 |
| 右侧浏览器面板 | `WorkspaceBrowserEntry.tsx` | `files-panel.css` | `text-overflow: ellipsis`（默认） |
| 右侧终端面板 | `WorkspaceTerminalEntry.tsx` | `files-panel.css` | 共用浏览器面板样式 |
| 浏览器面板标题 | - | `browser-panel.css` | `text-overflow: ellipsis` |

## 解决方案

参考 `参考.md` 中的方法，使用 `text-overflow: clip` 替代 `text-overflow: ellipsis`，实现文字被按钮物理切断的效果，而非重叠。

### 核心 CSS 变更

1. **`text-overflow: clip`**：允许文字被直接切断，不显示省略号
2. **`overflow: hidden`**：配合 flex 布局压缩文字宽度
3. **`min-width: 0`**：允许 flex 元素收缩到比内容更小
4. **`padding-right`**：hover 时为按钮腾出空间

## 实施步骤

### 步骤 1：修复左侧边栏工作区头部行

**文件**：`ai-digital-life/frontend/src/styles/regions/workspace-list.css`

**修改位置**：第 155-161 行

```css
/* 修改前 */
.adl-workspace-row__label > span:not(.adl-status-lamp) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

/* 修改后 */
.adl-workspace-row__label > span:not(.adl-status-lamp) {
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
```

### 步骤 2：修复右侧面板多工作区头部行（file-tree.css）

**文件**：`ai-digital-life/frontend/src/styles/regions/rightpanel/file-tree.css`

**修改位置**：第 931-942 行

```css
/* 修改前 */
.adl-multitree-entry__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  color: var(--text-primary);
}
.adl-multitree-entry__namezone:hover .adl-multitree-entry__name {
  padding-right: 0;
}

/* 修改后 */
.adl-multitree-entry__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  color: var(--text-primary);
}
.adl-multitree-entry__namezone:hover .adl-multitree-entry__name {
  padding-right: 80px;
}
```

### 步骤 3：修复右侧面板多工作区头部行（files-panel.css）

**文件**：`ai-digital-life/frontend/src/styles/regions/rightpanel/files-panel.css`

**修改位置**：第 2375-2386 行

```css
/* 修改前 */
.adl-multitree-entry__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  color: var(--text-primary);
}
.adl-multitree-entry__namezone:hover .adl-multitree-entry__name {
  padding-right: 0;
}

/* 修改后 */
.adl-multitree-entry__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  color: var(--text-primary);
}
.adl-multitree-entry__namezone:hover .adl-multitree-entry__name {
  padding-right: 80px;
}
```

### 步骤 4：修复浏览器面板标题

**文件**：`ai-digital-life/frontend/src/styles/regions/rightpanel/browser-panel.css`

**修改位置**：第 128-137 行

```css
/* 修改前 */
.adl-tool-navigator__context-title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

/* 修改后 */
.adl-tool-navigator__context-title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}
```

### 步骤 5：验证操作按钮的背景遮罩

确保 `.adl-multitree-entry__actions` 有足够的背景遮罩，防止文字在按钮下方显示：

**文件**：`file-tree.css` 和 `files-panel.css`

**修改位置**：第 961-976 行（file-tree.css）和第 2405-2420 行（files-panel.css）

```css
/* 确认现有样式 */
.adl-multitree-entry__actions {
  position: absolute;
  right: var(--space-2);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-150) var(--ease-default);
  flex-shrink: 0;
  background: inherit;  /* 继承父元素背景色 */
  padding-left: var(--space-1);
  z-index: 1;
}
```

如果 `background: inherit` 不足以遮挡文字，可改为：

```css
.adl-multitree-entry__actions {
  background: var(--surface-hover);  /* 使用明确的背景色 */
  padding-left: var(--space-2);      /* 增加左侧内边距 */
}
```

## 测试验证

### 测试场景

1. **短名称工作区**：名称不溢出时，hover 行为正常
2. **长名称工作区**：名称溢出时，文字被按钮物理切断
3. **各面板一致性**：左侧边栏、文件、变更、浏览器、终端面板行为一致
4. **悬停过渡**：hover 时按钮显示/隐藏的过渡动画平滑

### 测试命令

```powershell
# 类型检查
npm --prefix frontend run typecheck

# 前端测试
npm --prefix frontend test

# 浏览器预览模式
npm run dev:browser
```

## 预期效果

- 文字溢出时被按钮物理切断，不显示省略号
- 按钮区域有足够背景遮罩，文字不透出
- 各面板行为一致，用户体验统一
