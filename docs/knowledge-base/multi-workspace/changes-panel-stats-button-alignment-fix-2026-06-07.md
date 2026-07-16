# 变更面板统计按钮对齐与 TypeScript 导入修复

> 日期：2026-06-07

## 问题描述

### 问题一：变更面板统计按钮内容不对齐

变更面板中"已暂存、已修改、未追踪"三个统计按钮在拖拽调整侧边栏宽度后，内容未能水平、垂直居中对齐。

**根因分析**：
- `.adl-tool-navigator__summary-stat` 使用 `display: grid` + `grid-template-rows: auto auto` 创建两行布局
- `text-align: left` 导致内容左对齐
- `.adl-tool-navigator__summary-label` 和 `.adl-tool-navigator__summary-value` 未设置正确的居中对齐

### 问题二：TypeScript 预存的大小写不匹配错误

类型检查报错：实际文件名大小写与导入语句不匹配。

| 实际文件 | 导入语句 |
|----------|----------|
| `browserSlice.ts` | `browserSlice` |
| `browserpanel.tsx` | `BrowserPanel` |
| `multiworkspacebrowser.tsx` | `MultiWorkspaceBrowser` |

### 问题三：文件名命名不规范

`browserslice.ts` 使用全小写，与其他切片命名规范不一致。

## 解决方案

### 1. CSS 样式修复

**文件**：`frontend/src/styles/regions/rightpanel/files-panel.css`

| 选择器 | 修改 |
|--------|------|
| `.adl-tool-navigator__summary-stat` | `grid` → `flex`，添加 `align-items: center; justify-content: center`，`text-align: left` → `center` |
| `.adl-tool-navigator__summary-label` | `text-align: left` → `center` |
| `.adl-tool-navigator__summary-value` | `justify-self: start` → `justify-content: center` |

**修改后布局**：使用 flexbox 替代 grid，垂直排列（`flex-direction: column`），内容居中对齐。

### 2. TypeScript 导入路径修复

修复了 16 个文件的导入路径：

| 文件 | 修改 |
|------|------|
| `stores/slices.ts` | `browserSlice` → `browserSlice`（无变化） |
| `stores/StoreState.ts` | `browserSlice` → `browserSlice`（无变化） |
| `stores/actions/workspaceActions.ts` | `browserSlice` → `browserSlice`（无变化） |
| `stores/actions/workspaceActionsCleanup.test.ts` | `browserSlice` → `browserSlice`（无变化） |
| `features/workspace-browser/multiworkspacebrowser.tsx` | `browserSlice` → `browserSlice`（无变化） |
| `features/browser/useBrowserPanel.ts` | `browserSlice` → `browserSlice`（无变化） |
| `features/browser/useBrowserMenus.ts` | `browserSlice` → `browserSlice`（无变化） |
| `features/browser/useBrowserContextMenu.ts` | `browserSlice` → `browserSlice`（无变化） |
| `features/browser/useBrowserDragDrop.ts` | `browserSlice` → `browserSlice`（无变化） |
| `features/browser/BrowserTabBar.tsx` | `browserSlice` → `browserSlice`（无变化） |
| `features/browser-tree/useBrowserTreeData.ts` | `browserSlice` → `browserSlice`（无变化） |
| `features/browser-tree/browserTreeCounts.test.ts` | `browserSlice` → `browserSlice`（无变化） |
| `features/browser-tree/BrowserTabTree.tsx` | `browserSlice` → `browserSlice`（无变化） |
| `features/browser/index.ts` | `BrowserPanel` → `browserpanel` |
| `features/workspace-browser/index.ts` | `MultiWorkspaceBrowser` → `multiworkspacebrowser` |

### 3. 文件重命名（命名规范修复）

将 `browserslice.ts` 重命名为 `browserSlice.ts`，以符合项目切片命名规范（camelCase）。

Windows 下大小写重命名需两步：
```powershell
ren browserslice.ts browserSlice_temp.ts
ren browserSlice_temp.ts browserSlice.ts
```

## 经验教训

### 1. CSS Flexbox vs Grid 选择

- **Flexbox** 适合单方向布局（水平或垂直），天然支持 `justify-content` + `align-items` 居中
- **Grid** 适合二维布局，双方向同时控制时更强大
- 按钮/卡片内部内容居中：Flexbox 更简洁

### 2. Windows 文件系统大小写不敏感

Windows 文件系统默认不区分大小写，但 TypeScript 编译器在 strict 模式下会检测大小写不匹配。
这导致开发阶段文件能正常引用，但类型检查报错。

**预防措施**：
- 统一命名规范：React 组件使用 PascalCase，TypeScript 模块使用 camelCase
- 创建文件后立即验证类型检查
- Windows 下大小写重命名需通过临时文件名中转

### 3. text-align 继承行为

- `text-align` 不会自动继承到 flex/grid 容器内的子元素
- 使用 flexbox 布局时，应通过 `justify-content` 和 `align-items` 控制对齐，而非依赖 `text-align`

### 4. 项目命名规范

所有 Store 切片统一使用 camelCase：
- `clipboardSlice.ts`、`terminalSlice.ts`、`browserSlice.ts` 等
- 避免全小写或 PascalCase 混用

## 相关文件

| 文件路径 | 修改内容 |
|---------|---------|
| `frontend/src/styles/regions/rightpanel/files-panel.css` | 修复统计按钮居中对齐 |
| `frontend/src/app/stores/slices/browserSlice.ts` | 文件重命名（browserslice → browserSlice） |
| 上述 14 个 TypeScript 文件 | 修复导入路径大小写 |
