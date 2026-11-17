# 事项1「变更面板大文件卡顿」rev7 定向复核报告（R1）

## 范围与方式

- 快照：`.review-diffs/manifest-rev7.md`（base `afd628c1`，1 commit / 84 files）；只读 rev7 diff 快照 + 当前源码（只读 `read`/`grep`），未执行 git、未改源码、未跑测试。
- 复核对象：rev5 遗留的 1 项（low，`heavyDegradation.test.ts` 注释仍写「共用同一谓词」）及事项 1 相关文件是否引入新问题。
- 相关文件：`features/diff-viewer/heavyDegradation.test.ts`、`InlineDiffViewer.tsx`、`SideBySideDiffViewer.tsx`、`features/editor/{cmLanguages.ts,CodeEditor.tsx,useFoldMarkerAutoHide.ts}`、`right-panel/{heavyPreviewLimits.ts,diffCost.ts,diffCost.test.ts,heavyPreviewLimits.test.ts}`、`panels/DiffEditorSection.tsx`、`ChangesPanel/useChangesFilters.ts`。

## rev7 快照核对：本轮未再改事项1相关文件

- rev5→rev6：`heavyDegradation.test.ts` 快照 4840 → 4834 字节，仅注释修正；其余事项1文件字节未变。
- rev6→rev7：上述全部文件 rev6/rev7 diff 字节数一致（`heavyDegradation.test.ts` 4834/4834，`InlineDiffViewer.tsx` 3321/3321，`SideBySideDiffViewer.tsx` 7983/7983，`DiffEditorSection.tsx` 12780/12780，`heavyPreviewLimits.ts` 3626/3626，`cmLanguages.ts` 1682/1682，`CodeEditor.tsx` 1457/1457，`useFoldMarkerAutoHide.ts` 1187/1187），rev7 未触碰这些文件。
- 因此本轮只需确认 rev6 的注释修正在 rev7 保留，且断言仍与实现一致。

## 遗留项关闭确认

### F1（rev5，low）「共用同一谓词」注释失真 → **已关闭**

- 位置：`adlo/frontend/src/app/features/diff-viewer/heavyDegradation.test.ts:72`。
- rev7 现文：`// 面板与侧栏同源判定；三元档语义由 diffCost.test.ts 的 shouldSkipChangeOutline 用例锁定。`
- 事实核对：`差分`两侧确为同源——面板 `DiffEditorSection.tsx:103-110` 用 `classifyDiffTier(profileDiffCost(baseContent, currentContent))`；侧栏 `useChangesFilters.ts:100` → `shouldSkipChangeOutline` → `diffTierForPreview` → `classifyDiffTier(profileDiffCost(...))`（`heavyPreviewLimits.ts:66-76`）。共用的是档位判定而非单一谓词，新表述准确。
- 残留检查：`grep 同一谓词`（`adlo/frontend/src`）零命中；相关文件中只剩该行「同源」注释。
- 断言仍锁定侧栏入口：`:73` 为 `expect(filtersSource).toMatch(/shouldSkipChangeOutline\(/);`，与 `useChangesFilters.ts:100` 的调用一致 → **关闭**。

## 新问题检查（只看事项1相关文件）

未发现新问题。逐条复核 rev7 断言与实现对应关系：

- `:26/27/28/29` ↔ `InlineDiffViewer.tsx:166/167/169`、`:62`（`classifyDiffTier`）；`:33` ↔ `:72`（`isHeavy ? [] : getLanguageExtensionSync`）。
- `:37/38/39` ↔ `SideBySideDiffViewer.tsx:201/200/64`；`:43` ↔ `:275`（`!editorViewB || isHeavy || isDegraded`）。
- `:54/55/59/60` ↔ `DiffEditorSection.tsx:498/378/401/434`（`fileKey`、`heavyPreviewHintDiff`、`getHeavyPreviewPanes`、`language="plaintext"`）。
- `:64` `costTier` / `:73` `shouldSkipChangeOutline(` 命中实现；`:86` 的 `costTier === 'heavy'` 实测 3 处（`:120/:127/:358`），`:87-89` 命中 `:358/:364/:398-399`。
- `:78-82` ↔ 两 viewer `useFoldMarkerAutoHide(..., isHeavy || isDegraded || !languageSupportsFolding(language))`（`Inline:83`、`Side:84`）；`:102` ↔ `CodeEditor.tsx:95-100`（`!languageSupportsFolding(language)`）。
- `languageSupportsFolding` 用 `Object.hasOwn(languageLoaders, ...)`（`cmLanguages.ts:82`），`tsconfig` target/lib 为 ES2022 且仓内已有 `Object.hasOwn` 先例；`cmLanguages.test.ts:20-31` 覆盖 `constructor/__proto__/toString`，并顺带修掉 `getLanguageExtensionSync` 沿原型链取值的旧缺陷，无回归迹象。
- 档位语义一致：`classifyDiffTier` 仅用字符数/行数（256 KiB / 3000 行 / 10 000 行，`heavyPreviewLimits.ts:49-63`），`diffCost.test.ts:43-47` 锁住「1500 行普通代码 diff 不降级」；`shouldSkipChangeOutline` 仅 heavy 跳过（`diffCost.test.ts:29-35`）。

## 记录不修（沿用）

- `:86` 的 `toHaveLength(3)` 为脆性计数，当前实现恰好 3 处，断言通过（rev4/rev5 已记录）。
- `:64` 只断言 `toContain('costTier')` 偏宽，但同文件 `:86-89` 已锁具体形态。
- `LIGHT_MAX_CHARS` 仅上侧边界有测试；`expandedLinesHasOverlap` 无边角用例（沿用 rev5）。
- `SideBySideDiffViewer` 的滚动同步已抽到 `scrollSync.ts`（`createScrollSync`），属 scroll-sync 事项范围，不在本事项判定。

## 结论

- rev5 唯一遗留项（注释「共用同一谓词」）在 rev7 已修正为「面板与侧栏同源判定」，表述与实现一致 → 关闭。
- 事项 1 相关文件 rev7 相对 rev6 未改动，抽查无新增失真/接线问题。
- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）。

需修复项：0
