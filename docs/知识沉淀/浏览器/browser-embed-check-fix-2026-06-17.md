# 浏览器 iframe 嵌入崩溃修复总结 - 2026-06-17

## 问题概述

当浏览器面板导航到被 `X-Frame-Options: DENY` 或 `Content-Security-Policy: frame-ancestors 'none'` 阻止的 URL（如 youtube.com、bilibili.com、google.com）时，iframe 加载失败导致 IDE 嵌入式浏览器崩溃，显示"服务已停止或尚未启动"。

## 根因分析

| 层 | 原因 |
|------|-------|
| **浏览器机制** | 被阻止的 URL 在 iframe 中发出 console-level 错误，IDE 嵌入式浏览器监控检测到此错误后终止预览进程 |
| **代码缺失** | 没有任何前置检查来判断 URL 是否可被嵌入；iframe 直接设置 `src` 尝试加载 |
| **竞态条件** | `iframeBlockedDetected` 通过 Zustand `set()` 设置，但 Zustand 同步触发重渲染，iframe 可能在 blocking state 生效前就开始加载 |

## 架构变更

### 新增文件

| 文件 | 职责 |
|------|------|
| `frontend/src/app/features/browser/checkEmbed.ts` | LRU 缓存的嵌入检测（Map<string, boolean>，max 50） |
| `frontend/src/app/features/browser/SafeIframe.tsx` | iframe 包装组件，sandbox 属性固定 |
| `frontend/src/app/features/browser/BrowserNavigator.tsx` | 从 BrowserPanel 提取的导航器组件（~447 行） |

### 修改文件

| 文件 | 变更 |
|------|------|
| `frontend/vite.config.ts` | 新增 `/__adl_preview_api__/browser/check-embed` 中间件（HEAD 请求检测 X-Frame-Options/CSP frame-ancestors） |
| `frontend/src/app/features/browser/BrowserPanel.tsx` | 集成 checkEmbed（submitAddress 前置检查 + Guard Effect）+ SafeIframe 渲染条件改为 ref 同步判断 |
| `frontend/src/app/features/browser/useBrowserWebView.ts` | 暴露 `setIframeBlockedDetected`、`setIframeLoadError` 供 BrowserPanel 控制 |
| `frontend/src/app/i18n/en-US/browser.ts` | 简化 `browserCannotOpenEmbedded` 文案；删除 `browserProxyNote` |
| `frontend/src/app/i18n/zh-CN/browser.ts` | 同上 |

### 删除

- `BrowserPanel.tsx` 中的 `usePageReloadDetector` 钩子 + `DBG_KEY` 常量（全为调试用途）
- 所有 `[ADL-DEBUG]` console.log（BrowserPanel.tsx、useBrowserWebView.ts、SafeIframe.tsx）

## 核心设计

### 双路径验证

| 路径 | 触发时机 | 验证方式 |
|------|----------|----------|
| **用户输入**（submitAddress） | 用户在地址栏输入 URL 按回车 | 调用 `checkEmbed(finalUrl)` 后再更新 store |
| **持久化恢复**（Guard Effect） | 页面刷新 / Zustand hydration | `useEffect` 在 mount/URL 变化时异步验证 |

### 同步渲染门控

```tsx
// Ref 作为渲染条件（同步，无竞态）
validatedUrlsRef.current.has(activeTab.url)

// State 用于 UI 反馈（异步，渲染触发后更新）
iframeBlockedDetected / iframeLoadError
```

**为什么用 ref 而不是 state**：Zustand `set()` 同步触发 React 重渲染。如果用 state 控制 iframe 渲染，state 可能在当前渲染批次中尚未更新；ref 始终同步，确保门控立即可靠。

### 安全默认值

```typescript
// checkEmbed.ts — 失败时默认 blocked=true（安全失败）
const blocked = cached.get(url) ?? true;
```

## 经验教训

### 1. Zustand 同步重渲染陷阱

`set()` 是同步的，它会立即触发 React 重渲染。如果你在 `set({ iframeBlockedDetected: true })` 之后才调用 `browserNavigateActiveTab(url)`，iframe 可能在 blocking state 被读取之前就已经开始加载 URL。**必须在任意 store 变更之前设置 ref 同步状态**。

### 2. 持久化状态的恢复路径

页面刷新时，Zustand 从 localStorage 恢复 `activeTab.url`，但此时没有用户交互（`submitAddress` 不会被调用）。需要一个独立的 Guard Effect 来验证所有恢复/非用户触发的 URL 变更。

### 3. Ref 用于渲染门控，State 用于 UI 反馈

- `validatedUrlsRef` — 同步，控制 iframe 渲染与否（安全关键）
- `iframeBlockedDetected` / `iframeLoadError` — 异步，控制错误提示 UI（体验相关）

### 4. 调试日志及时清理

本次修复过程中产生了大量 `[ADL-DEBUG]` 日志。问题解决后应全部删除，避免：
- 生产环境日志噪音
- 额外的字符串拼接性能开销
- 代码可读性降低

### 5. 错误信息布局原则

- 错误提示不应常驻（proxy note 问题）
- 错误消息和操作按钮应放在同一容器中（视觉关联）
- 使用图标增强视觉反馈（IconAlertTriangle）

### 6. 空布局 div 不应常驻渲染

页面加载初期，一个空的 `<div className="adl-tool-primary__scroll--browser">`（flex:1, padding:12px）会与绝对定位的 iframe 共存于同一 flex 容器。iframe 加载前空白 div 的 padding 区域可见，造成 ~3px 顶部视觉瑕疵。

**原则**：仅当对应内容展示时才渲染其容器 div。条件渲染的内容不应依赖空的备用 div 占位。SafeIframe 分支中移除了该空 div，消除了布局干扰。
