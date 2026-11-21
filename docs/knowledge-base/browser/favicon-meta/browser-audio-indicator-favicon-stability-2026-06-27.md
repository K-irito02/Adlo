# 浏览器音频指示器与 Favicon 位置稳定性

## 背景

在浏览器的 open / tabs / list 三种导航模式下，为标签增加音频状态指示器（BrowserAudioIndicator）与静音切换功能。开发过程中发现两个核心问题：

1. **Favicon 垂直偏移**：音频指示器出现/消失时，favicon 产生约 2px 的细微垂直位移
2. **静音状态被覆盖**：页面播放/暂停音频时，Rust 端 `IsDocumentPlayingAudioChanged` handler 硬编码 `isMuted: false`，覆盖了用户设置的浏览器级静音状态

## Favicon 位置稳定性问题

### 根本原因

音频指示器条件性渲染导致 DOM 结构变化。

`BrowserEntrySubEntries.tsx` 中：

```tsx
<span className={hasAudio ? 'adl-browser-tree__icon-wrapper' : undefined}>
```

当 `hasAudio` 为 `true` 时，多一层 `<span>` 包装；为 `false` 时不存在。这导致两种不同的 DOM 树：

**无音频：**
```
icon-before (height: 16px, align-items: center)
  └── file-icon (20×18)
        └── img (16×16)
```

**有音频：**
```
icon-before (height: 16px, align-items: center)
  └── icon-wrapper (inline-flex, 高22px)
        ├── file-icon (20×18)
        │     └── img (16×16)
        └── audio-indicator button (22×22)
```

关键约束链：
- `icon-before` 的 `height: 16px`（来自 `file-tree-lines.css`）未被浏览器覆盖 → 容器高度固定
- 子元素（18px file-icon 或 22px wrapper）比容器高 → `align-items: center` 将它们在 16px 中居中
- 居中偏移量不同（18px 子项偏移 -1px vs 22px 子项偏移 -3px）→ favicon 最终位置差约 2px

### 解决方案

**方案：始终渲染 wrapper + height:auto + align-items:center**

三处修改：

1. `BrowserEntrySubEntries.tsx` — 无条件渲染 `<span className="adl-browser-tree__icon-wrapper">`（不再条件性设置 className）
2. `browser-webview.css` — `icon-before` 覆盖添加 `height: auto !important`，让容器自然适应内容
3. `browser-webview.css` — wrapper 改为 `align-items: center`（而非 `flex-start`），favicon 与音频按钮共享同一垂直中线

```css
/* 始终渲染的 wrapper：favicon 与音频按钮垂直居中 */
.adl-browser-entry__tree .adl-browser-tree__icon-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

/* 覆盖 icon-before 的固定高度，让容器按内容生长 */
.adl-browser-entry__tree .adl-filetree__node--file >
.adl-tree-node__row > .adl-tree-node__icon-before {
  height: auto !important;
}
```

**注意事项：**
- `height: auto` 只作用于 `adl-browser-entry__tree` 下的 `.adl-filetree__node--file`，不影响目录节点
- wrapper 始终存在，`gap: 2px` 在无音频时因只有一个子元素而不占可见空间

### 排查方法

1. 使用**调试日志收起器**排查 UI 交互类问题
2. 在控制台执行 `window.__exportDebugLogs()` 导出日志（界面已不提供「复制调试日志」按钮）
3. 分析日志中的 `[ADL-DEBUG]` 标记可追踪音频状态变化

## Rust 端静音状态覆盖问题

### 根本原因

`crates/browser/src/webview2_audio.rs` 中，`IsDocumentPlayingAudioChangedEventHandler` 的 `isMuted` 被硬编码为 `false`：

```rust
// 修复前
let _ = app.emit("digital-life://browser-audio-changed", serde_json::json!({
    "tabId": tid_for_audio,
    "isPlaying": is_playing,
    "isMuted": false,           // ← 硬编码
}));
```

当页面播放/暂停音频时，该 handler 触发并发送 `isMuted: false`，覆盖了用户通过 UI 设置的浏览器级静音状态。结果是：WebView2 被静音（通过 `SetIsMuted(true)`），但 UI 显示未静音，用户无法取消静音。

### 解决方案

在 handler 内读取实际静音状态：

```rust
// 修复后
let core18: ICoreWebView2_18 = match core17.cast() {
    Ok(c) => c,
    Err(_) => return Ok(()),
};
let mut is_muted_val: windows::core::BOOL = windows::core::BOOL(0);
let _ = core18.IsMuted(&mut is_muted_val);
let is_muted = is_muted_val.0 != 0;
// 现在 isMuted 反映实际静音状态
```

**注意事项：**
- `ICoreWebView2_18.IsMuted()` 返回实际 WebView2 内部静音标记
- 需要从 `ICoreWebView2_17` cast 到 `ICoreWebView2_18`（额外的 COM 查询，开销可忽略）

## 相关文件

| 文件 | 角色 |
|------|------|
| `crates/browser/src/webview2_audio.rs` | Rust 端 WebView2 音频事件处理 |
| `frontend/src/app/components/BrowserAudioIndicator.tsx` | 音频状态指示 UI 组件 |
| `frontend/src/app/components/BrowserFavicon.tsx` | Favicon 渲染组件 |
| `frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx` | 树模式图标渲染（renderBrowserIcon） |
| `frontend/src/styles/regions/rightpanel/browser-webview.css` | 浏览器树 CSS（icon-wrapper/icon-before） |
| `frontend/src/styles/regions/rightpanel/file-tree-lines.css` | 文件树基础 CSS（icon-before 默认样式） |
| `frontend/src/styles/themes.css` | 音频指示器脉冲动画 |
