# 进度 — 2026-08-20 21:38:17

## [x] 事项 1：浏览器面板-YouTube 刷视频后历史记录标题全部变成第一个视频的标题
- 状态：已完成（用户 2026-08-20 22:0x 确认——"以上问题解决了"）
- 现象（用户报告，Tauri 桌面应用）：右侧面板-浏览器面板-历史目录下，用鼠标滚轮/键盘上下刷视频（URL 随每个视频变化，如 YouTube Shorts）时，每个新出现的历史记录标签标题变化过程为「主机名 → 该视频真实标题 → 第一个视频的真实标题」，最终所有新标签标题都与第一个视频历史标签相同。
- 涉及代码：
  - 后端：`src-tauri/src/webview_event_bridge.rs` `spawn_spa_fallback`（2 秒延迟 SPA 兜底标题提取，最大嫌疑）、`crates/browser/src/webview2_history.rs`（HistoryChanged）、`crates/browser/src/webview2_postmessage.rs`（meta 上报）、`crates/browser/src/webview2_title.rs`（DocumentTitleChanged）
  - 前端：`browserHistorySlice.ts`（browserAddToHistory/browserUpdateHistoryTitle）、`useBrowserPageMeta.ts`（handlePageMeta/applyBroadcast 无条件更新历史标题）、`useBrowserUrlChange.ts`（onUrlChanged 写入历史）、`useBrowserMetaSubscription.ts`
- 初步根因假设（待日志验证）：
  1. `spawn_spa_fallback` 在 HistoryChanged 后 2 秒延迟 eval 提取标题，以**当时的 `location.href`** 上报 `{title, url}`（触发时 URL 参数 `_url` 被忽略）；
  2. YouTube 在队列自动连播/Shorts 场景下 `document.title`/`og:title` 钉死在第一个视频（本仓库 init_script/webview_event_bridge 注释已明确记录该行为）；
  3. 兜底提取对 `/shorts/` 页面（`isVideoPage` 仅匹配 `/watch`）无 h1 内容兜底 → 取到钉死的 `og:title`/`document.title` = 第一个视频的标题；
  4. 前端 `handlePageMeta` 对历史标题更新无条件执行（无陈旧性守卫）→ 覆盖先到达的正确真实标题。
  - 历史关联：2026-08-13/14 已修复 radio 自动播放（/watch）的同类问题（A2：h1 择优限定 /watch 视频页），`/shorts/` 不在覆盖范围 → 本次为同类根因在非 /watch 路径的残留。
- 计划：
  1. Phase 0：添加调试日志（Rust：fallback 触发 URL/评估时 location.href/提取来源与各候选值；前端：meta 事件、历史 add/update 前后值）→ 用户测试 → 分析最新日志验证根因；
  2. Phase 2A：按验证结果实施根因修复（通用所有站点，不特化 YouTube）：
     - fallback 用触发时 URL 配对，URL 已前进时跳过过期上报；
     - 钉死/过期标题不得降级覆盖（对 SPA 队列页不采用 og/tw 兜底，或仅采用"导航后确实变化"的 document.title）；
     - 前端历史标题更新加陈旧性守卫（防御纵深）；
  3. Phase 3：用户复测 + 日志验证；
  4. Phase 4：清理调试日志、子代理审查、全量验证、归档。
- 备注：调试日志为临时埋点（`[ADL-DEBUG]` 前缀），验证通过后 Phase 4 清理，不留生产代码。

## Phase 0 进度（2026-08-20 21:38-21:42）

### 已添加的调试日志（临时，`[ADL-DEBUG]` 前缀）

| 位置 | 日志 | 内容 |
|------|------|------|
| `src-tauri/src/webview_event_bridge.rs` `spawn_spa_fallback` | `[ADL-DEBUG][fallback] SPA fallback scheduled/evaluating` | 触发 URL（此前 `_url` 被忽略，现改为 `url` 并记录） |
| 同上（eval JS） | diag postMessage `type:'adl-fallback-diag'` | triggerUrl（触发时 URL）vs locHref（评估时 location.href）、h1/og/tw/docTitle 各候选值、best、src（来源）、isVideoPage |
| `crates/browser/src/webview2_postmessage.rs` | `[ADL-DEBUG][fallback] DIAG \| ...` | 打印 diag 全部字段（不触发 meta 链路） |
| `frontend/.../browserHistorySlice.ts` | `[ADL-DEBUG][history] add ENTER/COALESCED/INSERTED` | url/title/dedupKey/docKey/新增 vs 合并/前后长度 |
| 同上 | `[ADL-DEBUG][history] updateTitle` | url/title/dedupKey/matchedCount/matchedBefore（覆盖前各条目标题） |
| `frontend/.../useBrowserPageMeta.ts` | `[ADL-DEBUG][meta] handlePageMeta` | meta.url/cleanUrl/title/source/branch(exact\|activeTab\|none)/historyDedupKey/cachedTitle |
| 同上 | `[ADL-DEBUG][meta] broadcast` | 广播 url/title/source/匹配标签数/是否有历史条目 |
| `frontend/.../useBrowserMetaSubscription.ts` | `[ADL-DEBUG][meta] received` | 收到的 tabId/url/title/favicon |
| `frontend/.../useBrowserUrlChange.ts` | `[ADL-DEBUG][nav] urlChanged` + `existingEntry` | tabId/url/identityKey/urlChanged/eventTab 状态/existingEntry |

### 验证（改动后）
- `cargo check -p adl-browser -p ai-digital-life` 通过；`cargo clippy -p adl-browser -p ai-digital-life --all-targets -- -D warnings` 0 警告；`cargo test -p adl-browser` 通过
- `npx tsc --noEmit` 通过；eslint 0 error
- 受影响前端测试：browserHistorySlice 6/6、useBrowserPageMeta 6/6、useBrowserTagActions 8/8、useBrowserNavigation 等 27/27 通过

### 待用户测试（Tauri 桌面应用，需重建 Rust 侧）
1. 打开 YouTube 首页 → 进入 Shorts（或上下刷视频使 URL 逐视频变化）→ 连续刷多个视频
2. 观察历史目录：每个新历史标签标题的变化过程（主机名 → 真实标题 → 是否变回第一个视频标题）
3. 测试完成后提供日志：Tauri 前端日志 `debug-logs.txt` + Rust 日志（`.adl-logs/` 下最新文件）
4. 我按 `LastWriteTime` 取最新日志分析：重点核对 `[ADL-DEBUG][fallback] DIAG`（triggerUrl vs locHref、best/src）与 `[ADL-DEBUG][history] updateTitle`（哪个 URL 的标题被覆盖成什么）

## Phase 0 结论（2026-08-20 21:47，日志验证完成 — 根因已确认）

### 日志证据（`.adl-logs/debug-logs.txt`，2026-08-20 21:44-21:45 测试会话，最新日志）

用户测试为 YouTube Shorts 滚动（URL 逐视频变化）。逐条证据链（以第 2 个视频 HkXldcdKFQI 为例）：

| 时间 | 日志 | 内容 | 阶段 |
|------|------|------|------|
| 21:45:13.939 | `[nav] urlChanged` | 滚动到 `/shorts/HkXldcdKFQI` → 写入占位条目 | 主机名 |
| 21:45:14.508 | `[meta] broadcast` | 服务端静默渲染抓取 → **正确标题** "What if a skydive could grow a forest? 🌵 | Insta360 Ace Pro 2 #shorts - YouTube"（hadCache:false=真抓取）→ updateTitle 应用 | 真实标题 |
| **21:45:15.689** | **`[meta] received`** | **{url: /shorts/HkXldcdKFQI, title: "Rin Tohsaka Cosplay!"}** —— 该标题是**第一个视频**（U8qKgQcR8yQ，见 21:45:07.451）的 document.title → updateTitle **覆盖**为第一个视频标题（matchedBefore 显示正确标题被替换） | **第一个视频标题 ✗** |
| 21:45:15.711 | `[meta] broadcast` | 同一错误标题经 `pageMetaClient.report` 污染服务端缓存后广播回 → 再次应用，污染固化 | 持久化 |

同样的模式在后续每个视频复现：P2-TRzeQpLc（21.517）、2swLk3Lq-Wk（24.700）、tG795safQFI（28.317）——全部变成 "Rin Tohsaka Cosplay!"（第一个视频标题）。与用户描述"主机名→真实标题→第一个视频标题"完全吻合。

### 根因（已确认）

**Rust 2 秒 SPA 兜底 `spawn_spa_fallback`（`src-tauri/src/webview_event_bridge.rs`）把"钉死的第一个视频 document.title"与"当前 URL"配对上报，前端无条件应用覆盖正确标题。**

机制链：
1. YouTube Shorts 滚动是 SPA pushState（同 document），URL 逐视频变化，但 **`document.title`/`og:title` 钉死在第一个视频**（"Rin Tohsaka Cosplay!"，21:45:07.451 后不再变化）；
2. 每次 HistoryChanged 调度 2 秒兜底；对 `/shorts/` 路径 `isVideoPage` 为 false（仅匹配 `/watch`）→ `best = og || tw || t`；shorts 页无 og:title（证据：上报的是无 "- YouTube" 后缀的裸 document.title）→ `best = document.title` = 钉死的第一个视频标题；
3. 兜底以 `url: location.href`（评估时刻=当前视频 URL）postMessage 上报 {钉死标题, 当前视频 URL}；
4. 前端 `browser-meta-changed` → `handlePageMeta`（source='com'，经 `useBrowserPanelMetaWiring` 传入）→ **无条件** `browserUpdateHistoryTitle(url, 钉死标题)`（无陈旧性守卫）→ 覆盖 1 秒前到达的正确标题；
5. 且 `handlePageMeta` → `pageMetaClient.report` 把错误标题写入服务端缓存 → `page-meta-updated` 广播再应用 → 污染固化，未来再次访问该 URL 也会拿到错误标题。

时序交叉验证：错误事件到达时刻 ≈ URL 变化 + 2s（13.939→15.689，含事件分发延迟）——与兜底调度一致。

### 生产者排除（排除 init_script 与 DocumentTitleChanged）
- **init_script postMessage**：`isNewTitleForPage` 守卫要求标题 ≠ 导航时 preNavTitle；钉死标题恒等于 preNavTitle → 永远不会上报；且其上报会带 "- YouTube" 后缀变体，观测到的是无后缀标题。→ 排除。
- **DocumentTitleChanged**：只在 document.title 实际变化时触发；钉死标题不再变化 → 后续视频无该事件。→ 排除。
- **Rust 2s 兜底**：唯一能产生 {当前 URL + 2s 前钉死标题} 配对的生产者。→ 确认。

> 注：`terminal-logs.txt` 为 0 字节（Rust 侧日志未落盘——可能因启动方式/未 flush/未重建 Rust，前端日志已足以确认根因；如需 DIAG 佐证可让用户在 dev 控制台查 `[ADL-DEBUG][fallback]`，或重跑一次会话）。

### 外部调研（Chrome/Edge 等同类产品做法，2026-08-20 21:48）

| 调研项 | 结论 | 来源 |
|--------|------|------|
| Chromium 历史条目标题何时确定 | 每个 NavigationEntry 在**提交/创建时刻**携带标题；pushState 创建新条目时**立即**用当时的 document.title 设置（Issue 308143004 修复即"Immediately SetTitle on new NavigationEntry created via history.pushState"） | [Chromium issue 308143004](https://codereview.chromium.org/308143004#1)、[pushState 不改变标题（需 SPA 自行设置，浏览器按当时值记录）](https://stackoverflow.com/questions/13955520/page-title-is-not-changed-by-history-pushstate) |
| 标题变化如何应用 | `WebContentsImpl::UpdateTitleForEntry` **只更新当前最后提交的条目**（按 nav_entry_id 定位），绝不回写旧条目；旧条目标题不受后续标题变化影响 | [web_contents_impl.cc](https://chromium.googlesource.com/git/chromium/+/41959da1b949074011ca7596931f5f936c05e5b6/content/browser/web_contents/web_contents_impl.cc)、[issue 2086423005 UpdateTitleForEntry 取代 SetTitle](https://codereview.chromium.org/2086423005#4) |
| 标题与 URL 的配对 | 浏览器用**自身导航/文档状态**做原子配对（同一瞬间的 document + URL + title），如 WebView2 DocumentTitleChanged 携带 Source（当前 URL）+ 当前标题；**不存在"延迟重新提取旧标题 + 配新 URL"的机制** | [WebView2 DocumentTitleChanged 语义（本仓库 webview2_title.rs 已按此实现）](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_4?view=webview2-1.0.2792.45) |
| 其它浏览器实现参考 | qutebrowser：URL 变化与标题变化分别触发历史条目更新，均作用于**当前会话条目**，无延迟跨条目配对 | [qutebrowser PR #5337](https://github.com/qutebrowser/qutebrowser/pull/5337) |
| 对 YouTube Shorts 的实际含义 | Chrome/Edge 中每个短视为独立历史条目，标题=提交时刻的 document.title；若标题钉死，条目会保持钉死标题，但**绝不会**先显示正确标题再被覆盖，也不会把第一个视频标题挂到别的条目上（无"降级覆盖"） | 上列机制推导 |

### 修复方向（对齐 Chrome/Edge 语义，待用户确认后实施 — 用户要求暂不实施）
1. **Rust 兜底改造**（根因层）：
   - 用**触发时 URL**（HistoryChanged 的 url 参数，现被忽略）配对；评估时 `location.href` 已前进（≠ 触发 URL）则**跳过**，不做过期上报；
   - 对 SPA 视频队列页（shorts 等非 /watch 路径）：**不采用 og/tw/t 兜底**（钉死来源），仅采用"导航后确实变化"的 document.title 或内容 h1；无可靠当前内容标题则**不上报**（静默，让服务端抓取/init_script 负责）——与 Chrome"提交时刻标题"语义对齐；
   - 兜底只负责"补缺"（条目仍为占位时），不得**降级覆盖**已有真实标题。
2. **前端防御纵深**：
   - `handlePageMeta`/`applyBroadcast` 的历史标题更新加陈旧性守卫：不得用来源不可信/迟到的标题覆盖已有真实标题；
   - 兜底来源的标题**不得 report 进服务端权威缓存**（避免污染持久化）。
3. 双端一致：浏览器（iframe）模式同步考虑。

### 待办
- [ ] 用户确认修复方向 → Phase 2A 实施（TDD）
- [ ] Phase 3 用户复测 + 日志验证
- [ ] Phase 4 清理调试日志 + 子代理审查 + 全量验证 + 归档

## Phase 2A 实施（2026-08-20 22:00-22:03，用户已确认采用 Chrome/Edge 一致方案）

### 修复方案（对齐 Chrome/Edge 原子配对语义）
标题事件必须与其 URL **原子配对**（同一瞬间的 document+URL+title）；**绝不**把延迟/钉死的旧标题配到新 URL。据此收敛 Rust 2s 兜底：

| 项 | 修复前 | 修复后（Chrome/Edge 一致） |
|----|--------|---------------------------|
| 兜底标题来源 | `h1 || og:title || twitter:title || document.title` | **仅 h1（视频页内容标题）**；og/tw/document.title 一律不采用（钉死来源） |
| 配对 URL | 评估时刻 `location.href`（可能已前进） | 仅当 `location.href` 仍对应**触发页**（hash/尾斜杠归一后相等）才上报；URL 已前进 → 跳过 |
| 非视频页 | 上报 document.title（可能钉死） | 静默（DocumentTitleChanged/init_script/服务端抓取覆盖） |
| 视频页无 h1 | 回落 og/tw/t（钉死污染） | 静默（不再降级） |

### 变更文件
1. **新增 `crates/browser/src/spa_fallback.js`**：兜底脚本独立成文件（与 init_script.js 同目录，`__ADL_FALLBACK_PURE_START__/END__` marker 供前端测试提取纯函数）；实现 `__adlFallbackNormalizeForCompare` / `__adlFallbackSamePage`（同页守卫）/ `__adlFallbackIsVideoPage`（内容标题作用域：youtube /watch、bilibili/douyin /video）；运行时仅 h1 上报 + 三种跳过（url-advanced / no-h1 / not-video-page）；保留临时 diag postMessage（skipReason 字段）。
2. **`src-tauri/src/webview_event_bridge.rs` `spawn_spa_fallback`**：改为 `include_str!("../../crates/browser/src/spa_fallback.js")` + 注入触发 URL（`__ADL_TRIGGER_URL__` 替换，serde_json 转义）；保留 scheduled/evaluating 临时日志。
3. **`crates/browser/src/webview2_postmessage.rs`**：diag 分支日志字段更新为 triggerUrl/locHref/docTitle/h1/best/src/skipReason。
4. **新增 `frontend/src/app/features/browser/spaFallback.test.ts`**（13 断言）：同页守卫（相同/仅 hash/尾斜杠 → true；URL 前进/跨域/空 → false）、内容标题作用域（youtube /watch → true、**/shorts → false（回归守护）**、bilibili/douyin /video → true、非视频页 → false）、结构反污染（运行时代码不读 og/tw/pickContent；meta 上报在 `if (best)` 守卫内）。
5. 前端 `browserHistorySlice/useBrowserPageMeta/useBrowserMetaSubscription/useBrowserUrlChange` 的 `[ADL-DEBUG]` 临时日志保留（Phase 3 验证用，Phase 4 清理）。

### 验证（Phase 2A 分级测试，非全量）
- `cargo check -p adl-browser -p ai-digital-life` 通过；`cargo clippy -p adl-browser -p ai-digital-life --all-targets -- -D warnings` 0 警告；`cargo test -p adl-browser` 通过
- `npx tsc --noEmit` 通过；eslint 0 error 0 warning（含 --fix 后 prettier 干净）
- 受影响前端测试 6 文件 66/66 通过（含新增 spaFallback 13/13、browserHistorySlice 6、useBrowserPageMeta 6、useBrowserTagActions 8、useBrowserNavigation、initScriptNavigation）
- `node --check` 校验嵌入脚本语法（触发 URL 注入后）通过

### 待用户复测（Phase 3，Tauri 需重建 Rust 侧）
1. 滚动新的 Shorts（或重开新的视频序列；**建议使用上一轮未访问过的新视频 URL**——上一轮测试已把部分 URL 的缓存标题污染为"第一个视频标题"，修复只阻止新污染，不清理既有缓存；如用旧 URL 可先清 site-meta 缓存）；
2. 观察历史目录：每个新视频标题应为「主机名 → 各自真实标题」并**保持**，不再被改成第一个视频标题；
3. 附带验证 /watch 自动连播（radio）与普通网页（标题来自 DocumentTitleChanged/服务端）；
4. 测试后提供 `debug-logs.txt` + 最新 terminal 日志（或 dev 控制台 `[ADL-DEBUG][fallback] DIAG` 行：预期 shorts → `skipReason=not-video-page`，/watch → `src=h1` 或 `skipReason=no-h1`，快速滚动 → `url-advanced`）。

---

## [ ] 事项 2：进入 YouTube 首页后历史记录未记录，点击视频后首页标签才一同出现
- 状态：已完成（用户 2026-08-20 22:2x 确认——"以上问题都解决完成了"）
- 现象（用户 2026-08-20 报告，事项 1 复测通过后新发现）：进入 YouTube 首页（https://www.youtube.com/）后，历史目录下**没有**首页记录；**只有在点击某个视频后**，"YouTube 首页的历史记录标签"才与视频标签一同出现。
- 初步方向（预检，待确认与日志验证）：
  - 历史写入路径 `useBrowserUrlChange.onUrlChanged` 仅在 `noTabExists || urlChanged` 时调用 `browserAddToHistory`；`urlChanged` 为 false（事件 URL 与 tab 当前 URL 相同）时跳过写入；
  - 上轮日志佐证（2026-08-20 21:45:05）：进入首页时 `[nav] urlChanged` urlChanged:false → 未写历史（line 1-2）；`handlePageMeta` 的 `updateTitle` matchedCount:0（历史无首页条目，只更新不新增）；**点击视频后**（21:45:05.427）YouTube SPA 中间跳转先发「首页 HistoryChanged」，此时 eventTab.url 已是视频 → urlChanged:true → 首页条目补写（line 22-25）——与用户现象"点击视频后首页标签才出现"吻合；
  - 待确认：用户"进入首页"的具体方式（新开标签地址栏输入 / 激活已恢复的 tab / 书签 / 从视频返回？），以及进入时是否有 `urlChanged` 事件与 `browserAddToHistory` 调用；
  - Chrome/Edge 语义：每次导航（含恢复/重新进入/重复导航）均应产生历史条目；"tab 已在目标 URL 但历史无条目"的进入目前漏写。
- 涉及代码：`frontend/src/app/features/browser/useBrowserUrlChange.ts`（onUrlChanged 写入门槛）、`browserHistorySlice.ts`（browserAddToHistory）、`useBrowserPanelAddressSubmit.ts`、tab 恢复/持久化路径。
- 计划：预检确认进入方式 → Phase 0 调试日志（onUrlChanged 事件/门槛判定/进入路径）→ 根因确认 → Phase 2A 修复（对齐 Chrome/Edge：进入/恢复/重复导航也记录）→ Phase 3 复测 → Phase 4 收尾（与事项 1 一并清理调试日志、子代理审查、全量验证、归档）。
- 备注：调试日志为临时埋点（`[ADL-DEBUG]` 前缀），Phase 4 统一清理。

### Phase 0-2A 事项 2（2026-08-20 22:10-22:18）
- 用户确认进入方式：**书签/收藏打开**。
- 根因（已确认，代码链 + 上轮日志佐证）：树/书签打开走 `handleOpenTabFromTree` → `browserOpenTab(url, url)`（新建标签）或 `browserNavigateActiveTab(url)`（就地导航）→ **tab.url 被预置为目标 URL** → WebView 导航完成后 `onUrlChanged` 中 `urlChanged = dedupKey(eventTab.url) !== identityKey` 为 **false** → 历史写入分支（`noTabExists || urlChanged`）不执行 → 漏写。地址栏提交（`useBrowserPanelAddressSubmit` 显式 `browserAddToHistory`）不受影响——与"书签打开没记录、地址栏有记录"一致；"点击视频后首页标签出现"= YouTube SPA 中间跳转（回首页 HistoryChanged）触发补写。
- 修复（对齐 Chrome/Edge：显式打开/导航即记录；双端一致）：
  1. **`browserTabsSlice.browserOpenTab`**：url 非空时同步 `get().browserAddToHistory(url, title || url)`——覆盖书签/快捷站点/右键新标签/文件夹恢复等全部"新标签打开 URL"入口（Tauri + 浏览器双端）；`browserAddToHistory` 同日同 dedupKey 去重保证不重复。
  2. **`useBrowserUrlChange.onUrlChanged`**：新增 `missingHistoryEntry` 条件（`urlChanged:false` 但历史无该 URL 条目时也进入写入分支）——覆盖就地导航等预置 URL 场景（Tauri），并自动补写历史性漏记；历史有条目（SPA 重复事件/重复打开）不补，无副作用。
- 测试（TDD 红-绿）：`browserTabsSlice.test.ts` 新增 3 断言（browserOpenTab(url) 写历史 / 带标题用标题 / 空白标签不写）；修复 2 个旧 folder 测试的 store 组合（补 createBrowserHistorySlice）。
- 验证：stores+browser+browser-tree 全量 50 文件 464/464 通过；tsc 通过；eslint 干净（0 error 0 warning）。
- 待用户复测（Phase 3）：**前端改动（browserTabsSlice.ts / useBrowserUrlChange.ts），热更新即可，无需重建 Rust**。步骤：① 用书签打开 YouTube 首页 → 历史应立即出现首页条目（不再需要先点视频）；② 点击视频 → 首页条目保持、视频条目新增；③ 顺带验证快捷站点/右键"新标签页打开"同样记录；④ 提供 debug-logs.txt（`[ADL-DEBUG][history] add ENTER` 与 `[nav] urlChanged missingHistoryEntry` 会显示写入）。

---

## [ ] 事项 3：新建标签模式下，点击地址栏"新建标签页"按钮后地址栏仍显示旧链接 + 已暂停音频又自动播放
- 状态：已暂停（用户 2026-08-20 决定暂不处理——特殊 Bug 太难触发；调试日志保留待查）
- 现象（用户 2026-08-20 报告）：在"新建标签"导航模式下，偶尔（有时）点击网址输入框中的"新建标签页"按钮时：① 虽出现了新标签页，但网址输入框中的链接仍是**之前"已打开正在显示标签页面的网址链接"**；② 点击按钮之前明明已**暂停**了当时正在显示标签页的音频（**网页内暂停**，用户确认），点击后居然**又自动播放音频/视频**了。
- 涉及代码（预检方向）：地址栏"新建标签页"按钮 → `browserOpenTab(undefined, t.browserNewTabPage)`（BrowserToolbar.tsx line 156-171）；地址栏显示逻辑（activeTab URL → setAddress）；音频暂停/恢复逻辑（browserUpdateTabAudioState / WebView2 audio）；`useWebViewLifecycle`（新 tab 激活触发 WebView 创建/导航 → 旧 tab 是否被重新激活/恢复播放）。
- 初步方向（待确认）：新建标签后 activeTab 切换与地址栏 state 更新时序；暂停音频的是"静音/暂停"实现，新标签激活或 WebView 池重建可能触发旧标签 WebView 重新加载/恢复播放。
- 计划：预检确认 → Phase 0 调试日志（新建标签事件链、地址栏 state、音频状态变化）→ 根因确认 → Phase 2A 修复 → Phase 3 复测。

### Phase 0 事项 3（2026-08-20 22:40-23:00）
- 用户确认：暂停方式 = **网页内暂停**（YouTube 播放器暂停按钮）；图标位置（事项 4）= open 模式列表"新建标签页"标签的 favicon。
- 排除项（代码确认）：`handleAddressBlur`（useBrowserUrlState line 48-53）只恢复地址（setAddress(activeTabUrl)），**不提交导航** → "失焦触发旧页刷新"假设排除。
- 已加调试日志（临时，`[ADL-DEBUG]` 前缀，Phase 4 清理）：
  | 位置 | 日志 | 目的 |
  |------|------|------|
  | `BrowserToolbar` "+" 点击 | `[newtab] toolbar plus click`（模式 + 当前 activeTabUrl） | 入口确认 |
  | `useBrowserPanelEffects` | `[address] activeTab sync`（activeTab.id/url → setAddressTo） | 新标签页是否 setAddress('') |
  | `useBrowserUrlState` blur | `[address] blur`（activeTabUrl → restoreTo） | 失焦恢复值 |
  | `useBrowserUrlChange` onUrlChanged | `[address] onUrlChanged setAddress`（tabId + url） | **旧 tab 延迟事件是否覆盖空地址** |
  | `useWebViewLifecycle` | `[webview] hide prev tab webview` / `activate/create webview` | 旧 tab WebView 隐藏/重建 |
  | `crates/browser/src/browser_webview.rs` | `[webview] navigate_tab` / `create_for_tab`（含 evicted/pool_size）/ `activate_tab show/hide` / `set_tab_bounds` | **音频恢复播放来源**（旧 tab 是否被 navigate 刷新/驱逐/激活） |
- 验证：cargo check/clippy 通过、tsc 通过、267 前端测试通过。
- 待用户复测（Phase 3）：**需重建 Rust**（browser_webview.rs 改动）。复现步骤：打开 YouTube 视频 → 网页内暂停 → 点击地址栏"+"新建标签 → 观察①地址栏是否残留旧链接②音频是否恢复播放；复现后提供 `debug-logs.txt` + terminal 日志/dev 控制台 `[ADL-DEBUG][webview]` 行（重点看点击"+"后旧 tab 是否有 `navigate_tab` / `activate_tab show` / `create_for_tab` 出现）。

## [x] 事项 4：浏览器面板"已打开标签页"列表中"新建标签页"标签的 favicon 图标缺失
- 状态：已完成（用户 2026-08-20 23:1x 确认——"已经解决完成了"）
- 现象（用户 2026-08-20 报告，位置经确认）：点击"已打开标签页"（open 模式）按钮后，左侧边栏打开的标签列表中，"新建标签页"标签的 favicon 图标不存在（空白）。
- 根因（已确认）：`BrowserFavicon` 对空 url（新标签页 tab.url=''）→ `getFaviconUrl('')` 为空 + `resolved=false` → 占位内容为空字符串 → 图标位置空白。
- 修复（已实施，不内联，遵循图标规范 currentColor）：
  1. **`frontend/src/app/icons/core.tsx` 新增 `IconNewTabPage`**（独立图标组件，`make()` 工厂 + currentColor；SVG 路径 = 圆角窗口 + 标题栏两点，即用户提供图标；用户 SVG 的 `stroke="#ffffff"` 按项目规范转为 currentColor）→ `icons/index.ts` 导出；
  2. **`BrowserFavicon.tsx`**：`!url || url === 'about:blank'` 时渲染 `<IconNewTabPage size={size} decorative />`（替代空白占位）；url 非空走原 favicon 逻辑。
- 验证：tsc 通过、267 前端测试通过；样式 `adl-filetree__file-icon` 容器 `color: var(--adl-file-badge-ink)` → currentColor 继承可见。
- 待用户确认效果（热更新即可，无需重建 Rust）：open 模式列表"新建标签页"标签应显示窗口+两点图标（跟随主题色）。

## [x] 事项 5：open 模式标签"关闭"按钮悬停提示改为系统原生 title（替代自定义 Tooltip）
- 状态：已完成（用户 2026-08-20 23:1x 确认）
- 需求（用户 2026-08-20）：鼠标悬停在"已打开标签页"（open 模式）按钮下、标签上的"关闭"按钮时，使用**系统原生 title 提示**，不用自定义 tooltip。
- 变更（`BrowserOpenTabFlatListItem.tsx`）：移除关闭按钮的 `<TooltipSimple content={t.browserClose}>` 包裹，改原生 `title={t.browserClose}`（aria-label 保留）；移除不再使用的 TooltipSimple import。
- 备注：顶部标签栏（`BrowserTabBar.tsx` line 125-137）的关闭按钮同样用 TooltipSimple（content=unbookmark/close），**用户明确不需要一并改为原生 title（2026-08-20 确认），保持现状**。
- 验证：tsc/eslint 通过、相关测试 11/11 通过。
- 用户确认：热更新生效，悬停 open 模式标签关闭按钮显示系统原生 title ✓。

## [ ] 事项 3 备注（2026-08-20 用户指示）
- 用户决定：事项 3（新建标签地址栏残留旧链接 + 音频恢复播放）**暂不处理**（特殊 Bug 太难触发）；`[ADL-DEBUG]` 相关调试日志**保留**（便于以后出现问题检查）。
- 影响：Phase 4 清理调试日志时，**事项 3 相关的日志埋点（newtab/address/webview 等）需保留**，仅清理事项 1/2 的 history/meta/nav 等已确认收尾的埋点——或按用户届时最新指示处理。

## [x] 事项 6：B 站等网页内跳转（target=_blank 点击）在当前标签导航，不新建标签；且回退/前进仍一次到位
- 状态：已完成（用户 2026-08-21 确认——"所有的、所有的 问题和 任务 都解决完成了"）
- 需求（用户 2026-08-20）：不管"新建标签"模式还是"当前标签"模式，网页内跳转（如 B 站首页点击视频）**只使用一个标签页（当前标签导航），不新建标签**；同时**不带来**"B 站多次视频跳转后回退/前进需多次点击"的问题及其它负面问题。
- 背景：2026-08-13/14 为解决"B 站多次跳转后回退/前进多击"，选择对齐 Edge/Chrome 的 target=_blank 开新标签设计（C1：open-new-tab 拦截 + pushState/replaceState 归一化；C2：smartGoBack 智能回退 + can_go_back 检查）。用户现希望改为"网页内跳转当前标签导航"，同时保留"回退/前进一次到位"。
- 可行性初步分析（待确认）：
  - 回退/前进一次到位的两个基础**与标签是否新建无关**：① C1 pushState/replaceState 归一化（消除 SPA URL 变体冗余原生历史条目）；② C2 smartGoBack（整页导航条目——C1 无法拦截 WebView2 原生整页导航——回退时自动越过同视频冗余条目）。**保留 C1+C2 即可维持一次到位**。
  - 需改动：`init_script.js` click handler 的 target=_blank/新窗口分支——由"无条件 postMessage open-new-tab 开新标签"改为"普通左键点击（含 target=_blank 站内链接）→ 就地当前标签导航"；修饰键（ctrl/meta/shift）/中键点击（用户显式新标签意图）与 window.open（JS 弹窗）是否保留新标签——待用户确认。
  - 风险点：当前标签导航走 nav-guard/navigateToUrl（整页导航）→ 确认不触发"冗余 navigateTabInPool 整页刷新"（2026-08-13 根因 3）；历史记录写入正常（onUrlChanged urlChanged:true）。
- 计划：预检探索 + 外部调研（Edge/Chrome 导航栈/多击行为）→ 向用户确认方案取舍（修饰键/window.open/iframe 模式）→ Phase 0 调试日志 → 实施 → Phase 3 复测。

### Phase 2A 事项 6（2026-08-20 23:30-23:55，用户已确认取舍）
- 用户确认：① 修饰键（Ctrl/Shift/中键）点击链接 → **保留新标签**；② window.open（JS 弹窗）→ **保留新标签**；③ iframe 模式 → **先 Tauri，后续评估**。
- 可行性结论（已确认可行）："回退/前进一次到位"的两个机制（C1 pushState/replaceState 归一化、C2 smartGoBack）**与标签是否新建解耦**——保留 C1+C2 即可维持一次到位，仅需把"target=_blank 普通点击 → 开新标签"改为"→ 就地当前标签导航"。
- 修复（已实施）：
  1. **`crates/browser/src/init_script.js` click handler（A + AREA 分支）**：移除 `linkTarget === '_blank'/'_new'` 触发新标签的判定；仅**修饰键/中键**（`ctrlKey/metaKey/shiftKey/button===1`）→ `__adlTryOpenNewTab`（新标签）；普通左键点击（含 target=_blank 站内链接）→ `event.preventDefault() + __startNavGuard(href)`（就地导航，SPA pushState 或整页导航兜底）。
  2. 新增临时 diag：click handler 每次点击 postMessage `{type:'adl-nav-click-diag', href, forcedNewTab, linkTarget}` → `webview2_postmessage.rs` 打 `[ADL-DEBUG][navclick] DIAG` 日志（Phase 0 验证用，Phase 4 清理）。
  3. **`frontend/.../useBrowserNavigation.ts`** smartGoBack 加临时日志 `[ADL-DEBUG][backfwd]`（start/settle 落点/是否继续）——验证回退一次到位。
  4. 保留：C1 pushState/replaceState 归一化、C2 smartGoBack、open-new-tab 通道（修饰键）、window.open 委托原生 NewWindowRequested、Rust new_window_handler。
- 测试更新：`initScriptNavigation.test.ts` click handler 结构断言改为——新标签助手仅修饰键触发（不含 `linkTarget === '_blank'`）、普通点击路径 `preventDefault + __startNavGuard`、新标签路径不 startNavGuard。
- 验证：init_script 语法 node --check 通过；cargo check/clippy 0 警告；tsc 通过；浏览器+slices 345/345 测试通过。
- 待用户复测（Phase 3，**需重建 Rust**——init_script.js 与 webview2_postmessage.rs 改动）：① B 站首页点击视频（两种导航模式）→ 应**当前标签导航**（不新建标签）；② 多次视频跳转后回退/前进 → 应**一次到位**；③ 修饰键（Ctrl/中键）点击 → 仍开新标签；④ 其它站点（含 YouTube）点击跳转无负面；⑤ 提供 debug-logs.txt + terminal/dev 控制台 `[ADL-DEBUG][navclick]`（预期：B 站视频点击 → `forcedNewTab=false` 就地；Ctrl+点击 → `forcedNewTab=true` 新标签）与 `[ADL-DEBUG][backfwd]`（回退循环落点）。

### Phase 3 事项 6（2026-08-21 00:0x）
- 用户复测通过：**任务都完成了**（B 站点击视频当前标签导航、回退一次到位、修饰键新标签均正常，无负面）→ 事项 6 完成 ✓

## [x] 事项 7：视频有声音但历史/书签/已打开标签页下标签的音量图标不显示或闪烁消失
- 状态：已完成（用户 2026-08-21 确认——"所有的、所有的 问题和 任务 都解决完成了"）
- 现象（用户 2026-08-21 报告）：视频明明有声音，但历史记录下的标签没有"音量图标"；有时出现一下又消失。用户要求：书签/收藏目录、历史目录、已打开标签页下，**同一个相同的标签元组**都要正常出现音量图标。
- 根因方向（代码分析，待日志验证）：
  1. **Rust `crates/browser/src/webview2_audio.rs` IsMutedChanged 处理器硬编码 `emit_audio_changed(tab, false, is_muted)`**（line 106）——任何静音状态变化（点音量图标静音/取消静音）都会把 is_playing 错误清零 → 即使视频还在播放，tab.isPlayingAudio=false → 音量图标消失（"出现一下又消失"的直接来源）。
  2. **前端树节点音频匹配用精确 URL 字符串**：`useBrowserTreeData.ts` buildHistoryLeafNode `browserTabs.find((t) => t.url === entry.url)`（仅当天）+ buildFolderNode `tab.url !== snapshotUrl` 时清空音频 + workspace/bookmark 节点"始终清除音频状态"——URL 变体（尾斜杠/跟踪参数/www/SPA 参数）或 tab 导航走（URL 变化）→ 匹配失败 → 历史/书签条目不显示音量图标。
- 计划：Phase 0 日志（Rust audio emit 源 + 前端 browserUpdateTabAudioState）→ 修复（① IsMutedChanged 读取实际 is_playing；② 树匹配统一归一化 historyDedupKey）→ Phase 3 复测。

### Phase 2A 事项 7（2026-08-21 00:05-00:15）
- 已加调试日志（临时，`[ADL-DEBUG]` 前缀，Phase 4 清理）：Rust `webview2_audio.rs` 两个 handler（audio-change/mute-change 触发源 + is_playing/is_muted）；前端 `browserTabsSlice.browserUpdateTabAudioState`（前后值）。
- 修复（根因已确认，代码分析 + 逻辑链）：
  1. **Rust `webview2_audio.rs` IsMutedChanged 处理器**：`emit_audio_changed(tab, false, is_muted)` 硬编码 is_playing=false → 改为**读取实际 `IsDocumentPlayingAudio`**（cast ICoreWebView2_17）——静音状态变化不再错误清零播放状态（音量图标闪烁消失的直接来源）。
  2. **前端 `useBrowserTreeData.ts` 树音频匹配统一归一化**（`historyDedupKey` 剥离跟踪参数/尾斜杠/www）：
     - `buildHistoryLeafNode`：`t.url === entry.url` → `historyDedupKey(t.url) === historyDedupKey(entry.url)`（仅当天条目匹配，语义不变）；
     - `buildFolderNode`（收藏文件夹）：`tab.url !== snapshotUrl` → 归一化比较；
     - `buildWorkspaceCategoryTree`/`buildUserFolderCategoryTree` 书签节点：`tab` 仍在该快照 URL（归一化）时**保留音频状态**（此前"始终清除"导致书签/收藏目录不显示音量图标）。
- 测试：`browserTreeCounts.test.ts` 新增 4 断言（历史叶子尾斜杠变体匹配播放状态 / 无匹配 tab 不显示 / 文件夹收藏保留 / workspace 书签保留）。
- 验证：tsc 通过；cargo check/clippy 0 警告；浏览器+树+stores 469/469 测试通过。
- 待用户复测（Phase 3，**需重建 Rust**——webview2_audio.rs 改动）：① 打开视频播放 → 历史/书签/已打开标签页下该标签应显示音量图标并保持；② 点击音量图标静音/取消静音 → 图标切 VolumeX/Volume2 且不消失；③ URL 变体（尾斜杠/参数）场景（如 B 站视频）图标稳定；④ 提供 debug-logs.txt + dev 控制台 `[ADL-DEBUG][audio] emit`（预期 mute-change 事件 is_playing 为真实播放值而非 false）与 `[audio] store update`。

### Phase 3 事项 7（2026-08-21 00:3x）
- 用户复测通过（隐含）：所有问题/任务都解决完成（事项 3 除外）→ 事项 7 完成 ✓

---

## Phase 4 收尾（2026-08-21，用户确认进入）
- 用户 2026-08-21 确认：**所有问题/任务都解决完成（事项 3 除外——暂停、其 `[ADL-DEBUG]` 日志保留）**；更新进度文件 → 提交所有变更到本地 → 执行 root-cause-resolution 技能 Phase 4 及后续步骤。
- 事项状态：事项 1/2/4/5/6/7 = 已完成；事项 3 = 已暂停（日志保留）。
- 临时日志清理范围：清理事项 1/2/6/7 埋点（[history]/[meta]/[nav]/[fallback]/[navclick]/[backfwd]/[audio]）；**保留事项 3 埋点**（[newtab]/[address]/[webview]）。

### Phase 4 执行记录（2026-08-21 00:4x）
1. 基线提交：`05698e5a fix(browser): 历史标题/写入/图标/导航/音频系列修复（Phase 0-3 完成）`（26 文件 +965/-98，含临时日志与进度文件）。
2. 生成审查快照：`.review-diffs/issue-all-rev1.diff`（`git diff HEAD~1 HEAD`，100KB）。
3. 并行派发子代理 A（根因验证，源码只读，写报告文件）：A1 历史（事项 1/2）→ `review-issue-1-rev1.md`；A2 导航音频（事项 6/7）→ `review-issue-2-rev1.md`；A3 UI 图标/全量（事项 4/5 + 预存问题）→ `review-issue-3-rev1.md`。
4. 待 A 报告 → 主代理逐项验证 → 修复（含 M1 调试日志清理：清事项 1/2/6/7，保留事项 3）→ 重新生成快照（rev2）→ 复审 → 子代理 B（死代码清理）→ 修复 → 复审 → 全量验证（cargo test --workspace + 前端全量 + clippy/tsc/eslint/prettier）→ 标记完成 → README 归档 → 二次提交。

### 子代理 A2（导航/音频）报告转写 + 主代理验证（2026-08-21）
- 报告：`.review-diffs/review-issue-2-rev1.md`（12 项：1 严重/3 高/4 中/4 低）
- **主代理逐项验证结论**：

| # | 子代理结论 | 主代理验证 | 处理 |
|---|-----------|-----------|------|
| 1 严重 | click listener 注册位置在 nav-guard 前 → 冲突 | **误报**：click listener（useCapture=true）与 nav-guard 无注册时序依赖——`__startNavGuard` 在脚本同步执行完已赋值，click 事件在运行时才触发且 `if (window.__startNavGuard)` 有存在性检查 | 不修，记录 |
| 2 高 | target=_blank 就地导航影响 window.open 弹窗 | **用户特殊设计**：window.open（JS 弹窗）走独立路径（window.open 重写→NewWindowRequested→open-new-tab），不受影响；target=_blank 普通点击就地导航是用户 2026-08-20 明确决策，注释已写明 | 不修，记录 |
| 3 高 | AREA 未提取 alt/title 语义标题 | **误报**：点击处理是导航决策，标题由 meta 链路（DocumentTitleChanged/init_script meta/服务端抓取）负责，与 AREA alt 无关 | 不修，记录 |
| 4 中 | 书签归一化注释缺 modal_id 说明（子代理误称 historyDedupKey 剥离 modal_id） | **部分误报**：historyDedupKey **保留** modal_id（剥离的是 normalizeUrlForCompare/historyContainerKey）；音频匹配用 historyDedupKey 精确到具体视频是正确的；补充注释说明归一化范围（低成本文档改进） | 补充注释 |
| 5 低 | spa_fallback h1 选择器容错（抖音） | **无实证**：当前选择器是 2026-08-13 A2 审慎限定，抖音 2026-08-13 用户实测正常 | 不修，记录 |
| 6 中 | browserOpenTab folder.tabs 追加用精确 URL 去重 → URL 变体冗余 | **真实预存问题**（本次变更前已存在，审查范围内）：改为 historyDedupKey 归一化去重 | **修复** |
| 7 低 | browserTreeCounts.test.ts 缺 historyDedupKey 导入 | **误报**：测试未直接引用 historyDedupKey（子代理引用的是实现文件 import 行）；24/24 测试通过佐证 | 不修，记录 |
| 8 低 | spaFallback.test.ts 未覆盖 m.youtube.com | **误报/过期快照**：已有 `isVideoPage('m.youtube.com', '/watch')` 断言；子代理引用行号 664+ 超出文件长度（约 150 行） | 不修，记录 |
| 预存1 高 | IsMutedChanged 事件解绑不完全 → 内存泄漏 | **误报**：`cleanup_audio_handler` 已 `store.remove(tab_id)`；WebView2 事件随 WebView close 自动清理（token 与 WebView 生命周期绑定），无需手动 remove | 不修，记录 |
| 预存2 中 | browserOpenTab 写历史与标签更新重绘顺序 | **无实害**：Zustand set 同步 + React 自动批处理，无中间渲染 | 不修，记录 |

- 待修复：问题 6（folder.tabs 归一化去重）+ 问题 4 注释补充。A1/A3 报告到达后统一修复。

### 子代理 A1（历史标题/写入）报告转写 + 主代理验证（2026-08-21）
- 报告：`.review-diffs/review-issue-1-rev1.md`（7 项：1 严重/2 高/3 中/1 低 + 预存 2）
- **主代理逐项验证结论**：

| # | 子代理结论 | 主代理验证 | 处理 |
|---|-----------|-----------|------|
| 1 严重 | SPA 兜底 2s 延迟 + samePage 守卫是技术债，建议审计/移除 | **架构权衡**（非 bug）：兜底已消除污染（仅视频页 h1、shorts 完全跳过由服务端抓取负责）；移除=行为变更。记录为已知技术债（Phase 4 后可选跟进），本次不重构 | 不修，记录 |
| 2 高 | 过早置信服务端抓取，SW 缓存可能返回首标题，建议时效性校验 | **无实证/机制不符**：服务端抓取是**按 URL 独立渲染**（渲染 /shorts/X 得该视频真实标题，非 live DOM 钉死标题）；缓存按 URL 精确 key；修复后 report 路径不再写错误标题。时效性校验（visitedAt>3s 降级）会误伤合法慢标题 | 不修，记录 |
| 3 中 | 缺滚动集成测试（模拟连续滚动 3-5 视频） | **已覆盖**：spaFallback.test.ts 已测 samePage/isVideoPage + 结构反污染断言（不读 og/tw）；滚动场景的"错误标题不产生"在 Rust 兜底层，前端单测无法覆盖 | 不补，记录 |
| 4 低 | 事项 2 缺 folder 恢复场景测试（同 URL 写历史 1 次） | **已覆盖**：browserAddToHistory 去重（同日同 key）有 browserHistorySlice.test；folder.tabs 去重有 browserTabsSlice.test | 不补，记录 |
| 预存1 高 | browserUpdateTabAudioState 硬编码 is_playing=false | **事项 7 已修复**（webview2_audio.rs 读取实际播放状态），子代理确认 | 已修 ✓ |
| 预存2 中 | [ADL-DEBUG] 日志 12+ 处过载 | **按 Phase 4 计划执行**：清事项 1/2/6/7 日志，保留事项 3 | 执行中 |

- 汇总：A1 无必须修复项（架构建议/无实证/已覆盖/已修复）。

### 子代理 A3（UI 图标/title + 全量）报告转写 + 主代理验证（2026-08-21）
- 报告：`.review-diffs/review-issue-3-rev1.md`（16 项：1 严重/1 高/3 中/11 低）
- **主代理逐项验证结论**：

| # | 子代理结论 | 主代理验证 | 处理 |
|---|-----------|-----------|------|
| P1 严重 | SPA fallback 跨层耦合/测试-生产一致性/浏览器模式缺失 | **误报/过度工程**：init_script diag 与 fallback diag 是**本次临时日志（M1 清理）**，清理后无耦合；spa_fallback 生产逻辑已用户实测+13 单测；浏览器模式缺失是用户已决策（事项 6"先 Tauri，iframe 后续评估"）；__ADL_TESTS__ 隔离等建议超出范围 | 不修，记录 |
| P2 高 | webview2_audio.rs 遗留 info 日志 | **M1 清理范围**（临时诊断日志） | 清理 ✓ |
| P3 中 | 历史 URL 归一化边界测试（utm 参数） | **合理低成本**：historyDedupKey 已剥离 utm_*；补 1 个 utm 变体匹配断言防回归 | **补测试** |
| P4 中 | browserHistorySlice console.info 清理 | **M1 清理范围**（事项 1/2 日志） | 清理 ✓ |
| P5 低 | 测试 beforeEach 清理不彻底 | **无实证**：browserTreeCounts 为纯函数测试（无 store/localStorage）；vitest 默认 per-file isolate | 不修，记录 |
| P6-P14 低 | 各处 console.info/tracing 日志 | 全部为临时日志：P6/P7/P9（newtab/address/webview）= 事项 3 **保留**；P8 的 [address] onUrlChanged setAddress = 事项 3 **保留**（同文件 [nav] 日志 = 事项 1/2 清理）；P10/P11/P12/P13 = 事项 1/2/6/7 **清理** | 按计划清理 |
| 事项4 测试缺失 | BrowserFavicon 空 URL 分支无测试 | **合理低成本**：补组件测试（空 url/about:blank → IconNewTabPage；正常 url → img），mock 依赖 | **补测试** |

- 汇总修复清单（与 A2 合并）：① A2-6 browserOpenTab folder.tabs 归一化去重；② A2-4 书签注释补充 modal_id 说明；③ A3-P3 utm 变体测试；④ A3-事项4 BrowserFavicon 组件测试；⑤ M1 日志清理（事项 1/2/6/7，保留事项 3）。

### Phase 4 主代理修复执行（2026-08-21 00:35-00:45）
- 修复 1（A2-6）：`browserTabsSlice.browserOpenTab` folder.tabs 追加改为 `historyDedupKey` 归一化去重（URL 变体不产生重复快照条目）。
- 修复 2（A2-4）：`useBrowserTreeData.buildFolderNode` 书签音频注释补充 modal_id 说明（historyDedupKey 保留 modal_id，精确到具体视频）。
- 修复 3（A3-P3）：`browserTreeCounts.test.ts` 补 utm_* 参数变体匹配断言。
- 修复 4（A3-事项4）：`BrowserFavicon.test.tsx` 追加 3 断言（空 url/about:blank → IconNewTabPage；真实 url → 无）——该测试文件 pre-existing（A3 上轮未在 diff 中可见，故误报"测试缺失"）。
- 修复 5（M1 日志清理）：
  - **清理**（事项 1/2/6/7）：browserHistorySlice（[history]×5）、useBrowserPageMeta（[meta]×2）、useBrowserMetaSubscription（[meta] received）、useBrowserUrlChange（[nav] urlChanged/existingEntry）、useBrowserNavigation（[backfwd]×2）、browserTabsSlice（[audio] store update）、webview_event_bridge.rs（[fallback]×2）、spa_fallback.js（diag 块 + skipReason 等仅诊断变量）、webview2_postmessage.rs（[fallback] DIAG + [navclick] DIAG 分支）、init_script.js（adl-nav-click-diag×2）、webview2_audio.rs（[audio] emit×2）。
  - **保留**（事项 3）：BrowserToolbar [newtab]、useBrowserPanelEffects [address]、useBrowserUrlState [address]、useBrowserUrlChange [address] onUrlChanged setAddress、useWebViewLifecycle [webview]、browser_webview.rs [webview]。
  - 同步更新：spaFallback.test.ts 结构断言（skipReason → 短路 return/h1 检查）。
- 验证：cargo check/clippy 0 警告、tsc 通过、eslint 干净（prettier --fix 后）、受影响 66 文件 563/563 测试通过。
- 复审：重新生成 `.review-diffs/issue-all-rev2.diff`（96KB），并行派发 3 个复审子代理（读 rev2 全量重看，写 review-issue-N-rev2.md）。

### Phase 4 复审与全量验证（2026-08-21 00:45-01:05）
- **子代理复审/B 清理连续失败**（A1/A2/A3 复审 ×3 与 B 死代码清理均读完整 diff/文件后在写报告前中断，无 closing message）→ **改为主代理直接执行复审与死代码检查**（技能允许主代理验证；记录此环境异常）。
- **主代理复审结论**（对照 rev1 报告问题清单 + rev2 代码状态逐项核验）：
  - A2-6 folder 归一化去重已修复 ✓；A2-4 注释已补 ✓；A1/A3 无必须修复项 ✓
  - M1 日志清理范围正确：残留 `[ADL-DEBUG]` 全部为事项 3 埋点（[webview] browser_webview.rs/useWebViewLifecycle、[newtab] BrowserToolbar、[address] useBrowserPanelEffects/useBrowserUrlState/useBrowserUrlChange）✓
  - 死代码检查：useBrowserPageMeta 的 historyDedupKey/getCachedTitle/normalizedQueryForDedup 均仍使用；前端无残留调试 console（仅 useBrowserNavigation 4 处生产 console.warn 错误日志）；Rust clippy 0 警告（-D warnings）保证无未使用代码；spa_fallback.js 清理后无残留诊断变量 ✓
- **全量验证（Phase 4 唯一一次）**：
  - `cargo test --workspace`：exit 0 全绿
  - 前端全量 `vitest run`：**237 文件 1890/1890 通过**
  - clippy 0 警告、rustfmt 通过（含 cargo fmt 修正 webview_event_bridge.rs 格式）、tsc 通过、eslint 0 error（3 pre-existing warnings 非本次变更）、prettier 干净
- **Phase 4 结论**：全部通过，进入归档。
