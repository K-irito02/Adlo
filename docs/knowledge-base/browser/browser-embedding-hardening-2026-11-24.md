# 内置浏览器加固经验（2026-11-24）

本轮把中心/面板浏览器从「各自独立的 WebView2 会话」改为默认共享 profile，并集中修复 DSH 认证、下载、崩溃与 sidecar 生命周期。以下按根因归类，便于后续复用。

## 1. DSH 裸 URL 必 401：认证入口只能从 stdout 捕获

- 现象：打开中心入口页后进入 DSH 401 认证页；日志显示 `reusing running instance url="http://127.0.0.1:3080/"`。
- 根因：DSH 的 launch token 是进程内随机值，只从启动 stdout 打印的入口 URL 可取；复用外部/孤儿实例时只能拿到裸 URL。
- 修复：用户动作 `/dsh/open` 在「外部启动 + 裸 URL 无 token」时经既有 `/dsh/restart` 重启一次以捕获认证入口；`pre_start` 不触发（避免应用启动即杀外部进程）。重启失败回退原 URL 并标记 `restartedForAuth`，由页面展示 401 或连接错误。
- 注意：dsh 0.2.1-rc.5 没有 `--print-url`；`--no-open` + 默认 `printUrl` 即可打印带 token 的 URL。

## 2. adl-server 强杀后的孤儿进程

- 根因：父进程被强杀时不执行任何清理代码，`Child` 句柄消失但 sidecar 继续运行。
- 修复：Windows **Job Object**（`KILL_ON_JOB_CLOSE`）在 spawn 后立即接管 sidecar，父进程死亡时由系统终止成员；正常退出路径再由 `RunEvent::Exit` / `ExitRequested` 调 `terminate()`。
- 边界：spawn → `AssignProcessToJobObject` 之间仍有毫秒级窗口，父进程此刻被强杀可能留下孤儿；注释不要把它写成已覆盖。

## 3. `file://` 中文路径导致整个应用崩溃

- 现象：打开本地收藏夹 HTML 后 wry 在 `webview2/mod.rs` panic `InvalidUri`，进程 `STATUS_STACK_BUFFER_OVERRUN`。
- 根因：wry 把每条 `chrome.webview.postMessage` 当 Tauri IPC，用消息来源 URL 构造 `http::Uri`；`file://` 未编码中文路径非法，`Request::builder().uri(url).unwrap()` 直接 panic。
- 修复（三层）：
  1. vendored wry 对 `adl-browser-view-*` / `adl-silent-view-*` **不注册** IPC handler；
  2. 注入脚本只在 http(s) 文档发送宿主消息（file/about 由原生事件兜底）；
  3. 标题回填脚本同样加协议守卫。
- 注意：`src-tauri` 的 `include_str!` 断言同时锁补丁调用点、两个 label 前缀与 `[patch.crates-io]` 路由，防止重新 vendor 静默丢失。

## 4. 普通站点 blob 下载：postMessage + 共享落盘

- 根因：浏览器 WebView 没有 Tauri IPC（`withGlobalTauri:false`，且 patched runtime 跳过其 label），旧实现依赖 `window.__TAURI__.core.invoke('download_save_blob')` 永不生效。
- 修复：所有站点拦截显式 `<a download>` 的 `blob:` 链接（agent 站点保留全量），经 `chrome.webview.postMessage({type:'save-blob'})` 交给宿主；`save_blob_download` 统一做文件名净化、base64 解码、64 MiB 原始字节上限、冲突改名、下载记录。
- 失败可见性：宿主净化失败、页面侧超限/抓取失败都发 `browser-download-error`（带 `fileName`），前端对「无记录 + 有文件名」弹失败 toast；页面侧文件名先取 basename 并在 255 字符处截断（保留扩展名、不切断代理对）。
- 源标签：`save_blob` 带 `tab_id` 写入 `source_tab_id`，使标签在下载期间受挂起调度器保护。

## 5. 共享浏览配置文件：默认共享、可回退隔离

- 背景：冷启动的独立中心 profile 更容易触发 Google/Bing 风险控制（A/B：中心 5/5 → 0/5 触发）；共享后登录态/缓存一次生效。
- 决策：设置「浏览器 → 共享浏览配置文件」默认开（ADR 0001 修订）；关闭后中心回到独立 UDF，面板/静默维持原拓扑。
- 快照：标签在**创建时**记录 `shareProfile`，挂起重建/重启恢复沿用；设置切换只影响此后新建标签。三条建标签入口都必须写入快照。
- 代价：同一 UDF 内 `PreferredColorScheme` 联动仍存在，共享模式接受该风险；仅对新建标签生效。

## 6. 新标签 referrer 与地址栏

- `target=_blank`/修饰键点击经 postMessage 带 referrer（默认策略同源完整 URL、跨源 origin；尊重 `rel="noreferrer"`、`referrerpolicy`、`<meta name="referrer">` 与 HTTPS→HTTP 降级）；前端一次性 `browserTabReferrers` 消费后清除，关闭标签时清理。
- 原生 `NewWindowRequested` 与浏览器模式不携带 referrer。
- 地址栏带 scheme 的输入只做完整 URL 精确匹配（忽略末尾 `/`），不再做历史前缀匹配，避免根 URL 被更长历史路径劫持。
