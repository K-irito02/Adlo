# dsh 宿主壳接入设计（Design Spec）

> 主题：以 dsh（DeepSeek Harness）为灵魂的"纯宿主壳"接入
> 日期：2026-09-05
> 状态：草稿（待用户复核）

***

## 0. 背景与目标

**项目现状**：AI 数字生命（AI Digital Life）当前是自带 Agent 引擎的完整应用（Rust + Tauri + React 19）。

**未来方向**：转型为 **以 dsh 为灵魂的纯宿主壳** —— dsh 是隔离的顶层应用，项目只负责"拉起 dsh 进程 + 把 dsh 网页显示在界面中间区"。项目自身不再维护原生 Agent 引擎（agent\_loop / 多 Agent / MCP / ProviderRegistry / conversation 等将删除，作为独立前置重构）。

**核心纪律（贯穿全 spec）**：宿主对 dsh 只有两件事 —— **a) 拉起它的进程（空闲端口），b) 把它的 URL 显示在中间区**。其余 dsh 内部（模型/工具/会话/插件/更新 UI）一律 **不 import、不触达、不改动**。dsh 升了多少版本、API 怎么变，只要它还能"起进程 + 开 URL"，对宿主零影响。

**双端立场**：浏览器模式用 iframe；Tauri 桌面用独立 WebView2 子窗口 + 复用避让逻辑（选项 A）。

***

## 1. 架构总览

三明治架构：dsh 作为全隔离的顶层应用，项目作为宿主壳。

```
┌──────────────────────────────────────────────────────────┐
│ 宿主壳应用                                                 │
│  ├─ 前端 React（React 19 + Vite + TS）                    │
│  │    ├─ 中间区宿主：dsh 区（打开→dsh铺满 / 关闭→欢迎引导页）│
│  │    ├─ 左侧边栏 / 右侧面板 / 顶栏（保留原功能）           │
│  │    └─ 版本管理 UI：欢迎引导页上的按钮+版本/更新/回退/卸载/重装│
│  ├─ 桥接层（IPC bridge 三实现：tauri/preview/mock）        │
│  └─ Rust 后端（Tauri + crates）                           │
│       ├─ WebApp 托管服务：进程守护 + 空闲端口分配 + URL     │
│       ├─ 版本管理器：dsh 版本 检查/升级/回退/卸载/重装       │
│       └─ workspace / pty 终端（保留，作为宿主功能）         │
└──────────────────────────────────────────────────────────┘
        ▲ 仅"跑进程 + 开 URL"，不 import dsh 任何代码（零适配）
        │
┌───────▼──────────────────────────────────────────────────┐
│ dsh 引擎（隔离的 Node 子进程，`dsh --profile web`）       │
│  · 模型 / 工具 / 会话 / 插件 / UI 全内置（自足世界）        │
└──────────────────────────────────────────────────────────┘
```

**关键区分**：

- dsh 的配置与更新目录（管理"这个 dsh 跑哪个 cli 版本"）——宿主**只读部分状态给 UI 展示，不编写**。

- 宿主持有的持久化层（存"当前选中的 dsh 版本 + 已装版本列表"）——宿主完全拥有。

- WebApp 托管服务（进程 + 端口）——宿主完全拥有，是未来接更多 WebApp 的地基（当前仅 dsh）。

***

## 2. 组件与模块分解

| 组件                   | 位置                                          | 职责                                                      |
| -------------------- | ------------------------------------------- | ------------------------------------------------------- |
| dsh 宿主区（中间区 content） | 前端 `features/dsh/`                          | 打开=渲染 dsh；关闭=渲染欢迎引导页                                    |
| dshTab 容器            | 前端                                          | 浏览器→iframe；Tauri→由后端 WebView 承载                         |
| 欢迎引导页                | 前端 `features/dsh/WelcomePage.tsx`           | "DeepSeek Harness"按钮；版本状态（当前/有更新）+ 重启 + 回退 + 卸载 + 重装 控件 |
| 关闭选择对话框              | 前端 `features/dsh/`                          | 关闭 dsh 时用户选择：保留进程 / 彻底退出                                |
| WebApp 托管服务          | Rust `crates/webapp-host/`                  | 进程守护 + 空闲端口分配 + URL 生成 + 就绪探测                           |
| 版本管理器                | Rust `crates/dsh-version/`                  | 查更新/升级/回退/卸载/重装/列已装（只读写选中版本，不写 dsh 配置）                  |
| IPC 契约               | `shared/ipc/` + bridge 三实现                  | 宿主区打开/关闭、版本状态查询、升级/回退/卸载/重装/重启动作                        |
| 桥接层                  | tauri-bridge / preview-bridge / mock-bridge | 三端一致接入 Rust 命令                                          |

***

## 3. 数据流

### 3.1 生命周期流（宿主完全拥有）

**进入 dsh（欢迎引导页 → dsh 界面）**

```
1. 前端 dshTab 挂载 → 调 IPC `dsh.open`（读"当前选中版本 + 已装版本"）
2. Rust WebAppHost: 若进程未起 → 空闲端口上 spawn `dsh --profile web <version>`
3. WebAppHost 返回 URL `http://127.0.0.1:<port>`
4. 前端：
   - 浏览器模式 → 把该 URL 设为中间区 iframe 的 src
   - Tauri 桌面 → 调用后端 WebView 命令，把 URL 加载进独立 WebView2 子窗口，并按中间区 rect 定位
5. dsh 铺满中间区
```

**关闭 / 回到欢迎引导页**

```
1. 前端调 IPC `dsh.close` → 弹"关闭选择对话框"（见 3.3）
2. 用户选择后：
   - 保留进程 → dsh 进程常驻，会话延续，重进秒开
   - 彻底退出 → 停 dsh 进程并清理
3. 中间区隐藏 WebView / 移除 iframe → 渲染欢迎引导页
4. 欢迎引导页显示：当前版本号 + "是否有更新"徽标 + [重启][回退] 等控件
```

### 3.2 版本管理流（宿主完全拥有数据；dsh 自身配置零写入）

```
1. 欢迎引导页加载 → IPC `dsh.getVersionStatus` → Rust 版本管理器
   - 读"当前选中版本" + "已装版本列表"（宿主持久化）
   - 读"最新可用版本"：npm registry / 固定源查询最新 tag（只读远程，不下载）
2. 升级 → IPC `dsh.update` → 下载安装新版本到宿主版本目录，更新列表与选中，返回新版本号 → UI 刷新
3. 回退 → IPC `dsh.revert` → 从已装列表切换选中 → 重起 dsh 进程
4. 卸载 → IPC `dsh.uninstall(version)` → 从已装列表移除
5. 重装 → IPC `dsh.reinstall` → 重新安装当前/指定版本
6. 重启 → IPC `dsh.restart` → 停旧进程 → 用当前选中重起 → 重新就绪探测
7. "有更新"徽标 = 最新可用 > 当前选中
```

**边界**：版本管理器只操纵"跑哪个 dsh cli 版本"，绝不写入/改动 dsh 自己的会话/配置/插件目录。

### 3.3 关闭选择对话框

- 关闭 dsh 时弹出"选择对话框"，由用户选择：**保留进程** 或 **彻底退出**。

- **复用项目现有 Dialog 模式**：参考 `BrowserDownloadPauseDialog` 的 props 结构、`useBrowserDialogs.ts` 的局部 state 管理、`BrowserPanelDialogs.tsx` 的组合渲染，以及 `browser.ts` i18n 文案组织。

- i18n：zh-CN / en-US 同步新增 key。

### 3.4 关键契约：宿主与 dsh 只见面这两条边界

| 边界    | 方向     | 内容                                         | 说明                |
| ----- | ------ | ------------------------------------------ | ----------------- |
| 拉进程   | 宿主→dsh | `spawn dsh --profile web`                  | 只传工作区/端口/版本，不注入逻辑 |
| 开 URL | 宿主→dsh | 把 `http://127.0.0.1:port` 给 iframe/WebView | 只显示，不加载 dsh 内部能力  |

除此之外无任何数据通道 —— 保证"独立、互不影响、API 变也不影响"。

***

## 4. 双端嵌入细节

### 4.1 浏览器模式（Preview）— iframe

- **形态**：中间区渲染 `<iframe src="http://127.0.0.1:<port>">`，铺满中间区。

- **悬浮层级**：iframe 是 DOM 元素，悬浮层/菜单/下拉天然盖在其上，无需任何避让（③在浏览器端零成本达成）。

- **存储隔离**：跨源 iframe，dsh 的 localStorage/cookies 与宿主天然隔离（行为同"浏览器单独开 dsh"）。

- **iframe 可嵌入性**：**若 dsh 拒绝 iframe 嵌入（X-Frame-Options / CSP frame-ancestors）**，宿主不硬嵌，退化为**在外部浏览器打开**，并显示提示"**在外部浏览器打开**"，提供按钮用系统浏览器打开 dsh URL。

- **实现点**：`dshTab` 组件在 preview bridging 下渲染 iframe。

> 备注：选项 A 下桌面走 WebView 全页加载不挑 iframe 限制，因此该条不阻塞 Tauri 端。

### 4.2 Tauri 桌面模式 — 独立 WebView2 子窗口（选项 A）

- **形态**：复用现有 child WebView 机制（`browser_create_for_tab` / `attach_webview_child`），新建 dsh 专用 WebView 标签，URL 指向 `http://127.0.0.1:<port>`，按中间区 rect 定位（`browser_set_tab_bounds`）。

- **悬浮层**：独立可见子窗口会盖在 DOM 悬浮层之上 → 复用现有避让逻辑（`useWebViewVisibility` 检测 overlay → `setTabBounds(-10000,-10000)` → 恢复）。这是选项 A 实际支付成本的地方。

- **能力边界（硬约束，须与 Google/Edge 打开 dsh 一致）**：

  - 该 dsh WebView 的 capability = **`browser-remote.json`**（仅 `core:default` 最小权限），**不得授予任何宿主原生命令**。

  - 含义：dsh 页面能正常渲染/发网络请求/用 localStorage（等同普通网页），但**拿不到你的 Tauri IPC / 文件系统 / 系统能力** —— 等价于浏览器里一个陌生网页不能碰你的 App。

  - **不接受项**：加载时不带你的菜单/控制条/你的原生 UI，是一个干净的第三方网页。

- **实现点**：复用 `browser_set_tab_bounds` + IPC bridge；新增 dsh WebView 生命周期（创建/定位/销毁）。

### 4.3 双端一致性

| 关注点          | 浏览器(iframe)                    | Tauri(WebView)                    |
| ------------ | ------------------------------ | --------------------------------- |
| 显示源          | `http://127.0.0.1:port` iframe | 同 URL 的 WebView2 子窗口              |
| 悬浮层          | 天然置顶（无避让）                      | 复用避让逻辑                            |
| 隔离边界         | 跨源 iframe 天然隔离                 | `browser-remote.json` 最小权限（等同浏览器） |
| 进程/端口        | 同 Rust WebAppHost 托管           | 同 Rust WebAppHost 托管              |
| URL/生命周期 IPC | 由 bridge 三实现统一                 | 由 bridge 三实现统一                    |

**核心**：双端共享同一套 Rust `WebAppHost`（进程 + 端口 + URL），只有"渲染层"分叉（iframe vs WebView）；IPC 契约与数据流完全一致，三桥对齐。

***

## 5. 进程与版本管理

### 5.1 WebApp 托管服务（Rust `crates/webapp-host/`）

- **职责**：进程守护 + 空闲端口分配 + URL 生成。当前只托管 dsh；未来更多 WebApp 即加实体。

- **进程模型**：

  - `spawn dsh --profile web`（以"当前选中版本"拉起），监听就绪探测（轮询 `GET :port` 直到 200）再回报 URL，避免前端过早挂 iframe/导航。

  - 端口分配：扫描空闲端口，绑定 dsh 并记下 → URL。

  - **关闭时**：不直接杀，弹选择对话框（见 3.3）→ 保留进程 / 彻底退出。

  - **崩溃/失联**：探测失败 → 状态置"未运行" → UI 提示并可通过"重新启动"恢复。

### 5.2 版本管理器（Rust `crates/dsh-version/`）

- **职责**：列已装 / 查更新 / 升级 / 回退 / 卸载 / 重装。

- **版本模型**：宿主维护"已装版本列表 + 当前选中 + 最新可用"。

- **动作流**：

  - 查更新：`getVersionStatus` → {currentSelected, installed\[], latestAvailable, hasUpdate}

  - 升级：`update` → 下载装到版本目录 → 更新列表与选中 → 返回新版本

  - 回退：`revert(version)` → 从已装列表切选中 → 重起 dsh 进程

  - 卸载：`uninstall(version)` → 从已装列表移除。**若该版本为当前选中 → 弹提示（说明"将清空当前选中，需切换/重装后再用"），但不强行阻止**，用户确认后照样卸载（用户事后可重装该版本）。

  - 重装：`reinstall` → 重新安装当前/指定版本。

  - 重启：`restart` → 停旧进程 → 用当前选中重起 → 重新就绪探测。

- **持久化**：宿主持久化层存 {selectedVersion, installedVersions}，与 dsh 数据隔离。

- **边界**：只作用于"宿主管理的 dsh cli 版本目录"，不碰 dsh 自身配置/会话/插件。

***

## 6. 错误处理与删除 Agent 引擎边界

### 6.1 错误处理

| 场景                    | 处理                                                        | 落点  |
| --------------------- | --------------------------------------------------------- | --- |
| dsh 进程启动失败 / 插件缺失     | WebAppHost 捕获 → "未运行"状态 → 欢迎引导页提示并可重启                     | 5.1 |
| dsh 运行中崩溃 / 失去响应      | 探测失败 → 标记"未运行" → UI 提示重起                                  | 5.1 |
| 端口被占 / 分配失败           | WebAppHost 重试空闲端口，仍败则报错                                   | 5.1 |
| 版本查询 / 下载 / 安装失败      | 版本管理器返回结构化错误（AppError），UI toast/dialog 提示，不阻塞当前已运行版本      | 5.2 |
| 卸载当前选中版本              | 弹提示（不强行阻止），允许卸载后可重装                                       | 5.2 |
| iframe 被 dsh 拒绝（浏览器端） | 退化为"在外部浏览器打开"，提示"在外部浏览器打开"                                | 4.1 |
| 前端调用 IPC 失败           | 三桥统一捕获 error（captureError / AppError / isFetching 模式），不静默 | 全局  |

**统一使用宿主现有错误/加载模式**，保证规范一致、可追踪。

### 6.2 删除 Agent 引擎重构的边界（独立前置重构，单独列）

- **范围**：删 `agent_loop`（实为嵌在 `agent` crate 内，需精确定位）、`conversation`、`mcp-client`、`provider` 等 crate；DB 表 `agent_runs`/`agent_steps`/`sessions`/`conversation_messages`；前端 agent/conversation/mcp/provider 组件与 store slice；IPC 契约相应裁剪。

- **宿主壳保留**：workspace、pty 终端、双端桥接基建、i18n/设计系统的宿主部分。

- **关键解耦点**：`ServerState` 移除 `McpClient` 等 Agent 字段；确认 workspace/pty/bridge 不再 import Agent 代码。

- **删除顺序**：先删叶子（无依赖的 crate/module）→ 再删 `server` 依赖的 handler/state 字段 → 裁 IPC 契约 → 前端 slice/组件 → DB 表 → 清理测试。

- **不违反边界**：删除不得破坏保留功能。

- **说明**：此节仅作主 spec 的边界声明，不展开全部删除细节，由后续独立 spec 承载。

***

## 7. 验收标准（主 spec：dsh 宿主区接入）

1. 中间区打开 → dsh 铺满；关闭 → 欢迎引导页（含"DeepSeek Harness"按钮 + 版本状态）。
2. 浏览器模式：dsh 用 iframe 显示；悬浮层天然置顶。
3. Tauri 桌面：dsh 用独立 WebView2 子窗口显示；悬浮层复用避让逻辑。
4. **Tauri dsh WebView 能力边界 == browser-remote.json（等同 Chrome/Edge 打开 dsh），不得授予宿主原生命令。**
5. 关闭弹选择对话框：保留进程 / 彻底退出，二者均生效。
6. 版本管理：查更新 / 升级 / 回退 / 卸载 / 重装 / 重启 均可用；卸载当前选中弹提示不强行阻止。
7. iframe 被拒绝时提示"在外部浏览器打开"并可用系统浏览器打开。
8. 双端共享同一 Rust WebAppHost，IPC 三桥一致。
9. 删除 Agent 引擎重构不破坏保留功能（该重构独立验收，见 6.2）。

***

## 8. 待后续细化（非阻塞）

- dsh 版本获取源的具体地址（npm registry / 固定镜像）。

- 版本目录结构与重装/卸载的底层存储格式。

- dsh 就绪探测的具体超时与重试次数。

- 关闭对话框、欢迎引导页的具体视觉与交互细节。

