# SPA 导航标题同步修复（2026-06-28）

## 背景

在浏览器面板中点击 SPA 站点（Bilibili、YouTube）的视频链接时，历史记录和标签标题出现缓慢，而通过 SPA 自动跳转（如 YouTube 自动连播）则表现正常。

## 根因：双重 Bug

### Bug 1：SPA URL 归一化覆盖真实标题（前端层）

SPA 使用 `history.pushState` 导航时：
1. YouTube 删除 `?pp=` 参数 → URL 变化
2. Bilibili 添加 `?vd_source=` 参数 → URL 变化

这两个 URL 变体对应同一页面，前端 `urlChanged` 事件用 `historyDedupKey(hostname+pathname)` 匹配为同一条目。但处理顺序：
1. SPA pushState 触发 HistoryChanged → 前端添加**占位符**（URL 作为标题）
2. 若该条目已有真实标题（来自上一个状态），占位符**覆盖**了真实标题

**影响**：YouTube 自动连播或 Bilibili 视频切换时，标签标题短暂闪回 URL。

**修复**：`useBrowserUrlChange.ts` 检测 `historyDedupKey` 是否已有真实标题，若存在则**跳过占位符替换**。

### Bug 2：INIT_SCRIPT 强制整页导航阻断 SPA 标题（Rust 层，更严重）

`browser_navigation.rs` 的 INIT_SCRIPT 在点击事件的**捕获阶段**：
1. `stopPropagation()` → 阻止 SPA 的 Vue/React 路由处理器接收事件
2. `navigateToUrl(href)` → `window.location.href = href` → 强制整页加载

**影响**：SPA 无法通过 `pushState` 处理导航 → 页面完全重载 → 标题需等待新页面加载完成（~500ms）才能通过 `DocumentTitleChanged` 或 postMessage 到达。

**自动跳转为什么正常**：自动连播由 SPA 内部定时器触发，直接调用 `history.pushState()`，不经过点击事件 → 不受 INIT_SCRIPT 影响。

**修复**：捕获阶段仍 `preventDefault()`（阻止 `<a>` 默认导航），但**移除 `stopPropagation()`**，让事件传播到 SPA 路由处理器。使用 **microtask**（`Promise.resolve().then()`）在下一事件循环检查 URL 是否已通过 SPA 的 `pushState` 变化：

```javascript
event.preventDefault();
Promise.resolve().then(function() {
    if (!isSamePage(location.href, href)) {
        navigateToUrl(href);  // SPA 未处理，回退整页导航
    }
});
```

## 事件流对比

| 步骤 | 旧行为 (stopPropagation) | 新行为 (microtask) |
|------|------------------------|-------------------|
| 1. 用户点击 | INIT_SCRIPT 捕获 | INIT_SCRIPT 捕获 |
| 2. `event.preventDefault()` | ✅ | ✅ |
| 3. `event.stopPropagation()` | ❌ 阻断 | ✅ 不阻断 |
| 4. 导航 | `window.location.href` 立即执行 | 排队 microtask |
| 5. SPA 路由处理器 | **收不到事件** | 收到事件，执行 `pushState` |
| 6. URL 检查 | - | URL 已变 → 不导航；未变 → 回退整页导航 |
| 7. 标题到达时间 | 整页加载完 (~500ms) | 即时 (microtask 内) |

## 相关文件变更

| 文件 | 变更 |
|------|------|
| `crates/browser/src/browser_navigation.rs` | INIT_SCRIPT: 移除 `stopPropagation()` + 旧 `navigateToUrl`；新增 `isSamePage` + microtask 回退 |
| `frontend/src/app/features/browser/useBrowserUrlChange.ts` | SPA URL 归一化检测：占位符不覆盖已有真实标题 |
| `frontend/src/app/stores/slices/browserHistorySlice.ts` | `historyDedupKey` 替换逻辑：不覆盖已有真实标题 |
| `frontend/src/app/utils/browserDisplayUtils.ts` | `historyDupKey` 已存在 |

## 关键设计决策

### `isSamePage` 比较策略

```javascript
function isSamePage(url1, url2) {
    var u1 = new URL(url1);
    var u2 = new URL(url2);
    return u1.origin + u1.pathname.replace(/\/$/, '') ===
           u2.origin + u2.pathname.replace(/\/$/, '');
}
```

仅比较 **origin + pathname**，忽略 query params（如 `?vd_source=`、`?pp=`）和 hash。若 SPA 仅添加了 tracking 参数而未改变 pathname，视为同一页面。

### Microtask vs setTimeout

使用 `Promise.resolve().then()`（microtask）而非 `setTimeout(0)`（macrotask）：

- Microtask 在**当前事件循环结束、下一事件循环开始前**执行
- SPA 的同步 `pushState` 调用在同一事件循环内完成
- 确保在检查 URL 时 SPA 的 `history.pushState` 已经执行
- `setTimeout(0)` 有 ~4ms 最小延迟，不必要

## 验证

- Rust: `cargo check -p adl-browser` + `cargo test -p adl-browser` (6 tests)
- Frontend: `vitest run` 268/268, ESLint, Prettier, `tsc --noEmit`
- YouTube: 手动点击视频 → pushState → 标题即时显示
- Bilibili: 首页点击视频 → Vue Router 处理 → 标题即时显示
- 普通网站（无 SPA）：microtask 检测到 URL 未变 → 回退整页导航 → 同旧行为
