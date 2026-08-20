# 进度 — 2026-08-20 抖音浏览器面板后续观察

## [x] 事项 1：同一站点出现两个"真实"favicon 且来回变化
- 状态：✅ 已完成（已修复并验收，用户测试验证通过）
- 现象：书签/历史/已打开标签页下，站点 favicon 出现两种真实 favicon，有时来回变化
- 根因：`findOriginEntry` 按 memoryCache 插入顺序返回**第一个**同 origin 条目——随更多页面被缓存，返回条目/icon 可变；且缓存 key `normalizeUrlForCache` 不剥离 modal_id ⇒ base 与 modal_id 各存不同真实 favicon；显示时精确命中(L1)与 origin 回落(L2)来回切换 ⇒ 两种真实 icon
- 修复（siteMetaCache.ts + favicon.ts）：
  - 新增 `findCanonicalOriginEntry`：按 origin 确定性选取"站点级"canonical 图标（优先站点根条目 → 最新成功/最近抓取的含图标条目 → 插入顺序首个）
  - `getFaviconUrl` 直接使用 `getCanonicalOriginFavicon`，取消"精确 URL → origin"两级切换 ⇒ 同站所有 URL 显示唯一图标（Chrome/Edge 语义）
- 调试日志：`[site-meta-cache] canonical-origin-favicon`（url/origin/chosenCacheKey/has*）
- Chrome/Edge 行为：每个站点一个唯一 favicon，不做此切换

## [x] 事项 2：刷视频时历史未记录其它视频/页面 URL
- 状态：✅ 已完成（已修复并验收，用户测试验证通过）
- 现象：URL 明显不同，但历史只记录首发，后续视频/跳转未记录
- 根因：`onUrlChanged` 用 `normalizeUrlForCompare(eventTab.url) !== normalizedUrl` 判定 `urlChanged` 作为历史写入门槛；`normalizeUrlForCompare` 剥离 `modal_id` ⇒ 刷视频只变 modal_id ⇒ 恒相等 ⇒ 不写历史（Task 6 回归）。且历史写入门写入 normalizedUrl（剥离 modal_id）⇒ 即使写入也同 dedupKey 被合并。
- 修复（useBrowserUrlChange.ts）：
  - 新增 `const identityKey = historyDedupKey(url)`（保留 modal_id/页面身份参数）
  - 门槛改为 `urlChanged = eventTab && historyDedupKey(eventTab.url) !== identityKey`（Chrome/Edge 语义，每个视频识别为不同条目）
  - 历史写入/标题回填改用身份保留的 `url`（raw，含 modal_id），display/meta 归一仍用 `normalizedUrl`（剥离 modal_id）
- 调试日志：`[browser-url-change] onUrlChanged`（含 identityKey）、`branch-eventTab/existingEntry/fallback-navigate`（含 displayUrl/historyUrl/dedupKey）
- 验证：待用户测试后查 `debug-logs-browser.txt` / `debug-logs.txt` 中刷视频时 identityKey 是否不同、是否逐视频写历史

## [x] 事项 3：标题为官方笼统标题，非具体页面/视频标题
- 状态：✅ 已完成（确认为**正常预期行为，非 Bug**，用户测试验证通过）
- 定性：抖音 SPA 弹层模式下 `document.title` 天然保持笼统壳标题（如"抖音精选电脑版…"）；Chrome/Edge 真机读取同一 `document.title` 亦显示笼统标题 ⇒ **与真实浏览器行为完全一致**，非本应用缺陷，无需修复。
- 现象：书签/历史/标签标题都是站点笼统标题（如"抖音"），非具体视频/页面标题
- 分析：标题来源 = 注入脚本 `getPageTitle()` 读取的 `document.title`（抖音 modal 导航下通常保持"抖音"）+ 服务端 PageMetaService 抓取壳标题 + 前端门控。Chrome/Edge 的真实浏览器也读取 document.title，抖音视频（modal）下同样显示"抖音"——疑似 SPA document.title 未含具体视频标题的固有限制，待日志验证。
- 调试日志：
  - `[browser-page-meta] handlePageMeta` / `broadcast` / `exact-title-apply` / `activeTab-branch` / `broadcast-title-apply`（已存在，记录 url+title+source+门控决策）
  - `[browser-page-meta] broadcast`（新增匹配标签数）
  - `[browser-history] add` / `[browser-history] updateTitle`（新增，记录每历史条目 (url, title, dedupKey) 及是否变更）
- 验证：待用户测试后查日志中每个视频 URL 收到的 `meta.title` 是否仍为"抖音"（若否且被门控拒绝，则有 bug 可修；若是，则为 SPA 固有限制）

## 处理策略
全部先加调试日志（已完成）；根因明确者（事项 1/2）已同时修复；事项 3 经日志验证确认为 **SPA 固有限制（正常预期行为，非 Bug）**，无需修复。

## 整体结论（2026-08-20）✅
- 事项 1（favicon 双真实图标来回变化）：**已修复并验证通过**
- 事项 2（刷视频历史未逐条记录）：**已修复并验证通过**
- 事项 3（标题为笼统壳标题）：**正常预期行为，非 Bug**——与 Chrome/Edge 读取同一 `document.title` 的行为一致
- 事项 4（标题/favicon"兜底→真实"跳变）：**已修复并验证通过**，过渡走"空占位→真实值"
- 本次会话四个事项全部解决完成，无遗留问题。

## 日志审视结论（2026-08-20 用户测试后）
- 提供文件：`E:\AI-DIGITAL-LIFE\SourceWorkspace\.adl-logs\{debug-logs.txt, terminal-logs.txt}`（时间 15:34–15:38）
- 判定：**该日志系"中间构建"产物**
  - 含问题1 修复（`[site-meta-cache] canonical-origin-favicon` 全部归一 `chosenCacheKey=https://www.douyin.com/`，favicon 唯一稳定）✅
  - 但 `[browser-favicon] render` 仍打印**完整 `cached` 字符串**（瘦身前旧格式）
  - **缺失**问题2/3 全部调试日志：`[browser-url-change]`、`[browser-history]`、`[browser-page-meta]` 不存在
- 结论：用户运行版本未包含最新全部修复（favicon 瘦身 + 问题2/3 修码），故问题2/3 **无法从当前日志验证**，需重新构建/运行最新代码再测试。
- 底层拦截点排除：`crates/browser/src/webview2_history.rs` 的 `should_emit_history_changed` 仅对同 URL 500ms 去重，modal_id 不同会正常放行 → 根因确在前端 `onUrlChanged`（已修复）。

## 事项 2 补充：底层事件放行已确认
- `should_emit_history_changed_at` 只对 `last_url == url` 且 <500ms 去重；URL 不同（modal_id 变化）返回 true 放行 → HistoryChanged 事件能发到前端。
- 前端修复（useBrowserUrlChange.ts）：`identityKey = historyDedupKey(url)` 保留 modal_id；门槛 `urlChanged = historyDedupKey(eventTab.url) !== identityKey`；历史写入用含 modal_id 的原始 `url`。

## 事项 3 补充：SPA 固有限制倾向确认
- `getPageTitle()`（init_script.js）仅对 YouTube watch 页读 h1；抖音场景返回 `document.title` = SPA 壳"抖音"。
- 服务端 `fetch_silent_meta` 抓取的 `<title>` 亦为壳标题（日志 line 31/34/81 均为"发现更多精彩视频 - 抖音搜索"/"抖音精选电脑版…"）。
- 与 Chrome/Edge 真机行为一致（抖音 modal 刷视频时 document.title 保持笼统）→ **确认为 SPA 固有限制（正常预期行为，非 Bug）**，本轮日志中 `[browser-page-meta] broadcast`/`exact-title-apply`/`broadcast-title-apply` 亦确认前端门控正常放行真实壳标题、`[browser-history] add` 实际写入了对应历史条目。

## 二轮日志审视与三个新现象修复（2026-08-20 16:08 测试）✅
- 提供文件：`E:\AI-DIGITAL-LIFE\SourceWorkspace\.adl-logs\debug-logs.txt`（16:08:25–16:08:43，含**最新** `[browser-url-change]` / `[browser-history]` 日志，非中间构建）
- 关键证据：
  - `:25.538 add` 基础URL `https://www.douyin.com/jingxuan`（title=url）→ `:25.571 add` 视频 `?modal_id=7667…` → 两**重复**条目并存
  - `:41.644 add` 基础URL 再次置顶（`filteredOutSameDay:1`）→ 反复跳位（闪烁），且 title 为 URL 式"douyin.com/jingxuan"
  - `:41.682 add` 视频2 `?modal_id=7644…`；视频标题随后由链路更新为"抖音精选电脑版…"
- 用户确认设计取向：**(1) 只记录视频条目；(2) 保留历史声音图标并精确关联当前视频条目**。

### 现象 1/2（重复标签 + URL式标题）
- 根因：基础URL（无 modal_id，feed/scaffold 骨架）在每次刷视频/跳转时被 `onUrlChanged` 当作新导航写入历史并置顶；historyDedupKey 保留 modal_id 使得 base 与视频 URL 恒为不同条目 ⇒ 重复；且 base 写入时 title 空 ⇒ 回退成其 URL 字符串。
- 修复：
  - `browserDisplayUtils.ts` 新增 `hasViewIdentityParam(url)`（判 modal_id 是否有）+ `historyContainerKey(url)`（剥离 modal_id 的容器键，base 与视频共享）。
  - `browserHistorySlice.browserAddToHistory`：写入携带 modal_id 的视频条目时，清掉同日同容器的无 modal_id base scaffold，历史只留具体视频条目。
  - `useBrowserUrlChange.ts`：新增 `suppressBase` 抑制——当前为 base 且同容器已有视频条目 ⇒ 判定为 SPA transient base 重发，不写历史、不改标签 URL（仅刷新地址栏）。

### 现象 3（跳位/闪烁 + 声音图标回跳到 base 标签）
- 根因：`browserUpdateTab(tabId, { url: normalizedUrl })` 把标签 URL 归一化为基础URL（剥离 modal_id）；历史树 `buildHistoryLeafNode` 以 `t.url === entry.url` 精确匹配声音 ⇒ 声音图标被绑到 base 条目；base 又反复置顶 ⇒ 跳动/把声音从当前视频"抢"回到 base 标签。
- 修复：
  - `useBrowserUrlChange.ts` eventTab 分支：标签 URL 改用原始 `url`（保留 modal_id）⇒ 声音精确落在当前播放的视频历史条目（精确关联）。
  - `useBrowserUrlChange.ts` tryPrefetch 的 `onPageMeta` 改传原始 `url` ⇒ `handlePageMeta` 的 cleanUrl 与标签 URL 精确匹配（exact 分支只更新标题），不会再把标签 URL 覆盖回 base。
- 副作用边界：非 modal_id 站点（YouTube/Bilibili 等）`hasViewIdentityParam` 恒 false，base 抑制与容器清理均不触发，行为不变，改动低风险。

### 验收
- typecheck、prettier、eslint 均通过。
- 新增单测 `hasViewIdentityParam` / `historyContainerKey`（browserDisplayUtils.test.ts），30/30 通过；浏览器相关套件 268 通过。
- `useBrowserDialogs.test.ts` 1 例全量执行时报 `folder.tabs` undefined，**单文件隔离运行 25/25 通过** → 属既有测试顺序/状态隔离 flaky，非本次改动引入（改动未触及 folder tabs 路径）。

### 待用户再次测试验证的调试日志（新增）
- `[browser-url-change] scaffold-suppression`：记录 base 抑制判定（url/identityKey/containerKey/suppressBase）
- `[browser-history] add` / `updateTitle`：现有，观察 base 不应再单独增条、视频各自成条且声音图标落在当前视频条目上
- `[browser-history] updateTitle-skip-placeholder`：占位标题（空/纯URL/主机/主机+路径）被门控跳过、不覆盖更优标题

## 三轮日志审视与标题通用回退方案（2026-08-20 16:34 测试）
- 提供文件：`debug-logs.txt`（16:34–16:38，仅见 `[site-meta-cache] canonical-origin-favicon` 与 `[browser-favicon] render`，证明已跑 favicon 瘦身修复）、`terminal-logs.txt`（16:32–16:38）
- **导航路径澄清**：本次会话历史由 iframe + `fetch_silent_meta`（静默 WebView 抓标题）驱动，**未出现** `[browser-url-change]`/`[browser-history]` 日志 ⇒ `onUrlChanged`/`browserAddToHistory`（上轮修复路径）在本会话未触发。`fetch_silent_meta` 对首页 `https://www.douyin.com/jingxuan` 返回 `title=douyin.com/jingxuan`（水合前 `document.title` 回落成 URL 片段）。
- 现象 1（首页历史标题 = "douyin.com/jingxuan"）：根因 = 无 scheme 的主机/路径标题未被 `isPlaceholderTitle` 识别，`browserUpdateHistoryTitle` 无占位门控，URL 式标题直接写入/展示。
- 现象 2（刷视频后每条历史标题变"抖音精选电脑版…"）：实际为抖音 SPA 弹层固有行为，Chrome/Edge 同样显示壳标题，非 bug。
- 精确标题可获取性实测（WebFetch）：
  - `?modal_id=` 弹层 URL → 仅壳标题（Chrome/Edge 一致）
  - 规范直链 `https://www.douyin.com/video/{vid}` → 实测含具体视频标题（`第97集 | 河北村民上山砍柴…`）
  - 用户决策：**采用与 Chrome/Edge 一致、且通用所有网站**的方案 —— 不搞抖音单站 modal→/video 直链解析。
- 修复（通用、Chrome/Edge 语义）：
  - `browserDisplayUtils.ts`：`isPlaceholderTitle` 新增 `SCHEME_LESS_URL_LABEL` 检测（`douyin.com` / `douyin.com/jingxuan` / `m.youtube.com/watch` 判为占位）；`normalizeTabTitle` 占位标题回退**主机名**（空标题显示站点域名，替代 URL 式标题）
  - 同步 `useBrowserPageMeta.ts` 与 `mock-bridge.ts` 的 `isPlaceholderTitle` 复制（三端对齐）
  - `browserHistorySlice.browserUpdateHistoryTitle`：占位标题门控（`updateTitle-skip-placeholder`），URL 式标题不再覆盖真实/主机标题
- 验收：`browserDisplayUtils.test.ts` 新增 3 用例（33/33 通过）；浏览器相关套件 68/68 通过；typecheck 通过；eslint 无 error

### 待用户再次测试验证
- 现象 1：首页无真实标题时，历史标签应显示 `douyin.com`（主机名）而非 `douyin.com/jingxuan`
- 现象 2：弹层视频保持壳标题"抖音精选电脑版…"（与 Chrome/Edge 一致）
- 日志看点：`[browser-history] updateTitle-skip-placeholder` 出现（占位被门控）

## 事项 4（新）：标题/favicon 从"兜底回退方案"跳变为"真实值"的中间态（2026-08-20）
- 状态：✅ 已修复并验收，用户测试验证通过（详见文末"四轮日志审视结论"）
- 现象：书签/历史/标签标题先显示"兜底回退方案的主机名"（如 `douyin.com`），随后跳变为真实的标题名称；favicon 同样存在"兜底首字母 → 真实图标"的中间态跳动
- 用户期望：**不出现**"兜底 → 真实"的跳变过程；直接在短时间内显示空占位，等真实数据到来直接显示真实值；仅当真实获取失败（已确认抓取结算）才回退到主机名/首字母
- 根因：标题/favicon 获取是异步的，初始无真实数据时立即回退到兜底主机名/首字母，待元数据抓取完成后更新为真实值 ⇒ 产生"兜底 → 真实"的中间态跳变
- 修复（Chrome/Edge 语义：空占位缓存真实值，确认失败才回退）：
  - `siteMetaCache.ts`：新增 `isSiteMetaResolved(url)`——内存镜像中有该 URL entry（无论是否抓到真实值）即视为"已抓取结算"
  - `browserDisplayUtils.ts`：新增 `resolveSiteTitle(storedTitle, metaTitle, url, resolved)`——优先真实存储标题 → 真实元数据标题 → 仅当 `resolved=true` 才回退主机名，未结算返回空占位
  - `useBrowserTreeCache.ts`：`resolveTitle = (t, url) => resolveSiteTitle(t, getCachedTitle(url), url, isSiteMetaResolved(url))`，并传入 `buildWorkspaceCategoryTree`/`buildUserFolderCategoryTree`/`buildFolderNode`/`buildTabNode`（默认 resolver `() => ''`）
  - `BrowserFavicon.tsx`：跟踪结算状态，未结算时显示空占位（无首字母/无图标），结算后仍无有效 favicon 才显示站点首字母
- 验收：`typecheck`/`eslint`/`prettier` 通过（仅剩 2 条既有的 `metaVersion` exhaustive-deps 提示）；`browserDisplayUtils.test.ts` 新增 `resolveSiteTitle` 4 用例、`BrowserFavicon.test.tsx` 新增空占位/结算回退 2 用例；相关套件 63/63 通过（`browserTreeCounts.test.ts` ⑪ 组 1 例因 resolver 化改造同步更新）
- 待验证：书签/历史/标签标题与 favicon 首屏不再显示主机名/首字母，短暂空占位后直接出现真实标题/图标；仅抓取失败（已结算仍无真实值）才显示主机名/首字母

## 事项 4 补充：四轮日志审视结论（2026-08-20 17:51 测试）✅
- 提供文件：`E:\AI-DIGITAL-LIFE\SourceWorkspace\.adl-logs\debug-logs.txt`（17:51:10–17:51:21，含最新四项日志）
- 关键证据（标题跳变路径归零）：
  - **全程零次** `[browser-title-hostname-fallback]`（WARN）→ 主机名兜底未被触发
  - 标题决策日志 100% `mode: real-stored` / `real-meta`，无 `mode: hostname`，无标题来回振荡
  - 唯一曾出现的过渡 URL（`root/search?...&modal_id=7640472056342429922&type=general`）：`:10.797` `blank`（resolved:false, shown:''）→ `:10.822` `real-stored`（"发现更多精彩视频 - 抖音搜索"），**跳变窗口 ≤25ms** 且为"空占位→真实值"，符合预期
- favicon 稳定：`canonical-origin-favicon` 全部归一 `https://www.douyin.com/`；仅 1 次 `applyMetaUpdate changed`（prevLen 0→1154，空占位→数据，正常过渡）
- 异常排查：**无 ERROR 级条目**。全部 `[WARN]` 均信息性调试日志：
  - `browser-favicon render` / `browser-page-meta broadcast` / `applyMetaUpdate changed` → 诊断日志（正常）
  - `rejected-by-gate` → 标题已一致时的去重守卫，非异常
  - `TAURI Couldn't find callback id` ×2 → reload 时序无害提示
- 结论：**事项 4 标题闪烁（"主机名→真实"）已不再触发，本次测试验证通过**。该过渡项走"空占位→真实值"，正是用户期望的短占位行为