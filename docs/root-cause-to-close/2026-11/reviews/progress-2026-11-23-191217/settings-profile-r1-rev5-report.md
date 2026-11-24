# P4 R1 复审报告（rev5）— 设置（共享浏览配置文件 / 恢复默认）

## 范围

- 快照：`manifest-rev5.md`（base `aced53d8e`，files 78）。只看 rev5 全量快照；未用旧快照判断代码。
- 本轮快照内本 scope 文件（8 个）：`app/components/settings/{SettingsPanel.tsx,ResetAllDialog.tsx,ResetAllDialog.test.tsx,resetAllSettings.test.ts}`、`app/features/browser-settings/{BrowserSettings.tsx,BrowserSettings.test.tsx}`、`app/features/browser/useBrowserViewHost.test.ts`、`shared/settings-reset/browserReset.ts`。
- **rev5 与 rev4 的 scope 快照逐文件 SHA256 比对：8/8 全部 SAME**（另核对 i18n 双语 4 文件亦 SAME）。即 rev5 对本 scope 无任何代码/测试/文案改动，本轮所有结论均由**当前源码重新推导**，未沿用 rev4 判断。
- 为核对删除敏感性/接线，额外只读（不在本轮 diff 行内判断）：`features/browser/{browserPoolSingleton.ts,useBrowserViewHost.ts}`、`stores/slices/browserSlice.ts`、`stores/persisted/{persist.ts,registry.ts}`、`shared/settings-reset/{downloadPathReset.ts,browserReset.test.ts}`、`features/browser-settings/{browserAtDefault.ts,BrowserProfileSettings.tsx}`、`components/settings/resetAllSettings.ts`、`SettingsPanel.test.tsx:724-776`、`app/i18n/{zh-CN,en-US}/browser.ts`、`settingsSearchIndex.ts`、`styles/{components/settings.css,workspace-settings.test.ts}`。
- rev5 相邻变更（非本 scope，仅确认无交集）：`browserTabsSlice.ts`（仅注释换行）、`browserDownloadsSlice.ts` + 新增 `__tests__/browserDownloadsSlice.test.ts`、`init_script.js` / `webview_handle.rs` / `webview2_postmessage.rs` / `webview_event_bridge.rs` / `download_commands.rs` / `initScriptNavigation.test.ts` / `composite.test.ts`。本 scope 依赖的 `browserPoolSingleton.ts`、`useBrowserViewHost.ts`、`browserSlice.ts`、`browserAtDefault.ts`、`BrowserProfileSettings.tsx` 与 rev4 快照逐字节相同，故不影响 scope 断言。
- 只读审查：**未运行任何测试**（全部删除性推演）、未启动 dev server / 浏览器；**未使用任何端口**、无后台进程；未运行 `git diff/log/show`；未改源码/配置。
- `.review-diffs/` 本轮**无** `claims-ack-rev5.md`（已确认）；scope 内新增/改写注释的绝对措辞（「跨桥 4 次」「五块」「同步写…不回滚」「全部成功才关框」）已逐条对照实现。
- 新增用例内容核对：仅 `example.com` 类 URL、store 默认值与 `vi.fn()`，无真实路径/凭据。

## 上轮问题关闭情况

rev4 结论为零，无待关闭项；逐条复核 rev3 三项修复在当前源码仍成立：

- **F1（组级恢复注释口径）仍关闭**：`SettingsPanel.tsx:1059-1063` 与 `BrowserSettings.tsx:15-22/128-133`、`browserReset.ts:21-25` 一致。桥次数复核：`browserReset.ts:27` 为同步 store 写（非桥）+ `:28` `updatePreferences`（1）+ `:36` `updateDownloadSettings`（2）+ `downloadPathReset.ts:12` `changeDownloadPath`（3）+ `:14` `updateDownloadSettings`（4）= **跨桥 4 次**；挂起时长与白名单同属一次 `updatePreferences`，注释未单列成步。scope 内无残留「三步/三块」旧写法。
- **F2（全局恢复缺 profile 断言）仍关闭**：`ResetAllDialog.tsx:158` 接线 + `ResetAllDialog.test.tsx:252-272`（`:271` 断言 `setBrowserShareProfile` 收到 `true`）+ `resetAllSettings.test.ts:16/59`（腿调用）。删除性推演：`:158` 闭包改 `() => {}` → `:271` 红；删 `browserReset.ts:27` → `resetAllSettings.test.ts:59`、`browserReset.test.ts:31` 红。
- **F3（消费端 profile 快照）仍关闭**：`useBrowserViewHost.test.ts:162-196` 断言 `createForTab` 第 9 参为 `false`（store `browserShareProfile:true` + tab 快照 `false`），对照 `browserPoolSingleton.ts:98-99`（`tabShareProfile ?? true`）。删除性推演：实现改常量/改读当前 store（true）→ `:192` 红；缺省回落由既有 `:221-233`（第 9 参 `true`，此时 `browserTabsById` 已在 `:71-75` 清空）锁住。
- **恢复顺序仍成立**：`browserReset.ts:27`（profile，同步）→ `:28-32`（挂起/白名单）→ `:36`（模式）→ `:40`（路径）；`BrowserSettings.test.tsx:475-513` 用 `invocationCallOrder` 锁 profile < suspend < mode < path（`:504-512`）。删除性推演：把 `:27` 移到任一 `await` 之后 → `:504-506` 红。
- **聚合双向锁定仍成立**：`BrowserSettings.test.tsx:199-205`（profile off + 其余默认 → aggregate `false`，锁 profile 腿）+ `:671-680`（全默认 → `true`）；未激活组校正由 `SettingsPanel.test.tsx:750-776`（browserShareProfile:false → 聚合从 `true` 纠正为 `false`）。

## 新增发现

本轮无新增需修复项。

- R1 §4.1 async 复核：`resetShareProfile` 在第一个 `await` 前同步改 store（`browserSlice.ts:210-212`；`persist()` 走共享去抖调度器，`persist.ts:14-16`，写盘失败静默），后续步失败不回滚；与 `BrowserSettings.tsx:20/130`、`browserReset.ts:15`、`BrowserSettings.test.tsx:503` 四处注释一致。仓内「同步写」均指同 tick 写 store（如 `CenterTerminalView.tsx:82`），不指立即落盘。
- 入口守卫新用例删除敏感：`BrowserSettings.test.tsx:188-197`；删 `BrowserSettings.tsx:94` 的 `profileConfirmOpen` 守卫项 → 组框会弹出，`:196` 红。
- 全局恢复与组级恢复共用同一编排（`resetAllSettings.ts:83`），profile 复位在 `ResetAllDialog.tsx:158` 与 `BrowserSettings.tsx:145` 两处均已接线，无单端漏接。
- 双语键齐备：`browserShareProfile{,Title,Desc,DesktopOnly}` 在 `zh-CN/browser.ts:233-237`、`en-US/browser.ts:247-251`；搜索锚点 `anchorFor('browser','profile')` 对应 `settingsSearchIndex.ts:172`。

## 记录不修

- `ResetAllDialog.test.tsx:254` 的 `browserShareProfile:false` 在桩化 action 下不参与断言（删除仍绿，仅上下文），且 `afterEach`（`:126-131`）只还原 action 不还原该值，文件内残留；无后续用例依赖，建议清理用例时一并去掉。
- `BrowserSettings.test.tsx:159-164`、`:477-481` 注入的 `setBrowserShareProfile` mock 未在 `afterEach` 还原（rev3 已记录）；当前后续用例不依赖真实 action，不改变断言结果。
- `settingsSearchIndex.ts:172-177` 未收录条件文案 `browserShareProfileDesktopOnly`（仅浏览器模式可见），搜索该短语不命中（rev3 已记录，可选覆盖）。
- 产品默认 `true` 分散：`browserSlice.ts:82`、`registry.ts:825`、`browserAtDefault.ts:34`、`BrowserProfileSettings.tsx:38/52` 与 Rust `share_profile_default()`（rev3 已记录，Q4=A 已定）。
- `uiSliceTypes.ts:191`「浏览器三块」、`:333`「卸载清 null」与 `styles/components/settings.css:1612`「浏览器组两块卡片」为预存旧口径（均不在 rev5 diff）。
- `styles/workspace-settings.test.ts:250` 注释「两块卡片（挂起时长 / 下载设置）」在本轮加 profile 卡后已不完整（三张卡共用 `.adl-browser-settings`）；该文件不在 rev5 快照范围且断言不依赖计数，与 `settings.css:1612` 同族，留待统一清理。
- `browserReset.test.ts:21` 标题写「顺序执行」而本文件只断言各步被调用（顺序由 `BrowserSettings.test.tsx:504-512` 锁）。
- 组级文案「将一起恢复为默认值」对 profile 非原子（同步先落地、后续失败不回滚），属预存措辞。
- 文档类（`docs/adr/0001-…`、`docs/root-cause-to-close/…`、`docs/analysis/browser-embedding/**`）留 P5 同步，不计入本报告。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；本轮零问题，no regression —— rev5 对本 scope 无改动，恢复顺序与全局 profile 断言均仍成立。
