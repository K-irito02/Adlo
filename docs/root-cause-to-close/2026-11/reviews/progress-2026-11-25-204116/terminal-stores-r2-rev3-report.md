# terminal-stores — R2 rev3 审查报告

## 范围

快照 rev3（base `be34f973`），owner 文件 8 个：

- `adlo/frontend/src/app/features/terminal/TerminalTabBar.tsx` 及 `__tests__/TerminalTabBar.test.tsx`
- `adlo/frontend/src/app/stores/persisted/registry.ts`
- `adlo/frontend/src/app/stores/slices/{browserTypes,browserSlice,browserLandingSlice}.ts`
- `adlo/frontend/src/app/stores/slices/__tests__/browserPanelPersistence.test.ts`
- `adlo/frontend/src/app/i18n/{zh-CN,en-US}/browser.ts`

只读上下文：`browser-landing/{BackgroundSettingsDialog.tsx,BackgroundLayer.tsx,backgroundAssets.ts,VolumePercent.tsx,BrowserLandingPage.tsx}`、`stores/persisted/{parsers.ts,entry.ts}`、`styles/regions/rightpanel/{file-tree-core.css,tree-shared.css}`、`styles/components/tab-clip.css`、`docs/root-cause-to-close/2026-11/progress-2026-11-25-204116.md`。

R2 只查：死代码 / 冗余守卫 / 多余兼容 / 诊断日志残留。未运行测试、未启动 dev server 或浏览器；未占用端口，无后台进程；仅写本报告。

## 上轮问题关闭情况

- **R1 rev3 F1 [medium]「读侧规整缺测试」—— 已关闭**：`browserPanelPersistence.test.ts` 本轮新增 5 个用例（`:409-429` / `:431-445` / `:447-466` / `:468-485` / `:487-496`）分别锁 `custom→cover`+音量钳制+非法 adjust 丢弃、负音量、adjust 边界、视频 repeat→cover、fit 非白名单整条丢弃；删除性推演逐条成立（见「已核对」）。
- **R1 rev3 F2 [low]「终端用例缺 location 断言」—— 已关闭**：`TerminalTabBar.test.tsx:62` 仍断言 `location === 'center'`，删 `centerShowTerminalTab` 内 `terminalSetLocation(…,'center')` 后读到 `'panel'` 会红。
- **rev2 F1 [low]「`assetId` 注释『每次应用生成新键』」—— 已关闭**：`browserTypes.ts:127` 现为「新导入生成新键；沿用已导入素材时复用旧键」，与 `BackgroundSettingsDialog.tsx:530-534`（仅 `draft.blob` 才 `putBackgroundBlob`）一致。

## 新增发现

无。本轮 R2 的四条重点逐项核对均为负向结论（见下节），未发现需修复的死代码 / 冗余守卫 / 多余兼容 / 诊断日志。

## 已核对（无 finding）

- **TerminalTabBar 死类名**：rev1 记录的 `adl-tool-list__item-center` 全仓已无引用；新增 `adl-tool-list__item-actions` 有唯一消费方 `file-tree-core.css:232`（定位 + `inline-flex` + `gap`），非死类名；被删的旧定位规则 `> .tooltip-trigger` 无残留。两个按钮共用 `tree-shared.css:296-321` 的 `.adl-tool-list__item-close` 悬停/聚焦揭示规则，均会显示。
- **i18n 新 key 消费方与旧 key 孤儿**：新增 11 个 key（`browserBgAdjustHint/AdjustReset/VolumeEditHint/Volume/DropActive/Importing/Applying/Unsupported/LoadFailed/RemoveFile/RefreshFile`）zh-CN :125-135 与 en-US :132-142 两侧齐全、顺序一致，全部有生产消费点（`BackgroundSettingsDialog.tsx`、`BrowserLandingPage.tsx` 经 `VolumePercent.tsx:82` 的 `title={editHint}` 实际渲染），非只在测试里出现；旧 key 中仅 `browserBgPreview`（zh-CN :120 / en-US :127）无消费方，但它是 base 既有孤儿（`BackgroundSettingsDialog` 的 rev3 diff 里从未出现该字面量），不是本轮引入，故不入主表。
- **持久化用例无新增重复 / 死 mock**：5 个新用例各锁不同分支，无相互重复，也未新增 mock；`browserBgConfig` 的 `it.each` 用例与「新字段完整往返」互补（前者走写入侧，后者走读侧可选字段）。
- **读侧规约无实质重复守卫**：`readBackgroundConfig` 是 `adl:browser.bgConfig` 的唯一 reader（全仓仅 registry 引用）；旧字段 `filePath` 已整体删除，无读取/兼容残留；`assetPath` / `assetId` / `volume` / `muted` / `adjust` 均有真实读取方（`backgroundAssets.ts:61-68,236-241`、`BackgroundLayer.tsx:25,29-35`、`BrowserLandingPage.tsx:425,461-462`）。
- **诊断日志**：8 个 owner 文件内无 `console.*` / `debugger` / TODO 调试残留。
- **类型 re-export 非死导出**：`BackgroundAdjust` 由 `browserTypes` → `browserLandingSlice` → `browserSlice` 的链路有消费方 `backgroundVideoStage.ts:14`、`BackgroundVideoCanvas.tsx:2`。
- **新增用例的删除性推演**：删 `record.fit === 'custom' ? 'cover'` → `:409` 因 fallback 不等于 `{fit:'cover'}` 变红；删 `volume` 钳制 → `:409`（3≠1）与 `:431`（-0.2≠0）变红；删 `readBackgroundAdjust` 的 `typeof/Number.isFinite` 校验 → `:409` 的期望对象会多出 `adjust` 而红；删 `result.adjust = adjust` → `:380` / `:447` 红；删视频 `repeat→cover` → `:468` 红；删 `assetId/assetPath/muted` 透传 → `:380` 红。

## 记录不修

- `browserBgPreview`（zh-CN :120 / en-US :127）是 base 既有孤儿 i18n key，零消费方；删除即可，但非本轮引入、不改变行为，留待 P5 或后续清理。
- `browserPanelPersistence.test.ts:55,237` 两处 `vi.restoreAllMocks()` 属死脚手架：全文件无 `vi.fn/vi.spyOn/vi.mock/vi.stubGlobal`，无可恢复的 mock；pre-existing，无行为影响。
- `registry.ts:302` 的 `Array.isArray(raw)` 守卫在 `readBackgroundAdjust` 内冗余（数组进入后 `scale` 等必为 `undefined`，会走同一 early return）；`readBackgroundAdjust` / `readBackgroundConfig` 的 plain-record 判形还复制了已导入的 `parsers.isPlainRecord`（`parsers.ts:172`）。属可选收敛，不影响行为。
- `registry.ts:349` 的 0–1 内联钳制与 `parsers.readNumberInRange(0, 1)`、`BackgroundLayer.tsx:21-26` 的 `clampVolume` 同源三份；读侧钳制针对未受信 localStorage，有独立价值，暂不改。
- `TerminalTabBar.tsx:105,118` 两个按钮共用 `adl-tool-list__item-close`（语义为「关闭」）承载「移入中心」动作，名称与用途不符；纯命名/样式收敛，若区分需同步 `tree-shared.css` 的揭示规则。
- `browserPanelPersistence.test.ts:380` 标题「完整往返」实为读侧水合（写入侧只由 `it.each` 覆盖 `assetId`）；rev2 已记录，断言本身有效。
- 跨 scope（background-landing，交该 scope 复核）：`BackgroundSettingsDialog.tsx:539` `{ ...base, adjust: adjustRef.current, assetId }` 中 `adjust` 与 `base.adjust`（:514）重复；`{ mode: 'default', fit: 'cover' }` 默认值在 `registry.ts:841` 与 `browserLandingSlice.ts:226` 各一份。
- `registry.ts:331` 的 `'custom'` → cover 属旧持久值兼容分支，与「未发布期禁止数据格式兼容」有张力；但 `docs/root-cause-to-close/2026-11/progress-2026-11-25-204116.md:72` 明确记录「删除 custom 档（旧值按 cover 读入）」，属本轮已定决策，R2 不推翻（若主代理要求严格执行约束，需用户确认后再删分支与其用例）。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题

需修复项：0
