# 内置浏览器实现 Spec

## Why
当前右侧面板的浏览器面板仅有 UI 外壳（地址栏、书签、历史记录、标签页管理），核心 WebView 渲染能力未接入。需要基于 Tauri 2.x 原生的 multiwebview 能力实现真正的内置浏览器，提供页面预览、导航控制等核心功能。

## What Changes
- 新增 `crates/browser` crate，封装 Tauri WebView 生命周期管理
- 在 `src-tauri` 中注册浏览器相关 IPC 命令（创建/销毁/导航/前进后退/刷新/设置边界）
- 启用 Tauri 的 `unstable` feature（multiwebview 依赖）
- 更新 `AppState`，增加浏览器 WebView 状态管理
- 更新 `tauri.conf.json` 的 CSP 策略，允许浏览器 WebView 加载外部资源
- 更新 `capabilities/default.json`，注册新的 IPC 命令权限
- 修改前端 `BrowserPanel.tsx`：
  - 通过 Tauri IPC 管理 WebView 生命周期
  - 使用 ResizeObserver 跟踪面板内容区域边界，实时同步到后端
  - 接收后端导航事件（URL 变化、加载状态、标题变化）
  - 激活前进/后退/刷新按钮的实际功能
- 更新前端 `BrowserPanelProps` 类型，增加浏览器 WebView 相关回调
- 更新前端 `copy.ts` 文案，移除"WebView 仍在后续阶段接入"的说明

## Impact
- Affected specs: 右侧面板浏览器工具
- Affected code: `crates/browser/`（新增）, `src-tauri/`（main.rs, state.rs, commands/）, `frontend/src/app/regions/right-panel/`（panels/BrowserPanel.tsx, types.ts, hooks/useBrowserPanelProps.ts）, `frontend/src/app/copy.ts`, `tauri.conf.json`, `capabilities/default.json`, `Cargo.toml`

## ADDED Requirements

### Requirement: 浏览器 WebView 创建与销毁
系统 SHALL 支持通过前端面板动态创建和销毁 Tauri child WebView，在面板内容区域渲染网页内容。

#### Scenario: 用户切换到浏览器面板时创建 WebView
- **WHEN** 用户点击浏览器工具标签切换到浏览器面板
- **THEN** 前端调用 `browser_create` IPC 命令创建 child WebView
- **AND** WebView 初始加载 `about:blank`
- **AND** 若存在历史标签页，WebView 加载当前活跃标签页的 URL

#### Scenario: 用户离开浏览器面板时销毁 WebView
- **WHEN** 用户切换到其他工具面板
- **THEN** 前端调用 `browser_destroy` IPC 命令销毁 child WebView
- **AND** 相关资源被释放

### Requirement: 页面导航控制
系统 SHALL 支持前进、后退、刷新、地址栏导航等标准浏览器导航操作。

#### Scenario: 通过地址栏导航
- **WHEN** 用户在地址栏输入 URL 并回车提交
- **THEN** 前端调用 `browser_navigate` IPC 命令
- **AND** WebView 加载目标 URL
- **AND** 加载完成后地址栏显示当前 URL

#### Scenario: 前进和后退
- **WHEN** 用户点击后退/前进按钮
- **THEN** 前端调用 `browser_go_back` / `browser_go_forward` IPC 命令
- **AND** 前端根据返回结果更新按钮的 disabled 状态

#### Scenario: 刷新页面
- **WHEN** 用户点击刷新按钮
- **THEN** 前端调用 `browser_reload` IPC 命令
- **AND** WebView 重新加载当前页面

### Requirement: WebView 边界同步
系统 SHALL 实时同步 child WebView 的位置和尺寸与前端面板内容区域边界一致。

#### Scenario: 面板大小变化时同步 WebView 边界
- **WHEN** 浏览器面板内容区域因窗口大小或面板宽度调整而变化
- **THEN** 前端通过 ResizeObserver 获取最新边界
- **AND** 调用 `browser_set_bounds` IPC 命令同步位置和尺寸
- **AND** WebView 精确覆盖面板内容区域

### Requirement: 导航状态事件
系统 SHALL 通过 Tauri 事件机制将 WebView 的导航状态变化通知前端。

#### Scenario: URL 变化通知
- **WHEN** WebView 中页面的 URL 发生变化（导航或重定向）
- **THEN** 后端通过事件 `digital-life://browser-url-changed` 通知前端
- **AND** 前端更新地址栏显示和标签页 URL

#### Scenario: 页面标题变化通知
- **WHEN** WebView 中页面的标题发生变化
- **THEN** 后端通过事件 `digital-life://browser-title-changed` 通知前端
- **AND** 前端更新标签页标题

#### Scenario: 加载状态变化通知
- **WHEN** WebView 开始或完成页面加载
- **THEN** 后端通过事件 `digital-life://browser-loading-changed` 通知前端
- **AND** 前端显示/隐藏加载指示器

### Requirement: 安全策略
系统 SHALL 对浏览器 WebView 实施适当的安全策略。

#### Scenario: CSP 配置
- **WHEN** 浏览器 WebView 加载外部页面
- **THEN** 主窗口的严格 CSP 不影响 child WebView 的内容加载
- **AND** child WebView 使用独立的 CSP 配置

#### Scenario: 导航事件监听
- **WHEN** WebView 中发生导航
- **THEN** 后端通过 `on_navigation` 回调拦截导航请求
- **AND** 将导航信息通过事件通知前端

## MODIFIED Requirements

### Requirement: BrowserPanelProps 类型扩展
原有的 `BrowserPanelProps = Pick<RightPanelViewProps, "t">` 仅包含翻译函数。需要扩展以支持 WebView 控制回调。

#### Modification
- 在 `types.ts` 的 `RightPanelViewProps` 中新增属性：`browserWebViewAvailable: boolean`
- 更新 `BrowserPanelProps` 包含 `t` 和 `browserWebViewAvailable`

### Requirement: 浏览器文案更新
`copy.ts` 中包含"Webview、DevTools 与 Cookie/缓存治理仍在后续阶段接入"的临时说明文案，需更新为反映当前实际功能状态。

#### Modification
- 移除或更新中英文文案中的储备功能说明
- 保持与当前实现状态一致的描述
