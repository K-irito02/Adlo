# 内置浏览器实现总结

> **体裁**：设计决策（架构与双模式契约）。实现快照（crate 细节）见 [analysis/ai-digital-life/features/builtin-browser.md](../../analysis/ai-digital-life/features/builtin-browser.md)。

## 摘要
为右侧面板浏览器工具实现了完整的双模式内置浏览器功能。Tauri 桌面模式使用原生 child WebView（multiwebview），浏览器预览模式使用 `<iframe>` 直连 + 外部浏览器降级按钮。

## 架构变化

### 新增模块

| 模块 | 类型 | 说明 |
|------|------|------|
| `crates/browser` | Rust crate | `BrowserManager` 封装 Tauri child WebView 生命周期 |
| `src-tauri/src/commands/browser.rs` | Rust commands | 8 个 IPC 命令（create/destroy/navigate/go_back/go_forward/reload/set_bounds/eval） |
| `BrowserBridge` | TypeScript 接口 | 在 `DigitalLifeBridge` 中新增 `browser` 子接口 |

### 修改文件（共 14 个）

| 文件 | 变更 |
|------|------|
| `crates/browser/Cargo.toml` | 新增 crate 定义 |
| `crates/browser/src/lib.rs` | BrowserManager 实现（8 个方法 + on_navigation 事件） |
| `Cargo.toml`（根） | workspace.members 增加 `crates/browser` |
| `src-tauri/Cargo.toml` | 引用 adl-browser，tauri 启用 unstable feature |
| `src-tauri/tauri.conf.json` | CSP 放宽支持外部资源 |
| `src-tauri/capabilities/default.json` | 注册 browser IPC 命令权限 |
| `src-tauri/permissions/digital-life.toml` | 8 个 browser 命令白名单 |
| `src-tauri/src/state.rs` | AppState 增加 browser_manager 字段 |
| `src-tauri/src/setup.rs` | 初始化 BrowserManager |
| `src-tauri/src/commands/mod.rs` | 注册 browser 模块 |
| `src-tauri/src/main.rs` | invoke_handler 注册 8 个 browser 命令 |
| `frontend/src/shared/ipc.ts` | 新增 BrowserBridge 接口 |
| `frontend/src/tauri-bridge.ts` | 实现 browser.* 桥接方法 |
| `frontend/src/preview-bridge/index.ts` | 实现 browser.* no-op 桥接 |
| `frontend/src/mock-bridge.ts` | 实现 browser.* no-op 桥接 |
| `frontend/src/app/regions/right-panel/panels/BrowserPanel.tsx` | 核心重构：双模式 navigator + iframe + 历史栈 |
| `frontend/src/app/regions/right-panel/types.ts` | 清理 browserWebViewAvailable |
| `frontend/src/app/regions/right-panel/hooks/useBrowserPanelProps.ts` | 同步 prop 变更 |
| `frontend/src/app/regions/right-panel/hooks/useRightPanelViewProps.ts` | 同步 prop 变更 |
| `frontend/src/app/copy.ts` | 新增浏览器文案、更新状态说明、新增外部浏览器按钮翻译 |
| `frontend/src/styles/regions/rightpanel/browser-panel.css` | 新增 iframe 样式、外部浏览器按钮样式 |

## 双模式架构

| 功能 | **Tauri 桌面模式** | **浏览器预览模式** |
|------|--------------------|--------------------|
| 页面渲染 | 系统 WebView（`window.add_child`） | `<iframe>` 嵌入 |
| URL 导航 | `browser_navigate` IPC → `window.location.href =` | 设置 `iframe.src` |
| 后退/前进 | `browser_go_back`/`browser_go_forward` IPC | 前端历史栈（最多 50 条） |
| 刷新 | `browser_reload` IPC | `iframe.contentWindow.location.reload()` |
| URL 变化监听 | `on_navigation` → `digital-life://browser-url-changed` 事件 | 前端直接设置 src |
| 降级按钮 | 无（WebView 已足够） | "在外部浏览器打开"浮动按钮 |
| WebView 生命周期 | `safeInvoke` 动态 import `@tauri-apps/api/core` | 无（不需创建 WebView） |

## 状态管理

浏览器状态存储在 `useUiStore`（Zustand）中，通过 localStorage 持久化：

| 状态 | 类型 | localStorage key |
|------|------|------------------|
| `browserTabs` | `BrowserTabState[]` | `adl-ui:browser-tabs` |
| `browserActiveTabId` | `string` | `adl-ui:browser-active-tab` |
| `browserBookmarks` | `BrowserBookmark[]` | `adl-ui:browser-bookmarks` |
| `browserHistory` | `BrowserHistoryEntry[]` | `adl-ui:browser-history` |
| `browserNavigatorWidth` | `number` | `adl-ui:browser-navigator-width` |
| `browserNavigateInPlace` | `boolean` | `adl-ui:browser-navigate-in-place` |

## 快捷键

| 快捷键 | 作用 |
|--------|------|
| `Ctrl+L` | 聚焦地址栏 |
| `Alt+Left` | 后退 |
| `Alt+Right` | 前进 |
| `F5` | 刷新 |

## 已知限制

| 限制 | 影响范围 |
|------|----------|
| iframe 受 `X-Frame-Options` 限制 | 浏览器预览模式约 80% 网站无法内嵌显示 |
| Cookie/登录态不支持 | 全局限制，需要登录的网站无法正常交互 |
| DevTools 未集成 | 后续版本 |
| Cookie/缓存治理未实现 | 后续版本 |

## 经验教训（已迁移至 knowledge-base）

> 本节历史修复明细已全部迁移，知识库为唯一真源。此处仅保留导航索引。

- [knowledge-base/browser/builtin-browser.md](../../knowledge-base/browser/builtin-browser.md) — 浏览器经验汇总
- [browser-bookmark-tuple-dedup-and-title-isolation-2026-08-15.md](../../knowledge-base/browser/bookmark/browser-bookmark-tuple-dedup-and-title-isolation-2026-08-15.md) — 书签 (url, title) 元组语义 + 标题隔离
- [browser-history-navigation-2026-08-14.md](../../knowledge-base/browser/history/browser-history-navigation-2026-08-14.md) — 历史导航归一化 + 智能回退 + 标题来源门控
- [browser-site-meta-cache-2026-08-13.md](../../knowledge-base/browser/favicon-meta/browser-site-meta-cache-2026-08-13.md) — 网站元数据三层持久化缓存
- [browser-folder-delete-bookmark-cleanup-2026-06-30.md](../../knowledge-base/browser/bookmark/browser-folder-delete-bookmark-cleanup-2026-06-30.md) — 书签删除跨域污染修复
- [browser-spa-navigation-title-sync-fix-2026-06-28.md](../../knowledge-base/browser/navigation/browser-spa-navigation-title-sync-fix-2026-06-28.md) — SPA 导航标题同步
- [browser-history-recording-fix-2026-06-26.md](../../knowledge-base/browser/history/browser-history-recording-fix-2026-06-26.md) — 历史记录不记录 6 Bug
- [browser-tab-meta-deferred-creation-2026-06-25.md](../../knowledge-base/browser/favicon-meta/browser-tab-meta-deferred-creation-2026-06-25.md) — 标签延迟创建 + 同步渲染
- [browser-meta-sync-mechanism-2026-06-25.md](../../knowledge-base/browser/favicon-meta/browser-meta-sync-mechanism-2026-06-25.md) — WebView2 原生标题/favicon 事件 + 多源去重
- [browser-navigation-mode-toggle-2026-06-20.md](../../knowledge-base/browser/navigation/browser-navigation-mode-toggle-2026-06-20.md) — 导航模式切换 + 自动刷新修复
- [browser-url-sync-fix-2026-06-04.md](../../knowledge-base/browser/navigation/browser-url-sync-fix-2026-06-04.md) — 地址栏 URL 同步
