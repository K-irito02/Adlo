# Browser Menu Hint Card 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为"更多操作"下拉菜单项添加"!"说明子卡片，显示在菜单左侧

**Architecture:** 新建 `BrowserMenuHintItem` 独立组件，扩展 `BrowserMenuItem` 类型支持 `hint` 属性，修改 `BrowserMenuDropdown` 集成新组件

**Tech Stack:** React 19 + TypeScript + CSS Custom Properties

## Global Constraints

- i18n key 必须同时添加 zh-CN 和 en-US
- 子卡片必须显示在菜单左侧（避免超出右边缘）
- 无动画（与现有 ContextMenu 一致）
- word-break: normal → word-break: break-word 解决换行留空
- 复用现有 .adl-sub-hint-card 设计系统

---

### Task 1: 添加 i18n hint 文本

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/browser.ts`
- Modify: `frontend/src/app/i18n/en-US/browser.ts`

**Interfaces:**
- Produces: 9 个 i18n key（zh-CN + en-US），用于后续任务引用

- [ ] **在 zh-CN/browser.ts 末尾 as const 前添加以下 keys：**

```typescript
  browserHardReloadHint: '重新加载当前页面，忽略缓存',
  browserCopyCurrentUrlHint: '将当前页面URL复制到剪贴板',
  browserClearHistoryHint: '清除当前标签的浏览历史记录',
  browserClearCookiesHint: '清除当前网站的Cookie数据（仅Tauri模式支持）',
  browserClearCacheHint: '清除当前网站的缓存数据（需WebView底层API接入）',
  browserDeveloperToolsHint: '打开WebView开发者工具（仅Tauri桌面模式）',
  menuZoomInHint: '放大页面显示比例',
  menuZoomOutHint: '缩小页面显示比例',
  menuResetZoomHint: '重置页面显示比例为100%',
```

- [ ] **在 en-US/browser.ts 末尾 as const 前添加以下 keys：**

```typescript
  browserHardReloadHint: 'Reload the current page, ignoring cache',
  browserCopyCurrentUrlHint: 'Copy the current page URL to clipboard',
  browserClearHistoryHint: 'Clear browsing history of the current tab',
  browserClearCookiesHint: 'Clear cookie data for the current site (Tauri mode only)',
  browserClearCacheHint: 'Clear cache data for the current site (requires WebView API)',
  browserDeveloperToolsHint: 'Open WebView DevTools (Tauri desktop mode only)',
  menuZoomInHint: 'Zoom in the page',
  menuZoomOutHint: 'Zoom out the page',
  menuResetZoomHint: 'Reset zoom to 100%',
```

---

### Task 2: 创建 BrowserMenuHintItem 组件

**Files:**
- Create: `frontend/src/app/features/browser/BrowserMenuHintItem.tsx`

**Interfaces:**
- Produces: `BrowserMenuHintItem` 组件，接收 `{ id, label, icon, disabled, hint, action, onClose }` 属性
- Consumes: `.adl-sub-hint-card` / `.adl-sub-hint-card--left` CSS 类（Task 5）

- [ ] **创建 BrowserMenuHintItem.tsx**

```tsx
import React, { useRef, useEffect } from 'react';

interface BrowserMenuHintItemProps {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  hint?: string;
  action?: () => void;
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}

export function BrowserMenuHintItem({
  id,
  label,
  icon,
  disabled,
  hint,
  action,
  onClose,
  menuRef,
}: BrowserMenuHintItemProps) {
  const hintRef = useRef<HTMLSpanElement>(null);
  const subCardsRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    return () => {
      subCardsRef.current.forEach((el) => el.remove());
      subCardsRef.current = [];
    };
  }, []);

  const showHint = (e: React.MouseEvent) => {
    const buttonEl = (e.target as HTMLElement).closest('button');
    const originalTitle = buttonEl?.getAttribute('title');
    if (originalTitle) {
      buttonEl?.setAttribute('data-original-title', originalTitle);
      buttonEl?.removeAttribute('title');
    }
    const btnRect = buttonEl?.getBoundingClientRect();
    const menuEl = menuRef.current;
    const menuRect = menuEl?.getBoundingClientRect();
    if (btnRect && menuRect) {
      const centerY = btnRect.top + btnRect.height / 2;

      const card = document.createElement('div');
      card.className = 'adl-sub-hint-card adl-sub-hint-card--left';
      card.textContent = hint || '';
      card.style.right = `${window.innerWidth - menuRect.left + 8}px`;
      card.style.top = `${centerY}px`;
      card.style.transform = 'translateY(-50%)';

      const arrow = document.createElement('div');
      arrow.className = 'adl-sub-hint-card__arrow adl-sub-hint-card__arrow--left';
      arrow.style.right = `${window.innerWidth - menuRect.left + 3}px`;
      arrow.style.top = `${centerY - 4}px`;

      const arrowBorder = document.createElement('div');
      arrowBorder.className = 'adl-sub-hint-card__arrow-border adl-sub-hint-card__arrow-border--left';
      arrowBorder.style.right = `${window.innerWidth - menuRect.left + 2}px`;
      arrowBorder.style.top = `${centerY - 5}px`;

      document.body.appendChild(card);
      document.body.appendChild(arrow);
      document.body.appendChild(arrowBorder);

      subCardsRef.current.forEach((el) => el.remove());
      subCardsRef.current = [card, arrow, arrowBorder];
    }
  };

  const hideHint = () => {
    subCardsRef.current.forEach((el) => el.remove());
    subCardsRef.current = [];
  };

  return (
    <button
      type="button"
      role="menuitem"
      className="adl-menu__item"
      disabled={disabled}
      onClick={() => {
        action?.();
        onClose();
      }}
    >
      {icon && <span className="adl-menu__item-icon">{icon}</span>}
      <span>{label}</span>
      {hint ? (
        <span
          ref={hintRef}
          className="adl-menu-item__hint"
          onMouseEnter={showHint}
          onMouseLeave={hideHint}
        >
          !
        </span>
      ) : null}
    </button>
  );
}
```

---

### Task 3: 扩展 BrowserMenuItem 类型 + 修改 BrowserMenuDropdown

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserMenus.ts`
- Modify: `frontend/src/app/features/browser/BrowserMenuDropdown.tsx`

**Interfaces:**
- Consumes: `BrowserMenuHintItem`（Task 2）
- Produces: 带 `hint` 属性的 `BrowserMenuItem[]`

- [ ] **修改 useBrowserMenus.ts，在 `BrowserMenuItem` 类型中添加 `hint?: string`**

```typescript
export type BrowserMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; disabled?: boolean; hint?: string; action?: () => void };
```

- [ ] **修改 BrowserMenuDropdown.tsx，导入并使用 BrowserMenuHintItem**

```tsx
import { BrowserMenuHintItem } from './BrowserMenuHintItem';

// 在 return 中将 button 替换为 BrowserMenuHintItem
{browserMenuItems.map((item) =>
  'separator' in item ? (
    <div key={item.id} className="adl-menu__sep" role="separator" />
  ) : (
    <BrowserMenuHintItem
      key={item.id}
      id={item.id}
      label={item.label}
      icon={menuItemIcons[item.id]}
      disabled={item.disabled}
      hint={item.hint}
      action={item.action}
      onClose={onClose}
      menuRef={menuRef}
    />
  )
)}
```

---

### Task 4: 为菜单项添加 hint 文本

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserPanel.tsx`

**Interfaces:**
- Consumes: i18n hint keys（Task 1）

- [ ] **修改 BrowserPanel.tsx 中 browserMenuItems 定义，为每个菜单项添加 hint**

在 hard-reload 项添加 `hint: t.browserHardReloadHint`，copy-url 项添加 `hint: t.browserCopyCurrentUrlHint`，clear-history 项添加 `hint: t.browserClearHistoryHint`，以此类推。

```typescript
const browserMenuItems = useMemo(
  () => [
    {
      id: 'hard-reload',
      label: t.browserHardReload,
      hint: t.browserHardReloadHint,
      action: () => { /* ... */ },
    },
    {
      id: 'copy-url',
      label: t.browserCopyCurrentUrl,
      hint: t.browserCopyCurrentUrlHint,
      action: () => { /* ... */ },
    },
    { id: 'sep-1', separator: true as const },
    {
      id: 'clear-history',
      label: t.browserClearHistory,
      hint: t.browserClearHistoryHint,
      action: () => useAppStore.getState().browserClearHistory(),
    },
    { id: 'clear-cookies', label: t.browserClearCookies, hint: t.browserClearCookiesHint, disabled: true },
    { id: 'clear-cache', label: t.browserClearCache, hint: t.browserClearCacheHint, disabled: true },
    { id: 'devtools', label: t.browserDeveloperTools, hint: t.browserDeveloperToolsHint, disabled: true },
    { id: 'sep-2', separator: true as const },
    { id: 'zoom-in', label: t.menuZoomIn, hint: t.menuZoomInHint, disabled: true },
    { id: 'zoom-out', label: t.menuZoomOut, hint: t.menuZoomOutHint, disabled: true },
    { id: 'zoom-reset', label: t.menuZoomReset, hint: t.menuResetZoomHint, disabled: true },
  ],
  [activeTab, browserNavigateActiveTab, t]
);
```

---

### Task 5: 添加左侧子卡片 CSS 样式 + word-break 修复

**Files:**
- Modify: `frontend/src/styles/regions/rightpanel/file-operations.css`

- [ ] **修改 .adl-sub-hint-card 的 word-break: normal → word-break: break-word**

```css
  word-break: break-word;
  overflow-wrap: break-word;
```

- [ ] **在现有 .adl-sub-hint-card--down 样式之后添加左侧定位样式：**

```css
/* 左侧子卡片：箭头指向右侧（指向菜单） */
.adl-sub-hint-card--left {
  border-width: 1px 1px 1px 0;
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

---

### Verification

- [ ] **类型检查：** `cd ai-digital-life/frontend && npx tsc --noEmit`
- [ ] **Lint 检查：** `cd ai-digital-life/frontend && npx eslint .`
- [ ] **功能验证：** 打开浏览器模式，点击"更多操作"按钮，悬停每个菜单项的"!"图标，确认子卡片显示在菜单左侧且内容正确
