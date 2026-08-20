# 进度 — 2026-08-20 (浏览器面板-抖音测试问题)

> 阶段：预检已通过（理解对齐 + 用户确认"先加日志实测后定根因"）
> 调研：已完成（Edge/Chrome favicon 兜底分级、SPA pushState 软导航）

## [x] 事项 1：标签/历史条目 favicon 与标题"兜底→真实"闪烁
- 状态：进行中（**根因已确认**，待实施修复）
- 现象：已打开标签页、历史目录下的条目，favicon/标题先显示占位（兜底），再变为真实值
- 日志证据（.adl-logs/debug-logs.txt，本次重测 @ 12:57:55 ~ 12:59:13）：
  - `[browser-favicon] render { url:"...jingxuan?modal_id=7666786391379954984", ..., cached:"" }`（**L800, L803**）→ **新 modal_id 的精确 URL 缓存未就绪** → `getFaviconUrl` 返回 `''` → `BrowserFavicon` 显示内置占位图标
  - `[browser-favicon] applyMetaUpdate changed { prev:"...favicon.ico", next:"" }`（**L286**）+ `{ prev:"", next:"...favicon.ico" }`（**L293**，27ms 内）→ **URL 形态切换（base↔modal_id）时 favicon 被清空再回填** → 可见图标消失/闪烁
  - 同 URL 已被填缓存时 render 返回 host 共享图标（如 L1-10 `.../favicon/10.png` 复用于多个 modal_id 变体、L715 base64 data-URI）→ 证明**存在部分 host 级共享命中，但精确 URL miss（L800）与 applyMetaUpdate 清空（L286）仍导致闪烁**
  - 标题同理：`[browser-page-meta] broadcast-title-apply { curTitle:"", ..., applied:true }`（**L242, L295**）→ 标题由空/占位切换为真实
- **根因（已确认）**：favicon 与标题**只有异步来源**，且**按精确 URL 缓存、时机异步才回填**：
  1. `getFaviconUrl`（favicon.ts）为**精确 URL** 查 siteMetaCache，命中才返回、否则 `''`；新 modal_id / URL 形态变化的条目首次渲染时该 URL 缓存尚未就绪 → 返回 `''` → 显示内置占位图标（L800/803）
  2. 真实值随后由 (a) 异步读库水合、(b) page-meta 广播、(c) 历史标题写入 到达，触发重渲染切换 → 可见"兜底→真实"闪烁
  3. **URL 形态振荡加剧**：base（无 modal_id）与 `modal_id=XXXX` 两种 URL 属不同缓存 key，切换时 `applyMetaUpdate` 将 favicon 清为 `''`（L286）再回填（L293）；Edge/Chrome 用「精确URL → 同 host → 外部服务 → 首字母默认」分级，本实现精确 URL 未命中即兜底 → 闪烁更明显
- 修复方向（待用户确认后实施，Edge/Chrome 式分级）：
  - `getFaviconUrl` 增加 **host 级 favicon 回落**（同站点任何 URL 复用站点 favicon），减少冷缓存时的兜底图标
  - 归一化 base≡modal_id 的缓存 key，避免 URL 形态导致的缓存 miss
  - 标题侧复用现有 `isPlaceholderTitle` / source 门控，确保"仅获取失败才显示兜底"
  - 补充（设计已确认 2026-08-20）：采用 **origin 缓存 + 兜底阶梯 + 站点首字母终级兜底**；**删除** `IconWorld` 地球兜底用途（D3）。详见设计文档 ↓
  > 设计文档：`docs/superpowers/specs/2026-08-20-fluent-site-meta-and-nav-intent-design.md`（事项1/事项2 方案、IPC 契约、验证计划）
- 验证：待修复实施后实测抖音，确认首屏即真实 favicon/标题、无兜底闪烁

## [x] 事项 2：刷/切视频时网页自动刷新重载
- 状态：进行中（**根因已确认**，待实施修复）
- 现象：抖音刷视频/切视频时，网页自动刷新重新加载
- 日志证据（L175~L929 的"刷视频"过程 + 4 处重载点）：
  - `[browser-url-change] onUrlChanged` 交替上报 **base 形态** URL `.../search/音乐合集?aid=...&type=general` 与 **modal_id 形态** URL `...&modal_id=XXXX&type=general`（如 L368/L929）
  - `[webview-lifecycle] urlChanged-decision` 多数命中 `inSelfNavSet:true, setSize:1 → skip-navigate-selfNav`（SPA pushState 软导航被正确跳过，L175/279/308/…）
  - **重载点**（4 处）——`urlChanged-decision { inSelfNavSet:false, setSize:0, action:"NAVIGATE-TAB" }`（**L716 / L744 / L801 / L927**）→ 约 1ms 后 `NAVIGATE-triggered`（**L717 / L745 / L802 / L928**）
  - 关键：重载时 `setSize:0` —— 即上一次 self-nav **已把标记消费掉，Set 为空**
  - **决定性证据（重载触发来源）**：`NAVIGATE-triggered` 的 `stack` 显示其由 React **被动 effect 重跑**触发——`commitHookEffectListMount → commitPassiveMountEffects → runWithFiberInDEV → activateOrCreate（useWebViewLifecycle.ts:107）`，即**同一 tab 因 activeTab store 多次更新而反复重跑 effect**，非地址栏/用户导航
  - **紧邻佐证**：L929（12:59:13.679，重载后 2ms）收到新 `modal_id=7672709159372033295` 的 `onUrlChanged` → 说明 WebView 已 SPA 导航到新视频，但应用刚对 base URL `/jingxuan` 触发了一次 Navigate 整页重载
- **根因（已确认）**：`webViewSelfNavigatedRef` selfNav Set 是**一次性消费的 FIFO 标记**，与 `useWebViewLifecycle` effect 的**多次重跑**存在竞态：
  1. 抖音 SPA `pushState` → WebView2 `HistoryChanged` → Rust `emit_url_changed` → 前端 `onUrlChanged` 把当前 URL 写入 `webViewSelfNavigatedRef`（Set 上限 10，随 `branch-eventTab` 更新 tab.url）
  2. 同一次刷视频伴随 favicon/标题/历史多条广播 → `activeTab` 多次 store 更新 → `useWebViewLifecycle` effect **对同一 tab 反复重跑**
  3. 第一次重跑命中 Set 并 `selfNav.delete()` 消费掉标记（`inSelfNavSet:true, setSize:1→0`）
  4. 第二次/第 N 次重跑时 Set 已空（`setSize:0`），而 `tab.url` 与 `tabUrlMap` 仍因 base↔modal_id 振荡而不一致（`urlChanged=true`）→ 判定"非 self-nav" → `navigateTabInPool` → `WebView2.Navigate(tab.url)` → **整页重载**，丢失 SPA 状态（视频位置/歌曲）
  - 次要因素：base 与 modal_id 两种 URL 形态竞速写入 `tab.url`，加剧 `urlChanged=true` 与 Set 内容不匹配
- 调研结论（SPA pushState 软导航）：pushState 属软导航，浏览器不应触发资源重载；本次重载确系应用自身重复调用 Navigate 造成
- 修复方向（设计已确认 2026-08-20，待实施）：
  - **Rust 导航事件层**（D1）：区分 `HistoryChanged`（软导航/无网络）与 `NavigationStarting`/`SourceChanged`（真导航）；`HistoryChanged` 绝不触发宿主 Navigate，仅 `emit_url_changed`
  - **显式导航意图 pending-nav**（D4 接受新增 IPC）：仅地址栏/后退前进/历史书签/新标签等显式导航才 Navigate；SPA pushState 无 `NavigationStarting` → 不消费 → 不重载；消除 selfNav FIFO 一次性消费 + effect 重跑竞态
  - **前端**：删除 `useWebViewLifecycle` 中 `urlChanged && !selfNav → navigateTabInPool` 反向同步；`tab.url` 仅展示；`webViewSelfNavigatedRef` 可移除
  - URL 归一化 key 统一 base≡modal_id，消除 `urlChanged` 振荡误判
  - 双端一致：浏览器模式 `expectedNavigationUrlRef` 对齐"显式导航才有 navigate"
  > 设计文档：`docs/superpowers/specs/2026-08-20-fluent-site-meta-and-nav-intent-design.md`
> 实施计划：`docs/superpowers/plans/2026-08-20-fluent-site-meta-and-nav-intent.md`（6 任务，待用户选执行方式后实施）
- 验证：待修复实施后实测抖音刷视频/切视频，确认不再整页重载
- 说明（日志缺口）：Rust 侧 `navigate_tab`/`tauri_webview_handle::navigate` 的 `[warn]` 未出现在日志（debLog 仅捕获到前端 console + TAURI 部分）；前端 `NAVIGATE-triggered` 已带调用堆栈，足以证明重载决策发生在 `useWebViewLifecycle`，需确认 Rust WebView2.Navigate 日志在重编译/日志转发下可见（用于最终闭环验证）

## [ ] 事项 3：调试日志收集与验证
- 状态：已完成日志分析（根因已确认）
- 说明：已读取 .adl-logs/debug-logs.txt（1000 行，840 处调试标记），确认两个事项根因；Rust 导航日志未见（见事项 2 说明），待修复验证时补闭环