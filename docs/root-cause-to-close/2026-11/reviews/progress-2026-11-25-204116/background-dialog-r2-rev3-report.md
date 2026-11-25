## 范围

rev3 快照（base `be34f973`，`.review-diffs/manifest-rev3.md`）。R2 只查死代码 / 冗余守卫 / 多余兼容 / 诊断日志，只审这 11 个文件：

- `adlo/frontend/src/app/features/browser/browser-landing/BackgroundSettingsDialog.tsx`
- `.../BackgroundSettingsDialog.css`
- `.../BackgroundSettingsDialog.test.tsx`
- `.../backgroundAssets.ts`
- `.../backgroundAssets.test.ts`
- `.../backgroundVideoStage.ts`
- `.../backgroundVideoStage.test.ts`
- `.../useBackgroundMedia.ts`
- `.../BackgroundVideoCanvas.tsx`
- `.../BackgroundLayer.tsx`
- `.../BackgroundLayer.css`

只读源码，未改源码、未跑测试 / 门禁 / 未启动 dev server 或浏览器（无端口占用）。rev2→rev3 逐文件比对快照大小：只有 `BackgroundSettingsDialog.tsx`（36994→37540）、`BackgroundSettingsDialog.test.tsx`（13216→13840）、`backgroundAssets.test.ts`（2647→5690）、`backgroundVideoStage.test.ts`（1991→2025）变化，其余 7 个与 rev2 逐字节一致，故回归面按这 4 个文件核。为核对「无 filePath 残留」只读了 `stores/persisted/registry.ts:339-344` 的读取侧（他 scope 上下文，不产出 finding）。

## 上轮问题关闭情况

R1 rev3 主表为 0 条（「本轮零问题」）。逐条复核其关闭结论仍成立：

1. **F1（复位按钮 applying 期间可改写 adjust）— 已关闭。** `BackgroundSettingsDialog.tsx:743-748` 仍同时有 `busyRef.current === 'idle'` 早退与 `disabled={busy !== 'idle'}`；`handleApply` 在 `:514` 构造 base、`:539` 在 `await putBackgroundBlob`（`:532`）之后重新读 `adjustRef.current` 落库。
2. **F2（排空时机 / 去重键）— 已关闭。** 排空在种子 effect 内 `:173-179`（`seededOpenRef` 守卫之后），`:178` 同时清 `lastNativeDropRef`；拖放 effect `:306-350` 只剩注册、订阅与 `/300ms` 轮询。
3. **F3（测试文案与覆盖缺口）— 已关闭。** 延迟 prune 用例 `BackgroundSettingsDialog.test.tsx:278-288`、`putBackgroundBlob` 双键 + 回读 `backgroundAssets.test.ts:153-162`、先滚轮再调音量的非种子缩放断言 `BackgroundSettingsDialog.test.tsx:265-273` 均在。
4. **F4（图片 accept 过宽）— 已关闭。** `BackgroundSettingsDialog.tsx:694-698` 恢复显式 `image/jpeg,image/png,image/gif,image/webp`，与 `backgroundAssets.ts:18` 的 `IMAGE_EXTENSIONS` 对齐。

## 新增发现

无新增需修复项。R2 专项逐项结论（均不改变行为/事实，按简报 §6 降噪约定只进「记录不修」）：

- **filePath / data URL 兼容残留：无。** 11 个文件内 `filePath|FileReader|readAsDataURL|dataUrl|data:image|data:video` 命中 0 处（同目录唯一命中在 `ShortcutCard.test.tsx`，不属本 scope）；`resolveBackgroundUrl`（`backgroundAssets.ts:233-251`）与 `backgroundSourceKey`（`:60-71`）只认 `assetPath`/`assetId`；读侧 `persisted/registry.ts:339-344` 也只有两字段。没有半截兼容分支。
- **`adjustRef` + `busyRef`：分工成立，仅复位按钮一处真重复。** ref 拦「同一事件循环内同步重入」，state 驱动 `disabled`；规律的 `busyRef` 早退（`importPath:252`、`handleNativeDrop:283`、`handleDrop:404`、`pointerDown:428`、`wheel:476`、音量/静音 `:827,837`、`handleApply:491`）与 `disabled` 是互补而非重复，只有复位按钮的两个守卫完全等价（记录 5）。
- **背景素材模块辅助函数：无未消费导出。** `backgroundAssets.ts` 的 14 个导出全部有调用方（`isBackgroundExtensionAllowed`/`backgroundKindForFile`/`fileExtension`/`backgroundSourceKey`/`nextBackgroundAssetKey`/`putBackgroundBlob`/`readBackgroundBlob`/`pruneBackgroundBlobs`/`draftFromLocalFile`/`importDroppedPath`/`pickDesktopBackground`/`pruneDesktopBackgrounds`/`resolveBackgroundUrl`/`isDesktopShell`），类型 `BackgroundKind`/`BackgroundDraft` 亦被消费；`backgroundVideoStage.ts` 的 5 个函数导出全部被 `BackgroundVideoCanvas.tsx` 或测试使用（另有 `VideoStageConfig` 类型仅作入参）。唯一「只写不读」的是 `backgroundVideoStage` 的模块级 config 副本（记录 2）。
- **对话框死变量 / 死注释：无。** 10 个 ref（`draftsRef`/`fileInputRef`/`localVideoRef`/`busyRef`/`adjustRef`/`lastNativeDropRef`/`seededOpenRef`/`pruneTimerRef`/`previewDragRef`/`previewRef`）与 9 个 state 均有读取点；多次修复留下的注释（`:158-159`、`:168-169`、`:175-176`、`:212`、`:304-305`、`:416`、`:468`、`:618-619`、`:869`）逐句对照实现仍成立。两个 CSS 文件的类选择器全部有消费方（弹窗 TSX、`BackgroundVideoCanvas.tsx` 或 `BackgroundVolumeControl` 的 `adl-bg-volume`），仅 1 条被重构废弃的 no-op 声明（记录 6）。
- **诊断日志：无遗留。** 仅 `backgroundAssets.ts:221,224,247` 与 `useBackgroundMedia.ts:45` 的失败路径 `console.warn`，与同目录既有写法一致，且不含 `[DBG-]`/`[ADL-DEBUG]` 临时日志标记。

## 记录不修

- `useBackgroundMedia.ts:7,18-30,57`：`loading` 返回值无任何消费方（唯一调用方 `BackgroundLayer.tsx:48` 只解构 `{ url }`），且 `state.loading` 与 `loadedKey !== key` 两套判据冗余（`state.loading` 的每次取值都被 `loadedKey !== key` 覆盖）。删除 `loading` 可一并去掉 `loadedKey` state 与三处 `setLoadedKey`；属死 API，无行为影响。
- `backgroundVideoStage.ts:45-50,314-319`：模块级 `config` 保存了 `key`/`url`，但全文件只读 `config.muted`/`config.volume`（`:107-108`），`key` 由 `currentKey` 单独维护、`url` 只从入参 `next.url` 读（`:323-325`）。这两个字段是只写不读的模块状态，可收窄为 `{ muted, volume }`。
- `BackgroundLayer.tsx:59-63`：`url` 非空只可能来自 `resolveBackgroundUrl` 的 `assetPath` 分支或 `assetId` 命中分支，两者都保证 `backgroundSourceKey(config)` 非空，故 `if (!stageKey)` 回退分支当前不可达（防 TS 判空的死兜底），可直接内联。
- `BackgroundSettingsDialog.tsx:44-47`：`DraftState extends BackgroundDraft` 又重复声明 `revoke?: () => void`（`BackgroundDraft` 已有同类型字段，`backgroundAssets.ts:30`），冗余声明，删掉不影响类型。
- `BackgroundSettingsDialog.tsx:743-748`：复位按钮 `disabled={busy !== 'idle'}` 已由 React 在 applying 起点的同一事件末尾落盘，`onClick` 内的 `busyRef.current === 'idle'` 早退不可达（R1 rev3 也记录该守卫无用例）。保留任一处即可；如保留 ref 检查，建议注释说明它防的是渲染未提交的同一 tick 重入，而非 disabled 之外的路径。
- `BackgroundSettingsDialog.css:41-44`：`.adl-bg-settings__volume-row .adl-bg-settings__label { margin: 0; }` 的 `margin` 是重构残留（基础规则 `:21-26` 已无 `margin-bottom`），no-op 声明；`flex-shrink: 0` 仍有效。
- `backgroundAssets.test.ts:14-104`：手写 IndexedDB mock 与 `features/git-visualization/utils/avatarCache.test.ts:14-106` 同形（Store/Transaction/Database/makeRequest 约 70 行近似）。两份 mock 的 store 语义不同（avatarCache 用 keyPath 自增、backgroundAssets 用显式 key + `getAllKeys`），跨文件复用需先抽象参数化 mock；如后续要抽，落点建议 `src/test-fixtures/`（现有 fixtures 目录未含 IDB mock）。
- `backgroundAssets.ts:9-10`：头注释「不再把文件读成 data URL：…」是设计理由的历史陈述，没有对应兼容分支或旧字段（已核对），不违反「未发布阶段禁止兼容代码」；若后续统一措辞可改为「不把文件读成 data URL」，非必须。
- `backgroundAssets.ts:253-255`：`isDesktopShell()` 只是 `isTauriShell()` 的一行包装，但它是弹窗测试 `vi.mock('./backgroundAssets')` 的显式缝（单测在浏览器语义下跑），属有意设计，不建议合并。
- `backgroundAssets.ts:233-251` 的 `resolveBackgroundUrl` 形参是整个 `BackgroundConfig`，实际只读 `assetPath`/`assetId`；`useBackgroundMedia.ts:31` 为此额外拼 `{ mode, fit, assetPath, assetId }`。可收窄为 `Pick<BackgroundConfig, 'assetPath' | 'assetId'>`（与 `backgroundSourceKey` 入参一致），属可选收敛，与行为无关。

## 结论

- 需修复项：0（critical 0；high 0；medium 0；low 0）；本轮零问题

需修复项：0
