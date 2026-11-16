# 浏览器 WebView 池 + LRU 淘汰

## 背景

Tauri 模式下，浏览器需要多个标签页保持各自独立的状态（类似 Chrome/Edge）。但 WebView2 子窗口资源较重，不能无限制创建。

## 架构

采用「固定大小 WebView 池 + LRU 淘汰」策略：

```
Tauri 模式:
  标签 A (Google)  → WebView A (可见)
  标签 B (GitHub)  → WebView B (隐藏, off-screen)
  标签 C (B站)     → WebView C (隐藏, off-screen)
  ...              → 最多 6 个活跃 WebView
  标签 D (新标签)  → 超过 6 个 → LRU 淘汰最早未用的标签

Browser 模式 (iframe):
  iframe LRU 池 (容量 5):
  超过 5 个 → 最早的非活跃 iframe 设 src=about:blank
```

## 关键组件

### Rust 端
- `BrowserPool` (`crates/browser/src/browser_pool.rs`): 纯 LRU 追踪，线程安全（Mutex）。方法：`register`、`touch`、`remove`、`get_lru`、`is_full`、`size`
- `BrowserManager` (`crates/browser/src/browser_webview.rs`): 使用 `BrowserPool`，每标签独立 WebView（label: `adl-browser-view-{tabId}`）
- 12 个 per-tab 命令：`browser_create_for_tab`、`browser_activate_tab`、`browser_destroy_tab`、`browser_navigate_tab`、`browser_set_tab_bounds`、`browser_go_back_tab`、`browser_go_forward_tab`、`browser_reload_tab`、`browser_mute_tab`、`browser_set_color_scheme`、`browser_set_zoom`、`browser_fetch_page_meta`

### TypeScript 前端
- `useBrowserPool` (`frontend/src/app/features/browser/useBrowserPool.ts`): 前端 LRU 追踪 + IPC 桥接，返回 `poolVersion` 驱动 `evictedTabIds` 重算
- `BrowserPanel.tsx`: 计算 `evictedTabIds`（池外标签集合），排除当前活跃标签
- `BrowserNavigator.tsx` → `OpenTabFlatList`: 给淘汰标签添加 `.adl-filetree__item--evicted` 类
- `BrowserPanelContent.tsx`: 合并 Tauri 池淘汰 + browser 模式 iframe 淘汰

### 视觉
- 淘汰标签：favicon 60% 透明度，标题 45% 透明度，无灰度滤镜
- 当前标签高亮：`.adl-filetree__item.is-active > .adl-filetree__row { background: var(--bg-hover) }`
- 点击淘汰标签：`OrbitalLoader` 转子动画（Loading 时），WebView 创建后恢复
- `BrowserTabBar.tsx` 已于 2026-11-17 删除；实际标签列表由 `BrowserNavigator.tsx` 中的 `OpenTabFlatList` 渲染。

## 数据流

```
用户点击标签
  → browserSelectTab(tabId) (Zustand)
  → useBrowserWebView useEffect
  → 隐藏上一个标签 WebView (prevActiveTabIdRef → setTabBounds off-screen)
  → activateOrCreate()
  → setLoadingTabId(tabId) → OrbitalLoader 显示
  → createWebViewForTab(tabId, url) → Rust: pool.register → 
    若池满: Rust 返回 evicted_tab_id → 前端 poolRef 同步删除
  → activateTabInPool(tabId) → setTabBounds 定位
  → setLoadingTabId(null) → OrbitalLoader 消失
  → bumpPoolVersion() → evictedTabIds 重算 → 标签淡灰更新
```

## 初始闪烁消除

启动时 `poolVersion=0`，所有标签都未在池中。通过 `evictedTabIds` 的 `useMemo` 中 `result.delete(activeTab.id)` 排除当前活跃标签，解决初始活跃标签淡灰闪烁。

## 重复 HTTP 请求消除

`fetch_page_meta_inner` 使用 `OnceLock<Mutex<HashMap<String, Instant>>>` 3 秒内同一 URL 跳过重复请求（`commands/browser.rs`）。

## 注意事项

- 池大小默认 6（Tauri 模式），iframe LRU 大小默认 5（Browser 模式）
- 被淘汰标签的 WebView 被销毁（`webview.close()`），不是冻结
- `BrowserTabBar.tsx` 已删除（2026-11-17），不要重新引入
- `evictedTabIds` 在多处使用（Tauri pool + iframe LRU），修改需同步更新 `BrowserPanelContent.tsx` 的 `mergedEvictedTabIds`
