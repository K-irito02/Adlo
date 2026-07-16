# 浏览器新建标签对话框修复 — 2026-06-09

## 问题

点击浏览器目录树悬停按钮和顶部工具栏的"新建标签"时：
1. **无对话框弹出**——直接调用 `browserOpenTab()` 在 store 中创建标签
2. **计数虚假增加**——`navigatorCount = browserTabs.length` 跟随 store 同步增加，用户未确认就已"创建"

## 根因

创建标签的完整链路为：

```
点击"新建标签"按钮
→ BrowserTreeEntry.onCreateTab(workspaceId, folderId)
→ browserActions.handleCreateTabInTree(workspaceId)
→ browserOpenTab(undefined, undefined, workspaceId)  ← 直接写入 store
→ browserTabs.length +1                                ← 计数立即增加
```

全程无用户交互确认环节。工具栏按钮同理，且通过 `selectedTreePathRef.current` 解析目录上下文。

## 修复方案

### 新增 CreateTabDialog 组件

位置：`browser-landing/CreateTabDialog.tsx`

参考 `AddShortcutDialog`（添加快捷站点对话框）设计：
- 标题："新建标签"（复用 `t.browserNewTab`）
- 输入："标签名称" + "网址"（新增 i18n keys）
- 按钮："取消" + "新建标签"（确认时 URL 自动补 `https://` 前缀）
- Portal 渲染到 `document.body`，支持 Esc/点击遮罩关闭
- 输入校验：名称与 URL 均非空时启用确认按钮

### 拦截回调流

修改 `browserpanel.tsx`：

| 入口 | 修改前 | 修改后 |
|------|--------|--------|
| 树目录回调 `onCreateTab` | `browserActions.handleCreateTabInTree` | `setCreateTabDialog({ open: true, workspaceId })` |
| 工具栏按钮 | `browserActions.handleCreateTabInTree()` | 解析 `selectedTreePathRef.current` 提取 `workspaceId`，打开对话框 |
| 对话框确认 | 无 | `browserOpenTab(url, title, workspaceId)` + 关闭对话框 |
| 对话框取消 | 无 | 仅关闭对话框，不创建任何标签 |

### Store 交互

修改前：`browserOpenTab` 直接修改 `browserTabs[]` → `navigatorCount` 即时增加。
修改后：仅在用户确认对话框后才调用 `browserOpenTab`，计数仅反映实际创建。

### 工具栏 workspaceId 解析

```typescript
// path 格式: "workspace:<id>" | "folder:<id>"
if (path.startsWith('workspace:')) {
  wsId = path.slice('workspace:'.length);
} else if (path.startsWith('folder:')) {
  const folder = browserTabFolders.find(f => f.id === fid);
  if (folder?.parentType === 'workspace') wsId = folder.parentId;
}
```

文件夹需要回溯 `TabFolderState.parentType === 'workspace'` 找到所属工作区。

## 变更文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `browser-landing/CreateTabDialog.tsx` | **新增** | 新建标签对话框组件 |
| `browser-landing/index.ts` | 修改 | 导出 CreateTabDialog |
| `i18n/zh-CN/browser.ts` | 修改 | +2 keys: `browserTabName`, `browserTabUrl` |
| `i18n/en-US/browser.ts` | 修改 | +2 keys: `browserTabName`, `browserTabUrl` |
| `browser/browserpanel.tsx` | 修改 | 对话框状态管理 + 回调拦截 + 工具栏目录解析 |

## 经验教训

### 1. 直接操作 Store 的入口必须有用户确认环节

任何涉及写入 store 的操作（尤其是创建/删除/修改），如果用户意图需要确认（URL、名称等），必须通过对话框/表单拦截，不能直接调用 action。

### 2. 树目录回调与工具栏按钮的上下文来源不同

树目录通过 `callbacks.onCreateTab(workspaceId, folderId)` 直接传递上下文；工具栏按钮则只有 `selectedTreePathRef.current` 路径字符串，需要反向解析。两种入口应统一到同一个对话框状态管理。

### 3. 对话框状态的 useCallback 闭包陷阱

使用 `useCallback` 处理对话框确认时，`createTabDialog.workspaceId` 作为依赖会随对话框状态变化重新创建。由于 `CreateTabDialog` 在 `BrowserPanel` 内渲染，状态更新后重新渲染可确保闭包捕获最新值，方案可行。更鲁棒的做法是用 `useRef` 存储上下文。

### 4. 对话框复用 AddShortcutDialog 的设计模式

- Portal 渲染（遮罩层、面板、输入、按钮）
- i18n keys 注入（通过 `t` prop）
- `onConfirm` / `onCancel` 回调
- URL 自动补 `https://` 前缀
- 输入框焦点管理（`requestAnimationFrame`）
- 键盘事件（Enter 确认 / Esc 取消）
- 遮罩层点击关闭（`e.target === e.currentTarget`）

这些模式已成为项目对话框的标准规范。
