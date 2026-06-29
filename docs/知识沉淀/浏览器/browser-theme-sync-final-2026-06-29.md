# Browser Theme Sync — 最终方案与经验教训

## 架构决策

### 方案选择：CDP Emulation vs SetPreferredColorScheme

| 方案 | 效果 | 问题 |
|------|------|------|
| `SetPreferredColorScheme` (Profile) | 新导航正确渲染 | **影响共享 Profile** → 主 App 的 `prefers-color-scheme` 被覆盖 → ThemeController 反馈回路 |
| `Emulation.setEmulatedMedia` (CDP) | 仅目标 WebView 受影响，不影响主 App | 对已加载页面不触发 CSS 重评估 |

**最终选择**：CDP `Emulation.setEmulatedMedia`（`crates/browser/src/webview2_profile.rs`）

理由：避免 Profile 级别的副作用（Issue 3 反馈回路）优先于已加载页面实时更新。用户已确认接受"已加载页面不变化，刷新后生效"。

### 后退/前进：eval history vs native GoBack

| 方案 | SPA 站点 (YouTube) | 传统站点 (Bilibili) |
|------|-------------------|---------------------|
| `eval("history.back()")` | ✅ popstate 触发 | ✅ 正常工作 |
| `core.GoBack()` | ❌ 完整页面重加载 | ✅ 正确导航 |

**选择**：`eval("history.back()")`（`crates/browser/src/browser_webview.rs`）

### 新标签主题同步

在 `create_for_tab` 中创建 WebView 后立即调用 `webview2_set_color_scheme`，确保新标签使用当前主题。

## 关键 Bug 修复

### Bug 1: preferencesMerger resolvedTheme 始终为 'light'

`frontend/src/shared/preferencesMerger.ts:18` 和 `app/utils/preferencesMerger.ts:18`：
```typescript
// 错误：themeMode='system' 时 resolvedTheme 被硬编码为 'light'
nextConfig.resolvedTheme = patch.themeMode === 'dark' ? 'dark' : 'light';
// 修复：正确读取系统偏好
nextConfig.resolvedTheme = patch.themeMode === 'system'
  ? window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  : patch.themeMode;
```

### Bug 2: useThemeSync 传入 stale resolvedTheme

`frontend/src/app/hooks/useThemeSync.ts`：
```typescript
// 错误：即使 themeMode='system' 也传入 resolvedTheme
themeController.setTheme({ mode: themeMode, resolvedTheme });
// 修复：themeMode='system' 时不传入 resolvedTheme
if (themeMode !== 'system') {
  themeController.setTheme({ mode: themeMode, resolvedTheme });
} else {
  themeController.setTheme({ mode: 'system' });
}
```

### Bug 3: SetPreferredColorScheme 共享 Profile 反馈回路

`crates/browser/src/webview2_profile.rs`：
将 `SetPreferredColorScheme`（Profile 级别）改为 CDP `Emulation.setEmulatedMedia`（WebView 级别），避免影响主 App 的 `prefers-color-scheme` 媒体查询。

### Bug 4: 前进/后退按钮命令名错误

`frontend/src/app/features/browser/useBrowserNavigation.ts`：
使用错误的命令名 `browser_reload`/`browser_go_back`/`browser_go_forward`（缺少 `_tab` 后缀且未传递 `tabId` 参数）。
改为使用 bridge 方法 `reloadTab(tabId)`/`goBackTab(tabId)`/`goForwardTab(tabId)`。

## 已知限制

- YouTube 使用 `replaceState` 而非 `pushState`，`history.back()` 无历史可退
- CDP 对已加载页面不触发 CSS 媒体查询重评估，需用户手动刷新
- WebView2 共享 Profile 导致 SetPreferredColorScheme 影响主 App 主题检测

## 日志关键词

| 前缀 | 位置 | 含义 |
|------|------|------|
| `[ADL-DEBUG] useBrowserThemeSync` | 前端 | 应用主题变化触发 WebView 主题同步 |
| `[ADL-DEBUG] useThemeSync` | 前端 | `useThemeSync` hook 从配置加载主题 |
| `[ADL-DEBUG] ThemeController system change` | 前端 | `prefers-color-scheme` 媒体查询变化 |
| `cdp: set emulated media to` | 后端 | CDP 设置 WebView 配色方案 |
| `go_back_tab: eval history.back() ok` | 后端 | 后退操作 JS eval 成功 |
