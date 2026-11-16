# R2 rev6 定向复核报告 — scope `tabs`（只核 rev5 R2 的 F1–F3）

- 快照：`.review-diffs/*-rev6.diff`（base `4850ebaf`）；本轮只做定向复核，不重新全量审查
- 实跑（3 个单文件 / 20 tests 全绿）：
  - `src/app/features/browser/__tests__/BrowserOpenTabFlatList.test.tsx` → 5 passed
  - `src/app/features/browser/useOpenTabReorder.test.ts` → 9 passed
  - `src/app/features/browser-tree/__tests__/useBrowserTreeDnd.test.tsx` → 6 passed（共享插入线的树侧消费方）

## 范围

`useOpenTabReorder.ts`、`BrowserOpenTabFlatList.tsx`、`BrowserOpenTabFlatListItem.tsx`、`dragGhost.ts`、其测试、`browser-tree-dnd.css` / `browser-flat-list.css` / `rightpanel.css`、`BrowserTreeDndOverlay.tsx`（共享插入线的两处消费点）。

## 上轮问题关闭情况

- **F1（low，死代码）→ 已关闭。**
  - `isDragging` 全链删除：`OpenTabReorderResult` 现无该字段（`useOpenTabReorder.ts:13-17`）、无 `useState`、`cleanup` 不再 `setIsDragging`、返回对象只含 `visibleTabs`/`overIndex`/`handlers`（`:232-238`）；`grep isDragging` 在 `features/browser` 零命中。
  - `index` 形参全链删除：接口 `onPointerDown: (event, tabId)`（`:9-11`）、实现 `:134`、Item 的 prop 类型 `BrowserOpenTabFlatListItem.tsx:22` 与调用点 `:46` 均只剩 `(event, tabId)`；`index` prop 本身保留（`:15/27/44` 仍驱动 `data-tab-index`），未误删。
  - `DragGhostHandle.element` 删除（`dragGhost.ts:5-8` 只剩 `move`/`remove`）；`element` 局部变量仍被 `move`/`remove` 闭包使用（`:40-45`），无悬空引用。
  - 两个 interface 去掉 `export`（`:9/13`），全仓已无导入方（grep `OpenTabReorderHandlers|OpenTabReorderResult` 仅本文件自用）。
- **F2（low，冗余防御）→ 已关闭。**
  - React 层已删净：`<ul>` 不再有 `onClickCapture`（`BrowserOpenTabFlatList.tsx:107`），`handlers` 只剩 `onPointerDown`（`:124` + hook `:9-11/236`），`handleClickCapture` 与 `MouseEvent as ReactMouseEvent` 导入均不存在（`:1-2` 只剩 `PointerEvent` 类型）。
  - 抑制只剩 document 捕获层：`document.addEventListener('click'|'auxclick', blockClick, true)`（`:220-221`），`blockClick` 在 `suppressClickRef` 为真时 `preventDefault + stopPropagation`（`:208-214`），`suppressClickRef` 由 `handleUp` 置真（`:192`）。
  - **删除性推演仍成立**：删掉 `:220` 这条 document click 监听后，用例 `BrowserOpenTabFlatList.test.tsx:250` 的 `fireEvent.click(label)` 会沿冒泡命中标题按钮 `onClick` → `onSelectTab` 被调用 → `:251` 的 `not.toHaveBeenCalled()` 变红。`handleUp` 里对 `pointerup` 的 `preventDefault()` 不会抑制后续 click（只有取消 `pointerdown` 才可能抑制兼容事件），且该用例派发的是新 click 事件，推演不受影响。实跑 5 passed，抑制仍有效。
- **F3（low，重复）→ 已关闭。**
  - 共享视觉只保留一份：`.adl-dnd-insert-line`（`browser-tree-dnd.css:71-83`）承载 `height: 2px`、`border-radius: 999px`、12%–88% 渐变与 `box-shadow: 0 0 8px var(--adl-dnd-glow)`；树侧 `.adl-browser-dnd-insert-line` 只剩 `z-index: 10000`（`85-88`，`position: absolute` 由 `65-69` 提供），标签侧 `.adl-browser-tab-drop-line-overlay` 只剩 `position: fixed` + `z-index: 10000` + `pointer-events: none`（`browser-flat-list.css:84-88`）。
  - 两处插入线都真的挂上共享类：树 `BrowserTreeDndOverlay.tsx:27`（`adl-browser-dnd-insert-line adl-dnd-insert-line`）、标签 `BrowserOpenTabFlatList.tsx:135`（`adl-browser-tab-drop-line-overlay adl-dnd-insert-line`）。共享类所在文件由 `rightpanel.css:19` 全局导入，portal 到 body 的标签插入线同样命中（无父选择器限定，`0,1,0` 与两个定位类无属性冲突）。
  - 重复渐变已清除：`grep "linear-gradient(" + "0 0 8px"` 在 rightpanel 目录仅剩共享类一处（其余渐变属行 hover 遮罩等无关规则）。
  - ghost 内联重复已清除：`dragGhost.ts:29-33` 只留 `margin: 0` 与实例几何 `width/height/left/top`；`position: fixed` / `z-index: 9999` / `pointer-events: none` 由 `.adl-browser-dnd-lift`（`browser-tree-dnd.css:99-110`）唯一提供。
  - 无回归：树侧插入线用例（属于 `useBrowserTreeDnd.test.tsx` 的 portal/withElementFromPoint 断言）实跑通过；标签插入线几何用例（`left/width`）实跑通过。

复核中未发现新问题；`grep` 确认 tabs scope 已无 `isDragging` / `onClickCapture` / 未导出 interface 的残留引用。

## 记录不修（沿用，不影响闭环）

- `browser-tree-dnd.css:1` 文件头仍写「书签树拖拽…」，而同文件已承载 `--adl-dnd-*` 变量与标签页共用的 `.adl-dnd-insert-line`（rev5 已记，归 P5 文档）。
- 树 hook 的 `isDragging` / `onClickCapture` 双写属 core scope，未在本次复核范围。
- `OpenTabReorderHandlers` 现只有 1 个字段的 `handlers` 分组与 `dragGhost` 的 `margin: 0` 内联保留（CSS 未声明 margin；分组与树侧对称），非死代码。

## 结论

- 需修复项：0（定向复核通过）
