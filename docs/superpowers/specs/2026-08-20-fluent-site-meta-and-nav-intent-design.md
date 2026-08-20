# 设计：浏览器面板 favicon/标题无闪烁 + 软导航不重载（Chrome/Edge 一致方案）

> 日期：2026-08-20
> 状态：已确认（用户批准 3 项决策，进入实施计划前）
> 关联进度文件：`docs/root-cause-resolution/2026-08/progress-2026-08-20-douyin-browser-panel.md`
> 范围：Tauri 桌面应用 - 右侧面板 - 浏览器面板。不实施（仅设计 + 待写实施计划）。

## 背景与根因（已从日志确认）

抖音（SPA）实测暴露两类问题：

1. **标签/历史 favicon 与标题"兜底→真实"闪烁**：favicon/标题仅异步来源 + 按**精确 URL** 缓存；新 `modal_id` URL 缓存未就绪即命中内置地球兜底，随后广播回填真实值；且 URL 形态 base↔`modal_id` 切换时 `applyBroadcastUpdate` 会先清空 favicon 再回填（`next:""`）。
2. **刷/切视频时整页重载**：`webViewSelfNavigatedRef` 为一次性消费的 FIFO Set，与 `useWebViewLifecycle` effect 多次重跑竞态；某次重跑误判"非 self-nav"→ `navigateTabInPool` → `WebView2.Navigate` 整页重载，丢失 SPA 状态。

## 设计目标

- 首屏即真实 favicon/标题，无"兜底→真实"闪烁，仅抓取失败才占位。
- 软导航（SPA pushState、锚点、back/forward）绝不触发宿主 `Navigate`；仅显式用户/应用导航才导航。
- 覆盖所有类型网站（含无 favicon、多 URL 形态、复杂 SPA redirect/multi-pushState）。

## 决策（用户已批准）

| # | 决策 | 结论 |
|---|------|------|
| D1 | 事项2 修复层级 | **Rust 导航事件层**：WebView2 事件边界区分真导航与软导航，导航意图驱动。 |
| D2 | 事项1 缓存归属 | **按 origin 缓存 + 兜底阶梯**。 |
| D3 | 地球兜底去留 | 有"首字母"终级兜底后，**删除** `IconWorld` 在 favicon 的兜底用途。 |
| D4 | 新增 IPC | **接受**新增"显式导航意图标记"IPC，闭环"仅在显式导航时 Navigate"。 |

---

## 事项1：favicon/标题 分级兜底（origin 索引 + 阶梯 + 首字母终级兜底）

### 目标行为

站点元数据（favicon + 标题）按 **origin（`scheme://host[:port]`）** 归属；任意 URL 形态（base↔`modal_id`）共享同一站点图标。查询命中即返回，未命中以"首字母"作为显示终级兜底，全程不再出现"地球占位→真实"闪烁或"好图标被清空"。

### `getFaviconUrl(url)` 解析阶梯（查询期与原实现分层）

| 层 | 来源 | 说明 |
|----|------|------|
| L1 | 精确 URL 缓存（data-URI 优先） | 保留现有精确命中路径 |
| L2 | **同 origin 站点图标** | 回落到 origin key 索引的 favicon（新增） |
| L3 | 根路径 `/favicon.ico` 探测 | 可选，后台按需懒探测一次并写入 origin 缓存 |
| L4 | **站点首字母**（显示兜底，非缓存） | 取代 `IconWorld` 地球，由组件根据 host 渲染 |

> 首字母兜底是**展示层**工具（类似现在地球的位置），不进入缓存；L1-L3 是缓存/抓取层。

### 组件改动（BrowserFavicon）

- 空缓存 / 图片加载失败（`degraded`）时，渲染**站点首字母**（host 首字符，可按主题着色、圆底）。
- **删除** `IconWorld` 作为 favicon 兜底的用途。
  - 说明：仅移除其在 favicon 兜底处的使用；若 `IconWorld` 在文件树等其他组件仍被使用，图标本身保留。删除前需 Grep 确认 `IconWorld` 的全部引用，决定删除范围。

### 关键约束（防闪烁根因）

- **成功抓取前不清空已有图标**：修复 `applyBroadcastUpdate` 中 `next:""` 清空反例；用合并守卫（空字段/无效值保留旧值）。
- **原子化显示**：favicon 与标题应尽量同一数据来源（origin 级 page-meta）同时到位，避免 favicon/标题分两次切换造成的视觉闪烁。
- 标题复用现有 `isPlaceholderTitle` / source 门控，仅"确属抓取失败"才显示占位。

### 后端（Rust `site_meta_cache` + `PageMetaService`）

- 抓取 favicon/标题成功后，除精确 URL 外，同时以 origin 建立索引入口。
- `getFaviconUrl`（后端或前端）查询支持"精确 → origin → `/favicon.ico`"解析。
- 持久化/Schema：评估 site_meta 记录加入 origin 维度（引用计数/生命周期），避免同站点重复抓取与膨胀。**边界**：不改动历史条目标题写入来源，仅优化呈现。

---

## 事项2：导航意图 vs 显示 URL 解耦（WebView2 事件边界）

### 核心原则

**不再因 `tab.url` 变化而反向 Navigate。** 仅当存在"显式导航意图"时导航；软导航只更新展示 URL 与历史。

### WebView2 事件语义切分（官方）

| 事件 | 是否真导航（网络请求） | 宿主应做的反应 |
|------|----------------------|----------------|
| `NavigationStarting` | 是（可取消）| 显式导航的兜底校验点 |
| `SourceChanged` | 否（URL 已变，含 pushState/锚点）| 更新展示 URL |
| `HistoryChanged` | 否（历史已变）| 更新历史；**绝不 Navigate** |
| `NavigationCompleted` | — | 清理 loading |

> SPA `pushState` 只触发 `HistoryChanged`（无网络请求、无 `NavigationStarting`）。因此它**不是真导航**，宿主必须不 Navigate。

### 显式导航意图（pending-nav）

- **触发点**（宿主主动导航）：地址栏回车、后退/前进（GoBack/GoForward）、历史/书签点击、新标签打开、恢复 tab 时同步。
- **机制**：该 tab 记录 pending 导航（URL + 目标 NavigationId/会话 token）。当对应 `SourceChanged` 且 URL 匹配到达时消费（标记清除）。
- **SPA pushState**：无 `NavigationStarting`、URL 与前 pending 不匹配 → 不消费 → 宿主永不 Navigate。
- **效果**：消除 `webViewSelfNavigatedRef` FIFO Set 一次性消费 + effect 多次重跑竞态。

### 改动清单

**Rust 侧：**
- `webview2_history.rs`：`HistoryChanged` 分支**不触发/不容许宿主 Navigate**；仅 `emit_url_changed` 更新展示 URL + 历史。
- 维护 per-tab 显式导航意图（pending-nav 表格 + 会话 token）。
- `navigate_tab` / `tauri_webview_handle::navigate` 仅由显式导航意图路径调用（保留原 warn 级导航日志，便于闭环验证）。
- 新增 IPC：显式导航意图标记（前端→Rust，含 tab + URL + token）。

**前端侧：**
- `useWebViewLifecycle`：**删除** `urlChanged && !selfNav → navigateTabInPool` 反向同步路径；`tab.url` 仅作展示；真实导航从显式用户动作发起。
- `webViewSelfNavigatedRef` Set 可移除（被 pending-nav 取代）。
- `useBrowserUrlChange`：`onUrlChanged` 仅更新展示 URL / 历史，不再维护 selfNav 标记。
- `tabUrlMapRef` 保留（用于"切换到已离屏 tab 恢复展示"），但不再据此反向 Navigate。
- **URL 归一化 key**：base≡`modal_id` 统一比较与写入，消除 `urlChanged` 振荡误判。

### 双端一致性（Tauri / 浏览器模式）

- 浏览器模式 `handleIframeLoad` 的 `expectedNavigationUrlRef` 语义对齐为**"显式导航才有 navigate"**，与 Rust pending-nav 语义统一。
- 三桥（tauri/preview/mock）IPC 签名一致（见 IPC 契约）。

### IPC 契约（D4）

新增（评估后确定）：
- `browser.markNavigationIntent(input:{ tabId, url, token })`：前端→Rust，登记显式导航意图。
- 返回 `IpcResult<void>`；三桥统一实现；错误走 `AppError`。

> 若评估发现可完全在前端"显式动作调用 navigate 命令"而无需额外标记命令，则取消此 IPC，改为"前端只在显式导航时才 invoke navigate" —— 待写实施计划时定。

---

## 错误处理 / 边界 / 覆盖

- **无 favicon 站点**：L4 首字母兜底，不落库。
- **多 URL 形态 SPA（base↔modal_id）**：origin key + URL 归一化共同覆盖。
- **SPA redirect / 多段 pushState / back-forward 缓存（BFCache）**：仅显式导航才 Navigate，天然不触发宿主重载。
- **清除逻辑**：origin 缓存无有效图标（404/500）→ 标无效，回落到首字母；不保留过期"必空"状态。
- **IPC/能力边界**：事项1 无需新增能力；事项2 需评估新增导航意图命令并同步 tauri capability / 三桥契约。

## 验证计划（修复实施后手动 + 受控）

- 抖音：首次打开标签/历史条目即为真实 favicon/标题，无闪烁。
- 抖音：刷/切视频不再整页重载。
- 多类站点：无 favicon、非 SPA、多子域同 icon 站点、`#` 锚点站点、redirect 站点。
- `cargo test -p <受影响crate>` / `vitest run <受影响测试>`（部分测试；全量留待 Phase 4 收尾）。

## 风险与回退

- 事项2 重构导航决策是行为变更：回归重点为"后退/前进/地址栏导航仍正常"——保留 warm 导航日志（`[warn] navigat/POTENTIAL RELOAD`）与前端 `NAVIGATE-triggered` 日志用于回归对照。
- 事项1 持久化 origin 索引需评估引用计数与存储膨胀；先后端按需抓取、避免重复。

## 未决项（实施计划时收敛）

- pending-nav 是否需真实 NavigationId，还是 URL+token 即可。
- `/favicon.ico` L3 是否本期启用（可默认关闭，留接口）。
- 是否新增导航意图 IPC 命令（见 D4 备注）。