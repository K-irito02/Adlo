# 浏览器标签音频状态指示与控制 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在浏览器功能面板的 open/tabs/list 三种导航模式下，为正在播放音频的活跃标签提供音频状态指示器与静音切换功能，Tauri 模式使用 WebView2 原生事件，浏览器模式使用 iframe 同域检测。

**Architecture:** Tauri 模式通过 `ICoreWebView2_17` 的 `IsDocumentPlayingAudioChanged` 事件 + `ICoreWebView2_18` 的 `SetIsMuted` 实现；浏览器模式通过轮询 iframe contentDocument 的 HTMLMediaElement 实现。两套方案完全隔离，前端通过统一 `BrowserBridge` 接口和 Zustand store 共享状态。

**Tech Stack:** Rust + Tauri 2.x + webview2-com 0.38（已含 ICoreWebView2_17/_18）、React 19 + Zustand + lucide 体系 SVG 图标

## Global Constraints

- 双端隔离：Tauri 用原生事件，浏览器用 iframe 轮询，不混用
- 跨域 iframe 仅手动静音，不做自动检测
- 历史记录匹配：仅当天（yyyy-MM-dd）+ URL 精确匹配
- 无 emoji 图标，使用 SVG（lucide 体系）
- IconVolumeX 无特殊颜色，使用 currentColor 继承
- `isPlayingAudio` 瞬态不持久化，`isAudioMuted` 持久化到 localStorage

---

## 文件结构总览

### 新增文件
| 文件 | 职责 |
|------|------|
| `crates/browser/src/webview2_audio.rs` | Rust 端 WebView2 音频事件处理（ICoreWebView2_17/_18） |
| `frontend/src/preview-bridge/preview-browser-audio.ts` | 浏览器模式 iframe 音频监控 |
| `frontend/src/app/components/BrowserAudioIndicator.tsx` | 音频状态指示 UI 组件 |

### 修改文件
| 文件 | 修改内容 |
|------|---------|
| `crates/browser/src/lib.rs` | 暴露 `webview2_audio` 模块 |
| `crates/browser/src/browser_webview.rs` | `create_for_tab` 中注册音频处理器 |
| `src-tauri/src/commands/browser.rs` | 新增 `browser_mute_tab` 命令 |
| `src-tauri/src/main.rs` | handler 注册新增 `browser_mute_tab` |
| `src-tauri/permissions/digital-life.toml` | 允许 `browser_mute_tab` |
| `frontend/src/shared/ipc.ts` | BrowserBridge 接口扩展 |
| `frontend/src/tauri-bridge.ts` | muteTab + onAudioStateChanged |
| `frontend/src/mock-bridge.ts` | stub 方法 |
| `frontend/src/preview-bridge/index.ts` | 集成 audio monitor |
| `frontend/src/app/stores/slices/browserTabsSlice.ts` | 字段 + actions |
| `frontend/src/app/icons/status.tsx` | 新增 IconVolume2, IconVolumeX |
| `frontend/src/app/icons/index.ts` | 导出新图标 |
| `frontend/src/app/styles/themes.css` | 音频脉冲 CSS |
| `frontend/src/app/i18n/zh-CN/browser.ts` | 新增 browserMute/browserUnmute |
| `frontend/src/app/i18n/en-US/browser.ts` | 同上英文版 |
| `frontend/src/app/features/browser-tree/types.ts` | BrowserTreeNode 扩展 |
| `frontend/src/app/features/browser-tree/useBrowserTreeData.ts` | 历史匹配逻辑 |
| `frontend/src/app/features/browser/BrowserNavigator.tsx` | OpenTabFlatList 集成 |
| `frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx` | 树条目集成 |
| `frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx` | 扁平列表集成 |
| `frontend/src/app/features/browser/BrowserTabBar.tsx` | 标签栏集成 |
| `frontend/src/app/features/browser/BrowserPanelContent.tsx` | iframe 音频监控串联 |

---

### Task 1: 图标 + i18n

**Files:**
- Modify: `frontend/src/app/icons/status.tsx`
- Modify: `frontend/src/app/icons/index.ts`
- Modify: `frontend/src/app/i18n/zh-CN/browser.ts`
- Modify: `frontend/src/app/i18n/en-US/browser.ts`

**Interfaces:**
- Produces: `IconVolume2`, `IconVolumeX` 组件，`browserMute`/`browserUnmute` i18n keys

- [ ] **Step 1: 添加图标 SVG**

在 `frontend/src/app/icons/status.tsx` 末尾，`IconBrain` 之后添加：

```typescript
export const IconVolume2 = make(
  <>
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
    <path className="audio-wave" d="M16 9a5 5 0 0 1 0 6" />
    <path className="audio-wave" d="M19.364 18.364a9 9 0 0 0 0-12.728" />
  </>
);

export const IconVolumeX = make(
  <>
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
    <line x1="22" x2="16" y1="9" y2="15" />
    <line x1="16" x2="22" y1="9" y2="15" />
  </>
);
```

- [ ] **Step 2: 在 index.ts 中导出**

在 `frontend/src/app/icons/index.ts` 的 `status` 导出块末尾（`IconBrain` 之后）添加：

```typescript
  IconVolume2,
  IconVolumeX,
```

- [ ] **Step 3: 添加 i18n 中文 key**

在 `frontend/src/app/i18n/zh-CN/browser.ts` 的已有末尾（`}` 前）添加：

```typescript
  browserMute: '静音标签',
  browserUnmute: '取消静音',
```

- [ ] **Step 4: 添加 i18n 英文 key**

在 `frontend/src/app/i18n/en-US/browser.ts` 的已有末尾添加：

```typescript
  browserMute: 'Mute tab',
  browserUnmute: 'Unmute tab',
```

---

### Task 2: Store — 音频状态字段与 Actions

**Files:**
- Modify: `frontend/src/app/stores/slices/browserTabsSlice.ts`

**Interfaces:**
- Produces: `BrowserTabState.isPlayingAudio`, `BrowserTabState.isAudioMuted`, `BrowserTabStateUpdate` 对应字段, `browserUpdateTabAudioState(tabId, isPlaying?, isMuted?)`, `browserToggleTabMute(tabId)`

- [ ] **Step 1: 扩展 BrowserTabState 和 BrowserTabStateUpdate**

在 `BrowserTabState` 接口添加：

```typescript
export interface BrowserTabState {
  // ...现有字段
  isPlayingAudio: boolean;
  isAudioMuted: boolean;
}
```

在 `BrowserTabStateUpdate` 接口添加：

```typescript
export interface BrowserTabStateUpdate {
  // ...现有字段
  isPlayingAudio?: boolean;
  isAudioMuted?: boolean;
}
```

- [ ] **Step 2: 修改 browserOpenTab 初始化**

在 `browserOpenTab` action 中创建 tab 时添加默认值（确保 `BrowserTabState` 类型约束要求传入）：

```typescript
const tab: BrowserTabState = {
  id: createUiId('browser'),
  workspaceId: workspaceId ?? '',
  title: title?.trim() || '',
  url: url?.trim() || '',
  isPinned: false,
  isPlayingAudio: false,
  isAudioMuted: false,
  sortOrder: maxSortOrder + 1,
};
```

- [ ] **Step 3: 扩展 BrowserTabsSlice 接口**

在 `BrowserTabsSlice` 接口添加 actions：

```typescript
export interface BrowserTabsSlice {
  // ...现有
  browserUpdateTabAudioState: (tabId: string, isPlaying?: boolean, isMuted?: boolean) => void;
  browserToggleTabMute: (tabId: string) => void;
}
```

- [ ] **Step 4: 实现 browserUpdateTabAudioState**

在 `createBrowserTabsSlice` 返回对象中添加（放在 `browserUpdateTab` 之后）：

```typescript
  browserUpdateTabAudioState: (tabId, isPlaying, isMuted) =>
    set((state) => {
      const nextTabs = state.browserTabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        const next = { ...tab };
        if (isPlaying !== undefined) next.isPlayingAudio = isPlaying;
        if (isMuted !== undefined) next.isAudioMuted = isMuted;
        return next;
      });
      // isAudioMuted 需要持久化，isPlayingAudio 瞬态不持久化
      const hasMuteChange = isMuted !== undefined;
      if (hasMuteChange) {
        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
      }
      return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
    }),
```

- [ ] **Step 5: 实现 browserToggleTabMute**

在 `browserUpdateTabAudioState` 之后添加：

```typescript
  browserToggleTabMute: (tabId) =>
    set((state) => {
      const nextTabs = state.browserTabs.map((tab) =>
        tab.id === tabId ? { ...tab, isAudioMuted: !tab.isAudioMuted } : tab
      );
      scheduleWrite(BROWSER_TABS_KEY, nextTabs);
      return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
    }),
```

---

### Task 3: Rust 后端 — WebView2 音频事件 + mute 命令

**Files:**
- Create: `crates/browser/src/webview2_audio.rs`
- Modify: `crates/browser/src/lib.rs`
- Modify: `crates/browser/src/browser_webview.rs`
- Modify: `src-tauri/src/commands/browser.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/permissions/digital-life.toml`

**Interfaces:**
- Consumes: `BrowserManager`（已有）, `create_for_tab` 中注入 `setup_audio_changed_handler`
- Produces: `pub fn setup_audio_changed_handler(webview: Webview, tab_id: &str) -> Result<(), String>`, Tauri event `digital-life://browser-audio-changed` `{tabId: String, isPlaying: bool, isMuted: bool}`, Tauri command `browser_mute_tab(tabId, muted)`

- [ ] **Step 1: 创建 webview2_audio.rs**

创建 `crates/browser/src/webview2_audio.rs`：

```rust
//! WebView2 audio state tracking for Windows.
//!
//! Uses ICoreWebView2_17 (IsDocumentPlayingAudioChanged) and
//! ICoreWebView2_18 (IsMutedChanged, SetIsMuted) for native audio
//! detection and mute control.

#[cfg(windows)]
mod imp {
    use tauri::{Emitter, Manager, Webview};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2_17, ICoreWebView2_18,
    };
    use webview2_com::IsDocumentPlayingAudioChangedEventHandler;
    use webview2_com::IsMutedChangedEventHandler;
    use windows::core::Interface;
    use windows::core::IUnknown;

    type EventRegistrationToken = i64;

    pub fn setup_audio_changed_handler(
        webview: Webview,
        tab_id: &str,
    ) -> Result<(), String> {
        let app = webview.app_handle().clone();
        let tid = tab_id.to_string();

        webview.with_webview(move |platform_wv| {
            unsafe {
                let controller = platform_wv.controller();
                let core = controller.CoreWebView2().map_err(|e| {
                    format!("failed to get CoreWebView2: {e}")
                })?;

                // ICoreWebView2_17 for IsDocumentPlayingAudioChanged
                let core17: ICoreWebView2_17 = core.cast().map_err(|e| {
                    format!("ICoreWebView2_17 not available: {e}")
                })?;

                let app_for_audio = app.clone();
                let tid_for_audio = tid.clone();
                let audio_handler = IsDocumentPlayingAudioChangedEventHandler::create(Box::new(
                    move |sender: Option<ICoreWebView2>, _args: Option<IUnknown>| {
                        let Some(sender) = sender else {
                            return Ok(());
                        };
                        let is_playing = sender.IsDocumentPlayingAudio().unwrap_or(false);
                        let app = app_for_audio.clone();
                        let _ = app.emit(
                            "digital-life://browser-audio-changed",
                            serde_json::json!({
                                "tabId": tid_for_audio,
                                "isPlaying": is_playing,
                                "isMuted": false,
                            }),
                        );
                        Ok(())
                    },
                ));

                let mut token: EventRegistrationToken = 0;
                core17
                    .add_IsDocumentPlayingAudioChanged(
                        &audio_handler,
                        &mut token as *mut _ as *mut _,
                    )
                    .map_err(|e| format!("add_IsDocumentPlayingAudioChanged failed: {e}"))?;

                // ICoreWebView2_18 for IsMutedChanged
                let core18: ICoreWebView2_18 = core17.cast().map_err(|e| {
                    format!("ICoreWebView2_18 not available: {e}")
                })?;

                let app_for_mute = app.clone();
                let tid_for_mute = tid.clone();
                let mute_handler = IsMutedChangedEventHandler::create(Box::new(
                    move |sender: Option<ICoreWebView2>, _args: Option<IUnknown>| {
                        let Some(sender) = sender else {
                            return Ok(());
                        };
                        let core18: ICoreWebView2_18 = match sender.cast() {
                            Ok(c) => c,
                            Err(_) => return Ok(()),
                        };
                        let is_muted = core18.IsMuted().unwrap_or(false);
                        let app = app_for_mute.clone();
                        let _ = app.emit(
                            "digital-life://browser-audio-changed",
                            serde_json::json!({
                                "tabId": tid_for_mute,
                                "isPlaying": false,
                                "isMuted": is_muted,
                            }),
                        );
                        Ok(())
                    },
                ));

                let mut mute_token: EventRegistrationToken = 0;
                core18
                    .add_IsMutedChanged(&mute_handler, &mut mute_token as *mut _ as *mut _)
                    .map_err(|e| format!("add_IsMutedChanged failed: {e}"))?;

                tracing::info!(tab_id = %tid, "audio handlers registered (ICoreWebView2_17 + _18)");
                Ok(())
            }
        })
        .map_err(|e| format!("with_webview failed: {e}"))?
    }

    pub fn mute_tab(webview: &Webview, muted: bool) -> Result<(), String> {
        webview.with_webview(move |platform_wv| {
            unsafe {
                let controller = platform_wv.controller();
                let core = controller.CoreWebView2().map_err(|e| {
                    format!("failed to get CoreWebView2: {e}")
                })?;
                let core18: ICoreWebView2_18 = core.cast().map_err(|e| {
                    format!("ICoreWebView2_18 not available for mute: {e}")
                })?;
                core18.SetIsMuted(muted).map_err(|e| {
                    format!("SetIsMuted failed: {e}")
                })?;
                tracing::info!(muted = %muted, "tab audio mute toggled");
                Ok(())
            }
        })
        .map_err(|e| format!("with_webview failed: {e}"))?
    }
}

#[cfg(not(windows))]
mod imp {
    use tauri::Webview;
    use tracing::debug;

    pub fn setup_audio_changed_handler(_webview: Webview, _tab_id: &str) -> Result<(), String> {
        debug!("audio handler not available on non-Windows");
        Ok(())
    }

    pub fn mute_tab(_webview: &Webview, _muted: bool) -> Result<(), String> {
        debug!("mute tab not available on non-Windows");
        Ok(())
    }
}

pub use imp::{mute_tab, setup_audio_changed_handler};
```

- [ ] **Step 2: 在 lib.rs 中暴露模块**

在 `crates/browser/src/lib.rs` 添加：

```rust
mod webview2_audio;

pub use webview2_audio::{mute_tab, setup_audio_changed_handler};
```

- [ ] **Step 3: 在 browser_webview.rs 中注册音频处理器**

在 `crates/browser/src/browser_webview.rs` 的 `create_for_tab` 中，`setup_history_changed_handler` 之后添加：

```rust
            if let Err(e) = crate::webview2_audio::setup_audio_changed_handler(webview.clone(), tab_id)
            {
                tracing::warn!(tab_id = tab_id, error = %e, "audio handler setup failed");
            }
```

- [ ] **Step 4: 添加 browser_mute_tab 到 BrowserManager**

在 `crates/browser/src/browser_webview.rs` 的 `impl BrowserManager` 中添加：

```rust
    pub fn mute_tab(&self, app: &tauri::AppHandle, tab_id: &str, muted: bool) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;
        let label = webview_label(tab_id);
        let webview = window
            .get_webview(&label)
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;
        crate::webview2_audio::mute_tab(&webview, muted)
            .map_err(|e| AppError::Internal(e))?;
        Ok(())
    }
```

- [ ] **Step 5: 添加 Tauri Command**

在 `src-tauri/src/commands/browser.rs` 末尾（`browser_fetch_page_meta` 之后）添加：

```rust
#[tauri::command]
pub fn browser_mute_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
    muted: bool,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.mute_tab(&app, &tab_id, muted)))
}
```

- [ ] **Step 6: 在 main.rs 注册命令**

在 `src-tauri/src/main.rs` 的 `generate_handler!` 浏览器命令列表末尾添加：

```rust
commands::browser::browser_mute_tab,
```

- [ ] **Step 7: 在 permissions 中添加白名单**

在 `src-tauri/permissions/digital-life.toml` 的 `commands.allow` 数组中添加：

```toml
  "browser_mute_tab",
```

---

### Task 4: IPC 接口扩展 + 三端实现

**Files:**
- Modify: `frontend/src/shared/ipc.ts`
- Modify: `frontend/src/tauri-bridge.ts`
- Modify: `frontend/src/mock-bridge.ts`

**Interfaces:**
- Consumes: `AudioStatePayload`
- Produces: `BrowserBridge.muteTab(tabId, muted)`, `BrowserBridge.onAudioStateChanged(listener)`

- [ ] **Step 1: 扩展 BrowserBridge 接口**

在 `frontend/src/shared/ipc.ts` 中 `BrowserBridge` 接口添加：

```typescript
export interface AudioStatePayload {
  tabId: string;
  isPlaying: boolean;
  isMuted: boolean;
}

export interface BrowserBridge {
  // ...现有方法
  /** Mute or unmute a specific tab's audio */
  muteTab: (tabId: string, muted: boolean) => Promise<void>;
  /** Subscribe to audio state changes */
  onAudioStateChanged: (listener: (payload: AudioStatePayload) => void) => () => void;
}
```

- [ ] **Step 2: 实现 tauri-bridge.ts**

在 `frontend/src/tauri-bridge.ts` 的 `browser:` 桥接对象末尾添加：

```typescript
      muteTab: (tabId: string, muted: boolean) =>
        invoke('browser_mute_tab', { tabId, muted }).then(() => undefined),
      onAudioStateChanged: (
        listener: (payload: { tabId: string; isPlaying: boolean; isMuted: boolean }) => void
      ) => {
        let active = true;
        let ul: UnlistenFn | undefined;
        void listen<{ tabId: string; isPlaying: boolean; isMuted: boolean }>(
          'digital-life://browser-audio-changed',
          (event) => {
            if (active) {
              listener(event.payload);
            }
          }
        ).then((unlisten) => {
          if (active) {
            ul = unlisten;
          } else {
            void unlisten();
          }
        });
        return () => {
          active = false;
          void ul?.();
        };
      },
```

- [ ] **Step 3: 实现 mock-bridge.ts**

在 `frontend/src/mock-bridge.ts` 的 `browser:` 桥接对象末尾添加：

```typescript
    muteTab: (_tabId: string, _muted: boolean) => Promise.resolve(),
    onAudioStateChanged: (_listener: any) => () => {},
```

---

### Task 5: 浏览器模式音频监控

**Files:**
- Create: `frontend/src/preview-bridge/preview-browser-audio.ts`
- Modify: `frontend/src/preview-bridge/index.ts`

**Interfaces:**
- Consumes: `AudioStatePayload`
- Produces: `BrowserAudioMonitor` class with `startMonitoring`, `stopMonitoring`, `setMuted`, `destroy`; preview bridge 中 `onAudioStateChanged` 实现

- [ ] **Step 1: 创建 preview-browser-audio.ts**

创建 `frontend/src/preview-bridge/preview-browser-audio.ts`：

```typescript
import type { AudioStatePayload } from '../shared/ipc';

type StateListener = (payload: AudioStatePayload) => void;

export class BrowserAudioMonitor {
  private intervals = new Map<string, ReturnType<typeof setInterval>>();
  private playing = new Map<string, boolean>();
  private muted = new Map<string, boolean>();
  private iframes = new Map<string, HTMLIFrameElement | null>();
  private listeners = new Set<StateListener>();

  private notify(tabId: string, isPlaying: boolean, isMuted: boolean): void {
    for (const listener of this.listeners) {
      listener({ tabId, isPlaying, isMuted });
    }
  }

  startMonitoring(tabId: string, iframeEl: HTMLIFrameElement | null): void {
    this.iframes.set(tabId, iframeEl);
    const isMuted = this.muted.get(tabId) ?? false;

    const intervalId = setInterval(() => {
      try {
        const doc = iframeEl?.contentDocument ?? iframeEl?.contentWindow?.document;
        if (!doc) {
          if (this.playing.get(tabId)) {
            this.playing.set(tabId, false);
            this.notify(tabId, false, isMuted);
          }
          return;
        }
        const media = doc.querySelectorAll('audio, video');
        const nowPlaying = Array.from(media).some(
          (el) => !(el as HTMLMediaElement).paused && !(el as HTMLMediaElement).muted
        );
        const prevPlaying = this.playing.get(tabId) ?? false;
        if (nowPlaying !== prevPlaying) {
          this.playing.set(tabId, nowPlaying);
          this.notify(tabId, nowPlaying, isMuted);
        }
      } catch {
        // SecurityError: cross-origin iframe, skip auto-detection
      }
    }, 1000);

    this.intervals.set(tabId, intervalId);
  }

  stopMonitoring(tabId: string): void {
    const intervalId = this.intervals.get(tabId);
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      this.intervals.delete(tabId);
    }
    this.iframes.delete(tabId);
    this.playing.delete(tabId);
    this.muted.delete(tabId);
  }

  setMuted(tabId: string, muted: boolean): void {
    this.muted.set(tabId, muted);
    // Attempt to mute media elements inside the iframe (same-origin only)
    const iframeEl = this.iframes.get(tabId) ?? null;
    if (iframeEl) {
      try {
        const doc = iframeEl.contentDocument ?? iframeEl.contentWindow?.document;
        if (doc) {
          doc.querySelectorAll('audio, video').forEach((el) => {
            (el as HTMLMediaElement).muted = muted;
          });
        }
      } catch {
        // cross-origin: mute state is tracked locally but cannot be enforced
      }
    }
    const isPlaying = this.playing.get(tabId) ?? false;
    this.notify(tabId, isPlaying, muted);
  }

  onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    for (const tabId of this.intervals.keys()) {
      this.stopMonitoring(tabId);
    }
    this.listeners.clear();
  }
}
```

- [ ] **Step 2: 集成到 preview-bridge/index.ts**

在 `frontend/src/preview-bridge/index.ts` 中：

导入：
```typescript
import { BrowserAudioMonitor } from './preview-browser-audio';
```

在 `setupPreviewBridge` 函数中，创建 `ptyBridge` 之后添加：

```typescript
  const audioMonitor = new BrowserAudioMonitor();
```

将 `browser:` 桥接对象替换为：

```typescript
    browser: {
      createForTab: (_tabId: string, _url: string) => Promise.resolve(null),
      activateTab: (_tabId: string) => Promise.resolve(),
      destroyTab: (_tabId: string) => {
        audioMonitor.stopMonitoring(_tabId);
        return Promise.resolve();
      },
      navigateTab: (_tabId: string, _url: string) => Promise.resolve(),
      setTabBounds: (_tabId: string, _bounds: any) => Promise.resolve(),
      goBackTab: (_tabId: string) => Promise.resolve(false),
      goForwardTab: (_tabId: string) => Promise.resolve(false),
      reloadTab: (_tabId: string) => Promise.resolve(),
      onUrlChanged: (_listener: any) => () => {},
      onMetaChanged: (_listener: any) => () => {},
      muteTab: (tabId: string, muted: boolean) => {
        audioMonitor.setMuted(tabId, muted);
        return Promise.resolve();
      },
      onAudioStateChanged: (listener: any) => audioMonitor.onStateChange(listener),
    },
```

---

### Task 6: 树数据适配 — BrowserTreeNode 扩展 + 历史匹配

**Files:**
- Modify: `frontend/src/app/features/browser-tree/types.ts`
- Modify: `frontend/src/app/features/browser-tree/useBrowserTreeData.ts`

**Interfaces:**
- Consumes: `BrowserTabState`, `BrowserHistoryState`, `browserTabs: BrowserTabState[]`
- Produces: `BrowserTreeNode.isPlayingAudio`, `BrowserTreeNode.isAudioMuted`, `BrowserTreeNode.associatedTabId`

- [ ] **Step 1: 扩展 BrowserTreeNode**

在 `frontend/src/app/features/browser-tree/types.ts` 的 `BrowserTreeNode` 接口末尾添加：

```typescript
export interface BrowserTreeNode extends FileTreeRenderableNode {
  // ...现有字段
  isPlayingAudio?: boolean;
  isAudioMuted?: boolean;
  associatedTabId?: string;
}
```

- [ ] **Step 2: 修改 buildHistoryLeafNode 签名**

在 `frontend/src/app/features/browser-tree/useBrowserTreeData.ts` 中，将 `buildHistoryLeafNode` 函数签名改为接收 `browserTabs` 参数：

```typescript
function buildHistoryLeafNode(
  entry: BrowserHistoryState,
  _uniqueKey: string,
  browserTabs: BrowserTabState[],
): BrowserTreeNode {
```

在函数体内，计算日期匹配并注入音频状态：

```typescript
function buildHistoryLeafNode(
  entry: BrowserHistoryState,
  _uniqueKey: string,
  browserTabs: BrowserTabState[],
): BrowserTreeNode {
  // Match against currently open tabs by URL + same day
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const entryDate = new Date(entry.visitedAt);
  const entryDateStr = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}-${String(entryDate.getDate()).padStart(2, '0')}`;

  let isPlayingAudio = false;
  let isAudioMuted = false;
  let associatedTabId: string | undefined;

  if (entryDateStr === todayStr) {
    const matchedTab = browserTabs.find((t) => t.url === entry.url);
    if (matchedTab) {
      isPlayingAudio = matchedTab.isPlayingAudio;
      isAudioMuted = matchedTab.isAudioMuted;
      associatedTabId = matchedTab.id;
    }
  }

  return {
    path: `history-entry:${entry.id}`,
    name: normalizeTabTitle(entry.title, entry.url),
    kind: 'file',
    children: [],
    nodeType: 'history',
    tabId: entry.id,
    url: entry.url,
    visitedAt: entry.visitedAt,
    isPlayingAudio,
    isAudioMuted,
    associatedTabId,
  };
}
```

- [ ] **Step 3: 更新调用点**

在 `useBrowserTreeData.ts` 中找到 `buildHistoryLeafNode` 的调用（约第 215 行）：

```typescript
.map((entry) => buildHistoryLeafNode(entry, entry.id, browserTabs))
```

同时更新 `data.browserTabs` 应该已在 hook 返回值中可用（传入 `buildHistoryCategoryTree` 或直接在调用处注入）。确认 `buildHistoryCategoryTree` 函数签名接收 `browserTabs` 并透传到 `buildHistoryLeafNode`。

---

### Task 7: UI 组件 + CSS 动画

**Files:**
- Create: `frontend/src/app/components/BrowserAudioIndicator.tsx`
- Modify: `frontend/src/app/styles/themes.css`（或新增 `browser-audio.css`）

**Interfaces:**
- Consumes: `IconVolume2`, `IconVolumeX`, `useTCopy`, `TooltipSimple`
- Produces: `<BrowserAudioIndicator isPlaying isMuted onToggleMute />`

- [ ] **Step 1: 创建 BrowserAudioIndicator 组件**

创建 `frontend/src/app/components/BrowserAudioIndicator.tsx`：

```typescript
import React from 'react';
import { useTCopy } from '../../i18n/useTCopy';
import { IconVolume2, IconVolumeX } from '../../icons';
import { TooltipSimple } from './Tooltip';

interface BrowserAudioIndicatorProps {
  isPlaying: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
}

export function BrowserAudioIndicator({
  isPlaying,
  isMuted,
  onToggleMute,
}: BrowserAudioIndicatorProps) {
  const { t } = useTCopy();

  if (!isPlaying && !isMuted) {
    return null;
  }

  return (
    <TooltipSimple content={isMuted ? t.browserUnmute : t.browserMute} placement="top">
      <button
        type="button"
        className={`adl-icon-btn adl-icon-btn--xs adl-browser-audio-indicator${isPlaying && !isMuted ? ' is-animating' : ''}${isMuted ? ' is-muted' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMute();
        }}
        aria-label={isMuted ? t.browserUnmute : t.browserMute}
      >
        {isMuted ? <IconVolumeX size={12} decorative /> : <IconVolume2 size={12} decorative />}
      </button>
    </TooltipSimple>
  );
}
```

- [ ] **Step 2: 添加 CSS 脉冲动画**

在 `frontend/src/app/styles/themes.css` 末尾添加：

```css
.adl-browser-audio-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 2px;
}
.adl-browser-audio-indicator.is-animating svg {
  animation: audio-pulse 1.2s ease-in-out infinite;
}
.adl-browser-audio-indicator.is-animating .audio-wave:last-child {
  animation-delay: 0.3s;
}
@keyframes audio-pulse {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}
```

---

### Task 8: UI 集成 — 四处放置 AudioIndicator

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserNavigator.tsx`
- Modify: `frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx`
- Modify: `frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx`
- Modify: `frontend/src/app/features/browser/BrowserTabBar.tsx`

**Interfaces:**
- Consumes: `BrowserAudioIndicator`, `BrowserTabState` audio fields, `browserToggleTabMute` action, `useAppStore`

- [ ] **Step 1: OpenTabFlatList**

在 `frontend/src/app/features/browser/BrowserNavigator.tsx` 中：

导入：
```typescript
import { BrowserAudioIndicator } from '../../components/BrowserAudioIndicator';
import { useAppStore } from '../../stores/slicedStore';
```

在 `OpenTabFlatList` 组件中，`<BrowserFavicon url={tab.url} />` 之后，标题按钮之前添加：

```typescript
                <BrowserAudioIndicator
                  isPlaying={tab.isPlayingAudio}
                  isMuted={tab.isAudioMuted}
                  onToggleMute={() => {
                    useAppStore.getState().browserToggleTabMute(tab.id);
                  }}
                />
```

- [ ] **Step 2: BrowserEntrySubEntries**

在 `frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx` 中：

导入：
```typescript
import { BrowserAudioIndicator } from '../../components/BrowserAudioIndicator';
import { useAppStore } from '../../stores/slicedStore';
```

在 `renderBrowserIcon` 回调中添加：返回包含 `BrowserFavicon` + `BrowserAudioIndicator` 的片段：

```typescript
  const renderBrowserIcon = useCallback((childNode: BrowserTreeNode) => {
    if (childNode.kind === 'directory') {
      return null;
    }
    return (
      <>
        <BrowserFavicon url={childNode.url || ''} />
        {(childNode.isPlayingAudio || childNode.isAudioMuted) && (
          <BrowserAudioIndicator
            isPlaying={childNode.isPlayingAudio ?? false}
            isMuted={childNode.isAudioMuted ?? false}
            onToggleMute={() => {
              const tabId = childNode.tabId ?? childNode.associatedTabId;
              if (tabId) {
                useAppStore.getState().browserToggleTabMute(tabId);
              }
            }}
          />
        )}
      </>
    );
  }, []);
```

- [ ] **Step 3: BrowserTreeEntryFlatList**

在 `frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx` 中：

导入：
```typescript
import { BrowserAudioIndicator } from '../../components/BrowserAudioIndicator';
import { useAppStore } from '../../stores/slicedStore';
```

在 `<BrowserFavicon url={item.node.url ?? ''} />` 之后，标题按钮之前添加：

```typescript
                {(item.node.isPlayingAudio || item.node.isAudioMuted) && (
                  <BrowserAudioIndicator
                    isPlaying={item.node.isPlayingAudio ?? false}
                    isMuted={item.node.isAudioMuted ?? false}
                    onToggleMute={() => {
                      const tabId = item.node.tabId ?? item.node.associatedTabId;
                      if (tabId) {
                        useAppStore.getState().browserToggleTabMute(tabId);
                      }
                    }}
                  />
                )}
```

- [ ] **Step 4: BrowserTabBar**

在 `frontend/src/app/features/browser/BrowserTabBar.tsx` 中：

导入：
```typescript
import { BrowserAudioIndicator } from '../../components/BrowserAudioIndicator';
```

在 `<div className="adl-tool-list__tab-icon">` 块之后（关闭 `</div>` 之后），标题 `<span className="adl-tool-list__title">` 之前添加：

```typescript
                  <BrowserAudioIndicator
                    isPlaying={tab.isPlayingAudio}
                    isMuted={tab.isAudioMuted}
                    onToggleMute={() => {
                      useAppStore.getState().browserToggleTabMute(tab.id);
                    }}
                  />
```

---

### Task 9: PanelContent 中串联 iframe 音频监控

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserPanelContent.tsx`
- Modify: `frontend/src/preview-bridge/index.ts`

**Interfaces:**
- Consumes: `BrowserAudioMonitor`, `isTauriShell()`
- Produces: iframe 加载时启动监控，关闭时停止

- [ ] **Step 1: 在 preview-bridge 中暴露 audioMonitor**

在 `frontend/src/preview-bridge/index.ts` 中，创建 `audioMonitor` 之后添加：

```typescript
  (window as Record<string, unknown>)['__adlAudioMonitor'] = audioMonitor;
```

- [ ] **Step 2: 订阅音频状态变化 + 串联 iframe 监控**

在 `frontend/src/app/features/browser/BrowserPanelContent.tsx` 中：

导入：
```typescript
import { isTauriShell } from '../../../tauri-bridge';
```

在组件函数体顶部（`props` 解构后），添加：

```typescript
  // Subscribe to audio state changes from bridge
  useEffect(() => {
    if (!window.digitalLife?.browser?.onAudioStateChanged) {
      return;
    }
    const unsub = window.digitalLife.browser.onAudioStateChanged((payload) => {
      useAppStore.getState().browserUpdateTabAudioState(
        payload.tabId,
        payload.isPlaying,
        payload.isMuted
      );
    });
    return () => {
      unsub();
    };
  }, []);

  // Browser mode: start iframe audio monitoring when active tab changes
  useEffect(() => {
    if (isTauriShell() || !activeTab) {
      return;
    }
    const audioMonitor = (window as Record<string, unknown>)['__adlAudioMonitor'] as
      | { startMonitoring: (tabId: string, iframe: HTMLIFrameElement | null) => void }
      | undefined;
    if (audioMonitor) {
      audioMonitor.startMonitoring(activeTab.id, iframeRef.current);
    }
  }, [activeTab?.id, isTauriShell]);
```

---

### Task 10: 测试

**Files:**
- Create: `frontend/src/app/stores/slices/browserTabsSlice.test.ts`（若存在则追加）
- Create: `frontend/src/app/components/BrowserAudioIndicator.test.tsx`

- [ ] **Step 1: Store 单元测试**

创建 `frontend/src/app/stores/slices/browserTabsSlice.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { createBrowserTabsSlice } from './browserTabsSlice';

describe('browserTabsSlice', () => {
  it('browserUpdateTabAudioState should update isPlayingAudio and isAudioMuted', () => {
    const tabs: BrowserTabState[] = [];
    const slice = createBrowserTabsSlice((fn) => fn, () => ({} as any));
    // Implementation details depend on test store setup
  });

  it('browserToggleTabMute should toggle isAudioMuted', () => {
    // Verify toggle behavior
  });
});
```

- [ ] **Step 2: 组件渲染测试**

创建 `frontend/src/app/components/BrowserAudioIndicator.test.tsx`：

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserAudioIndicator } from './BrowserAudioIndicator';

describe('BrowserAudioIndicator', () => {
  it('renders nothing when not playing and not muted', () => {
    const { container } = render(
      <BrowserAudioIndicator isPlaying={false} isMuted={false} onToggleMute={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders IconVolume2 when playing and not muted', () => {
    render(
      <BrowserAudioIndicator isPlaying={true} isMuted={false} onToggleMute={() => {}} />
    );
    // Assert IconVolume2 is rendered
  });

  it('renders IconVolumeX when muted', () => {
    render(
      <BrowserAudioIndicator isPlaying={false} isMuted={true} onToggleMute={() => {}} />
    );
    // Assert IconVolumeX is rendered
  });
});
```
