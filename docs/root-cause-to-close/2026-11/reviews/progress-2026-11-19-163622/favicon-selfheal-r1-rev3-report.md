# R1 rev3 复审报告 — favicon-selfheal

## 范围

- 快照：`.review-diffs/*-rev3.diff`（base `ab91161741fc569c03281c5c7e23456f57289682`），只审本 scope 的 10 个文件，不复用旧快照。
- 本 scope 文件：
  - `adlo/src-tauri/src/commands/browser.rs`
  - `adlo/frontend/src/app/components/BrowserFavicon.tsx`、`adlo/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx`
  - `adlo/frontend/src/app/features/browser/faviconSelfHeal.ts`、`adlo/frontend/src/app/features/browser/__tests__/faviconSelfHeal.test.ts`
  - `adlo/frontend/src/app/features/browser/browser-landing/ShortcutCard.tsx`、`ShortcutCard.test.tsx`、`ShortcutGrid.css`
  - `adlo/scripts/check-rust-changed.mjs`、`adlo/scripts/dev-tools.test.mjs`
- 本轮增量确认（rev2 → rev3）：仅 3 个文件变化，且逐行核对后只有注释改动——`BrowserFavicon.tsx` 快照 3468 → 3502 B、`faviconSelfHeal.ts` 4680 → 4754 B、`browser.rs` 18889 → 19095 B；其余 7 个 scope 快照字节数与 rev2 完全相同（`BrowserFavicon.test.tsx` 2501、`faviconSelfHeal.test.ts` 4478、`ShortcutCard.tsx` 1956 / `.test.tsx` 2947、`ShortcutGrid.css` 1035、`check-rust-changed.mjs` 2472、`dev-tools.test.mjs` 1782），按未改动处理并沿用 rev2 结论（未逐行重读）。
- 只读核对（未修改）：`crates/browser/src/page_meta_service.rs`、`frontend/src/app/components/faviconDisplayCache.ts`、`utils/favicon.ts`、`utils/pageMetaClient.ts`、`features/browser/useBrowserTagActions.ts`、`frontend/dev/previewWorkspaceService/pageMetaService.ts`。
- 遵守只读约束：未运行 `git diff/log/show`，未改源码/配置，未运行测试套件，未启动 dev server / 浏览器 / headless Chrome。**端口：无**（未使用任何端口，无后台进程残留）。
- `.review-diffs/` 下没有 `claims-ack-rev3.md`（只有 rev1）；本轮新增措辞里的强断言已人工逐句核对，见下。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

- **上轮 F1（`warmup_target_allowed` 文档第 3/5 条与 arm 不符）：已关闭。**
  - 第 3 条「标题不成立且 `favicon_url` 为空 → 抓」与 arm 3 精确对应：`browser.rs:346` 判 `!silent_cache_hit`，而 `silent_cache_hit`（`:381-385`）为「有效标题 ∨ 非空 `favicon_url`」，取反即「无有效标题 ∧ `favicon_url` 为空」。
  - 「即便已有 data-URI 也会抓」成立：`silent_cache_hit` 不读 `favicon_data_uri`，data-URI-only 条目仍进 arm 3；`has_favicon` 才读 data-URI（`:298`）。该口径也与 rev2 记录的现实可达性一致（`report` 成功会写 `last_ok_at>0`，不会先被退避臂拦住）。
  - 「warmup 顺带补标题」成立：warmup 目标走 `fetch_silent_meta`（`:1127-1134`），后者经 `backfill_request_meta` 按标题/图标 `report`（`:789-791`、`:366-377`）。
  - 第 4/5 条亦与实现一致：arm 4 `:347` 在 `silent_cache_hit` 为真时判 `!has_favicon`，而 `has_favicon` 已含 `favicon_url` 与 data-URI，故命中该臂的只可能是「有效标题 + 两个图标字段都空」的标题-only 条目；arm 5 同 `:347` 返回 false（跳过）。组合覆盖完整：无标题 + 有 `favicon_url` → 走第 5 条跳过；无标题 + 无 `favicon_url` + 有 data-URI → 走第 3 条抓；有效标题 + data-URI → 走第 5 条跳过。
  - 单测注释（`:2075-2076`）与断言仍一致；`:2099-2105` 的「仅 data-URI 也算有图标 → 跳过」用例当时 `title="Example"`（`:2094`），测的是「有效缓存 + 图标」臂，不与第 3 条冲突。
- **上轮 F2（`has_favicon` 文档「与 `silent_cache_hit` 正交」）：已关闭。**
  - 现文「关注点不同：后者表达『可直接返回』（有效标题 **或** 非空 `favicon_url`）」与 `silent_cache_hit`（`:381-385`）逐字相符，「可直接返回」也与该函数自述（`:379-380`，零 WebView 创建）一致。
  - 现文「本函数表达『有任何可显示图标』（`favicon_url` **或** data-URI）」与 `has_favicon`（`:298`）逐字相符。已不再声称「正交」，不再有「改 `has_favicon` 不影响缓存命中」的误导。
- **上轮 F3（「只触发一次」绝对措辞）：已关闭。**
  - `faviconSelfHeal.ts:11-12` 改为「每次自动触发只排一次刷新，并在会话内按窗口节流（常规 10 分钟 / force 60 秒）」。核对：`ensureSiteFavicon` 每次调用最多入队一个 URL（`:100-109`，`enqueued` 去重）；常规 10 分钟来自 `FAVICON_SELF_HEAL_THROTTLE_MS`（`:19`）+ `shouldAttemptFaviconSelfHeal`（`:33-41`）；force 60 秒来自 `FORCE_ENSURE_THROTTLE_MS`（`:56`）+ `shouldAttemptForcedEnsure`（`:59-67`），两条路径走不同表（`:103`）。描述的是「每次触发的上界 + 两套窗口」，不再声称长会话内只触发一次。
  - `BrowserFavicon.tsx:383-384` 改为「触发一次补抓（受会话节流约束，等价手动『刷新网站图标与标题』）」。核对：effect（`:392-403`）第 1 条在 `!preferredSrc && resolvedFaviconEmpty` 时调用非 force 的 `ensureSiteFavicon`（`:400-401`），因此确实受常规 10 分钟节流；「等价手动刷新」指后端链路一致——`ensureSiteFavicon` 调 `pageMetaClient.refresh`（`faviconSelfHeal.ts:74-76`），手动入口也用同一方法（`useBrowserTagActions.ts:45`）。
- **rev2 观察项未被误写成已解决：确认。**
  - F1 残余 TOCTOU（`spawn_convention_favicon` 的 `peek` → `update_favicon_data_uri` 两次独立加锁）在本轮没有代码改动，三处新注释均未提及该守卫，也未宣称原子化。
  - 跨层重复补抓（Rust `get` 命中 → `spawn_meta_refetch` 与前端 `ensureSiteFavicon` 各抓一次；warmup 与前端队列也各建窗）仍存在；新注释的「每次自动触发只排一次刷新」范围是 `ensureSiteFavicon` 的入队行为，未声称跨层/跨进程去重，也没有改写后端冷却语义。

## 新增发现

无。

## 记录不修 / 观察（不进入主表）

- **「元数据已结算」是摘要口径**：`resolvedFaviconEmpty` 除「已结算/已重定向」外，还会由 5s 计时期置位（`BrowserFavicon.tsx:301-313`，注释自述「URL 永远不会被结算」），因此自愈 effect 在未结算页面也会触发一次。第 1 条注释只描述「已结算」这一主路径，没有写「只在已结算时」，且与既有测试标题 `spinner mode requests a favicon backfill once meta settled without any icon`（`BrowserFavicon.test.tsx:254`）同口径；未按过度承诺计。若主代理要求逐路径穷举，可写成「已结算（或 5s 降级）但一个图标都没有」。
- **data-URI-only + 无标题组合仍无隔离用例**：第 3 条新措辞「即便已有 data-URI 也会抓」由 arm 3 直接可证，但现有单测的 data-URI 断言（`browser.rs:2102-2105`）带着有效标题，走的是第 5 条跳过臂。rev2 已记录该覆盖缺口（当时即选择改注释而非补用例），本轮不新增要求。
- **删除性推演**：本轮三处均为注释，无可删除的行为代码；rev2 已验证的回归保护仍在（`faviconSelfHeal.test.ts:34-78` 的 once/节流/force 60s、`BrowserFavicon.test.tsx:254-268` 的 spinner/initial、`browser.rs:2073-2118` 的 warmup 各臂），本轮未复跑。
- **`claims-ack-rev3.md` 缺失**：不影响结论；本轮新增的「每次自动触发只排一次刷新」「即便已有 data-URI 也会抓」等强断言已按代码逐条核对，均可由 `ensureSiteFavicon` 的单次 push 与 `warmup_target_allowed` 的 arm 顺序证明。

## 结论

- 需修复项：0（本轮零问题）
