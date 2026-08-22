# 浏览器搜索引擎支持 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在地址栏实现搜索引擎集成——自动识别 URL vs 搜索词、支持切换默认引擎、自定义引擎管理、搜索历史记录。

**Architecture:** 新建 Zustand slice 管理搜索引擎配置，新建工具函数处理 URL/搜索词识别，修改 BrowserToolbar 实现地址栏 UI 变更（灰度 favicon + 收藏按钮移入 + 搜索引擎按钮），新建 SearchEnginePopover 组件实现两层视图交互。

**Tech Stack:** React 19 + Zustand + TypeScript + CSS custom properties

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `frontend/src/icons/Search.tsx` | 新建：搜索图标 SVG 组件 |
| `frontend/src/app/stores/slices/browserSearchEnginesSlice.ts` | 新建：搜索引擎 Zustand slice（数据模型、CRUD、默认引擎） |
| `frontend/src/app/features/browser/browserUrlUtils.ts` | 新建：URL/搜索词识别 + 搜索 URL 构建工具函数 |
| `frontend/src/app/features/browser/SearchEnginePopover.tsx` | 新建：Popover 两层视图组件（主菜单 + 自定义管理） |
| `frontend/src/app/features/browser/SearchEnginePopover.css` | 新建：Popover 样式 |
| `frontend/src/app/features/browser/BrowserToolbar.tsx` | 修改：左侧图标替换、收藏按钮移入、新增搜索引擎按钮 |
| `frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts` | 修改：引入搜索词识别、搜索 URL 构建、搜索写历史 |
| `frontend/src/app/stores/slicedStore.ts` | 修改：注入 browserSearchEnginesSlice |
| `frontend/src/app/i18n/zh-CN/browser.ts` | 修改：新增 i18n key |
| `frontend/src/app/i18n/en-US/browser.ts` | 修改：新增 i18n key |

---

## Global Constraints

- TypeScript strict mode
- CSS 使用自定义属性 `var(--...)`
- 图标使用 SVG，继承 `currentColor`
- 所有 UI 文本使用 i18n key
- 双端一致性（Tauri + 浏览器模式）
- 测试框架：Vitest + React Testing Library
- ESLint + Prettier 格式化

---

## 实施任务

---

### Task 1: 新建搜索图标 `IconSearch`

**Files:**
- Create: `frontend/src/icons/Search.tsx`

**Interfaces:**
- Consumes: 无
- Produces: `IconSearch` 组件

- [ ] **Step 1: 创建图标文件**

```tsx
// frontend/src/icons/Search.tsx
import type { SVGProps } from 'react';

export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
      <path d="M21 21l-6 -6" />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/icons/Search.tsx
git commit -m "feat(icons): add search engine icon (IconSearch)"
```

---

### Task 2: 新建浏览器搜索引擎 i18n key

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/browser.ts`
- Modify: `frontend/src/app/i18n/en-US/browser.ts`

**Interfaces:**
- Consumes: 无
- Produces: 15 个新 i18n key

- [ ] **Step 1: 添加中文 key**（在 `browserZh` 对象末尾 `resizeLabel` 之后）

```typescript
  // 搜索引擎
  browserSearchEngineSettings: '搜索引擎设置',
  browserSearchEngineManage: '自定义管理搜索引擎',
  browserSearchEngineBuiltIn: '内置引擎',
  browserSearchEngineCustom: '自定义引擎',
  browserSearchEngineAdd: '添加搜索引擎',
  browserSearchEngineEdit: '编辑',
  browserSearchEngineDelete: '删除',
  browserSearchEngineName: '名称',
  browserSearchEngineUrl: '地址',
  browserSearchEngineUrlHint: '使用 %s 作为查询词占位符',
  browserSearchEngineGetMethod: '获取方法：在目标网站搜索一次，复制结果页 URL，将查询词替换为 %s 即得模板。',
  browserSearchEngineCancel: '取消',
  browserSearchEngineSave: '保存',
  browserSearchEngineUrlRequired: '请输入包含 %s 的搜索地址',
  browserSearchEngineAddTitle: '添加自定义搜索引擎',
```

- [ ] **Step 2: 添加英文 key**（在 `browserEn` 对象末尾 `resizeLabel` 之后）

```typescript
  // Search Engines
  browserSearchEngineSettings: 'Search Engine Settings',
  browserSearchEngineManage: 'Manage Custom Search Engines',
  browserSearchEngineBuiltIn: 'Built-in Engines',
  browserSearchEngineCustom: 'Custom Engines',
  browserSearchEngineAdd: 'Add Search Engine',
  browserSearchEngineEdit: 'Edit',
  browserSearchEngineDelete: 'Delete',
  browserSearchEngineName: 'Name',
  browserSearchEngineUrl: 'URL Template',
  browserSearchEngineUrlHint: 'Use %s as query placeholder',
  browserSearchEngineGetMethod: 'Get method: Search once on the target site, copy the result URL, replace the query with %s.',
  browserSearchEngineCancel: 'Cancel',
  browserSearchEngineSave: 'Save',
  browserSearchEngineUrlRequired: 'Please enter a search URL containing %s',
  browserSearchEngineAddTitle: 'Add Custom Search Engine',
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/i18n/zh-CN/browser.ts frontend/src/app/i18n/en-US/browser.ts
git commit -m "feat(i18n): add search engine localization keys (zh-CN, en-US)"
```

---

### Task 3: 新建搜索引擎 URL/搜索词识别工具函数

**Files:**
- Create: `frontend/src/app/features/browser/browserUrlUtils.ts`
- Create: `frontend/src/app/features/browser/browserUrlUtils.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `isSearchQuery(input: string): boolean`, `buildSearchUrl(engine, query): string`, `ensureProtocol(input): string`

- [ ] **Step 1: 编写测试**

```typescript
// frontend/src/app/features/browser/browserUrlUtils.test.ts
import { describe, it, expect } from 'vitest';
import { isSearchQuery, buildSearchUrl, ensureProtocol } from './browserUrlUtils';
import type { SearchEngine } from '@stores/slices/browserSearchEnginesSlice';

describe('isSearchQuery', () => {
  it('returns false for URLs with protocol', () => {
    expect(isSearchQuery('https://github.com')).toBe(false);
    expect(isSearchQuery('http://example.com')).toBe(false);
  });
  it('returns false for about: URLs', () => {
    expect(isSearchQuery('about:blank')).toBe(false);
  });
  it('returns false for IP addresses', () => {
    expect(isSearchQuery('192.168.1.1')).toBe(false);
  });
  it('returns false for localhost', () => {
    expect(isSearchQuery('localhost:3000')).toBe(false);
  });
  it('returns true for strings with spaces', () => {
    expect(isSearchQuery('react hooks')).toBe(true);
  });
  it('returns true for Chinese text', () => {
    expect(isSearchQuery('你好世界')).toBe(true);
  });
  it('returns true for strings without dots', () => {
    expect(isSearchQuery('github')).toBe(true);
  });
});

describe('buildSearchUrl', () => {
  const googleEngine: SearchEngine = {
    id: 'google', name: 'Google', urlTemplate: 'https://www.google.com/search?q=%s',
    isBuiltIn: true, isDefault: true,
  };
  it('replaces %s with encoded query', () => {
    expect(buildSearchUrl(googleEngine, 'react hooks')).toBe('https://www.google.com/search?q=react%20hooks');
  });
  it('encodes Chinese characters', () => {
    expect(buildSearchUrl(googleEngine, '你好')).toBe('https://www.google.com/search?q=%E4%BD%A0%E5%A5%BD');
  });
});

describe('ensureProtocol', () => {
  it('preserves existing protocol', () => {
    expect(ensureProtocol('https://github.com')).toBe('https://github.com');
  });
  it('preserves about: URLs', () => {
    expect(ensureProtocol('about:blank')).toBe('about:blank');
  });
  it('adds https:// to bare domains', () => {
    expect(ensureProtocol('github.com')).toBe('https://github.com');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run browserUrlUtils.test.ts
```

- [ ] **Step 3: 实现工具函数**

```typescript
// frontend/src/app/features/browser/browserUrlUtils.ts
import type { SearchEngine } from '@stores/slices/browserSearchEnginesSlice';

export function isSearchQuery(input: string): boolean {
  const trimmed = input.trim();
  if (/^[a-z]+:\/\//i.test(trimmed)) return false;
  if (/^about:/i.test(trimmed)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) return false;
  if (/^localhost(:\d+)?/.test(trimmed)) return false;
  if (/\s/.test(trimmed)) return true;
  if (/[\u4e00-\u9fff]/.test(trimmed)) return true;
  if (!/\./.test(trimmed)) return true;
  return false;
}

export function buildSearchUrl(engine: SearchEngine, query: string): string {
  return engine.urlTemplate.replace('%s', encodeURIComponent(query));
}

export function ensureProtocol(input: string): string {
  const trimmed = input.trim();
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  if (/^about:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run browserUrlUtils.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/browser/browserUrlUtils.ts frontend/src/app/features/browser/browserUrlUtils.test.ts
git commit -m "feat(browser): add URL/search query detection utilities with tests"
```

---

### Task 4: 新建搜索引擎 Zustand slice

**Files:**
- Create: `frontend/src/app/stores/slices/browserSearchEnginesSlice.ts`
- Create: `frontend/src/app/stores/slices/__tests__/browserSearchEnginesSlice.test.ts`
- Modify: `frontend/src/app/stores/slicedStore.ts`（注入 slice）
- Modify: `frontend/src/app/stores/StoreState.ts`（添加类型）

**Interfaces:**
- Consumes: 无
- Produces: `searchEngines`, `defaultSearchEngineId`, `initializeSearchEngines`, `setDefaultSearchEngine`, `addCustomSearchEngine`, `updateCustomSearchEngine`, `deleteCustomSearchEngine`, `getDefaultSearchEngine`

- [ ] **Step 1: 编写测试**

```typescript
// frontend/src/app/stores/slices/__tests__/browserSearchEnginesSlice.test.ts
import { describe, it, expect } from 'vitest';
import { createBrowserSearchEnginesSlice } from '../browserSearchEnginesSlice';
import type { SearchEngine } from '../browserSearchEnginesSlice';

function createTestStore() {
  const state: Record<string, unknown> = {};
  const set = (partial: Record<string, unknown> | ((s: Record<string, unknown>) => Record<string, unknown>)) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    Object.assign(state, patch);
  };
  const get = () => state;
  const slice = createBrowserSearchEnginesSlice(set, get);
  return { state, slice };
}

describe('browserSearchEnginesSlice', () => {
  it('initializes with 8 built-in engines', () => {
    const { slice } = createTestStore();
    slice.initializeSearchEngines();
    const engines = (slice as unknown as { searchEngines: SearchEngine[] }).searchEngines;
    expect(engines).toHaveLength(8);
    expect(engines.every((e) => e.isBuiltIn)).toBe(true);
  });

  it('sets first engine as default on init', () => {
    const { slice } = createTestStore();
    slice.initializeSearchEngines();
    const engines = (slice as unknown as { searchEngines: SearchEngine[] }).searchEngines;
    expect(engines[0].isDefault).toBe(true);
  });

  it('can set default engine', () => {
    const { slice } = createTestStore();
    slice.initializeSearchEngines();
    slice.setDefaultSearchEngine('bing');
    const engines = (slice as unknown as { searchEngines: SearchEngine[] }).searchEngines;
    const bing = engines.find((e) => e.id === 'bing');
    expect(bing?.isDefault).toBe(true);
    expect(engines[0].isDefault).toBe(false);
  });

  it('can add custom engine', () => {
    const { slice } = createTestStore();
    slice.initializeSearchEngines();
    slice.addCustomSearchEngine({ name: 'My Engine', urlTemplate: 'https://myengine.com/search?q=%s', isDefault: false });
    const engines = (slice as unknown as { searchEngines: SearchEngine[] }).searchEngines;
    expect(engines).toHaveLength(9);
    expect(engines[8].name).toBe('My Engine');
    expect(engines[8].isBuiltIn).toBe(false);
  });

  it('can delete custom engine', () => {
    const { slice } = createTestStore();
    slice.initializeSearchEngines();
    slice.addCustomSearchEngine({ name: 'My Engine', urlTemplate: 'https://myengine.com/search?q=%s', isDefault: false });
    const engines = (slice as unknown as { searchEngines: SearchEngine[] }).searchEngines;
    const customId = engines[8].id;
    slice.deleteCustomSearchEngine(customId);
    const updated = (slice as unknown as { searchEngines: SearchEngine[] }).searchEngines;
    expect(updated).toHaveLength(8);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run browserSearchEnginesSlice.test.ts
```

- [ ] **Step 3: 实现 slice**

```typescript
// frontend/src/app/stores/slices/browserSearchEnginesSlice.ts
import type { StoreState } from '../StoreState';
import { makePersistedWriter } from '../shared';

export interface SearchEngine {
  id: string;
  name: string;
  urlTemplate: string;
  isBuiltIn: boolean;
  isDefault: boolean;
  faviconUrl?: string;
}

const BUILT_IN_ENGINES: Omit<SearchEngine, 'id'>[] = [
  { name: 'Google', urlTemplate: 'https://www.google.com/search?q=%s', isBuiltIn: true, isDefault: true, faviconUrl: 'https://www.google.com/favicon.ico' },
  { name: 'Bing', urlTemplate: 'https://www.bing.com/search?q=%s', isBuiltIn: true, isDefault: false, faviconUrl: 'https://www.bing.com/favicon.ico' },
  { name: 'DuckDuckGo', urlTemplate: 'https://duckduckgo.com/?q=%s', isBuiltIn: true, isDefault: false, faviconUrl: 'https://duckduckgo.com/favicon.ico' },
  { name: 'Yahoo', urlTemplate: 'https://search.yahoo.com/search?p=%s', isBuiltIn: true, isDefault: false, faviconUrl: 'https://search.yahoo.com/favicon.ico' },
  { name: '百度', urlTemplate: 'https://www.baidu.com/s?wd=%s', isBuiltIn: true, isDefault: false, faviconUrl: 'https://www.baidu.com/favicon.ico' },
  { name: '搜狗', urlTemplate: 'https://www.sogou.com/web?query=%s', isBuiltIn: true, isDefault: false, faviconUrl: 'https://www.sogou.com/favicon.ico' },
  { name: '360搜索', urlTemplate: 'https://www.so.com/s?q=%s', isBuiltIn: true, isDefault: false, faviconUrl: 'https://www.so.com/favicon.ico' },
  { name: '必应中国', urlTemplate: 'https://cn.bing.com/search?q=%s', isBuiltIn: true, isDefault: false, faviconUrl: 'https://cn.bing.com/favicon.ico' },
];

const writeSearchEngines = makePersistedWriter('adl:browser:searchEngines');

export interface BrowserSearchEnginesSlice {
  searchEngines: SearchEngine[];
  defaultSearchEngineId: string;
  initializeSearchEngines: () => void;
  setDefaultSearchEngine: (id: string) => void;
  addCustomSearchEngine: (engine: Omit<SearchEngine, 'id' | 'isBuiltIn'>) => string;
  updateCustomSearchEngine: (id: string, patch: Partial<SearchEngine>) => void;
  deleteCustomSearchEngine: (id: string) => void;
  getDefaultSearchEngine: () => SearchEngine;
}

export const createBrowserSearchEnginesSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): BrowserSearchEnginesSlice => ({
  searchEngines: [],
  defaultSearchEngineId: '',

  initializeSearchEngines: () => {
    const existing = get().searchEngines;
    if (existing.length > 0) return;
    const engines: SearchEngine[] = BUILT_IN_ENGINES.map((e, idx) => ({
      ...e,
      id: e.name.toLowerCase().replace(/\s+/g, '-'),
      isDefault: idx === 0,
    }));
    writeSearchEngines(engines);
    set({ searchEngines: engines, defaultSearchEngineId: engines[0].id });
  },

  setDefaultSearchEngine: (id) =>
    set((state) => {
      const next = state.searchEngines.map((e) => ({ ...e, isDefault: e.id === id }));
      writeSearchEngines(next);
      return { searchEngines: next, defaultSearchEngineId: id };
    }),

  addCustomSearchEngine: (engine) => {
    let id = '';
    set((state) => {
      id = `custom-${Date.now()}`;
      const newEngine: SearchEngine = { id, name: engine.name, urlTemplate: engine.urlTemplate, isBuiltIn: false, isDefault: false, faviconUrl: engine.faviconUrl };
      const next = [...state.searchEngines, newEngine];
      writeSearchEngines(next);
      return { searchEngines: next };
    });
    return id;
  },

  updateCustomSearchEngine: (id, patch) =>
    set((state) => {
      const next = state.searchEngines.map((e) => (e.id === id ? { ...e, ...patch } : e));
      writeSearchEngines(next);
      return { searchEngines: next };
    }),

  deleteCustomSearchEngine: (id) =>
    set((state) => {
      const next = state.searchEngines.filter((e) => e.id !== id);
      writeSearchEngines(next);
      return { searchEngines: next };
    }),

  getDefaultSearchEngine: () => {
    const state = get();
    return state.searchEngines.find((e) => e.id === state.defaultSearchEngineId) ?? state.searchEngines[0];
  },
});
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run browserSearchEnginesSlice.test.ts
```

- [ ] **Step 5: 注入 slice 到 StoreState 和 slicedStore**

按现有 slice 注入模式，在 `StoreState.ts` 和 `slicedStore.ts` 中添加 `browserSearchEnginesSlice`。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/stores/slices/browserSearchEnginesSlice.ts \
  frontend/src/app/stores/slices/__tests__/browserSearchEnginesSlice.test.ts \
  frontend/src/app/stores/slicedStore.ts \
  frontend/src/app/stores/StoreState.ts
git commit -m "feat(stores): add browserSearchEnginesSlice with CRUD and persistence"
```

---

### Task 5: 修改地址栏提交逻辑 — 引入搜索词识别

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts`

**Interfaces:**
- Consumes: `isSearchQuery`, `buildSearchUrl`, `ensureProtocol` from Task 3
- Produces: `submitAddress` 行为变更（搜索词 → 构建搜索 URL + 写历史）

- [ ] **Step 1: 修改 `useBrowserPanelAddressSubmit.ts`**

在文件顶部添加导入：

```typescript
import { isSearchQuery, buildSearchUrl, ensureProtocol } from './browserUrlUtils';
```

在 `submitAddress` 回调内，替换 URL 构建逻辑：

```typescript
const submitAddress = useCallback(async () => {
  const input = address.trim();
  if (!input) {
    const state = useAppStore.getState();
    const activeTab = state.browserTabs.find((t) => t.id === state.browserActiveTabId);
    const currentUrl = activeTab?.url ?? '';
    addressSubmittedForTabRef.current = currentUrl || 'about:blank';
    setAddress(currentUrl === 'about:blank' ? '' : currentUrl);
    return;
  }

  addressSubmittedForTabRef.current = '';

  const { searchEngines, defaultSearchEngineId } = useAppStore.getState();
  const engine = searchEngines.find((e) => e.id === defaultSearchEngineId) ?? searchEngines[0];
  const finalUrl = isSearchQuery(input) ? buildSearchUrl(engine, input) : ensureProtocol(input);

  // ... 保留现有 checkEmbed / navigateBrowser 逻辑 ...

  handleNavigationStart(finalUrl);
  setAddress(finalUrl);
  if (useAppStore.getState().isTauri) {
    browserNavigateActiveTab(finalUrl, undefined);
  }

  // 搜索查询写入历史
  if (isSearchQuery(input) && engine) {
    useAppStore.getState().browserAddToHistory(finalUrl, `${engine.name}: ${input}`);
  }

  // ... 保留现有 pageMetaClient 逻辑 ...
}, [...]);
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts
git commit -m "feat(browser): integrate search query detection into address bar submit"
```

---

### Task 6: 新建 SearchEnginePopover 组件

**Files:**
- Create: `frontend/src/app/features/browser/SearchEnginePopover.tsx`
- Create: `frontend/src/app/features/browser/SearchEnginePopover.css`

**Interfaces:**
- Consumes: `searchEngines`, `defaultSearchEngineId`, `setDefaultSearchEngine`, `addCustomSearchEngine`, `updateCustomSearchEngine`, `deleteCustomSearchEngine` from Task 4
- Produces: `SearchEnginePopover` 组件

- [ ] **Step 1: 创建主菜单视图**（内置引擎 + 自定义引擎分组，点击切换默认，底部"自定义管理搜索引擎..."入口）

- [ ] **Step 2: 创建自定义管理视图**（← 返回、获取方法提示、自定义列表 + 编辑/删除、行内添加表单含名称/地址/取消/保存）

- [ ] **Step 3: 创建样式文件**（`SearchEnginePopover.css`，复用 `ContextMenu` 定位逻辑）

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/browser/SearchEnginePopover.tsx frontend/src/app/features/browser/SearchEnginePopover.css
git commit -m "feat(browser): add SearchEnginePopover with two-layer view"
```

---

### Task 7: 修改 BrowserToolbar — 集成搜索引擎 UI

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserToolbar.tsx`

**Interfaces:**
- Consumes: `IconSearch` from Task 1, `SearchEnginePopover` from Task 6, `searchEngines`/`defaultSearchEngineId` from Task 4
- Produces: 地址栏 UI 变更完成

- [ ] **Step 1: 左侧图标替换** — `<IconLink />` → 当前默认引擎 `<img src={faviconUrl} className="adl-toolbar__search-engine-icon" />`，灰度 `filter: grayscale(100%)`，加载失败 fallback 为 `<IconSearch />`

- [ ] **Step 2: 收藏按钮移入地址栏 label 内** — 将 `TooltipSimple isBookmarked` 从右侧工具组移入 `adl-tool-search` label 内，置于 `CopyButton` 与 `+按钮` 之间

- [ ] **Step 3: 新增搜索引擎按钮** — 收藏按钮与更多菜单之间插入 `IconSearch` 按钮，点击打开 `SearchEnginePopover`

- [ ] **Step 4: 样式调整** — 灰度 favicon 样式 `.adl-toolbar__search-engine-icon`，工具栏按钮间距微调

- [ ] **Step 5: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/browser/BrowserToolbar.tsx
git commit -m "feat(browser): update BrowserToolbar with search engine icon, move bookmark into address bar"
```

---

### Task 8: 端到端验证 + 双端测试

**Files:**
- 全量 lint + typecheck + 现有测试回归

**Interfaces:**
- Consumes: 所有前置 Task
- Produces: 通过全部质量门禁

- [ ] **Step 1: 全量 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 2: ESLint 检查**

```bash
cd frontend && npx eslint . --max-warnings=0
```

- [ ] **Step 3: 运行现有测试**

```bash
cd frontend && npx vitest run
```

- [ ] **Step 4: 新功能手动验证**（浏览器模式）

1. 新建标签页 → 地址栏左侧显示灰度 Google favicon
2. 输入 "React hooks" → 自动搜索，历史记录新增
3. 输入 "https://github.com" → 正常导航
4. 点击搜索引擎按钮 → Popover 显示分组
5. 点击 Bing → 地址栏 favicon 切换
6. 点击"自定义管理搜索引擎" → 进入管理视图
7. 添加/编辑/删除自定义引擎 → 生效
8. 历史目录下可看到搜索记录

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "feat(browser): complete search engine integration with tests and i18n"
```
