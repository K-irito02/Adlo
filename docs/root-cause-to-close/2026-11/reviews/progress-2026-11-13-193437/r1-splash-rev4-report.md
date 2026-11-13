# R1 定向复核报告 — 开屏改版（rev4）

## 范围

基线 `e16d96659`，快照 `-rev4`。只核 rev3 的 2 项 low 是否闭合 + 修复是否引入新问题；未改源码。

- `adlo/frontend/src/app/components/__tests__/StartupOverlay.css.test.ts`（99 行，rev3→rev4 有改动）
- `adlo/frontend/src/app/components/StartupOverlay.css`（191 行，reduced-motion 清单加 `.adl-splash__sweep--idle`）
- `docs/root-cause-to-close/2026-11/progress-2026-11-13-193437.md`（152 行，rev3 结论段 + 缺口补述）
- 对比 rev3 无变化（blob 哈希一致）：`StartupOverlay.tsx`（`4acd44a2b`）、`__tests__/StartupOverlay.test.tsx`（`5344348c9`）、`tokens.css`（`c20359326`）、`scripts/check-no-cjk-source.mjs`（`80963fbf4`）、`themes.css`（`9144241dd`）

**本轮实跑**：`pnpm --dir adlo/frontend exec vitest run src/app/components/__tests__/StartupOverlay.css.test.ts src/app/components/__tests__/StartupOverlay.test.tsx` → `2 files / 7 tests passed`。
另用 `$env:TEMP` 脚本（`splash-guard-rev4.mjs` / `-rev4b.mjs`）把用例里的 `animatedSelectors` 与两条时长断言原样搬出来，对真实 CSS 与 9 个变异体复算（无仓库写入）。

## rev3 两项 low 闭合情况

| rev3 项 | 结论 |
|---------|------|
| R1 样式锁只对账两份清单（媒体块之后追加第 8 段仍全绿） | **已闭合** |
| R2 进度文档自相矛盾 + 缺口清单不完整 | **已闭合** |

### R1 — 已闭合（`animatedSelectors` 解析可靠性逐项验证）

实测：真实 CSS 上 `animatedSelectors(bare)` 返回
`['.adl-splash__grid', '.adl-splash__grid::before', '.adl-splash__mark', '.adl-splash__sweep', '.adl-splash__sweep--idle', '.adl-splash__rule', '.adl-splash__name']`
——与 `ANIMATED_LAYERS`（test:11-19）**逐项、同序相等**，两条用例同时绿。

按你点出的四类解析风险逐条核对（均为实测，不是推断）：

| 场景 | 期望 | 实测 |
|------|------|------|
| `@keyframes` 内部块（`from`/`to`/`0%`/`68%, 100%`） | 不误取 | 不取：内部块 body 无 `animation:`；把关键帧改名为 `animation-ish` 仍不取 ✓ |
| `@media` 外层块 | 不误取整块 | 不取：body 含花括号 → 正则不匹配外层；内层规则被单独解析（见下行） |
| reduced-motion 内层规则（`animation: none`） | 过滤掉 | 过滤：`!/animation\s*:\s*none/` 命中 ✓ |
| 其它位置的 `animation: none` 规则（非媒体块） | 视为无动画 | 不取 ✓（新增 `.adl-splash__reset{animation:none}` 后派生仍 7 项、用例仍绿） |
| 多行声明（`animation: ...\n    var(--splash-…) infinite;`） | 正确取到 | ✓ `[^{}]*` 含换行；时长断言 `[^;]*` 也含换行 |
| 伪元素选择器 `.adl-splash__grid::before` | 正常取到 | ✓ 在派生集合里 |
| 嵌套在另一个 `@media (min-width:600px)` 里的新动画 | 抓到 | 派生 8 项 → 红 ✓ |

变异实测（第 8 段动画的四种落点 + 最刁钻的绕过路径）：

| 变异体 | test1（派生 vs 清单） | test2（7 段 / 零字面量） | 结果 |
|--------|----------------------|------------------------|------|
| 追加 `.adl-splash__extra { animation: foo 500ms linear; }` 在媒体块之后 | 8 项 → 红 | 计数 8 + 字面量 → 红 | **两条同红 ✓**（与你记录的删除性验证一致，我独立复算确认） |
| 同上但用 token 时长 | 8 项 → 红 | 计数 8 → 红 | 红 ✓ |
| 同上包在另一个 `@media` 里 | 8 项 → 红 | 计数 8 → 红 | 红 ✓ |
| 给已有元素加第二段（`.adl-splash__brand`） | 8 项 → 红 | 计数 8 → 红 | 红 ✓ |
| 把 `.adl-splash__rule` 改成纯长写 + token（最刁钻） | 派生掉到 6 项 → 红 | 计数 6 → 红 | 红 ✓（不会静默滑过） |
| 会动的规则写成选择器列表（`.a,\n.b { animation: … }`） | 派生得到合并串 → 红 | 计数 8 → 红 | 红 ✓（提示必须拆规则，属期望的 loud 失败） |

即：rev3 的"只对账两份清单"缺口已由"从 CSS 反推实际动画层"补上，**动画加在文件任意位置都会红**，且不会因为 `animation: none` 规则或关键帧文本误报。

### R1 附带项 — `.adl-splash__sweep--idle` 显式入清单：无冲突、无新冗余问题

- **覆盖关系不冲突**：`.adl-splash__sweep`（CSS:76-85）与 `.adl-splash__sweep--idle`（CSS:88-92）都是 0-1-0；idle 元素同时带两个类（`StartupOverlay.tsx:38`），媒体块里两条都进选择器列表（CSS:185-186）并由同一条 `animation: none;`（CSS:189）覆盖，同值同行，谁胜出都一样 → 零行为差异。
- **新增的重复是可接受的**：现在两个选择器都会被媒体块清一次动画，属"显式 > 隐式"的取舍；更重要的是这份显式清单正是 `animatedSelectors` 对账的基准（派生集合里 idle 有自己的 `animation` 声明，必须单列）。文件内没有跨文件同名类，不触 `css-architecture.md:37` 的钻石依赖规则。
- **清单顺序与派生顺序一致**（`sweep` → `sweep--idle` → `rule` → `name`），`declared` 与 `ANIMATED_LAYERS` 逐项相等 ✓。

### R2 — 已闭合

1. **旧状态行已删**：rev3 的「R1 rev2 复审：待派发（rev2 快照 13 files）」已不存在，收尾状态改为 L136-141 的「R1 rev3 定向复核」结论段 ✓，与 L116-126 的 rev2 段不再互相矛盾。
2. **缺口补述**：L133-135 现为「桌面窗口不可见导致动画时钟冻结（`currentTime=0`），无法读取漂移在 1.5s/2.5s 的 `transform` 递增值；**也未能用像素证据确认 `::before` 合成层被父层 mask 实际裁出"无硬边矩形"（只核到 mask 规则存在）**」——正是我 rev3 指出的第 ① 项，措辞如实（说明了"只核到规则存在"，没有把推断写成已验证）✓。
3. **与代码一致**：L136-141 的三条描述逐项核对——「从 CSS 反推实际有动画的选择器与媒体清单对账」（test:52）、「时长扫描覆盖全文只排除 `animation: none`」（test:71-73）、「`.adl-splash__sweep--idle` 显式列入」（CSS:186 + test:16）、「追加 `.adl-splash__extra { animation: foo 500ms linear; }` → 两条用例同时红」（我独立复算，确认）——均与实现相符 ✓。

## 本轮新问题

**本轮零问题**（critical 0 / high 0 / medium 0 / low 0）。

修复只触碰测试断言与 reduced-motion 清单，未改动画参数、时序、层级或颜色；未引入行为、性能或可访问性变化。

## 记录不修

- **派生集合对文档顺序敏感**（test:52 `toEqual`）：重排 CSS 规则顺序会让派生集合与常量清单顺序不一致而假红（需同步调整 `ANIMATED_LAYERS` 与媒体块清单顺序）。当前三条清单同序、可读性好，暂不改；若将来觉得碍事，可改为排序后比较。
- **`animatedSelectors` 只认 `animation:` 简写**：纯长写改写会让派生集合掉项（实测掉到 6 → 红），属 loud 失败而非静默漏检，可接受；且本文件全用简写。
- **进度文档的一处归属偏差**（L136-137）：把我 rev3 的 R2（「进度文档状态行过期」）归到了"设置行 2 项 low"里，实际它属开屏范围。实质内容（状态行已删、缺口已补）都记为已修，只影响范围归属，不改任何事实；若 P5 整理时顺手可调。
- **维持前几轮记录不修**：`inset:-32px` 零余量（环路 9s、overlay ≤8.5s 卸载，不可达）、`will-change` 常驻的 124% 视口合成层纹理、合成层平移的亚像素重采样、`check:changed` 的 `vitest related` 不挑中本 CSS 锁（与 `loading-row.test.ts` 同形）、`#preload-overlay` 与 `--splash-bg` 两份字面量（P5 加反向指针）、调试按钮 `--z-toast-top` 盖住开屏、退出期拦截点击、`mask` 里的 `#000`、`mix-blend-mode: screen`、12 个变量不过度工程、CSS:17「不计入本登记」措辞。
- **按延后口径不重复计入**：`docs/design-system/foundations/tokens.md` 未登记 12 个 `--splash-*`（P5 台账 L143 已列）；历史文档引用 flow-field（P5 只确认不误导）。

## 结论

- rev3 的 2 项 low **均已实质闭合**：样式锁从"两份清单互相对账"升级为"从 CSS 反推实际动画层"，9 个注入/变异场景实测（含 2 个应保持绿的误报探测）证明任意位置新增动画都会红且无误报；`.adl-splash__sweep--idle` 显式入清单无覆盖冲突、属必要显式化；进度文档旧状态行已删、mask 像素证据缺口已补、结论段与代码逐项一致。
- 本轮零问题：需修复项 0（critical 0 / high 0 / medium 0 / low 0）。
