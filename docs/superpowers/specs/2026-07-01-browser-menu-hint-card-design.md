# Browser Menu Hint Card 设计文档

## 概述

为"浏览器功能面板"的"更多操作"下拉菜单添加"!"说明子卡片，当鼠标悬停在"!"图标上时，在菜单左侧显示功能说明卡片。

## 背景

- 用户需要在"更多操作"菜单中了解每个功能项的作用和限制
- 子卡片不能出现在菜单右侧，避免超出应用右边缘
- 现有 `ContextMenu.tsx` 和 `MenuHintItem.tsx` 已实现类似的"!"说明子卡片，但 `BrowserMenuDropdown` 尚无此支持

## 目标

1. 为"更多操作"菜单所有功能项添加!"说明子卡片
2. 子卡片显示在菜单左侧
3. 复用现有 `.adl-sub-hint-card` 设计系统
4. 保持与现有其他菜单一致的交互行为（无动画，即时显示/隐藏）
5. 解决长文本换行时出现的尾部留空问题

## 非目标

- 不实现 disabled 功能的实际功能（仅添加 hint 说明其状态和限制）
- 不修改现有 `ContextMenu` 或 `MenuHintItem` 组件
- 不修改菜单项的功能逻辑

## 组件设计

### BrowserMenuHintItem

新建独立组件，职责单一：渲染带"!"提示图标的菜单项。

**接口：**

```typescript
interface BrowserMenuHintItemProps {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  hint?: string;         // hint 文本，有值时才显示"!"图标
  action?: () => void;
  onClose: () => void;   // 点击后关闭菜单
}
```

**行为：**

- 渲染一个 `button`，内含图标（可选）、文本标签、"!"图标（有 hint 时）
- 鼠标进入"!"图标 → 计算定位 → 通过 `createPortal` 渲染子卡片到 `document.body`
- 鼠标离开"!"图标 → 移除子卡片
- 点击按钮 → 执行 action → 调用 onClose
- hint 为空或 undefined 时不显示"!"图标

### 子卡片定位

**定位计算（左侧显示）：**

```typescript
const menuRect = menuEl.getBoundingClientRect();
const buttonRect = buttonEl.getBoundingClientRect();
const centerY = buttonRect.top + buttonRect.height / 2;

// 卡片左边缘 = 菜单左边缘 - 卡片宽度 - 间距
card.style.right = `${window.innerWidth - menuRect.left + 8}px`;
card.style.top = `${centerY}px`;

// 箭头指向右侧（指向菜单）
arrow.style.right = `${window.innerWidth - menuRect.left + 3}px`;
arrowBorder.style.right = `${window.innerWidth - menuRect.left + 2}px`;
```

### CSS 样式扩展

在 `file-operations.css` 中添加左侧定位样式：

```css
.adl-sub-hint-card--left {
  border-width: 1px 1px 1px 0;  /* 右侧无边框，由箭头衔接 */
}
.adl-sub-hint-card__arrow--left {
  border-right: 5px solid var(--bg-card);
  border-left: none;
}
.adl-sub-hint-card__arrow-border--left {
  border-right: 6px solid var(--border-default);
  border-left: none;
}
```

同时修改 `word-break: normal` → `word-break: break-word`，解决换行留空问题。

### BrowserMenuItem 类型扩展

```typescript
export type BrowserMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; disabled?: boolean; hint?: string; action?: () => void };
```

## 数据设计

### i18n Keys

**中文 hint 内容：**

| Key | 值 | 对应菜单项 |
|-----|-----|-----------|
| `browserHardReloadHint` | 重新加载当前页面，忽略缓存 | hard-reload |
| `browserCopyCurrentUrlHint` | 将当前页面URL复制到剪贴板 | copy-url |
| `browserClearHistoryHint` | 清除当前标签的浏览历史记录 | clear-history |
| `browserClearCookiesHint` | 清除当前网站的Cookie数据（仅Tauri模式支持） | clear-cookies |
| `browserClearCacheHint` | 清除当前网站的缓存数据（需WebView底层API接入） | clear-cache |
| `browserDeveloperToolsHint` | 打开WebView开发者工具（仅Tauri桌面模式） | devtools |
| `menuZoomInHint` | 放大页面显示比例 | zoom-in |
| `menuZoomOutHint` | 缩小页面显示比例 | zoom-out |
| `menuResetZoomHint` | 重置页面显示比例为100% | zoom-reset |

## 实现计划

1. 创建 `BrowserMenuHintItem.tsx`
2. 修改 `useBrowserMenus.ts` 类型定义
3. 修改 `BrowserMenuDropdown.tsx` 集成新组件
4. 修改 `BrowserPanel.tsx` 添加 hint 文本
5. 修改 `browser.ts` i18n 文件（zh-CN + en-US）
6. 修改 `file-operations.css` 添加左侧样式 + word-break 修复

## 风险与注意事项

1. **菜单在屏幕左边缘时**：子卡片可能超出左边缘。对于"更多操作"按钮始终在工具栏右侧区域的情况，基本不会触发，但仍可保留 `right` 定位的兜底逻辑
2. **长 hint 文本**：使用 `max-width: min(480px, 90vw)` 限制宽度
3. **双端一致性**：纯前端组件，无 IPC 依赖，Tauri 与浏览器模式行为一致
4. **无障碍**：保持现有 `role="menuitem"` 和 `aria-*` 属性
