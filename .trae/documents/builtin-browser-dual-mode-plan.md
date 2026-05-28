# 内置浏览器双模式实现方案

## 摘要
基于**方案 A（双模式 + `<iframe>` 降级）**，实现内置/外部浏览器的完整功能。Tauri 桌面模式使用现有 Rust `BrowserManager` + IPC 路径，浏览器预览模式使用 `<iframe>` 降级渲染，两种模式共享同一个 `BrowserPanel` UI 壳层。

## 当前状态分析

| 模块 | 状态 |
|------|------|
| Rust `adl-browser` crate | ✅ 完整（8 个方法 + 事件回调） |
| Tauri Commands 注册 | ✅ 已注册（8 个命令在 main.rs） |
| `BrowserPanel.tsx` UI 壳层 | ✅ 完整（地址栏、导航按钮、书签、历史、标签、搜索） |
| Zustand 浏览器状态 | ✅ 完善（tabs、bookmarks、history 通过 localStorage 持久化） |
| CSS 样式 | ✅ 完整（219 行） |
| `safeInvoke`/`tryListen` 模式 | ⚠️ 直接调用 Tauri API，不符合项目桥接模式 |
| `DigitalLifeBridge` | ❌ 缺少 `BrowserBridge` 子接口 |
| Tauri Bridge 浏览器方法 | ❌ 未实现 |
| Preview Bridge 浏览器方法 | ❌ 未实现 |
| Mock Bridge 浏览器方法 | ❌ 未实现 |
| 浏览器模式 `<iframe>` 渲染 | ❌ 完全缺失 |

## 修改方案

### Step 1: 在 `DigitalLifeBridge` 中新增 `BrowserBridge` 子接口

**文件**: `frontend/src/shared/ipc.ts`

在 `RunActivityBridge` 之后、`DigitalLifeBridge` 之前新增：

```typescript
export interface BrowserBridge {
  navigate: (url: string) => Promise<void>;
  goBack: () => Promise<boolean>;
  goForward: () => Promise<boolean>;
  reload: () => Promise<void>;
  onUrlChanged: (listener: (url: string) => void) => () => void;
}
```

在 `DigitalLifeBridge` 主接口中新增 `browser: BrowserBridge` 字段。

为什么只暴露 5 个方法？
- `create`/`destroy`/`set_bounds` 是 Tauri 特有的 WebView 管理操作，浏览器模式不需要
- `eval` 是 AI 联动预留，暂不纳入桥接接口
- `onUrlChanged` 替代 `tryListen("digital-life://browser-url-changed")`，抽象掉 Tauri 事件通道

### Step 2: 实现 Tauri Bridge 浏览器方法

**文件**: `frontend/src/tauri-bridge.ts`

在 `createTauriBridge()` 返回对象中新增 `browser` 字段：
- `navigate(url)` → `invokeIpc("browser_navigate", { url })`
- `goBack()` → `invokeIpc("browser_go_back")`
- `goForward()` → `invokeIpc("browser_go_forward")`
- `reload()` → `invokeIpc("browser_reload")`
- `onUrlChanged(listener)` → subscribe 到 `digital-life://browser-url-changed` 事件通道

WebView 创建/销毁/边界同步仍然在 BrowserPanel 中通过 `safeInvoke` 直接调用，因为这些是 Tauri 特有操作，不属于 `BrowserBridge` 的跨模式抽象。

### Step 3: 实现 Preview Bridge 浏览器方法

**文件**: `frontend/src/preview-bridge/index.ts`

在 `previewBridge` 返回对象中新增 `browser` 字段：
- `navigate(url)` → 返回 `Promise.resolve()`（无操作，iframe 模式由前端直接控制）
- `goBack()` → 返回 `Promise.resolve(true)`
- `goForward()` → 返回 `Promise.resolve(true)`
- `reload()` → 返回 `Promise.resolve()`
- `onUrlChanged(listener)` → 返回空函数（iframe 模式下 URL 由前端直接设置）

### Step 4: 实现 Mock Bridge 浏览器方法

**文件**: `frontend/src/mock-bridge.ts`

在 `mockDigitalLifeBridge` 中新增 `browser` 字段，方法与 Preview Bridge 相同（no-op 实现）。

### Step 5: 重构 BrowserPanel.tsx — 核心修改

**文件**: `frontend/src/app/regions/right-panel/panels/BrowserPanel.tsx`

#### 5.1 移除旧的 `safeInvoke`/`tryListen` 模式
- 删除 `safeInvoke()` 和 `tryListen()` 辅助函数
- 删除 `UnlistenFn` 的类型导入
- 删除 `isTauriShell` 导入
- 改为通过 `window.digitalLife.browser.*` 调用

#### 5.2 新增状态和引用
- `const [iframeHistory, setIframeHistory] = useState<{ index: number; entries: string[] }>({ index: -1, entries: [] })` — 浏览器模式的历史栈
- `const iframeRef = useRef<HTMLIFrameElement | null>(null)` — iframe 元素引用

#### 5.3 新增 `<iframe>` 渲染
在 `.adl-tool-primary--browser` 内容区域中，根据模式条件渲染：
- **Tauri 模式**：保持现有的空 div（WebView 覆盖其上）
- **浏览器模式**：渲染 `<iframe>`，设置 `src` 为当前活跃标签页 URL

渲染逻辑：
```tsx
{!isTauriShell() && activeTab ? (
  <iframe
    ref={iframeRef}
    src={activeTab.url}
    className="adl-browser-iframe"
    title={activeTab.title}
    sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
  />
) : null}
```

#### 5.4 导航实现（浏览器模式）
- **地址栏提交**（`submitAddress`）：
  - 在 `browserNavigateActiveTab` 更新 store 后，记录 iframe 历史栈（push URL）
  - 设置 `iframeRef.current.src = url`
  - **Tauri 模式**：保持 `window.digitalLife.browser.navigate(url)`

- **后退按钮**（浏览器模式）：
  - 从 iframe 历史栈中取出上一个 URL
  - 设置 `iframeRef.current.src = previousUrl`
  - **Tauri 模式**：调用 `window.digitalLife.browser.goBack()`

- **前进按钮**（浏览器模式）：
  - 从 iframe 历史栈中取出下一个 URL
  - 设置 `iframeRef.current.src = nextUrl`
  - **Tauri 模式**：调用 `window.digitalLife.browser.goForward()`

- **刷新按钮**：
  - 浏览器模式：`iframeRef.current?.contentWindow?.location.reload()`
  - Tauri 模式：`window.digitalLife.browser.reload()`

#### 5.5 WebView 生命周期（Tauri 模式）
- `useEffect` on mount：调用 `safeInvoke("browser_create", ...)` 
- `useEffect` on unmount：调用 `safeInvoke("browser_destroy")`
- `useEffect` with ResizeObserver：调用 `safeInvoke("browser_set_bounds", ...)`
- 通过 `window.digitalLife.browser.onUrlChanged()` 监听 URL 变化

浏览器模式不需要 WebView 创建/销毁/边界同步。

#### 5.6 简化 `BrowserPanelProps`
移除之前的 `browserWebViewAvailable` 属性，因为现在两种模式都支持浏览器。

### Step 6: 更新 CSS

**文件**: `frontend/src/styles/regions/rightpanel/browser-panel.css`

新增 `.adl-browser-iframe` 样式：
```css
.adl-browser-iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}
```

同时更新 `.adl-tool-primary--browser` 为 `position: relative`，确保 iframe 的绝对定位相对于内容区域。

### Step 7: 清理 Prop 类型

**文件**: `frontend/src/app/regions/right-panel/types.ts`
**文件**: `frontend/src/app/regions/right-panel/hooks/useBrowserPanelProps.ts`
**文件**: `frontend/src/app/regions/right-panel/hooks/useRightPanelViewProps.ts`

- 从 `RightPanelViewProps` 移除 `browserWebViewAvailable`
- 恢复 `BrowserPanelProps` 为 `Pick<RightPanelViewProps, "t">`（因为不再需要传递特殊 props）
- 更新对应 hooks

## 触碰文件清单

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `frontend/src/shared/ipc.ts` | 编辑 | 新增 `BrowserBridge` 接口 + 挂载到 `DigitalLifeBridge` |
| 2 | `frontend/src/tauri-bridge.ts` | 编辑 | 实现 `browser.*` 桥接方法 |
| 3 | `frontend/src/preview-bridge/index.ts` | 编辑 | 实现 `browser.*` no-op 桥接方法 |
| 4 | `frontend/src/mock-bridge.ts` | 编辑 | 实现 `browser.*` no-op 桥接方法 |
| 5 | `frontend/src/app/regions/right-panel/panels/BrowserPanel.tsx` | 编辑 | 核心重构：桥接 + iframe + 历史栈 |
| 6 | `frontend/src/styles/regions/rightpanel/browser-panel.css` | 编辑 | 新增 `.adl-browser-iframe` 样式 |
| 7 | `frontend/src/app/regions/right-panel/types.ts` | 编辑 | 移除 `browserWebViewAvailable` |
| 8 | `frontend/src/app/regions/right-panel/hooks/useBrowserPanelProps.ts` | 编辑 | 移除 `browserWebViewAvailable` |
| 9 | `frontend/src/app/regions/right-panel/hooks/useRightPanelViewProps.ts` | 编辑 | 移除 `browserWebViewAvailable` |

## 假设与决策

| 决策 | 说明 |
|------|------|
| `<iframe>` 设 `sandbox` 属性 | `allow-scripts allow-forms allow-same-origin allow-popups`，允许页面脚本运行但不允许导航顶层窗口、不允许弹出新窗口，保证安全 |
| 不跟踪 iframe 内部导航 | 跨域 iframe 无法监听 `contentWindow.location` 变化，因此使用前端维护的历史栈 |
| 不将 `create/destroy/set_bounds` 抽象到 bridge | 这些是 Tauri WebView 专有操作，浏览器模式不需要 |
| 后退/前进用前端历史栈 | iframe 模式下无法获取 iframe 原生历史，前端维护 URL 栈是最简单可靠的方案 |
| 只暴露 5 个桥接方法 | navigate/goBack/goForward/reload/onUrlChanged，覆盖核心导航需求 |

## 验证步骤

1. `npm run typecheck` — 前端类型检查
2. `npm test` — 183 项测试全部通过
3. `cargo check` — Rust 编译通过（adl-browser crate）
4. 手动验证浏览器模式：`npm run dev:browser` → 打开浏览器面板 → 输入 URL → 确认 iframe 显示页面 → 前进/后退/刷新按钮可用
5. 手动验证 Tauri 模式：`npm run dev:tauri` → 同样操作 → 确认系统 WebView 显示
