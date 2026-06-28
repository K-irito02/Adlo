# 侧边栏切换图标状态切换与 CSS 高亮重构

## 变更概述

将 TitleBar 主侧边栏切换按钮（左/右）和右侧面板所有导航切换按钮的图标从静态改为**状态驱动**，并统一去除按压态背景高亮，改用图标形状变化指示状态。

## 涉及文件

### TypeScript

| 文件 | 变更 |
|------|------|
| `frontend/src/app/regions/TitleBar.tsx` | 左/右侧边栏按钮：`leftCollapsed`/`rightCollapsed` 驱动 `IconPanelLeft/LeftClose`、`IconPanelRight/RightClose` |
| `frontend/src/app/regions/right-panel/panels/CommunicationPanel.tsx` | 引入 `IconPanelLeftClose`，`communicateNavigatorCollapsed` 驱动图标切换 |
| `frontend/src/app/regions/right-panel/panels/FilesPanel.tsx` | 引入 `IconPanelLeft`，`navigatorCollapsed` 驱动图标切换 |
| `frontend/src/app/regions/right-panel/panels/ChangesTopToolbar.tsx` | 引入 `IconPanelLeft`，`navigatorCollapsed` 驱动图标切换 |
| `frontend/src/app/features/browser/BrowserToolbar.tsx` | 引入 `IconPanelLeft`，`navigatorCollapsed` 驱动图标切换 |
| `frontend/src/app/features/terminal/TerminalPanel.tsx` | 引入 `IconPanelLeft`，`navigatorCollapsed` 驱动图标切换 |

### CSS

| 文件 | 变更 |
|------|------|
| `styles/regions/rightpanel/tool-switcher.css` | 面板切换按钮仅压制 `.is-active`/`[aria-pressed='true']` 高亮；保留 hover 效果 |
| `styles/regions/titlebar.css` | 同上（TitleBar 区域限定）+ 关闭按钮 hover 红色背景修复 |
| `styles/regions/rightpanel/files-panel-core.css` | 导航切换按钮（leading iconbtn）仅压制激活态高亮，保留 hover |

### ESlint 修复

| 文件 | 问题 | 修复 |
|------|------|------|
| `BrowserEntrySubEntries.tsx:262` | `useCallback` 缺少 `bookmarkedUrls` 依赖 | 加入 deps |
| `BrowserIframeStack.tsx:76` | `useEffect` 缺失 `activeTab`/`iframeRef` 依赖 | 改为完整 `activeTab` + `iframeRef` |
| `BrowserIframeStack.tsx:113` | `useMemo` 未使用 `iframeEvictionVersion` | `void iframeEvictionVersion` 满足 lint |
| `useBrowserWebView.ts:131` | `useEffect` 缺失 `activeTab` 依赖 | 改为完整 `activeTab`（替代 `activeTab?.id` + `activeTab?.url`） |

## 关键经验

### CSS 特异性陷阱

1. **`:hover` vs `[aria-pressed='true']` 特异性冲突**
   - `[aria-pressed='true']` 的选择器特异性（0,3,0）高于 `:hover`（0,2,0），导致按下状态的按钮悬停无灰色背景
   - 修复：添加 `[aria-pressed='true']:hover` 组合选择器（0,4,0）

2. **`color: inherit` 导致图标亮度变化**
   - `color: inherit` 沿 DOM 链向上继承到 `body { color: var(--text-primary) }`，使图标从默认的 `var(--text-secondary)` 变为更亮
   - 修复：明确设为 `color: var(--text-secondary)`，保持图标亮度一致

3. **`.adl-window-btn--close:hover` 被 `.adl-icon-btn:hover:not(:disabled)` 覆盖**
   - 前者特异性（0,2,0）低于后者（0,3,0），导致关闭按钮悬停显示灰色而非红色
   - 修复：添加 `:not(:disabled)` 使特异性升至同级（0,3,0），利用源码顺序胜出

### 右侧面板 ErrorBoundary

- `BrowserToolbar.tsx` 中 `navigatorCollapsed` 未从 props 解构直接使用，导致 React 崩溃 → ErrorBoundary 捕获 → 整个右侧面板白屏
- 教训：props 解构须与接口定义保持同步，TS 编译检查不可跳过
