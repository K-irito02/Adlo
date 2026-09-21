# 浏览器 iframe 嵌入检查与双模式隔离修复 - 2026-06-17

## 问题概述

1. **嵌入崩溃**：被 `X-Frame-Options` 或 `CSP frame-ancestors` 阻止的 URL（如 youtube.com）在 iframe 中加载时，IDE 嵌入式浏览器崩溃。
2. **双模式干扰**：Tauri 桌面模式（原生 WebView）和 IDE/浏览器模式（iframe）的 embed 检查逻辑互相干扰，导致 Tauri 模式中所有 URL 被错误标记为"被阻止"。
3. **竞态条件**：连续快速导航时，异步 `checkEmbed` 的结果交叉覆盖，导致 URL 状态错乱。

## 架构变更

### 新增文件
| 文件 | 职责 |
|------|------|
| `frontend/src/app/features/browser/checkEmbed.ts` | LRU 缓存的嵌入检测（Map<string, boolean>，max 50） |
| `frontend/src/app/features/browser/SafeIframe.tsx` | Shadow DOM iframe 包装组件（`attachShadow({ mode: 'closed' })` 阻止 React DevTools 跨域 SecurityError） |

### 修改文件
| 文件 | 变更 |
|------|------|
| `frontend/vite.config.ts` | 新增 `check-embed` 中间件（HEAD 请求检测 X-Frame-Options/CSP） |
| `frontend/src/app/features/browser/BrowserPanel.tsx` | 全量重构：submitAddress/c guard effect/rendering |
| `frontend/src/app/features/browser/useBrowserWebView.ts` | Tauri 模式移除 embed 检查；error state 仅由 `handleIframeError`/`checkEmbed` 控制 |
| `frontend/src/app/features/browser/SafeIframe.tsx` | Shadow DOM iframe + 预检 HEAD 门控 |
| `frontend/src/styles/regions/rightpanel/browser-webview.css` | block 页 edge-to-edge 布局，去除边框 |

## 核心设计

### 1. 双路径验证
| 路径 | 触发时机 | 验证方式 |
|------|----------|----------|
| **用户输入**（`submitAddress`） | 地址栏回车 | 先查 LRU 缓存（`isEmbedBlocked`），未命中才 `await checkEmbed` |
| **持久化恢复**（Guard Effect） | 页面刷新 / 标签切换 / 书签历史点击 | `useEffect` 在 URL 变化时异步验证，LRU 缓存 + `checkEmbed` 双优先级 |

### 2. Tauri 模式独立
```
isTauriShell() → 完全跳过 checkEmbed、navigateBrowser、SafeIframe、validatedUrlsRef
checkEmbed.ts → __TAURI__ 早期返回 false（不被阻止）
useBrowserWebView.ts → 原生 WebView 创建 effect 无 embed 检查
```

### 3. 版本计数器消除竞态
```typescript
const submitVersionRef = useRef(0);
// 每次 submitAddress 调用时自增
// 异步结果返回时检查版本号，丢弃过期结果
if (submitVersionRef.current !== version) return;
```

### 4. 渲染门控
| 机制 | 用途 | 特点 |
|------|------|------|
| `validatedUrlsRef`（ref） | 控制 SafeIframe 是否渲染 | 同步，无竞态 |
| `iframeBlockedDetected`（state） | 控制友好提示页 UI | 异步，渲染触发后更新 |
| `iframeLoadError`（state） | 控制网络错误提示 | 仅由 `handleIframeError` 设置 |

### 5. 友好提示页 edge-to-edge
- `width: 100%; max-width: none; border: none; border-radius: 0` → 容器铺满 `adl-tool-primary--browser` 父容器
- 内容通过 `display: flex; align-items: center; justify-content: center` 居中
- 无水平 padding，无外边框（"网页显示区域"自身的边缘线已足够）

## 经验教训

### 1. setInterval 轮询陷阱
`setInterval` 每 interval 时间无条件发起请求，不等待上一次完成。若 fetch 耗时 > interval：
- 请求堆积 → 浏览器中止旧请求 → `ERR_ABORTED`
- 卸载时 in-flight 请求被浏览器中止 → Chrome 打印 `ERR_ABORTED`

**方案**：递归 `setTimeout` 替代 `setInterval`，下一次轮询在上一次完成之后才调度。卸载时仅取消下一次调度，不中止当前 in-flight 请求。

### 2. 浏览器网络错误日志不可抑制
`ERR_CONNECTION_REFUSED`、`ERR_ABORTED` 等是 Chrome 浏览器层面的网络诊断日志，即使 JavaScript 的 `try/catch` 捕获了错误，浏览器仍然输出这些消息。

**方案**：不是抑制日志，而是避免发出注定失败的请求：
- PTY 轮询间隔 100ms → 1000ms，失败时指数退避至多 30s
- `getAppDirectory` 结果缓存 30s TTL（debugLogCollector）

### 3. AbortController 对 ERR_ABORTED 无效
主动调用 `controller.abort()` 同样触发 `ERR_ABORTED`。AbortController 用于"取消但不关心日志"的场景，不适用于"消除日志"的场景。

### 4. 两个模式必须完全代码隔离
Tauri 模式与 iframe 模式的 embed/iframe 逻辑必须完全分离，不能在同一个代码路径中通过条件分支共享状态。Tauri 模式下应完全不执行 embed 检查、不引用 SafeIframe、不操作 validatedUrlsRef。

### 5. 异步结果的版本检查
连续快速提交 URL 时，每个异步 `checkEmbed` 返回后应检查版本计数器，丢弃过期结果，避免后一个提交的结果被前一个覆盖。

### 6. Ref 与 State 的职责分离
- Ref：渲染条件门控（同步，安全关键）
- State：UI 反馈（异步，体验相关）

### 7. 友好提示页布局
阻止页不应有边框（父容器已有边缘线），应铺满整个 "网页显示区域" 就像正常网页一样。使用 `width: 100%` + `max-width: none` 而非绝对定位。

## 文件清单
- `frontend/src/app/features/browser/BrowserPanel.tsx`
- `frontend/src/app/features/browser/useBrowserWebView.ts`
- `frontend/src/app/features/browser/SafeIframe.tsx`
- `frontend/src/app/features/browser/checkEmbed.ts`
- `frontend/src/styles/regions/rightpanel/browser-webview.css`
- `frontend/vite.config.ts`
- `frontend/src/preview-bridge/api.ts`
- `frontend/src/preview-bridge/ptyBridge.ts`
- `frontend/src/app/utils/debugLogCollector.ts`
