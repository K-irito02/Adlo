# terminal-stores — R1 rev3 审查报告

## 范围

本轮快照 rev3（base `be34f973`），owner 文件 8 个（与 rev2 相同）：

- `adlo/frontend/src/app/features/terminal/TerminalTabBar.tsx` 及 `__tests__/TerminalTabBar.test.tsx`
- `adlo/frontend/src/app/stores/persisted/registry.ts`
- `adlo/frontend/src/app/stores/slices/{browserTypes,browserSlice,browserLandingSlice}.ts`
- `adlo/frontend/src/app/stores/slices/__tests__/browserPanelPersistence.test.ts`
- `adlo/frontend/src/app/i18n/{zh-CN,en-US}/browser.ts`

只读上下文：`browser-landing/{BackgroundSettingsDialog.tsx,backgroundAssets.ts,BackgroundLayer.tsx,backgroundVideoStage.ts}`、`stores/persisted/{hydrate,persist}.ts`、`stores/actions/centerActions.ts`、`stores/slices/centerTabsSlice.ts`。

**本轮变更面（实测）**：把 rev2/rev3 快照的 scope 文件逐一取 SHA-256 对比，7 个文件字节完全一致（`TerminalTabBar.tsx`、其测试、`registry.ts`、`browserSlice.ts`、`browserLandingSlice.ts`、`browserPanelPersistence.test.ts`、`zh-CN/en-US/browser.ts`）；仅 `browserTypes.ts` 变化（rev2 1512 B → rev3 1548 B，差异即 `assetId` 注释一行）。另核对相邻 context 文件：`backgroundAssets.ts`、`BackgroundLayer.tsx`、`backgroundVideoStage.ts` rev2=rev3；`BackgroundSettingsDialog.tsx` 在 rev3 有改动（adjustRef、`accept`、复位守卫，属 background-landing scope），但 `handleApply` 的 `assetId` 分支未变。

未运行测试，未启动 dev server / 浏览器；用删除性推演 + 源码对照。未占用端口，未留下后台进程。仅写本报告。

## 上轮问题关闭情况

### F1 [medium] 读侧规整缺测试 —— **仍关闭**

`browserPanelPersistence.test.ts` 本轮字节未变，rev2 的 5 个用例全部在位并仍从公共入口 `restart()` 进入：`custom→cover`+音量钳制+非法 `adjust` 丢弃（`:409-429`）、负音量（`:431-445`）、`adjust` 边界值（`:447-466`）、视频 `repeat→cover`（`:468-485`）、`fit` 非白名单整条丢弃（`:487-496`）。`registry.ts` 的 `readBackgroundConfig` / `readBackgroundAdjust` 实现同样未变，故 rev2 的逐条删除性推演结论继续成立（删掉对应分支断言分别变红）。F1 保持关闭。

### F2 [low] 终端用例缺 `location` 断言 —— **仍关闭**

`TerminalTabBar.tsx` 与 `TerminalTabBar.test.tsx` 字节未变；`TerminalTabBar.test.tsx:62` 仍有 `expect(state.terminalTabsById[tabId]?.location).toBe('center')`，删掉 `centerShowTerminalTab` 内的 `terminalSetLocation(…, 'center')` 后该断言仍会从 `'panel'` 读红。F2 保持关闭。

### 上轮唯一 low（`browserTypes.ts` `assetId` 绝对断言） —— **已关闭**

- 现注释（`browserTypes.ts:126`）：「浏览器端 IndexedDB 内的素材键（**新导入生成新键；沿用已导入素材时复用旧键**）。」
- 「新导入生成新键」可证：导入草稿必带 `blob`（`backgroundAssets.ts:180` 的 `blob: file`），`handleApply` 里 `if (draft.blob) assetId = await putBackgroundBlob(mode, draft.blob)`（`BackgroundSettingsDialog.tsx:531-533`），而 `putBackgroundBlob` 每次都走 `nextBackgroundAssetKey` → `crypto.randomUUID()`（`backgroundAssets.ts:116-131`）；`backgroundAssets.test.ts:154-161` 也断言连续两次写入得到不同键。
- 「沿用已导入素材时复用旧键」可证：打开弹窗的种子草稿只带 `assetId`、不带 `blob`（`BackgroundSettingsDialog.tsx:198-204`），应用时 `let assetId = draft.assetId`，无 `blob` 不调用 `putBackgroundBlob`，并兜底 `assetId ?? (mode === browserBgConfig.mode ? browserBgConfig.assetId : undefined)`（`:530-534`）。
- 与 rev2 建议措辞一致，未再出现「每次应用都生成新键」这类被推翻的绝对句；本轮无新增绝对断言需要 ack。

## 新增发现

无。rev3 在本 scope 内只改了上述一行注释，未引入行为/契约变化。

## 已核对（无 finding）

- **rev3 无新事实错误**：`browserTypes.ts:109-135` 其余注释与 rev2 相同且仍对得上实现——`BackgroundFit` 三种填充方式在 `BackgroundLayer.adjustTransform`（`:28-35`）中统一套用「中心缩放 + 容器百分比平移」；`BackgroundAdjust` 的 `scale=1` 为预设、`offsetX/Y` 为百分比平移与 `translate(...) scale(...)` 一致；`assetPath` 指向 `adl-backgrounds/`、`volume` 缺省 0、`muted` 默认 true 均与消费端一致。
- **F1/F2 依赖链未被他 scope 改动破坏**：`registry.ts`、`backgroundAssets.ts`、`BackgroundLayer.tsx`、`backgroundVideoStage.ts` 的 rev3 快照与 rev2 一致；`BackgroundSettingsDialog.tsx` 的 rev3 改动（`adjustRef` 重读、`accept` 列表、复位 `busy` 守卫）不触碰 `assetId` 生成/复用路径，注释仍准确。
- **`BackgroundAdjust` 类型 re-export 链**（`browserTypes` → `browserLandingSlice` → `browserSlice`）未变，消费方 `backgroundVideoStage.ts:14` 仍在，非死导出。
- **i18n 11 个新 key**（rev3 与 rev2 字节一致）在 zh-CN / en-US 双侧齐全，全部有消费点：`browserBgAdjustHint`(`BackgroundSettingsDialog.tsx:884`)、`browserBgAdjustReset`(`:749-750`)、`browserBgVolumeEditHint`(`:847`、`BrowserLandingPage.tsx:473`)、`browserBgVolume`(`:822,846`、`BrowserLandingPage.tsx:472`)、`browserBgDropActive`(`:809`)、`browserBgImporting`(`:757,801`)、`browserBgApplying`(`:905`)、`browserBgUnsupported`(`:237,262,296,508`)、`browserBgLoadFailed`(`:525,536`)、`browserBgRemoveFile`(`:780`)、`browserBgRefreshFile`(`:772`)，无孤键、无硬编码展示文本。
- **`TerminalTabBar`**：两个按钮均 `aria-label` + `TooltipSimple`、图标 `decorative`，动作按钮名称恒定且未加 `aria-pressed`/`aria-expanded`；本轮未改动。

## 记录不修

- `browserTypes.ts:109-113`「三种模式都支持…自由缩放/平移」中的「模式」与相邻 `BackgroundMode`（同样三个值）易混；rev1 已记录、rev2 复核未改，事实无误（指三种 `BackgroundFit`），不改行为，留待后续措辞整理。
- 跨 scope（background-landing，交该 scope 复核）：`backgroundAssets.ts:126`「每次应用都用新键」的措辞仍与被本 scope 修正的同一事实同源（实为「每次写入新 Blob 都用新键」），建议该 scope 一并降级。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题

需修复项：0
