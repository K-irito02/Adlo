# R1 rev4 定向复核报告 — scope `tabs`（只核 rev3 N4）

- 快照：`.review-diffs/*-rev4.diff`，base `4850ebaf`；本轮不做全量重审
- 实跑：`npx vitest run src/app/components/HScrollbar.test.tsx src/app/hooks/useRevealScrollbar.test.tsx src/app/features/terminal/__tests__/useTerminalPaneLayout.test.ts --reporter=dot` → **3 files / 37 tests passed**（6 + 11 + 20）

## 范围

N4 修复面：`src/test-setup.ts` 全局 PointerEvent polyfill；`HScrollbar.test.tsx` / `useRevealScrollbar.test.tsx` 本地副本删除；`useTerminalPaneLayout.test.ts` 的 throw 守卫；全仓「本地 PointerEvent polyfill」残留扫描；上述三文件实跑。

## 上轮问题关闭情况

- **N4（low，死代码/一致性）→ 已关闭。** 逐项验证：
  - **两处本地副本确已删净**：`HScrollbar.test.tsx`（原 `:6-21`）现从 `import …` 直接进入 `makeController`（现行 `:1-5` 无任何 `if (typeof window.PointerEvent …)`）；`useRevealScrollbar.test.tsx`（原 `:5-20`）现 `:1-3` 为 import、`:5` 直接进入 `mockLayout`。两份 diff 均为纯删除，未留空壳或注释残句。
  - **全局 polyfill 语义覆盖原需求**：`test-setup.ts:78-94` 中 `pointerId = init.pointerId ?? 0`、`pointerType = init.pointerType ?? 'mouse'`，与被删除的两份**逐字段同义**（它们原本只多这两个字段），因此删除不带来能力回退；`if (typeof window.PointerEvent === 'undefined')` 守卫仍保留，将来 jsdom 自带时自动让位。
  - **守卫保留且有效**：`useTerminalPaneLayout.test.ts:13-15` 仍是 `if (typeof window.PointerEvent === 'undefined') throw new Error('test-setup.ts should provide a global PointerEvent polyfill')`（快照哈希 `ad566952f` 与 rev3 一致）；该文件实跑 20 passed，说明 setup 先于测试模块执行这一前提成立。
  - **无其它「本地全局 polyfill」残留**：`grep Object\.defineProperty\(window, 'PointerEvent'|PointerEventPolyfill|window\.PointerEvent` 仅剩 `test-setup.ts:78/79/89`（全局，应保留）、`useTerminalPaneLayout.test.ts:13`（throw 守卫，非 polyfill）、`ModuleTreeCard.test.tsx:67`（`beforeAll` 内**有意**覆盖为带 `isPrimary` 与 `setPointerCapture/hasPointerCapture/releasePointerCapture` 行为的 mock，并在 `afterAll:98-103` 清理；属能力专用 mock，不是 N4 类残留）。
  - 实跑三文件 37 passed（删副本后无断言变化，与该两文件不读 `pointerType` 的静态结论一致）。

## 新增发现

无。定向复核通过，未发现需修复项。

## 记录不修（可选，供 P5/P6 顺手清理，不计入需修复）

- `adlo/frontend/src/components/charts/brush/chart-brush.test.tsx:145-157`：用例内仍有 `class TestPointerEvent extends MouseEvent`（注释「jsdom lacks PointerEvent」）。它**不安装到 window**、只在自身 dispatch 时构造事件（`:189-197`），所以既不是死代码也不与全局 polyfill 冲突；全局 polyfill 后可直接改用 `new PointerEvent(...)` 并删掉该类，属可选清理（该文件不在 N4 范围，本轮未改动）。
- rev1–rev3 的其余「记录不修」项（z-index 裸值、grab 光标覆盖、Pinned 分隔条落点空洞、滚轮不重新命中测试、`isDragging`/`index` 未消费、插入线渐变重复、多指针 session 覆盖、codebase-map P5）本轮未触碰，结论沿用。

## 结论

- 需修复项：0（定向复核通过）
