# 浏览器导航模式切换 (2026-06-20)

## 问题

用户在浏览器面板点击链接后，新页面出现时会自动重新加载 2~3 次，且历史记录中存在重复标签。

## 根本原因

### 1. Tauri 模式下 `handlePageMeta` 创建新标签而非更新当前标签

iframe 模式使用 `browserNavigateActiveTab`（更新当前标签 URL），但 Tauri 模式通过 `handlePageMeta` 调用 `browserOpenTab`（创建新标签）。新标签触发 `useEffect` → `navigateTauriUrl` → 冗余 `browser_navigate` IPC → 页面刷新。

### 2. 两路并发回调携带不同 URL

`meta-changed`（来自 INIT_SCRIPT 标题上报，使用 `location.href`）与 `url-changed` → `browser_fetch_page_meta`（来自 `on_navigation` 回调）两路都调用 `handlePageMeta`，但两路 URL 可能不同：
- SPA 通过 `pushState` 移除 tracking param（如 YouTube 的 `&pp=oAcB`）
- `url-changed` 携带带 `&pp` 的导航 URL
- `meta-changed` 携带 `pushState` 后的 URL（无 `&pp`）
- `normalizeUrlForDedup` 只处理尾随斜杠，不处理 query param 差异 → 找不到匹配标签 → 重复创建

### 3. `isUrlRecentlySeen` 精确字符串匹配

去重使用精确 URL 字符串比较。SPA `pushState` 产生的新 URL 从未被 `markUrlSeen` → 去重失效 → `invoke('browser_navigate')` → 全页面重新加载。

## 解决方案

### 功能：导航模式切换

在工具栏"刷新"按钮右侧添加 Radix + Motion Switch 组件，切换两种模式：

| 模式 | 行为 |
|------|------|
| 新建标签（默认，滑块在左） | URL 变更创建新标签 |
| 就地导航（滑块在右） | URL 变更更新当前标签 |

使用 `@radix-ui/react-switch` + `motion` 实现动画切换，状态持久化到 localStorage（key: `adl-ui:browser-navigate-in-place`）。

### 修复 1：`isUrlRecentlySeen` 增加 hostname+pathname 级去重

当精确 URL 匹配失败时，遍历 recentMap 按 hostname + pathname（忽略 query/hash）匹配。SPA `pushState` 改变 query param 时仍能去重。

### 修复 2：`handlePageMeta` 增加 hostname+pathname 级标签匹配

in-place 模式下，当精确/归一化匹配都失败时，检查当前激活标签的 hostname+pathname 是否与 meta URL 一致。如果一致（只是 query param 不同），先调用 `markUrlSeen(meta.url)`，再用 `browserUpdateTab` 静默更新标签 URL + title，避免触发 `navigateTauriUrl`。

### 修复 3：延长 `isUrlRecentlySeen` TTL

从 1000ms 延长到 3000ms，覆盖 HTTP 元数据抓取和 SPA 标题上报的延迟。

### 修复 4：移除 `stopImmediatePropagation`

INIT_SCRIPT 中过于激进的 `stopImmediatePropagation` 会阻止页面自身的其他 capture 监听器（如分析、SPA 路由）。

## 关键文件变更

| 文件 | 变更 |
|------|------|
| `browserslice.ts` | 新增 `browserNavigateInPlace` 字段 + `setBrowserNavigateInPlace` 动作 + 持久化 |
| `BrowserNavModeSwitch.tsx` | 新建 — Radix + Motion Switch 组件 |
| `BrowserToolbar.tsx` | 在刷新按钮后添加 Switch |
| `useBrowserPageMeta.ts` | 新增 `normalizeUrlForDedup`、`hostnamePathKey`；支持 mode-aware 路由 + 标记 URL 已见 |
| `useBrowserWebView.ts` | `isUrlRecentlySeen` 增加 hostname+pathname 回退匹配；TTL 延长到 3000ms |
| `browser-toolbar.css` | 新增 Switch 样式 |
| `browser_navigation.rs` | 移除 `stopImmediatePropagation` |
| `browser.ts` (zh-CN, en-US) | 新增 `browserNavigateInPlace`、`browserNavigateNewTab` 键 |

## 经验教训

1. **SPA 的 URL 变化是多阶段的**：WebView2 `on_navigation` 事件捕获导航目标 URL，但 SPA 可能在页面加载后通过 `pushState` 修改 URL。`location.href` 在 DOMContentLoaded 和 MutationObserver 触发时可能不同。任何 URL 比较逻辑必须考虑 query param 差异。
2. **两路回调的去重要分层**：精确匹配 → 归一化匹配（尾随斜杠）→ hostname+pathname 匹配（query param）。三层递进才能覆盖 SPA 的 URL 变化模式。
3. **React 事件转发**：当自定义组件作为 TooltipTrigger 的子元素时，必须显式声明并转发 `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur`/`onClick`，否则 Tooltip 不工作。
4. **`stopImmediatePropagation` 的危险性**：它会阻止页面上所有同阶段的其他监听器。只应在确认无副作用时使用。
