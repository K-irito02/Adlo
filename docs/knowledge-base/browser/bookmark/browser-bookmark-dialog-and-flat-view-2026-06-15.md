# 浏览器收藏标签对话框 + 展平列表视图

## 功能概述

本次实现两大功能：

1. **收藏标签对话框（BookmarkToFolderDialog）** — 将原来的书签直接切换行为改为模态对话框，用户可从目录树中选择目标目录，再执行收藏操作。
2. **展平列表视图模式** — 浏览器导航器新增 tree / list / all 三种视图模式，list/all 模式将层级目录展平为统一的标签列表。

## BookmarkToFolderDialog 架构

### 组件结构

```
BookmarkToFolderDialog (Portal → document.body)
├── 标题栏 + 关闭按钮
├── 工具栏
│   ├── 展开/折叠全部按钮 (IconUnfoldVertical)
│   └── 新建目录按钮 (IconFolderPlus + "!" hint)
├── 目录树 (CustomScrollArea)
│   ├── DirCategorySection — 工作区目录
│   └── DirCategorySection — 非工作区目录
└── 底部操作栏 (取消 / 加入此目录)
```

### 关键技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 目录树仅显示目录层级 | 只渲染 FileTreeRenderableNode（folder 类型） | 聚焦目录选择，避免干扰 |
| 展开/折叠全部切换 | allPaths 收集 + expandedSet 整体替换 | 简单可靠，O(n) 复杂度 |
| "!" 提示卡片 | 独立 position:fixed DOM 元素（卡片 + 箭头 + 箭头边框） | 复用 GitHub 菜单 HintCard 模式，无包含块问题 |
| 新建目录按钮样式 | 直角按钮（border-radius: 0），与 GitHub 菜单项一致 | 项目"直角按钮"标准 |

### 数据流

```
BrowserPanel (bookmarkDialogOpen 状态)
  → buildBookmarkDirectoryTree() (browserPanelHelpers.ts)
    → 生成 workspaceNodes + userFolderNodes (FileTreeRenderableNode[])
  → BookmarkToFolderDialog
    → handleBookmarkAddToFolder → browserBookmarkTab(url, folderPath)
    → handleBookmarkCreateDir → browserCreateTabFolder(name, parentId, parentType)
```

## "!" Hint 图标设计

### 状态矩阵

| 状态 | "!" 背景 | "!" 文字颜色 | CSS 选择器 |
|------|---------|-------------|-----------|
| 无悬停 | var(--bg-card) | var(--text-muted) | `.adl-bookmark-dir-toolbar__btn-hint` |
| 按钮悬停，! 未悬停 | var(--bg-card)（不变） | var(--text-muted)（不变） | 无额外规则，z-index 阻断父级 hover |
| ! 直接悬停 | var(--bg-hover) | var(--text-primary) | `.adl-bookmark-dir-toolbar__btn-hint.adl-bookmark-dir-toolbar__btn-hint:hover` |

### 关键 CSS 技巧

1. **父级 hover 阻断**：`!` 使用 `background: var(--bg-card)`（与对话框面板同色）配合 `z-index: 1`，当按钮 hover 时 `!` 区域不受影响
2. **选择器 specificity 提升**：`.btn-hint.btn-hint:hover`（重复 class）提升 specificity 到 (0,2,1) 以覆盖 `.btn:hover .btn-hint` 的 (0,2,1)，确保 `!` 直接悬停时能正确显示灰色背景
3. **直角按钮**：`border-radius: 0` 与 GitHub 菜单项一致

## 经验教训

### 1. "!" Hint 的交互设计必须与父级按钮完全解耦

**问题**：最初的实现将 "!" 放在按钮外部（split-btn 结构），导致 hover 状态管理与 GitHub 菜单模式不一致。

**教训**：遵循 MenuHintItem 模式 — "!" 作为按钮的子元素（`position: absolute`），通过 `background: var(--bg-card)` 阻断父级 hover 的视觉穿透。按钮 hover 时 "!" 区域不可见变化，只有 "!" 自身 hover 才变化。

### 2. CSS specificity 陷阱：父子元素同时 hover

**问题**：当 "!" 直接 hover 时，父按钮 `:hover` 和子元素 `:hover` 同时生效。`.btn:hover .hint` 的 specificity (0,2,1) 高于 `.hint:hover` 的 (0,1,1)，导致父级规则覆盖子级。

**解法**：使用 `.hint.hint:hover`（重复 class）将 specificity 提升至 (0,2,1)，与父级规则持平且因出现在 CSS 后面而获胜。

**通用原则**：涉及父子同时 hover 的交互，子元素的 hover 规则必须使用提升的 specificity。

### 3. 按钮布局：从 split-btn 到扁平 className 体系

**演进路线**：
1. 最初使用 `.adl-bookmark-dir-split-btn` / `__main` / `__hint`（外部包装器）
2. 改为单一 `.adl-bookmark-dir-toolbar__btn` + 绝对定位的 `__btn-hint`
3. 引入 `__btn--with-hint` modifier class 处理不同的 padding 需求

**原则**：简单 > 嵌套。单一按钮元素 + 绝对定位子元素比 split-btn 包装器更接近 MenuHintItem 模式。

### 4. 展平列表视图：Tree → Flat 的转换

**实现**：`buildFlatTabItems()` 递归遍历目录树，收集所有 tab 类型节点，按子目录插入分隔线。分隔线元素 `adl-browser-entry__flat-separator` 包含分类名称 + `horizontal rule`。

**注意**：子目录的展开/折叠状态在扁平模式下隐藏（`!isFlatMode && fileTreeChildren`），但父级目录仍可点击展开/折叠以影响树视图。

### 5. 按钮常态无背景

**问题**：初始设计按钮有 `background: var(--bg-elevated)`，用户要求常态下无背景。

**原则**：工具栏按钮在未悬停时不应有背景色，与 GitHub 菜单项行为一致。

---

## 后续优化（2026-06-15 V2）

### 6. 已收藏标签的按钮行为：直接取消收藏

**问题**：当标签已收藏时，点击收藏按钮仍然弹出对话框，不合理。

**原则**：已收藏 → 直接调用 `browserToggleBookmark()` 取消收藏（从书签列表和所属目录中移除），不弹对话框。未收藏 → 打开 BookmarkToFolderDialog。通过 `isBookmarked` 状态分流。

### 7. "新建目录"命名对话框

**问题**：点击"新建目录"直接创建目录，用户无法自定义名称。

**解决方案**：复用 `RenameDialog` 组件，点击"新建目录"时先弹出命名对话框：
- 标题：`t.browserCreateDir`（"新建目录"）
- 用户输入名称后确认 → `browserCreateTabFolder(name, parentId, parentType)`
- 用户留空取消 → RenameDialog 内部 handleOk 检测空值并调用 onCancel
- 系统默认名称由 `formatNewFolderNameByLocale` 根据用户语言生成

**两处统一**：
- 收藏标签对话框的 `handleBookmarkCreateDir` → 设置 `createDirDialog` 状态
- 导航器工具栏的 "新建目录" 按钮 → 同样设置 `createDirDialog` 状态

### 8. Toast 高度统一

**问题**：不同 toast 卡片高度不一致（"收藏成功"与其他 toast）。

**根因**：图标包裹 `<span>` 默认 `display: inline`，其高度由 `line-height` 决定而非内容（SVG）。不同 SVG 图标在 inline 容器中的基线对齐行为不同，造成视觉高度差异。

**修复**：
- 添加 `className="adl-toast__icon"` 让图标包裹 `<span>` 使用专用 CSS 类
- `.adl-toast__icon`：`display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px` — 固定尺寸的 flex 容器，消除 inline 布局带来的不确定性
- `.adl-toast__icon svg`：`display: block` — 确保 SVG 是块级元素，不受基线对齐影响

**知识要点**：
- Toast 使用 `position: fixed; left: 50%; transform: translateX(-50%)` 居中
- 通过 `TOAST_HEIGHT` 常量（36px）计算 `top` 偏移，必须与 CSS `height` 保持一致
- flex 容器中的图标包裹元素必须显式设置 `display: inline-flex` + 固定宽高，避免 inline 元素的 `line-height` 干扰
- `height: 36px; box-sizing: border-box; overflow: hidden` 强制固定高度

---

## 后续修复（2026-06-16）

### 9. 工作区顶级目录直接收藏

**问题**：BookmarkToFolderDialog 中，选择"工作区目录"下的"顶级目录（一级目录）"并点击"加入此目录"时，提示"请选中一个目录"。

**根因**：`handleBookmarkAddToFolder` 只处理 `folder:` 前缀的路径，`workspace:` 前缀被忽略。

**解决方案**：新增独立的数据层 `browserWorkspaceBookmarks: Record<string, string[]>`，让工作区直接持有书签标签 ID 列表。

#### 新增状态

```typescript
// browserBookmarkSlice
browserWorkspaceBookmarks: Record<string, string[]>;
```

> **后续变更（2026-06-29）**：`TabFolderState.tabs` 从 `string[]` 改为 `BookmarkTabItem[]`（`{ tabId: string; url: string; title: string }`），实现「按文件夹存储快照」。同一标签页导航到不同 URL 后再次收藏时，各文件夹独立保存收藏时的 URL/标题，互不干扰。

以 `workspaceId` 为 key，标签 ID 数组为 value。持久化使用独立的 localStorage key：
```typescript
BROWSER_WORKSPACE_BOOKMARKS_STORAGE_KEY = 'adl-ui:browser-workspace-bookmarks'
```

#### 数据流

```
BrowserPanel.handleBookmarkAddToFolder(folderPath)
  ├── folderPath.startsWith('folder:')  → browserBookmarkTab(tabId, folderId)     // 普通目录
  └── folderPath.startsWith('workspace:') → browserBookmarkTab(tabId, undefined, undefined, workspaceId)  // 工作区顶级目录
```

#### 核心变更

| 文件 | 变更 |
|------|------|
| `browserBookmarkSlice.ts` | 新增 `browserWorkspaceBookmarks` 状态 + `browserBookmarkTab` 新增 `workspaceId` 参数 |
| `BrowserPanel.tsx` | `handleBookmarkAddToFolder` 识别 `workspace:` 前缀并传递 `workspaceId` |
| `useBrowserTreeData.ts` | `buildWorkspaceCategoryTree` 接收 `workspaceBookmarks` 参数，在目录下渲染书签标签（避免与已打开标签重复） |
| `browserSlice.ts` | 持久化加载 `browserWorkspaceBookmarks` |

#### 取消收藏的同步移除

`browserToggleBookmark` 在取消收藏时，同时从 `browserTabFolders` 和 `browserWorkspaceBookmarks` 中移除标签，确保两种收藏方式的行为一致。

