# SPA 后退需双击问题 — 2026-06-30

## 现象

在 bilibili 等 SPA 网站上，每次点击浏览器"后退"按钮都需要点击两次才能回到上一个页面。

## 根因

1. **实现方式**：Tauri 后端通过 `webview.eval("history.back()")` 执行后退（见 `browser_webview.rs:242`），而非 WebView2 原生 `GoBack()`。原因为原生 `GoBack()` 对 SPA 网站（如 YouTube）会触发整页重载。

2. **SPA 历史栈**：SPA 网站（如 bilibili）使用 `pushState`/`replaceState` 在同一 URL 下创建多个历史条目。例如一次视频浏览可能产生：
   - 入口页（推荐流）
   - 播放页（初始状态）
   - 播放页（全屏状态）
   - 播放页（推荐视频弹窗）

   每次 `history.back()` 只回退一个 SPA 内部状态。多次回退才能跨越 SPA 状态栈，真正回到不同 URL。

## 日志证据

```
19:05:39.413  go_back_tab: eval history.back() ok
19:05:39.537  DocumentTitleChanged: "宋雨琦，泳装集锦！"  ← SPA state #1
19:05:39.543  DocumentTitleChanged: "宋雨琦 火车摇"       ← SPA state #2 (same URL)
```

一次 `history.back()` 触发两次 title 变化（同一 URL 的不同 SPA 状态），验证了 SPA 内部存在多层历史状态。

## 解决方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| 维持 `eval("history.back()")` | SPA 兼容性好，无整页重载 | SPA 内部状态多时需多次点击 | 当前方案 |
| WebView2 原生 `GoBack()` | 一次后退跨越整个 SPA 栈 | SPA 网站（YouTube 等）整页重载 | 对 SPA 体验较差 |
| 前端自定义历史栈 | 完全可控 | 需额外维护栈状态，与 WebView2 历史不同步 | 若用户明确要求 |

## 结论

此现象为 SPA 网站的通病，非应用代码 bug。当前 `eval("history.back()")` 方案是平衡 SPA 兼容性与功能正确性的合理选择。仅当用户明确要求改善时再考虑其他方案。
