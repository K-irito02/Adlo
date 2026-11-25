## 范围

rev3 快照（base `be34f973`，`.review-diffs/manifest-rev3.md`）。按派发提示只审这 11 个文件：

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

只读源码，未改源码、未跑测试 / 门禁 / dev server（测试有效性用删除性推演）。比对 rev2 与 rev3 快照字节数：本轮只改了 `BackgroundSettingsDialog.tsx` / `.test.tsx`、`backgroundAssets.test.ts`、`backgroundVideoStage.test.ts` 四个文件，其余 7 个与 rev2 逐字节一致，因此回归面只按这四处核。为核对排空通道读了 `src-tauri/src/file_drop.rs`、`commands/background_asset.rs`（上下文，不产出 finding），为核对 fake timers 是否作用于 `window.setTimeout` 读了既有 `usePersistedScrollTop.test.tsx`（结论见下）。文档漂移不在本报告范围（P5）。

## 上轮问题关闭情况

1. **F1（medium，预览「复位」在 applying 期间可改写 adjust）— 已关闭。**
   - `BackgroundSettingsDialog.tsx:740-753`：复位按钮 `disabled={busy !== 'idle'}`（`:748`）且 `onClick` 内 `busyRef.current === 'idle'` 早退（`:743-747`），与滑杆/音量一致。
   - `:511-518` 构造 `base` 用 `adjust: adjustRef.current`，浏览器分支在 `await putBackgroundBlob`（`:532`）之后 `:539` 再 `{ ...base, adjust: adjustRef.current, assetId }` 落库；桌面分支无 await，读点即落点。
   - 该 ref 不是纯装饰：`handlePreviewPointerMove`（`:445-461`）没有 busy 守卫，键盘激活「应用」后继续拖动仍会改 adjust，重读正是兜住这条路径。`useEffect` 同步 `adjustRef`（`:160-162`）在正常「先滚轮/拖动、再点应用」事件序列里由 React 在下一个事件前 flush，不构成新竞态。

2. **F2（low，排空时机与去重键）— 已关闭。**
   - 排空已移入种子 effect：`:173-179`（`seededOpenRef` 守卫内）`void invokeIpc('browser_take_pending_drop')` + `lastNativeDropRef.current = { key: '', at: 0 }`；`handleNativeDrop`/`fit` 不再参与该副作用。
   - 拖放 effect `:306-350` 只剩注册处理器、`adl:file-drop` 订阅与 `/300ms` 轮询，已移除排空；注释 `:304-305` 不再声称排空。
   - 打开期间 `browserBgConfig` 变化（镜像音量写回）会重跑种子 effect，但 `:170-172` 在排空之前早退，不会二次排空（与注释「打开时排空一次」一致）。
   - 关闭 effect `:217` 复位 `seededOpenRef`，再次打开会重新排空并清去重键。

3. **F3（low，测试文案与覆盖缺口）— 已关闭（逐项）。**
   - `backgroundVideoStage.test.ts:44` 改为「尺寸未就绪时返回全零（drawSurface 在 readyState/canvas 未就绪时自行跳过绘制）」，与 `backgroundVideoStage.ts:184` 的 `!video || readyState < 2 || !canvas.isConnected` 逐句相符，不再声称全零矩形被消费。
   - `BackgroundSettingsDialog.test.tsx:257-282`：先 `fireEvent.wheel('.adl-bg-settings__preview')`（`:271`，缩放 1.5→≈2.02，非种子值），再 ArrowUp 调音量，断言 `canvasProbe.adjust.scale > 1.5`（`:279`）。删除性推演：若音量路径重新 `setAdjust(normalizeAdjust(config.adjust))`，画布会回落到 1.5，`:279` 变红——真正锁住了「缩放不被重置」。
   - `BackgroundSettingsDialog.test.tsx:284-294` 新增延迟 prune 用例（fake timers → 4000ms → `pruneBackgroundBlobs(['background-image-keep'])`）；`backgroundAssets.test.ts:170-178` 新增手写 IndexedDB mock 下的「保留 keep / 删除 stale」用例，删掉 `pruneBackgroundBlobs` 的 delete 循环即红。
   - `backgroundAssets.test.ts:158-168` 新增 `putBackgroundBlob` 双次调用键不同 + `readBackgroundBlob` 回读同一 Blob；把 `putBackgroundBlob` 改回常量键 `:164` 即红（补上了 rev2 指出的空断言）。
   - fake timers 有效性：`schedulePrune` 用 `window.setTimeout`，本轮未实跑；以既有 `usePersistedScrollTop.test.tsx:56-66`（fake timers + `window.setTimeout` 落盘断言，属常规门禁）为据，判定该环境下 `window.setTimeout` 受 fake timers 接管，用例可触发。

4. **F4（low，图片 accept 过宽）— 已关闭。**
   - `:694-698` 恢复显式列表 `image/jpeg,image/png,image/gif,image/webp`，与 `backgroundAssets.ts:24` 的 `IMAGE_EXTENSIONS`（jpg/jpeg/png/gif/webp）对齐；视频分支仍是显式 mp4/webm，同一控件两半一致。

## 新增发现

无新增需修复项。rev3 的四处改动（复位守卫 + await 后重读、排空搬入种子 effect、测试补强、accept 收敛）未引入可见竞态或契约错误：

- 排空与监听/轮询的先后顺序未变（种子 effect 声明在拖放 effect 之前，仍在注册前发出排空 IPC），`invokeIpc` 自身不 reject（`tauri-shared.ts:6-26` 全 catch 返回 `{ok:false}`），fire-and-forget 无未处理拒绝。
- applying 期间其它可写入口（模式/填充/重置/更换/移除/音量/静音/关闭/ESC/背景点击）仍全部 `disabled` 或 `busyRef` 守卫，逐个复核未发现新的越权写。
- 新增 mock 未泄漏到文件外：`vi.stubGlobal('indexedDB', …)` 由 `afterEach` 的 `vi.unstubAllGlobals()` 回收；`MockTransaction` 的 `oncomplete` 微任务在赋值后触发，`pruneBackgroundBlobs` 的 delete 事务能 resolve。
- 测试标题与断言一致（含新 prune 用例：`:293` 直接断言保留键参数）；未见新增死代码（`FILL_OPTIONS`、`adjustRef`、`lastNativeDropRef`、`previewStyle` 均有读取点）。

## 记录不修

- F1 的守卫仍无用例：删掉 `:748` 的 `disabled` 与 `:743-747` 的 busyRef 早退，全量套件仍绿；建议在既有「应用时按钮显示圆圈加载」用例（`:161-187`，`putBackgroundBlob` 挂起期间）顺手断言复位按钮 `disabled`，成本极低。
- `adjustRef` 由 `useEffect` 同步：极端情况下 IDB 写入落定早于该次 pointermove 的 passive effect flush，重读会晚一帧（相差一次微小拖动）；行为影响可忽略，且 rev2 的要求已满足，不作为问题。
- `:68` 注释「三种填充模式共用同一套自由调整」对视频不精确（`:861` 视频只给 cover/contain，`acceptFile`/`importPath`/模式按钮与读侧归一都会把 video+repeat 改成 cover）；rev1 起既有措辞。
- 新 prune 用例以 `open={false}` 初始挂载代替「打开后关闭」的迁移，且未覆盖「定时器触发时（而非排定时）读配置」——若把 `schedulePrune` 改成排定时快照 config，该用例仍会绿；不过落地页本来就常驻挂载为 open=false（`BrowserLandingPage.tsx:496-500`），该分支即真实关闭分支。属测试强度可选增强。
- `BackgroundSettingsDialog.css:154-165`（`.adl-bg-settings__busy` 用 `--bg-overlay` + `--text-primary`）与 `:148-153`（`preview-reset:focus-visible` 去 outline）仍无亮/暗 `getComputedStyle` 证据；rev3 的 CSS 与 rev2 逐字节一致，仍请主代理在 R2 前用 `ui-probe.mjs` 采证。
- `backgroundAssets.test.ts:54-64` 用 `Object.defineProperty(URL, 'createObjectURL'/'revokeObjectURL')` 且不还原（`vi.restoreAllMocks()` 不恢复 defineProperty）；rev2 起既有，当前文件内无后续用例依赖真实实现，建议改 `vi.spyOn(URL, …)` + restore。
- 原生拖放 1.5s 去重、`applyVideoStageConfig` 同 key 不换源仍无用例（桌面路径被 `isDesktopShell=false` 短路）；rev3 未新增也未回退该缺口。
- 上传区 📁 emoji、模式组 `aria-label={t.browserBgSettings}` 与弹窗标题同名（rev2 记录，均 rev1 起既有）。

## 结论

- 需修复项：0（critical 0；high 0；medium 0；low 0）；本轮零问题

需修复项：0
