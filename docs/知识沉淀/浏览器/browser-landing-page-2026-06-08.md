# 浏览器空标签引导页 — 实现总结

## 概述

为浏览器面板实现了空标签引导页，当没有活跃标签或 URL 为空时展示。包含快捷导航、本地端口管理、自定义背景三大功能模块。

**触发条件**：`!hasActiveTab || !activeTab?.url || activeTab.url === 'about:blank'`

## 架构变化

### 新增文件（12 个）

| 文件 | 用途 |
|------|------|
| `browser-landing/BrowserLandingPage.tsx/css` | 主容器，组装所有子组件 |
| `browser-landing/BackgroundLayer.tsx/css` | 背景层（渐变/图片/视频） |
| `browser-landing/ShortcutGrid.tsx/css` | 快捷导航网格，拖拽排序 |
| `browser-landing/ShortcutCard.tsx` | 快捷卡片（48×48 正方形） |
| `browser-landing/AddShortcutDialog.tsx` | 添加快捷站点的弹窗 |
| `browser-landing/LocalPortSection.tsx/css` | 本地端口区，自动扫描 |
| `browser-landing/AddManualPortDialog.tsx` | 手动添加端口弹窗 |
| `browser-landing/BackgroundSettingsDialog.tsx/css` | 自定义背景设置弹窗 |
| `browser-landing/index.ts` | Barrel 导出 |

### 修改文件（5 个）

| 文件 | 变更 |
|------|------|
| `stores/slices/browserSlice.ts` | 新增 4 个状态 + 14 个方法 |
| `features/browser/browserpanel.tsx` | 空状态渲染 BrowserLandingPage |
| `features/browser/index.ts` | 新增导出 |
| `i18n/zh-CN/browser.ts` | +32 i18n keys |
| `i18n/en-US/browser.ts` | +32 i18n keys |
| `vite.config.ts` | 新增 `/__adl_preview_api__/browser/scan-ports` 端点 |
| `styles/regions/composer.css` | 新增 `adl-prompt-modal__actions--fill`、`adl-btn--square` |

### Store 新增状态

| 状态 | 类型 | localStorage key |
|------|------|------------------|
| `browserShortcuts` | `ShortcutSite[]` | `adl-ui:browser-shortcuts` |
| `browserLocalPorts` | `LocalPort[]` | `adl-ui:browser-local-ports` |
| `browserBgConfig` | `BackgroundConfig` | `adl-ui:browser-bg-config` |
| `browserPortScanning` | `boolean` | 无（运行时状态） |

### Store 新增方法

14 个方法，分为 3 组：

**快捷站点**：`browserAddShortcut`、`browserRenameShortcut`、`browserDeleteShortcut`、`browserReorderShortcuts`

**本地端口**：`browserSetLocalPorts`、`browserAddManualPort(port, label?)`、`browserUpdateLocalPort(id, patch)`、`browserDeleteLocalPort`、`browserReorderLocalPorts`、`browserSetPortScanning`

**背景配置**：`browserSetBgConfig`、`browserResetBgConfig`

## 关键技术挑战与解决方案

### 1. 端口扫描不产生控制台报错

**问题**：前端使用 `fetch`/`XMLHttpRequest`/`Image` 探测端口时，浏览器原生网络层输出 `ERR_CONNECTION_REFUSED` 到控制台，JS `try/catch` 无法抑制。

**解法1（试错）**：`fetch → XHR → Image`。Image 虽比 fetch 安静，但未关闭端口的请求仍会产生控制台日志。

**终解**：将端口扫描放在服务端（Vite dev server 中间件），Node.js `net.Socket` TCP 连接探测。浏览器端只请求同源 API → 无网络错误日志。

### 2. 调试日志收集器捕获不到网络错误

**问题**：`navigator.clipboard.writeText()` 在 HTTP 环境下可能失败；网络错误是浏览器原生日志，不经过 `console.error()`。

**解法**：
- 添加 `window.addEventListener('error')` 和 `unhandledrejection` 全局监听
- 添加 clipboard 备选方案：`document.execCommand('copy')` + 临时 `<textarea>`

### 3. 对话框按钮圆角与布局

**问题**：对话框底部按钮使用 `var(--radius-md)` 圆角，不符合用户期望的直角设计；按钮布局不够规整。

**解法**：新增 CSS class `adl-btn--square`（`border-radius: 0`）和 `adl-prompt-modal__actions--fill`（`grid 1fr 1fr`）用于所有对话框底部操作按钮。

## UI/UX 标准（项目沉淀）

### 快捷卡片

| 属性 | 标准 |
|------|------|
| 尺寸 | 48×48 px 正方形 |
| 间距 | `gap: 12px`，`flex-wrap` 多行自动换行 |
| 图标 | 32×32 px 圆形，首字母占位 |
| 名称 | 卡片下方 10px 字号，`text-overflow: ellipsis` |
| 悬停提示 | `title` 属性原生提示，显示完整名称 |
| 添加占位 | 48×48 虚线框 + 下方"添加"文字 |

### 本地端口卡片

| 属性 | 标准 |
|------|------|
| 地址 | 13px 加粗，`max-width: 140px`，省略号截断 |
| 标签 | 11px 灰色，`max-width: 80px`，省略号截断 |
| 悬停提示 | `title` 属性显示完整 `host:port (label)` |
| 刷新按钮 | 20×20 px，常态透明，hover 时显示背景 |

### 弹窗对话框

| 属性 | 标准 |
|------|------|
| 面板 | 320px 宽度，`border-radius: var(--radius-lg)` |
| 内容 | 与面板标题左对齐（`padding: 0` 继承面板） |
| 按钮 | 直角（`adl-btn--square`），`grid 1fr 1fr` 铺满 |
| 输入框 | `border-radius: var(--radius-md)` 不变 |

## 完整组件结构图

```
BrowserLandingPage
├── BackgroundLayer (最底层)
│   ├── 默认: CSS 背景渐变
│   └── 自定义: <img> 或 <video>
├── 内容容器
│   ├── ShortcutGrid
│   │   ├── ShortcutCard × N (48×48, 拖拽排序)
│   │   └── "+" 占位卡片
│   └── LocalPortSection
│       ├── LocalPortCard × N (拖拽排序)
│       └── "+" 手动添加占位
├── 底部工具栏
│   ├── 「自定义背景」按钮
│   └── 「管理快捷站点」按钮
├── AddShortcutDialog (Portal)
├── AddManualPortDialog (Portal)
├── BackgroundSettingsDialog (Portal)
└── ContextMenu (Portal, 快捷方式/端口 右键)
```

## 交互细节

| 交互 | 快捷站点 | 本地端口 |
|------|---------|---------|
| 左键点击 | 打开 URL | 打开 http://host:port |
| 右键菜单 | 重命名 / 删除 | 重命名 / 删除 |
| 拖拽 | 排序持久化 | 排序持久化 |
| 悬停 | title 提示名称 | title 提示完整地址 |
