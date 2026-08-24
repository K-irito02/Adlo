# 浏览器「已打开标签页」挂起策略：闲置时长 + 系统内存压力（Edge 式 + Chrome 式）

- 日期：2026-08-24
- 状态：设计已获用户认可（分 4 节），待实施
- 关联进度：`docs/root-cause-resolution/2026-08/progress-20260824-browser-tab-design.md`（事项 4）

## 背景与目标

调研 Chrome/Edge 后，当前实现把「不活跃标签」按**固定 WebView 池容量 6（LRU 驱逐）**管理。这与 Chrome/Edge 的「资源/时间驱动」不一致：Chrome 按内存压力、Edge 按闲置时长，均**不设固定数量上限**。

目标：把触发机制改为 **Edge 式（闲置时长）+ Chrome 式（系统内存压力）双重策略**，移除数量封顶，并接入设置系统可配置。保护规则（pinned / 播放音频 / 活动标签不挂起）与「被挂起标签仍留在列表、重激活重载、月图图标」的可见语义保持不变。

## 关键技术约束

- 项目基于 Tauri **WebView2**，无 Chromium 式按标签 freeze API；隐藏 WebView2 页面仍常驻并吃内存。
- 因此「Edge 式休眠」与「Chrome 式丢弃」在本架构的**落点动作相同**：关闭该 WebView（`destroyTab`）+ 保留标签（月图图标）+ 重新激活时重载。
- 差异只在**触发时机**：闲置时长 vs 内存压力。
- 无法实现 Edge 的「休眠后内存保留、秒级恢复」效果。

## 架构与组件（第 1 节）

- **方案 A（已选）：前端统一编排，Rust 提供原语。**
- 前端是唯一「谁该挂起」决策者（持有标签列表、闲置时间、保护标记）。

### 新增（前端）

- `useBrowserSuspendScheduler`（`features/browser/`）：挂起决策者，setInterval ~20s：
  - **Edge 式**：遍历 `browserTabs`，凡「非活动 ∧ 在池 ∧ 非 pinned ∧ 非播放音频 ∧ `now − lastActiveMs > idleMs`」→ `removeFromPool(tabId)`（→ Rust `destroyTab` close）。tab 留列表，显示月图图标。
  - **Chrome 式**：调 `window.digitalLife.browser.memoryPressure()`；若吃紧，按 LRU（池中最久未激活）逐个挂起非保护非活动页，直到恢复或无可挂起。
- `useBrowserLastActive`（或并入上述 hook）：ref map 记录每 tab 最近激活时间（`browserSelectTab` / 新建 tab 时更新）。
- 双端启用：浏览器（iframe）模式同样用该调度器；`memoryPressure()` 在浏览器模式返回 `false`（无系统内存概念）。

### Rust 改造（移除数量封顶）

- `BrowserPool::register()`：取消「满容量即驱逐」分支；删除 `POOL_CAPACITY` / `DEFAULT_POOL_SIZE`。`activate_tab` 仍遍历池 show/hide。
- 移除 `protected` 集合 + `set_protected`（保护判定移到前端调度器）。
- 移除命令 `browser_set_tab_protected`（main.rs 注册 + Rust + 三端桥 + 前端 `setTabProtected` 依赖）。
- 新增命令 `browser_memory_pressure() -> IpcResult<bool>`：Windows 用 `GlobalMemoryStatusEx` 读可用内存，满足「可用内存 < 1GB 或 可用比例 < 总内存 10%（任一成立）」→ true。

### 前端 useBrowserPool 简化

- 删 `POOL_CAPACITY`、`evictLocalLRU`（无容量）；`createWebViewForTab` 不做本地容量驱逐；保留 in-flight 守卫与 `removeFromPool`（现在唯一挂起动作）。
- 删 `setTabProtected`/`protectedRef` 的 Rust 同步（调度器读取 `tab.isPinned`/`isPlayingAudio` 原地判定）。

### 浏览器模式 iframe 一致性

- 移除 `BrowserIframeStack` 的 `IFRAME_POOL_SIZE = 5` 硬上限与独立 `iframeLruOrderRef` 驱逐，改为跟随「是否在池」渲染。`evictedTabIds` 继续由「不在池」推导。

## 数据流与竞态防护（第 2 节）

1. 激活：`browserSelectTab` → 记 `lastActiveMsRef`；不在池→`createWebViewForTab`，在池→`activateTabInPool`。
2. 闲置触发 → `removeFromPool` → Rust close → 月图图标。
3. 内存触发 → 按 LRU 逐个挂起。
4. 恢复：点标签 → 不在池 → 新建重载。

竞态防护：
- 调度器 tick 开始快照 `activeTab.id`，排除活动标签；`removeFromPool` 内部再校验 `tabId !== currentActiveId`；tick 中被激活则跳过该候选。
- `memoryPressure()` 返回后逐个挂起前复核「在池 ∧ 非活动 ∧ 非保护」。
- 保留 in-flight 创建守卫（`creatingRef`）。
- 单 tick 最多挂起到「恢复内存 / 无候选」，避免一次全挂。
- 挂起只经 `removeFromPool` 单一路径，避免状态漂移。

## 设置项（第 3 节）

- 新增偏好字段 `browserInactiveTabSuspendMs: number`（毫秒），默认 `3_600_000`（1h，Edge 默认）。UI 以「分钟」显示档位：关/OFF、5、15、30、60、120。
- 接入：`crates/types/src/types/config.rs` + `src-tauri/src/commands/app.rs` 的 `app_update_preferences`；前端 `kernel/types.ts`、`preferencesMerger.ts`；`useBrowserSuspendScheduler` 从 `appInfo.config` 读取。
- 新增设置区段 `BrowserPerformanceSettings.tsx`（参考 `WorkspaceSettings` 模板：`SettingsHeader` + `adl-settings-row`），值变化 → `updatePreferences({ browserInactiveTabSuspendMs })`。
- i18n：browser 领域字典加 key（zh-CN/en-US）。
- 内存低水位阈值本期用**常量**（可用内存 <10% 或 <1GB），不进设置。

## 错误处理与测试（第 4 节）

错误处理：
- `memoryPressure()` 失败 → `console.warn` + 按 false 处理，不崩溃。
- `removeFromPool` 内 `destroyTab` 失败 → `console.warn` + 保留 tab，下一 tick 重试。
- 调度器 tick 全程 try/catch，单次异常不阻断后续 tick。
- 面板隐藏时调度器暂停。

测试：
- 前端单测：候选选择（排除活动/pinned/音频）、闲置判定、内存压力 LRU 挂起顺序、竞态守卫。
- Rust 单测：`BrowserPool::register` 不再驱逐；`browser_memory_pressure` 返回 `bool`；`GlobalMemoryStatusEx` 封装。
- 桥接测试：三端 `memoryPressure()` 对齐；`setTabProtected` 清理无残留引用。

## 明确不做（本期范围外）

- 不做 Edge「休眠后保留内存秒级恢复」——WebView2 能力限制。
- 不做内存低水位的设置项（本期常量）。
- 不做站点例外列表（「始终活跃」），沿用现有 pinned/音频保护。