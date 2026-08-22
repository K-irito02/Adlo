# 浏览器搜索引擎支持设计文档

**日期**：2026-08-21
**状态**：已审核，待实施
**相关 Issue**：无

---

## 1. 背景与目标

当前浏览器地址栏仅支持 URL 导航。用户期望：
- 地址栏支持文本搜索（非 URL 识别为搜索词）
- 可切换默认搜索引擎（内置 8 个 + 自定义）
- 地址栏左侧显示当前引擎灰度 favicon
- 收藏按钮移入地址栏区域
- 搜索查询自动记入历史目录
- 通过工具栏 Popover 管理引擎（无设置页入口）

---

## 2. 核心设计决策

| 决策点 | 方案 |
|--------|------|
| 着陆页搜索框 | **不添加**（Approach 3：Minimalist） |
| 地址栏行为 | 统一 Omnibox：自动识别 URL vs 搜索词 |
| 引擎切换入口 | 工具栏按钮（收藏与更多操作之间）→ Popover |
| 设置页 | **无新增区块**，全在 Popover 完成 |
| 关键词快捷搜索 | Phase 1 不实现 |
| 搜索历史记录 | 搜索提交后写入 `browserAddToHistory` |

---

## 3. 数据模型

```typescript
interface SearchEngine {
  id: string;                    // UUID
  name: string;                  // 显示名
  urlTemplate: string;           // 必含 %s，如 https://www.google.com/search?q=%s
  isBuiltIn: boolean;            // 内置 vs 自定义
  isDefault: boolean;            // 当前默认（全局唯一）
  faviconUrl?: string;           // 可选，用于地址栏左侧显示
}
```

### 预置内置引擎（8 个）

| 名称 | urlTemplate | faviconUrl |
|------|-------------|------------|
| Google | `https://www.google.com/search?q=%s` | `https://www.google.com/favicon.ico` |
| Bing | `https://www.bing.com/search?q=%s` | `https://www.bing.com/favicon.ico` |
| DuckDuckGo | `https://duckduckgo.com/?q=%s` | `https://duckduckgo.com/favicon.ico` |
| Yahoo | `https://search.yahoo.com/search?p=%s` | `https://search.yahoo.com/favicon.ico` |
| 百度 | `https://www.baidu.com/s?wd=%s` | `https://www.baidu.com/favicon.ico` |
| 搜狗 | `https://www.sogou.com/web?query=%s` | `https://www.sogou.com/favicon.ico` |
| 360搜索 | `https://www.so.com/s?q=%s` | `https://www.so.com/favicon.ico` |
| 必应中国 | `https://cn.bing.com/search?q=%s` | `https://cn.bing.com/favicon.ico` |

---

## 4. UI/UX 设计

### 4.1 地址栏区域布局

```
[导航按钮组] [地址栏标签区域] [工具栏操作组]
                    ↓
         ┌─────────────────────────────────────┐
         │ [引擎favicon] [输入框] [复制] [★收藏] [+新标签] │
         └─────────────────────────────────────┘
```

- **左侧图标**：当前默认引擎 favicon，`filter: grayscale(100%)`，16×16，无交互
- **收藏按钮**：从工具栏右侧移入地址栏 label 内，位于 CopyButton 与 + 按钮之间
- **Placeholder**：`t.browserAddress` ("搜索网址或名称" / "Search URL or name")

### 4.2 工具栏新增按钮

- **位置**：收藏按钮 ★ 与 更多菜单 ☰ 之间
- **图标**：`IconSearch`（新建 SVG，见下）
- **Tooltip**：`t.browserSearchEngineSettings` ("搜索引擎设置")
- **点击**：打开 Popover 菜单

### 4.3 Popover 两层视图

**状态管理**：`SearchEnginePopover` 内部维护 `view: 'main' | 'manage'`，点击"自定义管理搜索引擎..." 切换至 `manage`，左上返回箭头或 Esc 切回 `main`。

#### 主菜单视图
```
┌────────────────────────────────────┐
│ 🔍 搜索引擎                        │
├────────────────────────────────────┤
│ 内置引擎                           │
│ ● Google                    ✓      │
│ ● Bing                             │
│ ● DuckDuckGo                       │
│ ● Yahoo                            │
│ ● 百度                             │
│ ● 搜狗                             │
│ ● 360搜索                          │
│ ● 必应中国                         │
├────────────────────────────────────┤
│ 自定义引擎                         │
│ ● MySite Search                    │
│ ● Another Engine                   │
├────────────────────────────────────┤
│ 自定义管理搜索引擎...    ────────► │
└────────────────────────────────────┘
```
- 分组标题："内置引擎" / "自定义引擎"
- 当前默认引擎右侧显示 `IconCheck` (✓)
- 点击任意引擎 → 立即设为默认、关闭 Popover、地址栏 favicon 更新

#### 自定义管理视图
```
┌────────────────────────────────────┐
│ ← 自定义管理搜索引擎                │
├────────────────────────────────────┤
│  💡 获取方法：在目标网站搜索一次，   │
│     复制结果页 URL，将查询词替换    │
│     为 %s 即得模板。如：            │
│     https://site.com/search?q=%s   │
├────────────────────────────────────┤
│ 自定义引擎列表                     │
│ ┌────────────────────────────────┐ │
│ │ ● MySite Search         [编辑] [删] │
│ └────────────────────────────────┘ │
│                                    │
│ [+ 添加搜索引擎]                   │
└────────────────────────────────────┘
```

**点击 `[+ 添加搜索引擎]` → 行内展开表单**：
```
┌────────────────────────────────────┐
│ ← 自定义管理搜索引擎                │
├────────────────────────────────────┤
│  💡 获取方法提示...                 │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │ 名称: [______________]         │ │
│ │ 地址: [______________]  (含 %s) │ │
│ │ [取消] [保存]                  │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```
- 仅两字段：名称、URL 模板（必填 `%s` 校验）
- 编辑现有项同理：行内展开、保存/取消
- 返回主菜单：点击左上 `←` 或 Esc
- **无底部"完成"按钮**

### 4.4 新增图标：`IconSearch`

文件：`frontend/src/icons/Search.tsx`
```tsx
export const IconSearch = (props: SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
    <path d="M21 21l-6 -6" />
  </svg>
);
```

---

## 5. 核心逻辑

### 5.1 URL / 搜索词识别
复用 `useBrowserPanelAddressSubmit.ts` 现有启发式，新增导出函数：

```typescript
// frontend/src/app/features/browser/browserUrlUtils.ts
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
```

### 5.2 地址栏提交流程（`useBrowserPanelAddressSubmit.ts`）

```typescript
const submitAddress = useCallback(async () => {
  const input = address.trim();
  if (!input) { /* 恢复当前 URL */ return; }

  const { searchEngines, defaultSearchEngineId } = useAppStore.getState();
  const engine = searchEngines.find(e => e.id === defaultSearchEngineId) ?? searchEngines[0];
  const finalUrl = isSearchQuery(input)
    ? buildSearchUrl(engine, input)
    : ensureProtocol(input); // 补 https://

  handleNavigationStart(finalUrl);
  setAddress(finalUrl);
  browserNavigateActiveTab(finalUrl);

  // 搜索查询写入历史
  if (isSearchQuery(input)) {
    browserAddToHistory(finalUrl, `${engine.name}: ${input}`);
  }
}, [...]);
```

**辅助函数**（同文件或 `browserUrlUtils.ts`）：
```typescript
export function ensureProtocol(input: string): string {
  const trimmed = input.trim();
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  if (/^about:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
```

### 5.3 搜索引擎 Store（新建 Slice）

文件：`frontend/src/app/stores/slices/browserSearchEnginesSlice.ts`

```typescript
interface BrowserSearchEnginesSlice {
  searchEngines: SearchEngine[];
  defaultSearchEngineId: string;

  // Actions
  initializeSearchEngines: () => void;
  setDefaultSearchEngine: (id: string) => void;
  addCustomSearchEngine: (engine: Omit<SearchEngine, 'id' | 'isBuiltIn'>) => string;
  updateCustomSearchEngine: (id: string, patch: Partial<SearchEngine>) => void;
  deleteCustomSearchEngine: (id: string) => void;
  
  // Selectors (内部使用)
  getDefaultSearchEngine: () => SearchEngine;
}
```

- 持久化：`localStorage` key `adl:browser:searchEngines`
- 初始化：若无数据，写入 8 个内置引擎，首个设为默认
- `getDefaultSearchEngine` 实现：`searchEngines.find(e => e.id === defaultSearchEngineId) ?? searchEngines[0]`

---

## 6. 文件变更清单

### 新建文件
| 文件 | 说明 |
|------|------|
| `frontend/src/icons/Search.tsx` | 搜索图标组件 |
| `frontend/src/app/features/browser/browserUrlUtils.ts` | URL/搜索识别工具函数 |
| `frontend/src/app/stores/slices/browserSearchEnginesSlice.ts` | 搜索引擎 Zustand slice |
| `frontend/src/app/features/browser/SearchEnginePopover.tsx` | Popover 组件（主菜单+管理视图） |
| `frontend/src/app/features/browser/SearchEnginePopover.css` | 样式 |

### 修改文件
| 文件 | 变更 |
|------|------|
| `frontend/src/app/features/browser/BrowserToolbar.tsx` | 左侧图标替换、收藏按钮移入、新增搜索引擎按钮、Popover 集成 |
| `frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts` | 引入 `isSearchQuery`、`buildSearchUrl`、搜索写历史 |
| `frontend/src/app/stores/slicedStore.ts` | 注入 `browserSearchEnginesSlice` |
| `frontend/src/app/i18n/zh-CN/browser.ts` | 新增 i18n key |
| `frontend/src/app/i18n/en-US/browser.ts` | 新增 i18n key |

---

## 7. i18n Key 新增

### zh-CN
```json
{
  "browserSearchEngineSettings": "搜索引擎设置",
  "browserSearchEngineManage": "自定义管理搜索引擎",
  "browserSearchEngineBuiltIn": "内置引擎",
  "browserSearchEngineCustom": "自定义引擎",
  "browserSearchEngineAdd": "添加搜索引擎",
  "browserSearchEngineEdit": "编辑",
  "browserSearchEngineDelete": "删除",
  "browserSearchEngineName": "名称",
  "browserSearchEngineUrl": "地址",
  "browserSearchEngineUrlHint": "使用 %s 作为查询词占位符",
  "browserSearchEngineGetMethod": "获取方法：在目标网站搜索一次，复制结果页 URL，将查询词替换为 %s 即得模板。",
  "browserSearchEngineCancel": "取消",
  "browserSearchEngineSave": "保存",
  "browserSearchEngineUrlRequired": "请输入包含 %s 的搜索地址"
}
```

### en-US
```json
{
  "browserSearchEngineSettings": "Search Engine Settings",
  "browserSearchEngineManage": "Manage Custom Search Engines",
  "browserSearchEngineBuiltIn": "Built-in Engines",
  "browserSearchEngineCustom": "Custom Engines",
  "browserSearchEngineAdd": "Add Search Engine",
  "browserSearchEngineEdit": "Edit",
  "browserSearchEngineDelete": "Delete",
  "browserSearchEngineName": "Name",
  "browserSearchEngineUrl": "URL Template",
  "browserSearchEngineUrlHint": "Use %s as query placeholder",
  "browserSearchEngineGetMethod": "Get method: Search once on the target site, copy the result URL, replace the query with %s.",
  "browserSearchEngineCancel": "Cancel",
  "browserSearchEngineSave": "Save",
  "browserSearchEngineUrlRequired": "Please enter a search URL containing %s"
}
```

---

## 8. 测试要点

| 场景 | 预期 |
|------|------|
| 地址栏输入 "React hooks" 回车 | 使用默认引擎搜索，跳转结果页，历史记录新增 |
| 地址栏输入 "https://github.com" 回车 | 正常导航，不触发搜索 |
| 点击工具栏搜索引擎按钮 | 打开 Popover，显示分组、当前默认打勾 |
| 点击 Popover 中 Bing | 默认切换为 Bing，地址栏左侧 favicon 更新为 Bing 灰度图标 |
| 点击"自定义管理搜索引擎" | 进入管理视图，仅显示自定义列表、获取方法提示 |
| 点击"+ 添加"，填名称/地址保存 | 新引擎出现在自定义列表，可设为默认 |
| 编辑/删除自定义引擎 | 生效，内置引擎不可删改 |
| 切换默认引擎后新建标筘搜索 | 使用新默认引擎 |
| 双端一致性 | Tauri / 浏览器模式行为一致 |

---

## 9. 实施顺序建议

1. **新建 Slice + 图标 + 工具函数**（基础设施）
2. **修改 `useBrowserPanelAddressSubmit`**（核心搜索逻辑）
3. **修改 `BrowserToolbar`**（UI 布局、Popover 集成）
4. **实现 `SearchEnginePopover` 组件**（两层视图、表单）
5. **i18n 补充、样式调整**
6. **端到端测试、双端验证**

---

## 10. 风险与对策

| 风险 | 对策 |
|------|------|
| Favicon 加载失败/跨域 | 兜底用通用搜索图标（`IconSearch`）；`faviconUrl` 可选，加载失败时 `onError` 替换为通用图标 |
| URL 识别误判 | 单测覆盖常见情况；可后期微调启发式 |
| Popover 定位异常 | 复用现有 `ContextMenu` 定位逻辑 |
| 双端历史写入不一致 | 统一走 `browserAddToHistory` action |

---