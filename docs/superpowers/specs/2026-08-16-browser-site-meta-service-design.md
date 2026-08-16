# 浏览器面板"网站图标与标题"集中式服务层改造设计

日期：2026-08-16
状态：已确认（方案 B v2）
适用范围：`ai-digital-life/` 实现工作区（Rust + Tauri 2.x + React 前端）

## 1. 背景与目标

### 1.1 用户观察到的现象

在应用程序右侧面板的浏览器面板中，标签（书签）的"网站图标（favicon）与标题名称"存在三类问题：

1. **同一网址的图标/标题表现不一致**：有时真实图标与兜底图标互相切换（真实→兜底、兜底→真实）；同一网址在收藏、历史、已打开标签页三个目录中标题可能不同。
2. **打开应用时图标/标题延迟显示**：部分书签的图标与标题不显示或延迟出现。
3. **"刷新网站图标与标题"按钮行为不完整**：点击后书签节点的标题不更新。

### 1.2 根因诊断（现状代码证据）

| 编号 | 根因 | 代码位置 |
|---|---|---|
| R1 | 渲染失败 `onError` 删除持久缓存 → 缓存丢失 → 每次打开应用重复失败加载，图标在"真实图标 ↔ Google S2 兜底"间反复切换，且兜底成功后不回写缓存 | `frontend/src/app/components/BrowserFavicon.tsx:63` |
| R2 | com 源图标预加载**失败也写缓存**（`img.onerror = writeEntry`），坏 URL 进入缓存，与 R1 联动 | `frontend/src/app/features/browser/useBrowserPageMeta.ts:239` |
| R3 | 缓存无 TTL/过期机制：`fetched_at` 已持久化但从未参与读取决策，网站更换图标后永不更新 | `frontend/src/app/utils/siteMetaCache.ts`、`crates/browser/src/site_meta_cache.rs` |
| R4 | 打开应用时缓存异步预载，就绪前 `BrowserFavicon` 渲染**空白占位**；仅有 `favicon_url`（无 dataUri）的节点靠渲染时才逐个网络加载，无批量预热 | `BrowserFavicon.tsx:41-48` |
| R5 | "刷新网站图标与标题"只更新打开标签标题或历史标题，**不更新书签快照标题**（书签节点仅写全局缓存） | `frontend/src/app/features/browser/useBrowserTagActions.ts:40-80` |
| R6 | 唯一外部兜底为 Google S2（16px 缩略图放大，质量低），无更高质量的真实图标兜底 | `frontend/src/app/utils/favicon.ts` |
| R7 | 缓存键（保留 query）与标题去重键（剥 tracking 参数）两套规范化不一致 → 带 tracking 参数的"同一网址"缓存命中不一致 | `siteMetaCache.ts:normalizeUrlForCache` vs `browserDisplayUtils.ts:historyDedupKey` |
| R8 | 标题溯源/去重/质量门控逻辑分散在前端 `useBrowserPageMeta.ts`（约 300 行），与图标缓存分散在 `siteMetaCache.ts`/`BrowserFavicon.tsx`，前后端职责边界不清，写缓存入口不唯一 | 多处 |

### 1.3 目标

- 消除 R1/R2：渲染失败与抓取失败永不删除持久缓存；图标不再来回切换。
- 消除 R3：缓存 TTL + 后台刷新（stale-while-revalidate），网站换图标后能自动更新。
- 消除 R4：打开应用立即显示占位图标（非空白）+ 启动批量预热，消除延迟。
- 消除 R5：刷新按钮同步更新书签快照标题（仅当快照为占位标题时）。
- 消除 R6：回退链升级为 真实图标 → `/favicon.ico` → DuckDuckGo → Google S2 → 内置占位。
- 建立**集中式服务层**：图标与标题的抓取、缓存、合并、回退、失效、广播全部收归后端唯一事实源；前端只做展示、事件转发与交互。

### 1.4 外部参考（同类型产品方案）

- Chromium FaviconService + LargeIconService：本地抓取 HTML 图标 + 缓存 + 缺失时从 Google 服务器兜底拉取（https://chromium.googlesource.com/chromium/src/ 、 http://codereview.chromium.org/2721363002 ）。
- Chrome 书签/扩展 `chrome://favicon`：直接读内核已加载 favicon，成功率约 95%（https://stackoverflow.com/posts/10670365/revisions#1 ）。
- DuckDuckGo Favicon API：`https://icons.duckduckgo.com/ip3/{domain}.png|.ico`，返回真实网站图标（https://www.logo.dev/docs/duckduckgo-favicon-api 、 https://docs.brandfetch.com/comparisons/duckduckgo-favicon-api ）。
- Google S2 Favicon API：`sz=64` 为 16px 缩略图放大，质量低，仅作最后兜底（https://docs.brandfetch.com/comparisons/google-favicon-api ）。
- Dashy 图标源多级回退与 linkding favicon 改进讨论（https://github.com/alydemah/dashy/blob/master/docs/icons.md 、 https://github.com/sissbruecker/linkding/issues/465 ）。

## 2. 方案选型

| 方案 | 描述 | 结论 |
|---|---|---|
| A | 现状架构（多源获取 + 三层缓存）上逐项修复 R1-R8 | 备选；修复面分散，写缓存入口仍不唯一 |
| B | 后端集中式服务层：图标+标题统一收归后端唯一事实源 | **选定**（用户确认） |
| C | 优先用 WebView2 内核原生 favicon | 否决：WebView2 无官方 favicon API；预览 iframe 模式无法同等实现，破坏双端一致性 |

方案 B 的关键理由：
- 与 Chromium FaviconService 架构同构，方向正确。
- 写缓存入口唯一化，从机制上杜绝 R1/R2 类不一致。
- 标题合并引擎（溯源/去重/质量门控）从 React hook 迁出为可单测的纯逻辑，双端同构实现。
- 预览模式已有同构基础（`siteMetaBackends` 的 tauri/preview/mock 三适配模式），双端一致性可保持。

## 3. 架构设计

### 3.1 总体架构

```
┌────────────────────────────────────────────────────────┐
│ 前端 (WebView) — 只做"展示 + 事件转发 + 交互"            │
│  · BrowserFavicon → useFavicon(url): peek/get/订阅      │
│  · 展示层标题解析: resolveDisplayTitle(快照标题, metaTitle)│
│  · 事件转发: com/iframe 实时事件 → pageMetaClient.report()│
│  · 交互: 刷新 → pageMetaClient.refresh(); 启动预热 warmup│
└──────────────┬─────────────────────────────────────────┘
               │ IPC: browser_page_meta_get/report/refresh/warmup
               │      事件: page-meta-updated {url,title,faviconUrl,dataUri}
┌──────────────▼─────────────────────────────────────────┐
│ Rust PageMetaService（唯一事实源，仿 Chromium 架构）     │
│  ├─ 合并引擎: per-URL 标题溯源 + 图标质量门控            │
│  ├─ 抓取引擎: HTML解析(html_meta.rs) → 图标下载 → dataUri│
│  ├─ 回退链: 真实图标 → /favicon.ico → DDG → Google S2 → 空│
│  ├─ 缓存: SQLite + 内存, TTL 7天 + SWR + 指数退避        │
│  ├─ 单飞行合并(同URL并发1次) + domain限速 + robots门控   │
│  └─ 广播: page-meta-updated → 前端所有相关节点原位更新    │
└────────────────────────────────────────────────────────┘
预览模式: previewPageMetaService（同构 JS 实现 + JSON 持久层）
前端经 PageMetaClient 适配器（tauri/preview/mock）双端一致
```

### 3.2 职责边界

| 能力 | 归属 |
|---|---|
| 图标抓取/HTML 解析/图标字节下载转 dataUri | Rust PageMetaService（预览：previewPageMetaService） |
| 标题 http 抓取（`<title>` → `og:title`） | 同上 |
| 标题合并决策与持久化（per-URL 权威 {title, source}、占位判断、来源优先级、去重） | 同上（从 `useBrowserPageMeta.ts` 迁移决策逻辑） |
| 图标质量门控（低质量不覆盖高质量、dataUri 不可覆盖） | 同上（从 `faviconQuality.ts` 迁移） |
| 图标/标题缓存（内存 + SQLite/JSON + TTL + SWR + 失败退避） | 同上；写路径唯一入口在服务端 |
| 前端只读镜像（预载 + 广播驱动的内存 Map） | 前端（读缓存展示用，不产生写） |
| 回退链决策 | 同上 |
| 单飞行合并、domain 限速、robots 门控 | 同上（复用现有 `robots_policy.rs`/`robots_txt.rs`/限速器） |
| 元数据广播（`page-meta-updated`） | 同上 → 前端订阅 |
| com/iframe 实时事件转发 | 前端桥接 → `pageMetaClient.report()` |
| per-tab 应用门（广播标题是否应用到某个标签） | 前端：`titleSourceRef`（per-tab 来源）+ 占位判断（约 20 行，见第 5 节） |
| 展示层标题解析（快照 vs 服务端标题） | 前端（`resolveDisplayTitle`） |
| 书签快照标题落库（仅占位时覆盖） | 前端（现有 bookmark store action） |
| 启动批量预热 | 前端发起 `warmup(urls)` |

### 3.3 数据模型（SQLite，未发布阶段直接改 schema，无迁移）

```sql
CREATE TABLE IF NOT EXISTS site_meta_cache (
    url TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    title_source TEXT NOT NULL DEFAULT '',   -- 新增: com|http|iframe|google|''
    favicon_url TEXT NOT NULL DEFAULT '',
    favicon_data_uri TEXT NOT NULL DEFAULT '',
    fetched_at INTEGER NOT NULL,
    last_ok_at INTEGER NOT NULL DEFAULT 0,    -- 新增: TTL 依据
    next_retry_at INTEGER NOT NULL DEFAULT 0, -- 新增: 失败退避
    fail_count INTEGER NOT NULL DEFAULT 0     -- 新增: 指数退避计数
);
```

- 预览模式 JSON 持久层同步扩展同名字段（`.adl-cache/site-meta-cache.json`）。
- 表结构变更属未发布阶段的 schema 演进，直接修改 `CREATE TABLE` 与 Rust 结构体，禁止添加迁移/兼容代码。

## 4. 四条主数据流

### 4.1 渲染读取（useFavicon）

1. `BrowserFavicon` 挂载 → `peek(url)`：读**前端只读镜像**（应用启动时由 `initSiteMetaCache` 从服务端 `get_all` 预载，之后由广播与 `get` 结果驱动更新）→ 立即返回 best（dataUri 优先，其次 faviconUrl，其次回退链 URL，最后空）。
2. 镜像未命中或缓存过期（SWR）→ `get(url)` 异步：
   - 服务端内存命中且未过期 → 直接返回（前端镜像同步更新）；
   - 过期 → 先返回旧值（立即显示），后台重抓，成功后广播替换；
   - 无缓存 → 单飞行合并抓取（同 URL 并发请求共享同一次抓取）→ HTML 解析 → 回退链 → 图标下载 → 写缓存 → 广播；
   - 抓取失败 → 更新失败计数与 `next_retry_at`，返回现有缓存或空（不删缓存）。
3. 订阅 `page-meta-updated` → URL 匹配则原位更新镜像与图标。

### 4.2 实时上报（com / iframe）

1. WebView2 `meta-changed` / iframe `load` 事件 → 前端桥接捕获 `{title, favicon, url, source}`。
2. 前端 `pageMetaClient.report(meta, source)` → IPC `browser_page_meta_report`。
3. 服务端合并引擎按 per-URL 权威值决策：
   - 标题：`isPlaceholderTitle`（空/URL/裸域名）可被任何来源覆盖；`http`/`iframe` 可覆盖任意；`com` 仅覆盖占位或同为 `com`/`google` 的权威标题（防 SPA 陈旧 title 覆盖真实标题）。决策结果更新 per-URL 权威 `{title, source}` 并持久化。
   - 图标：`shouldReplaceFavicon` 质量门控（dataUri 不可覆盖；低质量不覆盖高质量）。
4. 命中 → 写缓存 + 广播 `page-meta-updated`（payload 含 `{url, title, faviconUrl, faviconDataUri, source}`）→ 前端按第 5 节的 per-tab 应用门更新匹配标签的 tab.title / history.title / 展示层标题 / 图标。
5. 行为等价性：同 URL 多标签时，占位标签仍可被 com 广播补全（应用门中的占位规则），真实标题标签不被 com 覆盖（source 规则）——与现状 per-tab 溯源行为一致。

### 4.3 HTTP 抓取（导航 / 地址栏 / 新建收藏）

1. URL 变化（Tauri `onUrlChanged` / 地址栏提交 / 新建收藏对话框）→ 前端 `pageMetaClient.get(url)`（或复用 4.1 路径）。
2. 服务端抓取 HTML → 标题 + 图标**原子**写缓存（标题以 `http` source 更新权威值）→ 广播。
3. 前端广播处理器按第 5 节应用门更新 tab.title / history.title（现有 `browserUpdateTab`/`browserUpdateHistoryTitle` 路径保留为广播的落地动作）。
4. 前端广播处理器保留现有三段结构（exactMatch 更新匹配标签 / activeTab URL 匹配更新 / 无标签且处于 pendingNavigation 时创建），但**决策数据（标题/图标/来源）全部来自服务端广播**。
5. 去重窗口（Rust 端 3s `FETCH_DEDUP_WINDOW_MS`）与重试（1 次、5s 间隔）逻辑保留在服务端。

### 4.4 刷新与预热

1. 刷新按钮 `refresh(url)`：force 跳过 TTL 与退避，强制重抓 → 广播 → 前端更新 tab/history 标题 + **书签快照仅当为占位标题时落库**（见第 5 节）。
2. 应用启动 `warmup(urls)`：收集收藏/历史可见 URL（去重、上限可配，默认 200），服务端并发受限（默认 8）批量补全，复用现有 domain 限速，消除首屏延迟。

## 5. 前端保留的标题应用逻辑

服务端负责**权威标题的决策与持久化**；前端保留两块轻量逻辑（约 30 行，替代原 `useBrowserPageMeta.ts` 约 300 行的溯源引擎）：

```
resolveDisplayTitle(snapshotTitle, metaTitle):
  若快照标题非占位（用户自定义）→ 返回快照标题（永不覆盖）
  若快照标题为占位（空 / 纯 URL / 裸域名）→ 返回服务端 metaTitle（可为空串）
  （应用于收藏树节点标题：快照优先）

applyBroadcastTitle(tab, broadcastTitle, source):
  if (tab.title 为占位) → 应用（无论 source，保证占位标签可被 com/http 补全）
  else if (source === 'http' || source === 'iframe') → 应用
  else if (source === 'com') → 仅当 tab 的 titleSourceRef 为 'com'/'google' 时应用
  else → 不应用
  （应用于 tab.title / history.title；titleSourceRef 仍为前端 per-tab Map，
    由广播处理器在应用标题时同步更新）
```

- 该应用门与现状 `shouldApplyExactMatchTitle` 行为等价（占位可覆盖、http/iframe 可覆盖、com 仅覆盖 com/google 来源），差异仅为"决策数据来自服务端广播"。
- 历史节点与打开标签页节点标题使用 `applyBroadcastTitle`；收藏树节点标题使用 `resolveDisplayTitle`（快照优先），其占位判定与 `isPlaceholderTitle` 语义一致（前端仅做快照侧等价判断）。

## 6. TTL / 失效 / 错误处理

| 项 | 规则 |
|---|---|
| 成功缓存 TTL | 7 天（`last_ok_at` + 7d）；过期后 SWR：旧值先显示，后台重抓 |
| 失败退避 | `next_retry_at = now + min(5min × 2^fail_count, 2h)`；成功清零 `fail_count` |
| 手动刷新 | force 跳过 TTL 与退避 |
| 抓取失败 | 不删缓存；更新失败计数与 `next_retry_at` |
| 图标字节下载失败 | 保留 `favicon_url`（渲染时前端可加载），`favicon_data_uri` 留空 |
| 前端渲染失败 | 本次降级显示（切换回退链下一级），**永不删缓存、永不通知服务端删除** |
| 广播丢失 | 下次 `peek`/`get` 兜底；订阅断线自动重连 |
| robots / 限速 | 保留现有门控与限速（HTML 与 favicon 两处，favicon 走 robots-only 不限速路径） |

## 7. 回退链（服务端决策）

```
HTML <link rel="icon"> 最佳候选（现有 favicon_score 选择）
  → {origin}/favicon.ico
  → DuckDuckGo icons（新增）: https://icons.duckduckgo.com/ip3/{host}.png
      （.png 加载失败时尝试同域 .ico）
  → Google S2（最后手段）: https://www.google.com/s2/favicons?domain={host}&sz=64
  → 空 → 前端显示内置占位图标
```

- 私网/本地地址（localhost / 127.x / 192.168.x）跳过外部兜底，直接返回空（现有行为保留）。
- 回退链每一级均需 robots 门控（外部兜底 URL 按域名门控，同现有 favicon 门控路径）。

## 8. 前端改造清单

| 文件 | 改动 |
|---|---|
| 新增 `frontend/src/app/utils/pageMetaClient.ts` | 三适配（tauri/preview/mock）：`peek/get/report/refresh/warmup` + 订阅 `page-meta-updated` |
| `frontend/src/app/components/BrowserFavicon.tsx` | 重写：去掉 ready 空白占位（未命中即显示占位图标）；去掉 `removeCachedSiteMeta`；渲染失败仅本次降级（切回退链下一级）；订阅广播原位更新 |
| `frontend/src/app/features/browser/useBrowserPageMeta.ts` | 溯源/去重/门控决策逻辑删除（迁移服务端）；改为"广播处理器"：按第 5 节应用门更新 tab.title/history.title，保留三段落地结构（更新匹配标签/更新活动标签/无标签时创建） |
| `frontend/src/app/features/browser/useBrowserUrlChange.ts`、`useBrowserPanelAddressSubmit.ts`、`useBrowserDialogs.ts`、`useBrowserTagActions.ts` | `fetchPageMeta/prefetchPageMeta` 调用统一改走 `pageMetaClient`；刷新改调 `refresh()` + 书签占位快照落库 |
| `frontend/src/app/utils/siteMetaCache.ts` | 改为**只读镜像**：保留 `initSiteMetaCache`（服务端 `get_all` 预载）与订阅通知；删除所有写后端路径的对外调用（`setCachedSiteMeta`/`removeCachedSiteMeta` 的前端调用全部移除，写入口唯一在服务端） |
| `frontend/src/app/utils/favicon.ts`、`faviconQuality.ts` | 保留渲染侧回退链显示辅助（Google S2/DDG URL 构造）；质量评分逻辑迁移服务端，前端仅留显示降级判断 |
| 新增启动预热 | `useAppStartup.ts` 或 `BrowserPanel.tsx`：收集书签/历史可见 URL → `warmup(urls)` |
| `frontend/src/app/features/browser/useBrowserMetaSubscription.ts` | 保留事件桥接，改为转发 `report()` 语义 |
| mock-bridge / preview-bridge / tauri-bridge | 同步实现新 IPC 与事件（双端一致性强制项） |

## 9. 后端（Rust）改造清单

| 模块 | 改动 |
|---|---|
| 新增 `crates/browser/src/page_meta_service.rs` | PageMetaService：合并引擎 + 缓存策略（TTL/SWR/退避）+ 单飞行合并 + 回退链 + 广播 |
| `crates/browser/src/html_meta.rs` | 保留（抓取解析）；新增 DDG 兜底 URL 构造；`favicon_score`/`google_favicon_url` 保留 |
| `crates/browser/src/site_meta_cache.rs` | 表 +4 列；结构体扩展（title_source/last_ok_at/next_retry_at/fail_count） |
| `src-tauri/src/commands/browser.rs` | `fetch_page_meta_inner` 改造为服务入口；新增 `browser_page_meta_get/report/refresh/warmup` 命令；`browser_site_meta_get_all` 保留（前端预载只读镜像用）；`browser_site_meta_upsert/remove/clear` 前端调用路径删除（服务端内部直接访问 SQLite，无 IPC 通道） |
| 事件 | Tauri `page-meta-updated` 事件（payload: `{url, title, faviconUrl, faviconDataUri, source}`），由 `browser_page_meta_report`/`get`/`refresh` 写路径触发 |
| capabilities | 新增命令白名单条目（禁止通配） |
| 预览同构 | `frontend/dev/previewWorkspaceService/`：新增同构 PageMetaService（复用现有 page-meta 中间件抓取逻辑 + JSON 持久层扩展） |

## 10. 测试计划

### 10.1 Rust 单元测试（新增）

1. 合并引擎：标题溯源矩阵（占位/自定义/`http`/`com` 交叉覆盖）、`shouldApplyExactMatchTitle` 迁移等价性、来源优先级与去重窗口。
2. 缓存策略：TTL 过期判定、SWR（过期返回旧值+后台重抓）、失败退避（`next_retry_at` 指数增长与封顶、成功清零）、force 跳过。
3. 单飞行合并：同 URL 并发仅一次抓取。
4. 回退链：HTML 命中 / 无图标 → `/favicon.ico` / → DDG / → Google S2 / 私网跳过外部兜底。
5. 质量门控：低质量不覆盖高质量、dataUri 不可覆盖（迁移等价性）。
6. 现有 `html_meta.rs`、`robots_*`、`site_meta_cache.rs` 测试全部保留。

### 10.2 前端单元测试

1. 三适配层（tauri/preview/mock）的 `peek/get/report/refresh/warmup` 与订阅。
2. `BrowserFavicon`：渲染失败不删缓存、未命中显示占位图标、广播驱动原位更新。
3. `resolveDisplayTitle`：快照优先/占位回退矩阵。
4. `applyBroadcastTitle`：占位可覆盖、http/iframe 可覆盖、com 仅覆盖 com/google 来源（per-tab titleSourceRef 行为矩阵）。
5. 刷新按钮：书签占位快照落库、自定义快照不动。
6. 预热：URL 去重、并发限制。
7. `siteMetaCache` 只读镜像：预载、广播更新、无任何写后端调用（静态断言）。

### 10.3 双端一致性

- previewPageMetaService 与 Rust PageMetaService 行为对比测试（同一输入序列 → 相同缓存/广播结果）。
- 现有 `siteMetaCache.test.ts` 系列改为针对新适配层的等价测试。

## 11. 验收标准

1. 图标渲染失败时持久缓存不被删除；无"真实图标↔兜底图标"来回切换（重复渲染同一失效 URL 多次，缓存条目持续存在）。
2. 打开应用：图标立即显示（缓存 dataUri 或占位图标），无空白占位期；预热后可见节点图标 5 秒内补全。
3. 网站更换图标后，7 天 TTL 到期或手动刷新后图标自动更新。
4. 点击"刷新网站图标与标题"：书签快照为占位标题时更新为抓取标题，自定义标题不变；tab/history 标题同步更新。
5. 无网络时：缓存 dataUri 正常显示，无缓存项显示占位图标，不报错、不删缓存。
6. 双端（Tauri 桌面 + 浏览器预览）行为一致；新增 IPC 在 tauri-bridge / preview-bridge / mock-bridge 全部实现。
7. 行为等价性回归：同 URL 多标签场景（占位标签被 com 补全、真实标题标签不被 com 覆盖）与改造前 `shouldApplyExactMatchTitle` 语义一致。
8. 质量门禁：`cargo clippy --workspace --all-targets -- -D warnings` 0 警告；`pnpm --dir frontend run lint` 0 errors；红绿测试全绿。

## 12. 影响范围与风险

| 项 | 说明 | 缓解 |
|---|---|---|
| 服务端合并引擎双份实现 | Rust + preview JS 同构（各约 200 行；前端仅保留约 30 行 per-tab 应用门） | 以 Rust 为真源，preview JS 逐函数对照移植 + 一致性测试 |
| tab/history 标题更新改为广播驱动 | 实时性路径增加一次 IPC 往返（毫秒级） | 广播处理器同步落地 store；事件丢失由 peek/get 兜底 |
| SQLite 表结构变更 | +4 列 | 未发布阶段直接改 schema，无迁移代码（项目规则） |
| 外部兜底新增 DDG | 新增一个外部依赖 | 仅作回退链中间级；DDG 不可达时继续降级 Google S2/占位 |
| 旧缓存数据 | 已有 `site-meta-cache.db`/JSON 无新列 | `get_all` 读取时缺列按默认值处理（反序列化缺省字段），首次写入后补齐 |
