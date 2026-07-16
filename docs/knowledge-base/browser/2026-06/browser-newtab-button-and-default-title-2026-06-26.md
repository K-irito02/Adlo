# 浏览器新标签按钮文字与默认标签名称修复

## 日期
2026-06-26

## 涉及问题

### Issue 1：按钮文字不一致
侧边栏"已打开的标签"区域的 "+" 按钮 Tooltip 提示文字为"新建标签"（`t.browserNewTab`），而网址输入框旁的"+"按钮提示文字为"新建标签页"（`t.browserNewTabBtn` / `t.newTabPage`）。

**修复**：将 `BrowserNavigator.tsx` 中按钮的 `content` 和 `aria-label` 从 `t.browserNewTab` 改为 `t.browserNewTabBtn`。

### Issue 2：新建空白标签无默认名称
点击任意位置的"新建标签页"按钮后，新标签的 `title` 为空字符串（`browserOpenTab()` 无参数调用时默认 `title?.trim() || ''`），导致标签列表中只显示 Logo 图标而无文字。

**修复**：在调用 `browserOpenTab()` 时传入 i18n 默认标题 `t.browserNewTabPage`，使空白标签显示"新建标签页"（中文）/ "New tab page"（英文），且随语言切换自动变化。

## 涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/app/features/browser/BrowserNavigator.tsx` | Tooltip: `t.browserNewTab` → `t.browserNewTabBtn`; aria-label: 同上; `browserOpenTab()` → `browserOpenTab(undefined, t.browserNewTabPage)` |
| `frontend/src/app/features/browser/BrowserPanelContent.tsx` | `() => browserOpenTab()` → `() => browserOpenTab(undefined, t.browserNewTabPage)` |

## 知识沉淀

### 新标签默认标题原则
- 创建标签时应始终提供有意义的默认标题，避免显示空白
- 默认标题必须使用 i18n key，确保语言切换时自动适配
- 推荐使用 `t.browserNewTabPage`（约定 key）作为浏览器新标签的默认标题

### 按钮文字一致性原则
- 相同功能的按钮在 UI 不同位置应使用相同的 i18n key，确保文案统一
- 网址输入框"+"按钮使用 `t.newTabPage`（common 领域），侧边栏"+"按钮使用 `t.browserNewTabBtn`（browser 领域），两者值相同但分属不同 i18n 领域以减少耦合

### i18n Key 速查

| Key | 中文 | English | 使用位置 |
|-----|------|---------|----------|
| `browserNewTab` | 新建标签 | New tab | 旧值（已废弃） |
| `browserNewTabBtn` | 新建标签页 | New tab page | 侧边栏"+"按钮 |
| `browserNewTabPage` | 新建标签页 | New tab page | 空白标签默认标题 |
| `newTabPage` | 新建标签页 | New tab page | 网址输入框"+"按钮（common 领域） |

## 相关的未完成任务

### Tauri 模式标签切换重新加载
已在方案讨论阶段完成根因分析和多方案对比（见 conversation 记录），但尚未实现。关键发现：

- **根因**：Tauri 模式使用**单 WebView**，切换标签时调用 `browser_navigate` 导致页面全量重新加载
- **推荐方案**：多 WebView 架构（每标签独立 WebView，切换时 show/hide，通过 `set_bounds` 移入/移出屏幕）
- **状态**：方案讨论已完成，待实施
