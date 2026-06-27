# 浏览器标签音频状态指示与控制 — 设计规格说明书

## 概述

在浏览器功能面板中（open / tabs / list 三种导航模式），为正在播放音频的活跃标签提供音频状态指示器与静音切换功能，并确保 Tauri 桌面模式与浏览器预览模式双端一致可用。

---

## 前置约束

1. **双端隔离**：Tauri 模式使用 WebView2 原生事件，浏览器模式使用 iframe 内脚本检测，两种方案完全分离，不混用。
2. **浏览器模式跨域限制**：跨域 iframe 无法自动检测音频播放状态，仅支持手动静音/取消静音；同域 iframe 全功能支持。
3. **历史记录匹配规则**：历史条目仅在与活跃标签 URL **且同属当天日期（yyyy-MM-dd）** 时才关联音频状态，防止跨日误匹配。
4. **无 emoji 图标**：所有状态指示使用 SVG 图标（lucide 体系），播放中未静音状态具有 CSS 脉冲动画。
5. **静音图标无特殊颜色**：IconVolumeX 使用 currentColor 继承，不额外染色。

---

## 数据层

### BrowserTabState 新增字段

文件：`frontend/src/app/stores/slices/browserTabsSlice.ts`

```typescript
export interface BrowserTabState {
  // ...现有字段
  isPlayingAudio: boolean;   // 当前是否正在播放音频（瞬态，不持久化）
  isAudioMuted: boolean;     // 用户是否静音此标签（持久化到 localStorage）
}

export interface BrowserTabStateUpdate {
  // ...现有字段
  isPlayingAudio?: boolean;
  isAudioMuted?: boolean;
}
```

### 初始化默认值

在 `browserOpenTab` action 中创建 tab 时：
```typescript
const tab: BrowserTabState = {
  // ...现有
  isPlayingAudio: false,
  isAudioMuted: false,
};
```

### 新增 Store Actions

```typescript
// 更新音频状态（支持局部更新）
browserUpdateTabAudioState: (tabId: string, isPlaying?: boolean, isMuted?: boolean) => void;

// 切换静音（同步更新 store 与后端）
browserToggleTabMute: (tabId: string) => void;
```

`browserUpdateTabAudioState` 使用 `Partial<>` 语义，允许只更新 `isPlaying` 或 `isMuted` 其中之一（因不同模式下数据源可能只携带部分信息）。

### 持久化

- `isAudioMuted`：通过现有 `scheduleWrite(BROWSER_TABS_KEY, nextTabs)` 持久化。
- `isPlayingAudio`：瞬态，不持久化，tab 销毁或重新导航后重置为 `false`。

---

## Tauri 模式（Rust 后端）

### 新增 Rust 文件

`crates/browser/src/webview2_audio.rs`

职责：为单个 WebView2 实例注册音频状态变更事件处理器。

### 接口定义

```rust
pub fn setup_audio_changed_handler(webview: Webview, tab_id: &str) -> Result<(), String>
```

参数：
- `webview`：目标 WebView2 实例
- `tab_id`：关联的标签 ID（用于事件 payload）

### 实现逻辑

项目当前依赖 `webview2-com = "0.38"`，已内置 `ICoreWebView2_17` 和 `ICoreWebView2_18` 接口（直至 `_28`），无需额外升级。

1. 从 WebView 获取 `ICoreWebView2` → cast 到 `ICoreWebView2_17`。
2. 调用 `core17.add_IsDocumentPlayingAudioChanged(&handler, &mut token)` 注册音频播放状态变更处理器。
3. 从 `ICoreWebView2_17` → cast 到 `ICoreWebView2_18`。
4. 调用 `core18.add_IsMutedChanged(&handler, &mut token)` 注册静音状态变更处理器。
5. 事件触发时读取当前 `IsDocumentPlayingAudio()` + `IsMuted()` 属性值。
6. 通过 Tauri `emit` 发射事件：

```
digital-life://browser-audio-changed
{
  "tabId": "browser:xxx",
  "isPlaying": true,
  "isMuted": false
}
```

### 新增 Tauri Command

`browser_mute_tab(tabId: String, muted: bool) -> Result<(), AppError>`

- 通过标签获取对应 WebView2 实例。
- 从 `ICoreWebView2` → cast 到 `ICoreWebView2_18`。
- 调用 `core18.SetIsMuted(muted)` 原生静音/取消静音（项目中已可用）。

### 注册时机

修改 `crates/browser/src/browser_webview.rs` → `create_for_tab()`：

```rust
if let Err(e) = crate::webview2_audio::setup_audio_changed_handler(webview.clone(), tab_id) {
    tracing::warn!(tab_id, error = %e, "audio handler setup failed");
}
```

### 模块注册

在 `crates/browser/src/lib.rs` 中公开 `webview2_audio` 模块。

---

## 浏览器模式（Preview Bridge）

### 新增文件

`frontend/src/preview-bridge/preview-browser-audio.ts`

### Class: `BrowserAudioMonitor`

```typescript
class BrowserAudioMonitor {
  private intervals: Map<string, number>;  // tabId → intervalId
  private muted: Map<string, boolean>;     // tabId → isMuted
  private listeners: Set<(payload: AudioStatePayload) => void>;

  // 启动监控
  startMonitoring(tabId: string, iframeEl: HTMLIFrameElement | null): void;

  // 停止监控
  stopMonitoring(tabId: string): void;

  // 设置静音
  setMuted(tabId: string, muted: boolean): void;

  // 销毁全部
  destroy(): void;
}
```

### 同域检测逻辑

```typescript
startMonitoring(tabId, iframeEl) {
  const intervalId = window.setInterval(() => {
    try {
      const doc = iframeEl.contentDocument ?? iframeEl.contentWindow?.document;
      if (!doc) return;
      const media = doc.querySelectorAll('audio, video');
      const nowPlaying = Array.from(media).some(el => !el.paused && !el.muted);
      // 状态变化时通知 listener
    } catch (e) {
      // SecurityError → 跨域，不做自动检测
    }
  }, 1000);

  // 额外监听 play/pause 事件（部署在 iframe 加载时）
}
```

### 静音逻辑

```typescript
setMuted(tabId: string, muted: boolean) {
  this.muted.set(tabId, muted);
  // 尝试在 iframe 内静音所有媒体元素
  try {
    const iframe = this.getIframe(tabId);
    const doc = iframe.contentDocument;
    doc.querySelectorAll('audio, video').forEach(el => { el.muted = muted; });
  } catch {
    // 跨域：仅记录状态，实际静音效果受限
  }
  this.notify({ tabId, isPlaying: this.playing.get(tabId) ?? false, isMuted: muted });
}
```

### 集成到 Preview Bridge

修改 `frontend/src/preview-bridge/index.ts`：

```typescript
const audioMonitor = new BrowserAudioMonitor();

browser: {
  // ...现有方法
  muteTab: (tabId, muted) => {
    audioMonitor.setMuted(tabId, muted);
    return Promise.resolve();
  },
  onAudioStateChanged: (listener) => {
    audioMonitor.onStateChange = listener;
    return () => audioMonitor.destroy();
  },
}
```

### 与 iframe 生命周期联动

在 `BrowserPanelContent.tsx` 中，当 iframe 加载完成（`handleIframeLoad`）时启动监控，tab 关闭时停止监控。LRU 驱逐时自动停止，恢复时重新启动。

---

## 桥接层（IPC）

### BrowserBridge 接口扩展

文件：`frontend/src/shared/ipc.ts`

```typescript
export interface AudioStatePayload {
  tabId: string;
  isPlaying: boolean;
  isMuted: boolean;
}

export interface BrowserBridge {
  // ...现有方法
  muteTab: (tabId: string, muted: boolean) => Promise<void>;
  onAudioStateChanged: (listener: (payload: AudioStatePayload) => void) => () => void;
}
```

### 三端实现一览

| 实现文件 | muteTab | onAudioStateChanged |
|----------|---------|-------------------|
| `tauri-bridge.ts` | `invoke('browser_mute_tab', { tabId, muted })` | `listen('digital-life://browser-audio-changed', cb)` |
| `preview-bridge/index.ts` | `audioMonitor.setMuted(tabId, muted)` | `audioMonitor.listeners.add(cb)` |
| `mock-bridge.ts` | `Promise.resolve()` | `() => {}`（空函数） |

---

## 树形结构适配

### BrowserTreeNode 类型扩展

文件：`frontend/src/app/features/browser-tree/types.ts`

```typescript
export interface BrowserTreeNode {
  // ...现有字段
  parentPath?: string;
  tabId?: string;
  // 新增
  isPlayingAudio?: boolean;
  isAudioMuted?: boolean;
  associatedTabId?: string;  // history 条目关联到的活跃标签 ID
}
```

### 历史记录条目音频匹配

文件：`frontend/src/app/features/browser-tree/useBrowserTreeData.ts`

在 `buildHistoryLeafNode` 函数中新增逻辑：

```typescript
function buildHistoryLeafNode(
  entry: BrowserHistoryState,
  browserTabs: BrowserTabState[],
): BrowserTreeNode {
  // 匹配规则：URL 匹配 + 同属当天
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const entryDate = new Date(entry.visitedAt);
  const entryDateStr = `${entryDate.getFullYear()}-${String(entryDate.getMonth()+1).padStart(2,'0')}-${String(entryDate.getDate()).padStart(2,'0')}`;

  let isPlaying = false;
  let isMuted = false;
  let associatedTabId: string | undefined;

  if (entryDateStr === todayStr) {
    const matchedTab = browserTabs.find(t => t.url === entry.url);
    if (matchedTab) {
      isPlaying = matchedTab.isPlayingAudio;
      isMuted = matchedTab.isAudioMuted;
      associatedTabId = matchedTab.id;
    }
  }

  return {
    // ...现有字段
    isPlayingAudio: isPlaying,
    isAudioMuted: isMuted,
    associatedTabId,
  };
}
```

### 覆盖范围

| 树视图 | 历史记录分类 | 工作区/用户文件夹分类 |
|--------|------------|-------------------|
| **tabs 模式**（标签目录按钮） | ✅ URL+日期匹配 | ✅ 直接取 Tab 的音频状态 |
| **list 模式**（文件列表按钮） | ✅ 同上 | ✅ 同上 |

---

## UI 组件

### BrowserAudioIndicator

新增：`frontend/src/app/components/BrowserAudioIndicator.tsx`

```typescript
interface BrowserAudioIndicatorProps {
  isPlaying: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
}
```

### 图标实现

新增至 `frontend/src/app/icons/status.tsx`（与 `IconMic` 同组）：

```typescript
// 扬声器（播放中未静音）— 含 CSS class 用于动画
export const IconVolume2 = make(
  <>
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
    <path className="audio-wave" d="M16 9a5 5 0 0 1 0 6" />
    <path className="audio-wave" d="M19.364 18.364a9 9 0 0 0 0-12.728" />
  </>
);

// 静音
export const IconVolumeX = make(
  <>
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
    <line x1="22" x2="16" y1="9" y2="15" />
    <line x1="16" x2="22" y1="9" y2="15" />
  </>
);
```

在 `frontend/src/app/icons/index.ts` 中导出。

### 图标方案

| 状态 | 图标组件 | CSS class | 动画 |
|------|---------|-----------|------|
| 播放中 + 未静音 | `IconVolume2` | `is-animating` | 含有 `.audio-wave` 的两个 path 做振幅缩放脉冲 |
| 静音中 | `IconVolumeX` | `is-muted` | 无动画 |
| 未播放 | — | `display: none` | — |

### CSS 脉冲动画

在 `frontend/src/app/styles/themes.css` 或 `browser-audio.css` 中添加：

```css
.adl-browser-audio-indicator.is-animating .audio-wave {
  animation: audio-pulse 1.2s ease-in-out infinite;
  transform-origin: center;
  transform-box: fill-box;
}
.adl-browser-audio-indicator.is-animating .audio-wave:last-child {
  animation-delay: 0.3s;
}

@keyframes audio-pulse {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}
```

`transform-box: fill-box` 确保缩放以 SVG 元素自身的中心为原点。

### 布局位置

所有标签行统一调整 flex 顺序：

```
旧: [favicon] [title    ] [meta actions]
新: [favicon] [📢] [title] [meta actions]
```

实现方式：在 `BrowserFavicon` 与标题按钮之间插入 `BrowserAudioIndicator`。

### 集成点（四处）

| 组件 | 文件 | 插入位置 |
|------|------|---------|
| `OpenTabFlatList` | `BrowserNavigator.tsx:136-150` | `<BrowserFavicon />` 与 `<button className="adl-filetree__label">` 之间 |
| `BrowserEntrySubEntries.renderChildMeta` | `BrowserEntrySubEntries.tsx:331-367` | `BrowserFavicon` 之后（通过 `renderMeta` callback 的图标区域） |
| `BrowserTreeEntryFlatList` tab 行 | `BrowserTreeEntryFlatList.tsx:127` | `<BrowserFavicon />` 与 `<button className="adl-filetree__label">` 之间 |
| `BrowserTabBar` 标签项 | `BrowserTabBar.tsx:117-147` | `<div className="adl-tool-list__tab-icon">` 与 `<span className="adl-tool-list__title">` 之间 |

### i18n

新增 key：

| Key | 中文值 | 英文值 |
|-----|--------|--------|
| `browserMute` | 静音标签 | Mute tab |
| `browserUnmute` | 取消静音 | Unmute tab |

文件：`frontend/src/app/i18n/`

---

## 未受影响模块

| 模块 | 原因 |
|------|------|
| `BrowserPanelContent.tsx` | 仅串联 iframe 引用到音频监控器，无结构变更 |
| `SafeIframe.tsx` | 不需要改动 |
| `useBrowserTreeData.ts` 树构建逻辑 | 仅 `buildHistoryLeafNode` 增加匹配参数 |
| `BrowserCategorySection.tsx` | 无需改动 |
| 浏览器 panel 的 capability 配置 | 已有 WebView2 完整访问权限 |
| 现有 i18n 文件 | 仅新增 2 个 key，不冲突 |
| Login/Memo/Other 面板 | 完全不相关 |

---

## 关键时序流程

### Tauri 模式 — 音频播放

```
WebView2 页面开始播放 <video>
  → CoreWebView2.IsDocumentPlayingAudioChanged 触发
  → Rust handler 读取 IsDocumentPlayingAudio = true
  → emit("digital-life://browser-audio-changed", {tabId, isPlaying: true})
  → tauri-bridge.ts listen() 接收
  → store.browserUpdateTabAudioState(tabId, {isPlaying: true})
  → UI 重新渲染，BrowserAudioIndicator 亮起
```

### Tauri 模式 — 用户点击静音

```
用户点击 BrowserAudioIndicator
  → onToggleMute()
  → store.browserToggleTabMute(tabId)
     → store 更新 isAudioMuted = true
     → store 触发的副作用调用 bridge.browser.muteTab(tabId, true)
        → tauri-bridge.ts invoke("browser_mute_tab", {tabId, muted: true})
           → Rust 端调用 WebView2.set_IsMuted(true)
  → UI 更新图标为 IconVolumeX
```

### 浏览器模式 — 音频检测

```
iframe 加载完成（handleIframeLoad）
  → audioMonitor.startMonitoring(tabId, iframeEl)
  → 每隔 1s 轮询 iframe.contentDocument 检查 media 元素
  → 检测到有元素 !paused && !muted
  → 通知 store 更新 isPlayingAudio = true
  → UI 更新
```

---

## 已知限制

| 限制 | 说明 |
|------|------|
| 浏览器模式跨域 iframe | 无法自动检测音频播放状态，静音操作仅影响前端记录的状态，不影响 iframe 内实际音频输出 |
| Web Audio API 覆盖 | 浏览器模式下，使用 `AudioContext.createOscillator()` 等 Web Audio API 的页面无法被 HTMLMediaElement 轮询检测到 |
| Tauri 模式 | 无限制 — `webview2-com` v0.38 已完整支持 `ICoreWebView2_17`（音频事件）和 `ICoreWebView2_18`（静音控制）|

---

## 测试策略

| 测试类型 | 覆盖范围 |
|---------|---------|
| 单元测试 | `browserUpdateTabAudioState` / `browserToggleTabMute` action |
| 单元测试 | `BrowserAudioMonitor` 同域检测/跨域降级 |
| 单元测试 | `buildHistoryLeafNode` 日期匹配逻辑 |
| 组件测试 | `BrowserAudioIndicator` 三态渲染 |
| 集成测试 | 音频状态从 Rust → IPC → Store → UI 全链路 |
| E2E | 浏览器模式 iframe 音视频元素播放检测 |

---

## 依赖项

| 依赖 | 用途 | 版本状态 |
|------|------|---------|
| `webview2-com` crate | Rust 端 `ICoreWebView2_17`（音频事件） + `ICoreWebView2_18`（静音控制） | ✅ `"0.38"` 已自带，无需升级 |
| `motion` npm 包 | 播放中图标的脉冲动画 | ✅ 已有 |
| 自定义 SVG 图标 | `IconVolume2` / `IconVolumeX` | 需新增至 `frontend/src/app/icons/status.tsx`（已有 `IconMic` 等音频相关图标模式可参考） |
| `windows` crate | `ICoreWebView2_17`/`_18` 的底层 COM 类型 | ✅ 已依赖 `"0.61"` |
| `windows-core` crate | 事件句柄类型 | ✅ 已依赖 `"0.61"` |

无需新增任何外部依赖。

---

## 实施顺序

1. 数据层：`BrowserTabState` 字段 + store actions
2. Tauri 后端：`webview2_audio.rs` + `browser_mute_tab` command
3. IPC 桥接层：`BrowserBridge` 接口扩展 + 三端同步实现
4. 浏览器模式：`preview-browser-audio.ts` + `BrowserAudioMonitor`
5. 树结构适配：`BrowserTreeNode` 扩展 + `buildHistoryLeafNode` 匹配逻辑
6. UI 组件：`BrowserAudioIndicator` + 四处集成 + CSS 动画
7. i18n：新增 2 个 key
8. 红绿测试 + 回归验证
