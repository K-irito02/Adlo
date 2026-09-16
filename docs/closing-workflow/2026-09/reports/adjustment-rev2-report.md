# 剪贴板历史面板 21 项调整 + 期间缺陷修复 — rev2 复审报告（Agent 2 / round 2）

> 自包含报告。审阅对象：`.review-diffs/changed-files-rev2.txt` 所列 43 份文件的 **rev2 全量 diff**（非增量，逐份完整重读）。
> 审阅时间：2026-09-17。方式：Read 全部 rev2 diff + Read 仓库实际源码交叉验证（源码只读，未做任何修改）+ 只读门禁实测。
> 唯一写入：本报告。

---

## 0. 证据基线（可复现）

| 检查 | 命令 | 结果 |
|------|------|------|
| 前端受影响测试 | `pnpm exec vitest run`（clipboard-history + utils + CopyButton + i18n + overlayManager + httpBridge） | **16 files / 150 tests passed** |
| 类型 | `pnpm exec tsc --noEmit` | 无输出（0 错误） |
| 格式（CI 门禁） | `pnpm exec prettier --check <21 组变更文件>` | `All matched files use Prettier code style!` |
| Rust lint | `cargo clippy -p adl-server --lib -- -D warnings` | 干净 |
| Rust 测试 | `cargo test -p adl-server --lib clipboard` | **8 passed; 0 failed**（含新增 `image_serves_stored_original_and_404s_unknown`、`asset_routes_reject_traversal_and_degenerate_names`） |

注：终端未执行任何 git 命令（按任务约束）。

---

## 1. 上轮（round 1）发现与处理 — 逐项核实

### 1.1 F3/F4【已修？→ 部分通过，剩余 1 个 medium】清空确认框焦点管理

**核实结论：主体实现正确，但存在一个可复现的焦点逃逸缺陷（新 M-01），以及两个 low 级边角。**

实现位置：`ClipboardHistoryHeader.tsx:160-196`（焦点陷阱 effect）+ `:154-158`（`closeConfirm` 守卫）。

已确认正确的部分：
- 打开聚焦确认按钮：`:165` `confirmBtnRef.current?.focus()`（portal 提交后执行，正确）。
- 面板内 Tab 循环：`:172-189` 查询 `button:not([disabled])`，计算 `nextIndex`（Shift 反向、越界回绕）并 `preventDefault`，逻辑本身正确；disabled 按钮被 `:not([disabled])` 正确跳过。
- Escape 经 `closeConfirm()` 受 `clearing` 守卫：`:167-170` + `:154-158` 正确（测试 `keeps the confirmation dialog open while clearing is in flight` 已锁定）。
- 遮罩点击经 `closeConfirm()`：`:326` 正确。

**M-01（medium / Accessibility-Correctness）— clearing 态切换导致 effect 重跑，焦点在清空过程中被甩到模态框之外**

- 位置：`ClipboardHistoryHeader.tsx:154-158`（`closeConfirm` 的 deps 含 `clearing`）与 `:196`（陷阱 effect 的 deps 含 `closeConfirm`）。
- 机理：点击「确定」→ `handleClear` 先 `setClearing(true)`（`:199`）。`clearing` 变化使 `closeConfirm` 引用变化，进而使陷阱 effect **整个 teardown + setup**：
  1. commit 阶段确认/取消按钮变为 `disabled`，被聚焦的确认按钮失焦（浏览器把焦点交给 `body`）；
  2. effect cleanup（`:192-195`）执行 `trigger?.focus()`（`:194`），把焦点还给了 **模态框背后** 的清空按钮（此时 `visibleItems.length > 0`，按钮仍可聚焦）；
  3. effect 重跑（`:165`）`confirmBtnRef.current?.focus()` 因按钮已 disabled 而 **no-op**。
- 结果：整个清空执行期间，`aria-modal="true"` 的对话框外（背景工具栏）持有焦点，与模态契约相违；`Tab` 需用户手动按下才把焦点拉回面板（`:172-188`，此时 `focusables=[✕]`）。
- 影响面：F2 已声明收窄清空为 **≤200 次串行 await**，该窗口可能持续数百毫秒到数秒（HTTP 往返 × N），非瞬时。
- 建议修复（二选一）：
  - 用 ref 承载守卫，令陷阱 effect 仅依赖 `confirmOpen`：
    `const clearingRef = useRef(false); clearingRef.current = clearing;`
    `const closeConfirm = useCallback(() => { if (!clearingRef.current) setConfirmOpen(false); }, []);`
  - 或拆分 effect：焦点陷阱/还原只依赖 `[confirmOpen]`，`clearing` 守卫单独走 `clearingRef`。

**L-01（low / Accessibility）— 关闭后焦点归还在触发按钮已 disabled 时失败**
- 位置：`:194`（`trigger?.focus()`）与 `:233`（`disabled={visibleItems.length === 0}`）。
- 清空全部 / 清空全部可见项后 `visibleItems` 变为 0，清空按钮被禁用，`focus()` 落到 disabled 元素上无效 → 焦点丢失到 `body`。这是「关闭还原焦点到触发按钮」契约在**主路径**上的空洞。
- 建议：还原失败时回退到稳定目标（如搜索切换按钮），或对清空按钮采用 `aria-disabled` + 逻辑拦截而非原生 `disabled`。

**L-02（low / 一致性）— 对话框右上角 `✕` 未随 `clearing` 禁用**
- 位置：`:337-344`（`✕` 无 `disabled`）对比 `:350-367`（取消/确定有 `disabled`）。
- clearing 期间点击 `✕` 无任何效果（被 `closeConfirm` 守卫拦截），但外观仍可用，形成「可点但无效」的误导；同时它是 clearing 期间唯一的可聚焦元素（Tab 只能停在它上面做无效操作）。
- 建议：`✕` 与取消按钮一致加 `disabled={clearing}`（注意：若加 disabled，则 `:176-178` 的 `focusables.length === 0` 分支会真正生效，需把该分支改为 `preventDefault()` 保留在面板内）。

**L-17（low / 测试缺口，与 M-01 同源）**：Header 测试覆盖了「clearing 期间 Escape 不关闭 / 按钮禁用 / 菜单焦点模型」，但**没有**断言「打开时聚焦确认按钮」与「关闭后焦点归还触发按钮」这两条 F3/F4 的兑现点，也没有覆盖 `clearing` 切换时的焦点归属，因此 M-01/L-01 无法被现有测试发现。
- 建议：补两条断言（打开后 `document.activeElement === 确认`；关闭后 `document.activeElement === 清空按钮`），并补一条「clearing 期间焦点仍在 dialog 内」的断言。

### 1.2 F1【不修】计数基于 `list(200)`，`clearAllClipboard()` 清窗口外条目
- **确认维持不修**。已核对同源性：`clearLabel/clearConfirmMessage`（`:85-88`）与 `handleClear` 的动作分支（`:201-207`）都由同一个 `clearScope`（`:59-83`）派生，文案与动作严格同源；未收窄 → 后端全清 + 文案「清空全部」，收窄 → 逐条删除可见项 + 文案「筛选/搜索…」。点击意图与文案一致。
- 改进空间（建议记为独立需求，不阻塞）：若要让计数与清空范围在 >200 条时也绝对一致，可让后端 `/clipboard/list` 额外返回 total，或对计数在达到窗口上限时显示 `200+`；否则存在「显示 200、实际删除 N>200」的观感差。

### 1.3 F2【不修】收窄清空 ≤200 条串行 await + 每次 store 更新触发全列表重渲染
- **确认维持不修**（低影响、2s 轮询终态正确）。改进空间：新增按 id 集合的批量删除接口可把 N 次往返降为 1 次；属于独立需求。
- 但请注意：F2 的「非瞬时」特性正是 M-01 焦点逃逸窗口被放大的原因（见 1.1）。

### 1.4 M3b【不修·已声明】纯空白查询在文件面板 replace 变为无操作
- **确认维持不修**。已核对实际代码：`useSearchPanel.ts:49-55` 中 `filteredResults` 在 `!searchQuery.trim()` 时直接返回全部（该短路本来就在，与 rev1 声明一致）；仅 `handleReplace`（`:62-67`）因 `buildSearchPattern`（`searchPattern.ts:26-28`）把空白 query 视为空而变成 no-op。语义统一为「空白 = 空查询」是本次共享收敛的既定目标，改动合理。

### 1.5 M2/F4b【不修】行 `role="button"` 内嵌子按钮
- **确认维持不修**（用户明确要求整行点击放大查看）。已核对：行 `onClick`（`ClipboardItemRow.tsx:69`）与行 `onKeyDown`（`:41-49`，`e.target !== e.currentTarget` 守卫）配合子按钮的 `stopPropagation`（`:33-34`、`:110-113`）与 CopyButton 内部 `stopPropagation`（`CopyButton.tsx:61`）无重复触发。
- 诚实备注：`CopyButton` 是 `<span role="button" tabIndex={0}>`（`CopyButton.tsx:111-123`）嵌在 `role="button"` 的行内，属无效 ARIA 嵌套；200 行 × 4 个 tab stop 的键盘负担也偏重。已在 round 1 由用户裁定接受，此处仅留痕（L-15）。

---

## 2. 新发现问题清单（按严重度）

**结论先行：0 critical / 0 high / 1 medium / 16 low。**

### M-01（medium）clearing 态切换使确认框 effect 重跑，焦点在清空期间逃出模态框
见 1.1，位置 `ClipboardHistoryHeader.tsx:154-158,160-196`。

### L-01（low）焦点还原在触发按钮 disabled 时失败
`ClipboardHistoryHeader.tsx:194,233`。见 1.1。

### L-02（low）对话框 `✕` 未随 clearing 禁用
`ClipboardHistoryHeader.tsx:337-344` vs `:350-367`。见 1.1。

### L-03（low / 潜伏）`focusables.length === 0` 分支会放行原生 Tab 逃逸
`ClipboardHistoryHeader.tsx:176-178`。当前因 `✕` 永不禁用而不可达；一旦按 L-02 修复即变为可达缺陷（需改为 `event.preventDefault()`）。属「修复 L-02 时必须同步处理」的联动项。

### L-04（low / Accessibility）筛选菜单 Tab 关闭时未接管焦点，焦点可能落到 body
`ClipboardHistoryHeader.tsx:126-129`。菜单项卸载后，被聚焦的菜单项消失，浏览器默认 Tab 从 `body` 起算，落点不保证是筛选按钮的下一个元素。建议 `preventDefault()` 并显式 `filterBtnRef.current?.focus()` 后再放行（或直接 `closeFilterMenu(true)` 后 `preventDefault`）。

### L-05（low / 健壮性）筛选菜单键盘导航使用打开瞬间捕获的 `items` 快照
`ClipboardHistoryHeader.tsx:109-113,130-144`。2s 轮询可能改变 `kindCounts` 并让菜单重渲染，此时旧 `items` 中的节点可能已脱离 DOM，方向键会 no-op（直到重新打开）。低概率（菜单通常短暂开启），但属真实窗口。

### L-06（low / Standards-i18n 无硬编码）筛选按钮 `aria-label` 内硬编码 `': '` 分隔符
`ClipboardHistoryHeader.tsx:268`：`` aria-label={`${t.clipboardFilter}: ${activeFilterLabel}`} ``。项目规则要求 aria-label 亦须走 i18n。建议改为 `formatT(t, 'clipboardFilterWithValue', { filter, value })`（或在 zh/en 各加一条含占位符的 key）。

### L-07（low / 可读性 nit）`formatT(t, 'searchOptions')` 无变量却走 formatT
`ClipboardHistoryList.tsx:122`。可直接用 `t.searchOptions`（`t` 已具备该 key），无功能影响。

### L-08（low / 设计，F1 关联）计数窗口与清空范围在 >200 条时的观感差
见 1.2，改进建议已列。

### L-09（low / 性能，F2 关联）逐条删除的 N 次往返 + 每次 store 更新全列表重渲染
见 1.3。

### L-10（low / 性能，既有共享实现）`ClipboardItemRow` 的 `memo` 因每次轮询产生新 item 对象而基本不命中；`CustomScrollArea` 的测量 effect 依赖 `children`（每渲染新引用）→ 每渲染同步测量一次；`kindCounts`/`clipboardHistory` 每 2s 换新数组使失效回退 effect（`:91-95`）每 2s 空跑一次（无 state 变更，仅开销）。均为既有实现或共享组件，改动风险 > 收益，记录为独立清理项。

### L-11（low / 健壮性）查看器持有条目快照，条目被轮询/清空删除后仍展示陈旧内容
`ClipboardHistoryList.tsx:41-49,182` + `ClipboardItemViewer.tsx`。因遮罩挡住列表，无法在打开期间切换条目，影响面小；可在 `item` 从 `clipboardHistory` 消失时自动关闭。

### L-12（low / 健壮性）查看器 `imageStage` 初始值只在挂载时求值，`item` 变更不重置
`ClipboardItemViewer.tsx:28-30`。当前不可达（无条目切换路径），仅提示未来复用需注意（建议以 `key={item.id}` 或 effect 重置）。

### L-13（low / 死样式，已在进度文档备案未清）`justify-self:end`、`__preview max-width:100%`、`--bg-overlay` 死 fallback
`leftbar-clipboard.css:274,224,296`。零风险清理项，本轮未做，与进度文档 rev4 记录一致。

### L-14（low / token 化不彻底）裸字号 `10px` / `11px`
`leftbar-clipboard.css:26,241,269`。颜色已全部 token 化；字号仍有裸值（`--text-xs` 等可用）。全库同类用法普遍，非本次引入。

### L-15（low / ARIA，round1 已裁定接受）`role="button"` 嵌套 + 每行 4 个 tab stop
见 1.5。仅留痕。

### L-16（low / Promise 处理，既有）行删除 `void removeClipboardItem(item.id)` 无 catch
`ClipboardItemRow.tsx:34`。store 层（`utilitiesActions.ts:45-52`）在 `ok:false` 时走 `captureError`，但传输层 reject 时该 Promise 会 unhandled。既有代码，改动一行可加 `.catch(() => {})` 或让 store 内部兜底。

### L-18（low / 文档一致性）进度文档与最终代码/快照的陈述不一致
`docs/root-cause-resolution/2026-09/progress-2026-09-16-205905.md`：
- 事项 7（diff 第 50 行）称「改用新 key `clipboardClearFiltered`/`clipboardClearFilteredConfirm`…删除已无引用的 `clipboardClearAll`」——最终代码实际保留 `clipboardClearAll` 并新增 `clipboardClearConfirmAll`，`clipboardClearFilteredConfirm` 已被事项 22 取代。属时间线日志的陈旧行，但会误导读者。
- 事项 1–22 / README「22 项」与本任务 scope「21 项调整」表述不一致。
- rev4–rev6 段落称 `router.rs` / `composer-core.css` / `icons/*`「不在本轮工作区 diff」，而 rev2 快照实际包含这些文件。
- 建议：在归档 doc 顶部加一句「以最终 `changed-files-*` 清单为准」或校正上述行，避免下一轮审阅重复核对。

### L-19（low / Rust，既有取舍）`serve_png` 固定 `image/png`、无缓存头、整文件读入内存
`crates/server/src/handlers/clipboard.rs:130-155`。原图为全分辨率 PNG，单请求全量 buffer；无 `Cache-Control`/`ETag`。进度文档 rev1-P8/P13 已登记为后续架构决策，本轮不阻塞。非请求路径穿越问题（basename 归一化 + 穿越测试已覆盖，实测通过）。

---

## 3. Review dimensions 小结

1. **Design**：清空语义单点化（`buildClipboardClearScope` 同时驱动动作与文案，`:59-83` / `:85-88` / `:201-207`）达成，设计意图清晰；`visibleItems` 由列表单点派生并下传，消除计数/渲染/清空三处漂移（`ClipboardHistoryList.tsx:81-107`）；筛选/搜索/kind 标签抽成 `clipboardFilter.ts` / `clipboardKind.ts` 单点。设计上无明显缺陷。
2. **Correctness**：清空范围与文案**严格同源**（已逐分支核对：未收窄 / 仅搜索 / 仅类型 / 搜索+类型 / 空白 query / 搜索面板关闭保留 query / 正则非法 / 失效类型自动回退），未发现文案与动作分叉或越范围删除。边界与竞态主要为低影响项（L-05/L-10/L-11）；**唯一 medium 为焦点管理（M-01）**。测试真实性良好（150 项通过；Header 的 `visibleItems` 由真实 `filterClipboardItems` 派生，非手搓 fixture；Rust 跨目录/穿越断言经字节级判别，实测有效）。
3. **Security & Performance**：资产路由 basename 归一化 + `%2e%2e%2f`/`..`/`.`/混合穿越全部 404（实测通过）；URL 只取 basename + `encodeURIComponent`；无密钥/凭据落日志。性能问题均为既有形态或已声明（L-09/L-10/L-19），无新增高开销热点。
4. **Standards**：i18n zh/en 双份键齐备且过 parity 测试；无新增硬编码展示文本（仅 L-06 的分隔符与既有 `✕`）；错误经 `captureError` 收敛，`handleClear` 有 try/catch/finally；Promise 均有处理或显式 `void` + 注释。prettier/tsc/eslint/clippy 门禁实测通过。
5. **Optimization & Improvement**：对 F1/F2/M3b/M2/F4b 五项「不修」逐项复核了改进空间（见 1.2–1.5），结论维持不修，但给出了可选独立需求（total 计数、批量删除接口）；另记录 13 条 low 级改进项，其中 L-03 与 L-02 存在联动关系。

---

## 4. 结论

- **是否仍有 critical / high：无。**
- **是否仍有 medium：有 1 项 — M-01**（`clearing` 态切换引起确认框焦点陷阱 effect 重跑，清空过程中焦点逃逸到模态框外；直接关系到 round 1 的 F3/F4 修复质量）。
- **low：16 项**（L-01～L-19，其中 L-17 已并入 1.1 叙述）。
- **上轮修复确认**：
  - F3/F4（清空确认框焦点管理）：**部分通过**——打开聚焦、Tab 循环（含跳过 disabled）、Escape/遮罩守卫、焦点归还的主体实现正确，但存在 M-01（清空期间焦点逃逸）、L-01（触发按钮 disabled 时归还未生效）、L-02（`✕` 未禁用）三个残留点，其中 M-01 为 medium。
  - F1 / F2 / M3b / M2·F4b：**确认维持「不修」**，理由与改进空间已逐项复核，与 rev1 声明一致。
- 其他门禁（测试 150 通过、tsc、prettier、clippy、Rust 8 测试）**实测全绿**，与进度文档声明一致。

**放行判断**：无 critical/high，M-01 为建议在合并前修复的 medium（改动小、局部化、可用 ref 承载守卫一次性消除），其余 low 可作为独立清理项或后续迭代。
