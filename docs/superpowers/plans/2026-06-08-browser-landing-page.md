# 浏览器空标签引导页 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现浏览器空标签引导页，包含快捷导航、本地端口、自定义背景三大功能模块

**Architecture:** 在 `features/browser/browser-landing/` 目录下创建 8 个新组件，扩展 `browserSlice` 新增状态和方法，在 `browserpanel.tsx` 中根据 `showLandingPage` 条件渲染新页面

**Tech Stack:** React 19 + Zustand + CSS 变量主题 + HTML5 Drag & Drop API

---

### Task 1: 在 browserSlice 中添加快捷站点、本地端口、背景配置的类型定义与状态管理

**Files:**
- Modify: `frontend/src/app/stores/slices/browserSlice.ts`
- Test: `frontend/src/app/stores/slices/__tests__/browserSlice.test.ts` (if test file exists)

- [ ] **Step 1: 添加新类型定义** — 在 `BrowserTabState` 定义之后添加以下类型

```typescript
// browserSlice.ts — 在 BrowserBookmark 接口之后添加

export interface ShortcutSite {
  id: string;
  name: string;
  url: string;
  icon?: string;
  sortOrder: number;
  createdAt: number;
}

export interface LocalPort {
  id: string;
  host: string;
  port: number;
  label?: string;
  isAutoDiscovered: boolean;
  lastAliveAt: number;
  sortOrder: number;
}

export type BackgroundMode = 'default' | 'image' | 'video';
export type BackgroundFit = 'cover' | 'contain' | 'repeat';

export interface BackgroundConfig {
  mode: BackgroundMode;
  filePath?: string;
  fit: BackgroundFit;
  fileName?: string;
}
```

- [ ] **Step 2: 添加 localStorage keys** — 在 `const BROWSER_BOOKMARKS_KEY` 定义之后添加

```typescript
const BROWSER_SHORTCUTS_KEY = 'adl-ui:browser-shortcuts';
const BROWSER_LOCAL_PORTS_KEY = 'adl-ui:browser-local-ports';
const BROWSER_BG_CONFIG_KEY = 'adl-ui:browser-bg-config';
```

- [ ] **Step 3: 在 BrowserSlice 接口中添加新状态和方法**

```typescript
// 在 BrowserSlice 接口中添加
browserShortcuts: ShortcutSite[];
browserLocalPorts: LocalPort[];
browserBgConfig: BackgroundConfig;
browserPortScanning: boolean;

// 快捷站点方法
browserAddShortcut: (site: Omit<ShortcutSite, 'id' | 'sortOrder' | 'createdAt'>) => string;
browserRenameShortcut: (id: string, name: string) => void;
browserDeleteShortcut: (id: string) => void;
browserReorderShortcuts: (ids: string[]) => void;

// 本地端口方法
browserSetLocalPorts: (ports: LocalPort[]) => void;
browserAddManualPort: (port: number, label?: string) => string;
browserDeleteLocalPort: (id: string) => void;
browserReorderLocalPorts: (ids: string[]) => void;
browserSetPortScanning: (scanning: boolean) => void;

// 背景配置方法
browserSetBgConfig: (config: BackgroundConfig) => void;
browserResetBgConfig: () => void;
```

- [ ] **Step 4: 在 hydrateBrowserDefaults 中添加新状态的水合逻辑**

```typescript
// 在 hydrateBrowserDefaults 的 doHydrate 函数中，set({...}) 之前添加
const shortcuts = readJson<ShortcutSite[]>(BROWSER_SHORTCUTS_KEY, []);
const localPorts = readJson<LocalPort[]>(BROWSER_LOCAL_PORTS_KEY, []);
const bgConfig = readJson<BackgroundConfig>(BROWSER_BG_CONFIG_KEY, {
  mode: 'default',
  fit: 'cover',
});
```

在 `set({...})` 中添加：
```typescript
browserShortcuts: shortcuts,
browserLocalPorts: localPorts,
browserBgConfig: bgConfig,
browserPortScanning: false,
```

- [ ] **Step 5: 在 createBrowserSlice 的返回值中添加默认状态**

```typescript
// 在 browserTabTreeExpanded: {} 之后添加
browserShortcuts: [],
browserLocalPorts: [],
browserBgConfig: { mode: 'default', fit: 'cover' },
browserPortScanning: false,
```

- [ ] **Step 6: 实现 browserAddShortcut 方法**

```typescript
browserAddShortcut: (site) => {
  let id = '';
  set((state) => {
    const maxSortOrder =
      state.browserShortcuts.length > 0
        ? Math.max(...state.browserShortcuts.map((s) => s.sortOrder))
        : 0;
    id = createUiId('shortcut');
    const newSite: ShortcutSite = {
      id,
      name: site.name,
      url: site.url,
      icon: site.icon,
      sortOrder: maxSortOrder + 1,
      createdAt: Date.now(),
    };
    const nextShortcuts = [...state.browserShortcuts, newSite];
    scheduleWrite(BROWSER_SHORTCUTS_KEY, nextShortcuts);
    return { browserShortcuts: nextShortcuts };
  });
  return id;
},
```

- [ ] **Step 7: 实现 browserRenameShortcut / browserDeleteShortcut / browserReorderShortcuts**

```typescript
browserRenameShortcut: (id, name) =>
  set((state) => {
    const nextShortcuts = state.browserShortcuts.map((s) =>
      s.id === id ? { ...s, name } : s
    );
    scheduleWrite(BROWSER_SHORTCUTS_KEY, nextShortcuts);
    return { browserShortcuts: nextShortcuts };
  }),

browserDeleteShortcut: (id) =>
  set((state) => {
    const nextShortcuts = state.browserShortcuts.filter((s) => s.id !== id);
    scheduleWrite(BROWSER_SHORTCUTS_KEY, nextShortcuts);
    return { browserShortcuts: nextShortcuts };
  }),

browserReorderShortcuts: (ids) =>
  set((state) => {
    const idSet = new Set(ids);
    const remaining = state.browserShortcuts.filter((s) => idSet.has(s.id));
    const other = state.browserShortcuts.filter((s) => !idSet.has(s.id));
    const ordered = ids.map((id, idx) => {
      const site = remaining.find((s) => s.id === id)!;
      return { ...site, sortOrder: idx };
    });
    const nextShortcuts = [...ordered, ...other];
    scheduleWrite(BROWSER_SHORTCUTS_KEY, nextShortcuts);
    return { browserShortcuts: nextShortcuts };
  }),
```

- [ ] **Step 8: 实现本地端口方法**

```typescript
browserSetLocalPorts: (ports) =>
  set((state) => {
    const withSort = ports.map((p, idx) => ({ ...p, sortOrder: p.sortOrder ?? idx }));
    scheduleWrite(BROWSER_LOCAL_PORTS_KEY, withSort);
    return { browserLocalPorts: withSort };
  }),

browserAddManualPort: (port, label) => {
  let id = '';
  set((state) => {
    const maxSortOrder =
      state.browserLocalPorts.length > 0
        ? Math.max(...state.browserLocalPorts.map((p) => p.sortOrder))
        : 0;
    id = createUiId('localport');
    const newPort: LocalPort = {
      id,
      host: 'localhost',
      port,
      label,
      isAutoDiscovered: false,
      lastAliveAt: Date.now(),
      sortOrder: maxSortOrder + 1,
    };
    const nextPorts = [...state.browserLocalPorts, newPort];
    scheduleWrite(BROWSER_LOCAL_PORTS_KEY, nextPorts);
    return { browserLocalPorts: nextPorts };
  });
  return id;
},

browserDeleteLocalPort: (id) =>
  set((state) => {
    const nextPorts = state.browserLocalPorts.filter((p) => p.id !== id);
    scheduleWrite(BROWSER_LOCAL_PORTS_KEY, nextPorts);
    return { browserLocalPorts: nextPorts };
  }),

browserReorderLocalPorts: (ids) =>
  set((state) => {
    const idSet = new Set(ids);
    const remaining = state.browserLocalPorts.filter((p) => idSet.has(p.id));
    const other = state.browserLocalPorts.filter((p) => !idSet.has(p.id));
    const ordered = ids.map((id, idx) => {
      const port = remaining.find((p) => p.id === id)!;
      return { ...port, sortOrder: idx };
    });
    const nextPorts = [...ordered, ...other];
    scheduleWrite(BROWSER_LOCAL_PORTS_KEY, nextPorts);
    return { browserLocalPorts: nextPorts };
  }),

browserSetPortScanning: (scanning) => set({ browserPortScanning: scanning }),
```

- [ ] **Step 9: 实现背景配置方法**

```typescript
browserSetBgConfig: (config) => {
  scheduleWrite(BROWSER_BG_CONFIG_KEY, config);
  set({ browserBgConfig: config });
},

browserResetBgConfig: () => {
  const defaultConfig: BackgroundConfig = { mode: 'default', fit: 'cover' };
  scheduleWrite(BROWSER_BG_CONFIG_KEY, defaultConfig);
  set({ browserBgConfig: defaultConfig });
},
```

---

### Task 2: 创建 BackgroundLayer 组件（默认渐变背景）

**Files:**
- Create: `frontend/src/app/features/browser/browser-landing/BackgroundLayer.tsx`
- Create: `frontend/src/app/features/browser/browser-landing/BackgroundLayer.css`

- [ ] **Step 1: 创建 BackgroundLayer.css**

```css
.adl-browser-landing-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  transition: background var(--duration-300) var(--ease-default);
}

[data-theme='light'] .adl-browser-landing-bg--default {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

[data-theme='dark'] .adl-browser-landing-bg--default {
  background: linear-gradient(135deg, #0a0a0a 0%, #2a2a2a 50%, #121212 100%);
}

.adl-browser-landing-bg--image {
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.adl-browser-landing-bg--video {
  object-fit: cover;
  width: 100%;
  height: 100%;
}

.adl-browser-landing-bg--contain {
  background-size: contain;
}

.adl-browser-landing-bg--repeat {
  background-size: auto;
  background-repeat: repeat;
}
```

- [ ] **Step 2: 创建 BackgroundLayer.tsx**

```typescript
import type { BackgroundConfig } from '../../../stores/slices/browserSlice';
import './BackgroundLayer.css';

interface BackgroundLayerProps {
  config: BackgroundConfig;
}

export function BackgroundLayer({ config }: BackgroundLayerProps) {
  if (config.mode === 'default') {
    return <div className="adl-browser-landing-bg adl-browser-landing-bg--default" />;
  }

  if (config.mode === 'image' && config.filePath) {
    const fitClass =
      config.fit === 'contain'
        ? 'adl-browser-landing-bg--contain'
        : config.fit === 'repeat'
          ? 'adl-browser-landing-bg--repeat'
          : 'adl-browser-landing-bg--image';
    return (
      <div
        className={`adl-browser-landing-bg ${fitClass}`}
        style={{ backgroundImage: `url(${config.filePath})` }}
      />
    );
  }

  if (config.mode === 'video' && config.filePath) {
    return (
      <video
        className="adl-browser-landing-bg adl-browser-landing-bg--video"
        src={config.filePath}
        autoPlay
        loop
        muted
        playsInline
      />
    );
  }

  return <div className="adl-browser-landing-bg adl-browser-landing-bg--default" />;
}
```

---

### Task 3: 创建 ShortcutCard 组件（可拖拽、右键菜单）

**Files:**
- Create: `frontend/src/app/features/browser/browser-landing/ShortcutCard.tsx`
- (CSS included in ShortcutGrid.css)

- [ ] **Step 1: 创建 ShortcutCard.tsx**

```typescript
import { useCallback, useRef } from 'react';
import type { ShortcutSite } from '../../../stores/slices/browserSlice';

interface ShortcutCardProps {
  site: ShortcutSite;
  index: number;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  onContextMenu: (e: React.MouseEvent, site: ShortcutSite) => void;
  onClick: (site: ShortcutSite) => void;
}

export function ShortcutCard({
  site,
  index,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onContextMenu,
  onClick,
}: ShortcutCardProps) {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', site.id);
      onDragStart(e, site.id);
    },
    [site.id, onDragStart]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      onDragOver(e, site.id);
    },
    [site.id, onDragOver]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      onDrop(e, site.id);
    },
    [site.id, onDrop]
  );

  const handleClick = useCallback(() => onClick(site), [site, onClick]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenu(e, site);
    },
    [site, onContextMenu]
  );

  return (
    <div
      className={`adl-shortcut-card${isDragOver ? ' adl-shortcut-card--drag-over' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={onDragEnd}
      onDrop={handleDrop}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleClick();
      }}
    >
      <div className="adl-shortcut-card__icon">
        {site.icon ? (
          <img src={site.icon} alt="" className="adl-shortcut-card__icon-img" />
        ) : (
          <span className="adl-shortcut-card__icon-placeholder">{site.name.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <span className="adl-shortcut-card__name" title={site.name}>
        {site.name}
      </span>
    </div>
  );
}
```

---

### Task 4: 创建 ShortcutGrid 组件（快捷导航网格 + 拖拽排序 + 右键菜单）

**Files:**
- Create: `frontend/src/app/features/browser/browser-landing/ShortcutGrid.tsx`
- Create: `frontend/src/app/features/browser/browser-landing/ShortcutGrid.css`

- [ ] **Step 1: 创建 ShortcutGrid.css**

```css
.adl-shortcut-grid {
  margin-bottom: 24px;
}

.adl-shortcut-grid__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.adl-shortcut-grid__title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.adl-shortcut-grid__add-btn {
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
  background: none;
  border: none;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.adl-shortcut-grid__add-btn:hover {
  background: var(--bg-hover);
}

.adl-shortcut-grid__items {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.adl-shortcut-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 8px 12px;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  position: relative;
  transition: box-shadow var(--duration-150), transform var(--duration-150);
  user-select: none;
}

.adl-shortcut-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--border-default);
}

.adl-shortcut-card--drag-over {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.adl-shortcut-card:active {
  cursor: grabbing;
}

.adl-shortcut-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--accent-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.adl-shortcut-card__icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.adl-shortcut-card__icon-placeholder {
  font-size: 18px;
  font-weight: 600;
  color: var(--accent);
}

.adl-shortcut-card__name {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  text-align: center;
}

.adl-shortcut-card__add-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 8px 12px;
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-strong);
  cursor: pointer;
  opacity: 0.5;
  transition: opacity var(--duration-150);
}

.adl-shortcut-card__add-placeholder:hover {
  opacity: 0.8;
}

.adl-shortcut-card__add-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: var(--text-muted);
}

.adl-shortcut-card__add-text {
  font-size: 12px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: 创建 ShortcutGrid.tsx**

```typescript
import { useCallback, useState, useMemo } from 'react';
import { useAppStore } from '../../../stores/slicedStore';
import type { ShortcutSite } from '../../../stores/slices/browserSlice';
import { ShortcutCard } from './ShortcutCard';
import './ShortcutGrid.css';

interface ShortcutGridProps {
  onOpenUrl: (url: string) => void;
  onAddClick: () => void;
  onContextMenu: (e: React.MouseEvent, site: ShortcutSite) => void;
}

export function ShortcutGrid({ onOpenUrl, onAddClick, onContextMenu }: ShortcutGridProps) {
  const browserShortcuts = useAppStore((state) => state.browserShortcuts);
  const browserReorderShortcuts = useAppStore((state) => state.browserReorderShortcuts);

  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const sortedShortcuts = useMemo(
    () => [...browserShortcuts].sort((a, b) => a.sortOrder - b.sortOrder),
    [browserShortcuts]
  );

  const handleDragStart = useCallback((_e: React.DragEvent, _id: string) => {
    // 可以记录拖拽起始状态
  }, []);

  const handleDragOver = useCallback((_e: React.DragEvent, id: string) => {
    setDragOverId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (_e: React.DragEvent, targetId: string) => {
      setDragOverId(null);
      const draggedId = _e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === targetId) return;

      const ids = sortedShortcuts.map((s) => s.id);
      const fromIdx = ids.indexOf(draggedId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;

      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, draggedId);
      browserReorderShortcuts(ids);
    },
    [sortedShortcuts, browserReorderShortcuts]
  );

  const handleCardClick = useCallback(
    (site: ShortcutSite) => {
      onOpenUrl(site.url);
    },
    [onOpenUrl]
  );

  return (
    <div className="adl-shortcut-grid">
      <div className="adl-shortcut-grid__header">
        <span className="adl-shortcut-grid__title">快捷导航</span>
        <button
          type="button"
          className="adl-shortcut-grid__add-btn"
          onClick={onAddClick}
        >
          + 添加快捷站点
        </button>
      </div>
      <div className="adl-shortcut-grid__items">
        {sortedShortcuts.map((site) => (
          <ShortcutCard
            key={site.id}
            site={site}
            index={site.sortOrder}
            isDragOver={dragOverId === site.id}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            onContextMenu={onContextMenu}
            onClick={handleCardClick}
          />
        ))}
        <div
          className="adl-shortcut-card__add-placeholder"
          onClick={onAddClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAddClick();
          }}
        >
          <div className="adl-shortcut-card__add-icon">+</div>
          <span className="adl-shortcut-card__add-text">添加</span>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 5: 创建 AddShortcutDialog 和 RenameShortcutDialog

**Files:**
- Create: `frontend/src/app/features/browser/browser-landing/AddShortcutDialog.tsx`

- [ ] **Step 1: 创建 AddShortcutDialog.tsx**（包含添加快捷站点和重命名两种模式）

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface AddShortcutDialogProps {
  open: boolean;
  mode: 'add' | 'rename';
  initialName?: string;
  onConfirm: (name: string, url: string) => void;
  onCancel: () => void;
}

export function AddShortcutDialog({
  open,
  mode,
  initialName = '',
  onConfirm,
  onCancel,
}: AddShortcutDialogProps) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setUrl('');
      requestAnimationFrame(() => {
        nameRef.current?.focus();
      });
    }
  }, [open, initialName]);

  const handleConfirm = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (mode === 'add') {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) return;
      const finalUrl = /^https?:\/\//i.test(trimmedUrl)
        ? trimmedUrl
        : `https://${trimmedUrl}`;
      onConfirm(trimmedName, finalUrl);
    } else {
      onConfirm(trimmedName, '');
    }
  }, [name, url, mode, onConfirm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleConfirm();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    },
    [handleConfirm, onCancel]
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel]
  );

  if (!open) return null;

  return createPortal(
    <div className="adl-prompt-modal" onKeyDown={handleKeyDown} onClick={handleBackdrop}>
      <div className="adl-prompt-modal__panel" role="dialog" aria-modal="true" aria-label={mode === 'add' ? '添加快捷站点' : '重命名快捷站点'}>
        <div className="adl-prompt-modal__header">
          {mode === 'add' ? '添加快捷站点' : '重命名快捷站点'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 24px 16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
              站点名称
            </label>
            <input
              ref={nameRef}
              className="adl-prompt-modal__input"
              type="text"
              value={name}
              placeholder="例如：GitHub"
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </div>
          {mode === 'add' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                站点网址
              </label>
              <input
                className="adl-prompt-modal__input"
                type="text"
                value={url}
                placeholder="例如：https://github.com"
                onChange={(e) => setUrl(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm();
                }}
              />
            </div>
          )}
        </div>
        <div className="adl-prompt-modal__actions">
          <button type="button" className="adl-btn adl-btn--ghost" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary"
            onClick={handleConfirm}
            disabled={!name.trim() || (mode === 'add' && !url.trim())}
          >
            {mode === 'add' ? '添加' : '保存'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

---

### Task 6: 创建 LocalPortCard 和 LocalPortSection 组件

**Files:**
- Create: `frontend/src/app/features/browser/browser-landing/LocalPortCard.tsx`
- Create: `frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx`
- Create: `frontend/src/app/features/browser/browser-landing/LocalPortSection.css`

- [ ] **Step 1: 创建 LocalPortSection.css**

```css
.adl-local-port-section {
  margin-bottom: 24px;
}

.adl-local-port-section__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.adl-local-port-section__title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.adl-local-port-section__refresh {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 11px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  cursor: pointer;
}

.adl-local-port-section__refresh:hover {
  background: var(--bg-hover);
}

.adl-local-port-section__hint {
  font-size: 11px;
  color: var(--text-muted);
}

.adl-local-port-section__items {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.adl-local-port-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: box-shadow var(--duration-150);
  user-select: none;
}

.adl-local-port-card:hover {
  box-shadow: var(--shadow-sm);
  border-color: var(--border-default);
}

.adl-local-port-card--drag-over {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.adl-local-port-card__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
}

.adl-local-port-card__address {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.adl-local-port-card__label {
  font-size: 11px;
  color: var(--text-muted);
}

.adl-local-port-card__add-placeholder {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--radius);
  border: 2px dashed var(--border-strong);
  cursor: pointer;
  opacity: 0.4;
  transition: opacity var(--duration-150);
}

.adl-local-port-card__add-placeholder:hover {
  opacity: 0.7;
}

.adl-local-port-card__add-icon {
  font-size: 18px;
  color: var(--text-muted);
}

.adl-local-port-card__add-text {
  font-size: 12px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: 创建 LocalPortSection.tsx**

```typescript
import { useCallback, useState, useMemo } from 'react';
import { useAppStore } from '../../../stores/slicedStore';
import type { LocalPort } from '../../../stores/slices/browserSlice';
import './LocalPortSection.css';

interface LocalPortSectionProps {
  onOpenUrl: (url: string) => void;
  onAddManualPort: () => void;
}

export function LocalPortSection({ onOpenUrl, onAddManualPort }: LocalPortSectionProps) {
  const browserLocalPorts = useAppStore((state) => state.browserLocalPorts);
  const browserPortScanning = useAppStore((state) => state.browserPortScanning);
  const browserReorderLocalPorts = useAppStore((state) => state.browserReorderLocalPorts);
  const browserDeleteLocalPort = useAppStore((state) => state.browserDeleteLocalPort);
  const browserSetPortScanning = useAppStore((state) => state.browserSetPortScanning);

  const [dragOverPortId, setDragOverPortId] = useState<string | null>(null);

  const sortedPorts = useMemo(
    () => [...browserLocalPorts].sort((a, b) => a.sortOrder - b.sortOrder),
    [browserLocalPorts]
  );

  const handleRefresh = useCallback(() => {
    browserSetPortScanning(true);
    // 端口扫描逻辑由外部实现，这里仅触发状态
    setTimeout(() => {
      browserSetPortScanning(false);
    }, 3000);
  }, [browserSetPortScanning]);

  const handleDragStart = useCallback((_e: React.DragEvent, _id: string) => {}, []);

  const handleDragOver = useCallback((_e: React.DragEvent, id: string) => {
    setDragOverPortId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragOverPortId(null);
  }, []);

  const handleDrop = useCallback(
    (_e: React.DragEvent, targetId: string) => {
      setDragOverPortId(null);
      const draggedId = _e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === targetId) return;

      const ids = sortedPorts.map((p) => p.id);
      const fromIdx = ids.indexOf(draggedId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;

      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, draggedId);
      browserReorderLocalPorts(ids);
    },
    [sortedPorts, browserReorderLocalPorts]
  );

  const handlePortClick = useCallback(
    (port: LocalPort) => {
      onOpenUrl(`http://${port.host}:${port.port}`);
    },
    [onOpenUrl]
  );

  return (
    <div className="adl-local-port-section">
      <div className="adl-local-port-section__header">
        <span className="adl-local-port-section__title">本地端口</span>
        <button
          type="button"
          className="adl-local-port-section__refresh"
          onClick={handleRefresh}
          disabled={browserPortScanning}
        >
          {browserPortScanning ? '扫描中...' : '↻ 刷新'}
        </button>
        <span className="adl-local-port-section__hint">
          首次自动扫描 · 点击刷新重新扫描
        </span>
      </div>
      <div className="adl-local-port-section__items">
        {sortedPorts.map((port) => (
          <div
            key={port.id}
            className={`adl-local-port-card${dragOverPortId === port.id ? ' adl-local-port-card--drag-over' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', port.id);
              handleDragStart(e, port.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              handleDragOver(e, port.id);
            }}
            onDragEnd={handleDragEnd}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(e, port.id);
            }}
            onClick={() => handlePortClick(port)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handlePortClick(port);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              browserDeleteLocalPort(port.id);
            }}
          >
            <span className="adl-local-port-card__dot" />
            <span className="adl-local-port-card__address">
              {port.host}:{port.port}
            </span>
            {port.label && <span className="adl-local-port-card__label">{port.label}</span>}
          </div>
        ))}
        <div
          className="adl-local-port-card__add-placeholder"
          onClick={onAddManualPort}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAddManualPort();
          }}
        >
          <span className="adl-local-port-card__add-icon">+</span>
          <span className="adl-local-port-card__add-text">手动添加</span>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 7: 创建 BrowserLandingPage 主容器组件

**Files:**
- Create: `frontend/src/app/features/browser/browser-landing/BrowserLandingPage.tsx`
- Create: `frontend/src/app/features/browser/browser-landing/BrowserLandingPage.css`
- Create: `frontend/src/app/features/browser/browser-landing/index.ts`

- [ ] **Step 1: 创建 BrowserLandingPage.css**

```css
.adl-browser-landing {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.adl-browser-landing__content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 800px;
  padding: 40px;
}

.adl-browser-landing__footer {
  position: absolute;
  bottom: 24px;
  left: 0;
  right: 0;
  text-align: center;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.adl-browser-landing__footer-btn {
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  background: none;
  border: none;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.adl-browser-landing__footer-btn:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.adl-browser-landing__footer-divider {
  width: 1px;
  height: 12px;
  background: var(--border-subtle);
}
```

- [ ] **Step 2: 创建 BrowserLandingPage.tsx**

```typescript
import { useCallback, useState, useMemo } from 'react';
import { useAppStore } from '../../../stores/slicedStore';
import { BackgroundLayer } from './BackgroundLayer';
import { ShortcutGrid } from './ShortcutGrid';
import { LocalPortSection } from './LocalPortSection';
import { AddShortcutDialog } from './AddShortcutDialog';
import type { ShortcutSite } from '../../../stores/slices/browserSlice';
import { ContextMenu } from '../../../components/ContextMenu';
import './BrowserLandingPage.css';

interface BrowserLandingPageProps {
  t: Record<string, string>;
  onOpenUrl: (url: string) => void;
}

export function BrowserLandingPage({ t, onOpenUrl }: BrowserLandingPageProps) {
  const browserBgConfig = useAppStore((state) => state.browserBgConfig);
  const browserOpenTab = useAppStore((state) => state.browserOpenTab);
  const browserAddShortcut = useAppStore((state) => state.browserAddShortcut);
  const browserRenameShortcut = useAppStore((state) => state.browserRenameShortcut);
  const browserDeleteShortcut = useAppStore((state) => state.browserDeleteShortcut);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'rename'>('add');
  const [renameSite, setRenameSite] = useState<ShortcutSite | null>(null);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    site: ShortcutSite | null;
  }>({ open: false, x: 0, y: 0, site: null });

  const [bgSettingsOpen, setBgSettingsOpen] = useState(false);

  const handleOpenUrl = useCallback(
    (url: string) => {
      browserOpenTab(url, undefined, undefined);
    },
    [browserOpenTab]
  );

  const handleAddClick = useCallback(() => {
    setDialogMode('add');
    setRenameSite(null);
    setDialogOpen(true);
  }, []);

  const handleAddConfirm = useCallback(
    (name: string, url: string) => {
      if (dialogMode === 'add') {
        browserAddShortcut({ name, url });
      } else if (renameSite) {
        browserRenameShortcut(renameSite.id, name);
      }
      setDialogOpen(false);
      setRenameSite(null);
    },
    [dialogMode, renameSite, browserAddShortcut, browserRenameShortcut]
  );

  const handleAddCancel = useCallback(() => {
    setDialogOpen(false);
    setRenameSite(null);
  }, []);

  const handleShortcutContextMenu = useCallback(
    (e: React.MouseEvent, site: ShortcutSite) => {
      setContextMenu({ open: true, x: e.clientX, y: e.clientY, site });
    },
    []
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenu({ open: false, x: 0, y: 0, site: null });
  }, []);

  const handleRenameFromMenu = useCallback(() => {
    if (contextMenu.site) {
      setRenameSite(contextMenu.site);
      setDialogMode('rename');
      setDialogOpen(true);
    }
    handleContextMenuClose();
  }, [contextMenu.site, handleContextMenuClose]);

  const handleDeleteFromMenu = useCallback(() => {
    if (contextMenu.site) {
      browserDeleteShortcut(contextMenu.site.id);
    }
    handleContextMenuClose();
  }, [contextMenu.site, browserDeleteShortcut, handleContextMenuClose]);

  const contextMenuItems = useMemo(
    () => [
      {
        id: 'rename',
        label: '重命名',
        action: handleRenameFromMenu,
      },
      {
        id: 'delete',
        label: '删除',
        danger: true,
        action: handleDeleteFromMenu,
      },
    ],
    [handleRenameFromMenu, handleDeleteFromMenu]
  );

  const handleAddManualPort = useCallback(() => {
    // TODO: Phase 2 — 实现手动添加端口弹窗
  }, []);

  return (
    <div className="adl-browser-landing">
      <BackgroundLayer config={browserBgConfig} />
      <div className="adl-browser-landing__content">
        <ShortcutGrid
          onOpenUrl={handleOpenUrl}
          onAddClick={handleAddClick}
          onContextMenu={handleShortcutContextMenu}
        />
        <LocalPortSection
          onOpenUrl={handleOpenUrl}
          onAddManualPort={handleAddManualPort}
        />
      </div>
      <div className="adl-browser-landing__footer">
        <button
          type="button"
          className="adl-browser-landing__footer-btn"
          onClick={() => setBgSettingsOpen(true)}
        >
          自定义背景
        </button>
        <span className="adl-browser-landing__footer-divider" />
        <button type="button" className="adl-browser-landing__footer-btn">
          管理快捷站点
        </button>
      </div>

      <AddShortcutDialog
        open={dialogOpen}
        mode={dialogMode}
        initialName={renameSite?.name ?? ''}
        onConfirm={handleAddConfirm}
        onCancel={handleAddCancel}
      />

      {contextMenu.open && contextMenu.site && (
        <ContextMenu
          items={contextMenuItems}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={handleContextMenuClose}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: 创建 browser-landing/index.ts**

```typescript
export { BrowserLandingPage } from './BrowserLandingPage';
export { AddShortcutDialog } from './AddShortcutDialog';
export { BackgroundLayer } from './BackgroundLayer';
export { ShortcutGrid } from './ShortcutGrid';
export { ShortcutCard } from './ShortcutCard';
export { LocalPortSection } from './LocalPortSection';
```

---

### Task 8: 集成到 browserpanel.tsx 中

**Files:**
- Modify: `frontend/src/app/features/browser/browserpanel.tsx`
- Modify: `frontend/src/app/features/browser/index.ts`

- [ ] **Step 1: 在 browserpanel.tsx 中导入 BrowserLandingPage**

```typescript
// 在文件顶部 import 区域添加
import { BrowserLandingPage } from './browser-landing';
```

- [ ] **Step 2: 修改主内容区的渲染逻辑** — 将原来的条件渲染

```typescript
// browserpanel.tsx — 替换第 687-734 行的渲染逻辑
// 原有代码：
// <div className="adl-tool-primary adl-tool-primary--browser" ref={primaryRef}>
//   <div className="adl-tool-primary__scroll adl-tool-primary__scroll--browser" />
//   {hasActiveTab && activeTab?.url && activeTab?.url !== 'about:blank' ? ( ...
```

替换为：

```typescript
<div className="adl-tool-primary adl-tool-primary--browser" ref={primaryRef}>
  <div className="adl-tool-primary__scroll adl-tool-primary__scroll--browser" />

  {(!hasActiveTab || !activeTab?.url || activeTab?.url === 'about:blank') ? (
    <BrowserLandingPage
      t={t}
      onOpenUrl={(url: string) => {
        browserOpenTab(url, undefined, undefined);
      }}
    />
  ) : (
    <>
      {!isTauriShell() && activeTab && isBrowserVisible && (
        <iframe
          ref={iframeRef}
          src={activeTab.url}
          className="adl-browser-iframe"
          title={activeTab.title}
          onLoad={browserActions.handleIframeLoad}
          onError={browserActions.handleIframeError}
          sandbox="allow-scripts allow-forms allow-popups allow-modals allow-top-navigation allow-same-origin"
        />
      )}

      {!isTauriShell() && iframeLoadError && (
        <div className="adl-browser-error-container">
          <p className="adl-browser-error-text">
            该网站无法在嵌入式视图中打开，这通常是由于网站的安全策略导致的。
          </p>
        </div>
      )}

      <button
        type="button"
        className={`adl-browser-external-btn ${iframeLoadError ? 'adl-browser-external-btn--prominent' : ''}`}
        onClick={() => {
          const url = activeTab?.url ?? 'about:blank';
          if (isTauriShell()) {
            shellOpen(url).catch((err) =>
              console.error('Failed to open external browser:', err)
            );
          } else {
            const w = window as { trae?: { openExternal: (url: string) => void } };
            if (w.trae?.openExternal) {
              w.trae.openExternal(url);
            } else {
              window.open(url, '_blank', 'noopener,noreferrer');
            }
          }
        }}
      >
        {t.browserOpenExternal}
      </button>
    </>
  )}
</div>
```

注意：在新渲染逻辑中，需要确保 `browserOpenTab` 方法在 `browserPanel` 函数中可访问。检查函数体内是否已有 `const browserOpenTab = useAppStore((state) => state.browserOpenTab);` — 第 103 行已存在该引用，可直接使用。

- [ ] **Step 3: 修改 browserpanel.tsx 的 import 区域** — 在文件顶部添加浏览器壳导入（如果需要）

确保 `shellOpen` 导入存在（第 35 行已有 `import { open as shellOpen } from '@tauri-apps/plugin-shell';`）

- [ ] **Step 4: 更新 features/browser/index.ts 导出**

```typescript
// 在末尾添加
export { BrowserLandingPage } from './browser-landing';
export type { ShortcutSite, LocalPort, BackgroundConfig, BackgroundMode, BackgroundFit } from '../../stores/slices/browserSlice';
```

---

### Task 9: 创建 CSS 主题变量 + 背景渐变

**Files:**
- Modify: `frontend/src/styles/themes.css`

- [ ] **Step 1: 在 themes.css 中添加空标签引导页的背景渐变变量**（可选优化）

如果需要通过 CSS 变量控制渐变，可以添加：

```css
/* 在 light 主题区域添加 */
[data-theme='light'] {
  --banner-bg-start: #f5f7fa;
  --banner-bg-end: #c3cfe2;
}

/* 在 dark 主题区域添加 */
[data-theme='dark'] {
  --banner-bg-start: #0a0a0a;
  --banner-bg-mid: #2a2a2a;
  --banner-bg-end: #121212;
}
```

此步骤为可选优化，BackgroundLayer 当前使用直接 CSS 选择器实现。

---

## 验证清单

| 检查项 | 命令 |
|--------|------|
| 前端类型检查 | `pnpm --dir frontend run typecheck` |
| 前端测试 | `pnpm --dir frontend run test` |
| Rust 编译 | `cargo check --workspace` |
| Rust 测试 | `cargo test --workspace` |
| 浏览器模式验证 | `pnpm run dev:browser` — 打开浏览器面板，确认空状态引导页显示 |
| 双端一致性 | 分别在 Tauri 和浏览器模式下验证功能一致 |

## 未包含在当前计划中的内容（Phase 2/3）

- 端口自动扫描逻辑（Task 6 中的 `handleRefresh` 仅为占位实现）
- BackgroundSettingsDialog 自定义背景设置弹窗
- 本地存储的文件管理（图片/视频上传到应用数据目录）
- i18n 国际化 keys（当前使用中文硬编码）
