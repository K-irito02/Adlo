# R1 复审报告 — 开屏改版（rev2）

## 范围

基线 `e16d96659`，本轮快照 `-rev2`（13 files），按 rev1 职责范围**完整重审**，未只看增量。未改源码。

- `adlo/frontend/src/app/components/StartupOverlay.css`（188 行）
- `adlo/frontend/src/app/components/StartupOverlay.tsx`（44 行）
- `adlo/frontend/src/app/components/__tests__/StartupOverlay.css.test.ts`（新增，56 行）
- `adlo/frontend/src/app/components/__tests__/StartupOverlay.test.tsx`（34 行）
- `adlo/frontend/src/app/components/flow-field-background.tsx`、`flow-field-worker.ts`（整文件删除）
- `adlo/frontend/src/styles/themes.css`、`adlo/frontend/src/styles/tokens.css`
- `adlo/frontend/scripts/check-no-cjk-source.mjs`

实读上下文：`App.tsx`（`OVERLAY_MIN_MS=3500`/`OVERLAY_MAX_MS=8000`、`!t` 分支）、`StartupOverlayWrapper.tsx`（500ms exit）、`index.html:20-57`、`styles/base.css:154-163`、`tokens.css:97-132/196/232-250`、`themes.css:31-56/316-340`、`styles/testing/cssRules.ts`、`styles/loading-row.test.ts`、`.agents/rules/css-architecture.md:54-57/175`、`.agents/rules/ui-patterns.md:571`、`docs/.../progress-2026-11-13-193437.md`、`public/adlo-icon.png`（像素探测沿用 rev1 结论）、`GLOSSARY.md`。

**本轮实跑**（简报 §1 允许的单文件判定）：
`pnpm --dir adlo/frontend exec vitest run src/app/components/__tests__/StartupOverlay.css.test.ts src/app/components/__tests__/StartupOverlay.test.tsx` → `2 files / 7 tests passed`（CSS 锁 4 + 组件 3）。
另用 `$env:TEMP` 临时脚本复算两条正则的覆盖力（见 F2 证据），无仓库写入。

## rev1 各项闭合情况

| # | rev1 问题 | 结论 | 核对要点 |
|---|-----------|------|----------|
| 1 | F1 网格改 `::before` + `translate3d` | **已闭合** | 见下 |
| 2 | F1 名称收字距登记偏离 + `--ease-linear` | **部分闭合** | 登记成立但措辞 2 处失真（F1）；`linear` → token 到位 |
| 3 | F2 新增 CSS 样式锁 | **已闭合（主体）** | 三条硬约束均被真正锁住；4 条断言有 3 处口径缺口（F2） |
| 4 | F4 去 `*`/`!important`、删不可达 1ms | **已闭合** | 见下 |
| 5 | F5 称谓统一 + 移除冗余 `aria-hidden` | **已闭合** | 见下 |

> 补充（rev1 F3，不在你列的 5 项内但文件在本轮范围）：`check-no-cjk-source.mjs:18-21` 已把豁免口径扩为「外部格式规范常量 **+ 不可本地化的品牌常量（两种语言 i18n 取值相同）**」，与本轮 `StartupOverlay.tsx:6` 的实际用法一致，措辞准确（`i18n/en-US/about.ts:7` 与 `zh-cn` 同为 `安洛`）→ **已闭合**；F3②（`tokens.md` Duration 登记）按你给的延后口径不计。

### 1. 网格漂移（已闭合）

- **方向与周期匹配**：`@keyframes adl-splash-grid-drift` 为 `translate3d(0,0,0)` → `translate3d(32px,32px,0)`（CSS:121-128），`background-size: 32px 32px`（CSS:40）——位移恰好一个周期、方向右/下，与 rev1 `background-position` 的 0→(32,32) 同向同速（32px/9s ≈ 3.6px/s 每轴）。
- **无缝性**：伪元素盒相对父层 `inset:-32px`（CSS:36），即四边各多一个周期；t=0 覆盖 `[-32, W+32]`，t=9s 覆盖 `[0, W+64]`，中间全程覆盖父层盒子。图案相位 t=0 时相对父层为 −32 ≡ 0 (mod 32)，与 rev1 相位一致，无视觉跳变。
- **仍受 `mask-image` 裁剪**：mask 挂在 `.adl-splash__grid`（CSS:27-28），作用于该元素及其子树，伪元素不会逃逸；且多出的 32px 落在 `radial-gradient(closest-side, #000 12%, transparent 76%)` 的透明区之外，本就被裁掉，不会出现硬边矩形。
- **与 `grid-in` 的 scale 无冲突**：drift `delay=1000ms` > grid-in `900ms`；父层 `both` 收在终态（隐式 `to` = 基础样式 → scale 1），子层此时 `translate=0`（无 backwards fill）。0–1000ms 期间两段互不重叠。
- **`will-change: transform` 恰当**：本层动画只动 transform，是标准用法；且它把合成层提升放在 0ms（而不是 drift 开始时的 1000ms），避免在开屏中段出现提升抖动。代价见「记录不修」。
- 唯一残留是注释方向写反（并入 F1(b)）与 `inset` 零余量（本质不可达，见「记录不修」）。

### 2. 名称收字距偏离登记（部分闭合）

- 形式**成立**：文件头按 `css-architecture.md:56` 的禁令逐项登记了偏离位置、范围、理由与已排除的替代方案（`scaleX` 扭曲字形、拆字引入逐字 DOM），比静默违反好；位置（组件 CSS 头部、就近实现）也对。
- `--ease-linear`：`drift`（CSS:42）与 `sweep--idle`（CSS:88）都已换 token，全文件再无裸缓动关键字（`linear` 仅出现在 `linear-gradient`）✓。
- 但登记文本本身与代码不符：见 **F1**。

### 3. CSS 样式锁（主体已闭合）

逐条做删除性推演（均已在实跑中确认文件为绿，推演的是「删掉修复后哪条会红」）：

1. 删掉 `@media (prefers-reduced-motion` 块 → `ruleBody(css, '@media …')` 为 `null` → 红 ✓；从选择器列表删任一项 → 对应 `ruleBody(media, sel)` 为 `null` → 红 ✓；把 `animation: none` 加 `!important` → 负向断言红 ✓。
2. 任一 `animation:` 简写改成字面量（如 `900ms`/`.5s`）→ 红 ✓（实测两条正则确实命中）。
3. `.adl-splash` 的 `z-index` 换魔数 → 红 ✓。
4. 网格退回 `background-position` → `not.toContain('background-position')` 红 ✓。

覆盖完整性也成立：`ruleBody(media, sel)` 对 6 个选择器逐一取到 `animation: none;`，而运行时全部动画元素只有这 6 个（`.adl-splash__sweep--idle` 复用 `.adl-splash__sweep` 类，CSS:38 同时带两个类，媒体块 `.adl-splash__sweep` 与它同特异度且更靠后，胜出 ✓）。缺口见 **F2**。

### 4. reduced-motion 逐项列名 + 删 1ms（已闭合）

- 媒体块（CSS:179-188）无 `*`、无 `!important`；`.adl-splash__grid` 与 `.adl-splash__grid::before` 都点名（伪元素有独立动画声明，必须单列——已列）✓。
- 同特异度 + 源序在后的判断成立：各动画规则为 0-1-0，媒体块 0-1-0 且位于文件末尾 ✓；`base.css` 的 `animation-duration: 1ms !important` 不改变 `animation-name: none` 的结果 ✓。
- `tokens.css:247-248` 删掉 7 个不可达的 1ms 项，改为解释「1ms 塌缩不取消 delay」——准确的根因说明 ✓。全仓检索 `--splash-*-duration` 消费方只有 `StartupOverlay.css`，无其它路径依赖那 7 行 ✓。

### 5. 称谓统一 + `aria-hidden`（已闭合）

- TSX:35「品牌图标 + 掠光 + 网格背景」、TSX:41「柔光带扫过图标」✓；`adl-splash__grid` 的 `aria-hidden` 已删（TSX:33）✓；用例改断言根节点（test.tsx:22、27）✓。
- 残留：CSS:1 仍写「A 字标掠光 + B 网格背景」——这是用户给的原型代号（A/B 方案名），不是实现描述，且 TSX/CSS 的实现描述已统一为「图标」；判定可接受，不算残留不一致。

## 新增发现

### F1 [severity: low] [category: 文档]

- 位置：`adlo/frontend/src/app/components/StartupOverlay.css:7-10`（偏离登记）、`:35`（`::before` 注释）、`:1-5`（文件头约定）
- 描述：rev2 新写/改写的三处注释各有 1 句与实现不符，属简报强制项 8（注释逐句相符）：
  ① **L9「其余动画只动 `transform` / `opacity`」不成立**：`@keyframes adl-splash-mark-in`（L130-136）还动 `filter: blur(6px)`（L134）。同一句的登记也没点名 `padding-left`（L173）——它与 `letter-spacing` 成对逐帧触发**布局**，是该偏离里成本更高的一半，只写"收字距"会让后来的审计者以为只动了一个属性。
  ② **L35「translate(-32px, -32px) 后四边仍铺满」方向写反**：实际关键帧是 `translate3d(32px, 32px, 0)`（L126）。断言本身在 ±32 两个方向都成立（`inset:-32px` 恰好一个周期），但描述的与代码相反，读者会以为漂移向左上。
  ③ **L3「`@keyframes` 只描述起始态」不再成立**：`adl-splash-grid-drift` 有显式 `to`（L125-127），`adl-splash-sweep-idle` 有 68%/100% 端点（L155-159）。这句话是"reduced-motion 靠停用动画即得终态"的论证前提，前提被削弱后，结论仍需成立——实际成立，因为 drift 的 `to` 与基础样式的差恰好是一个周期（视觉等价）、sweep-idle 的端点取值等于基础样式（opacity 0 / translateX(130%)）。
- 证据：L134 `filter: blur(6px)`；L172-173 `letter-spacing` + `padding-left`；L126 vs L35；L121-128、L144-160 的端点；对比 rev1 同名注释（当时只提到 `letter-spacing`、无 drift 的 `to`，②③ 为 rev2 重构新引入，①中 `filter` 一项 rev1 就存在但 rev1 未写这句断言）。
- 建议修复：① 改为「名称收字距有意逐帧改 `letter-spacing` / `padding-left`（成对，620ms 单行短文本）；图标落定另有一个 88px 局部的 `filter: blur(6px)`，不计入本登记；其余动画只动 `transform` / `opacity`」；② 改为「：translate(32px, 32px) 后左边/上边正好落到父层边界，仍铺满」；③ 改为「基础样式 = 动画终态（循环动画的端点取值与基础样式等价：drift 的 32px 位移等于一个周期，sweep-idle 的端点等于基础态）」。

### F2 [severity: low] [category: 正确性]

- 位置：`adlo/frontend/src/app/components/__tests__/StartupOverlay.css.test.ts:34-36`（`*` 守卫）、`:39-44`（时长守卫）、`:50-55`（drift 守卫）
- 描述：四条断言对**主要回归**是有效的（见上「闭合情况 3」），但有三处口径缺口，其中第一条正是 F4 要防的那次回归本身：
  ① **`*` 守卫无效**：`/^\s*\*\s*\{/m` 要求行首就是 `*`，而 rev1 的真实形态是 `.adl-splash * {`（行首为 `.`）→ 不匹配。实测：把 rev1 的媒体块文本喂给该正则返回 `false`（守卫放行）。
  ② **字面量守卫只覆盖 `animation` 简写**：`animation-duration: 900ms;` 与 `animation-delay: 1700ms;` 均不命中（实测 `false`）。另外 `expect(css).toMatch(/var\(--splash-[a-z-]+-duration\)/)` 只要求"全文至少出现一次"，把某条动画的时长换成 `var(--duration-500)` 仍全绿——与用例注释「编排只能来自 tokens.css 的 `Motion: Splash`」不符。
  ③ **drift 断言过窄**：只查 `toContain('translate3d')`。删掉 `to { translate3d(32px, 32px, 0) }`（漂移退化成静止）仍全绿。
- 证据：TEMP 脚本 `/^\s*\*\s*\{/m` × rev1 媒体块 → `false`；`/animation:[^;]*\b\d+(\.\d+)?m?s\b/` × `animation-duration: 900ms;` / `animation-delay: 1700ms;` → `false/false`。另外该文件头部注释（L8-10）本身含「620ms」等字样，只是因为前面没有 `animation:` 才没误命中——将来注释里写「animation: 900ms」就会假红。
- 建议修复：断言前先剥注释 `const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')`，然后：① 提取媒体块选择器列表（`media.split('{')[0].split(',')`）并断言 `toEqual` 六个精确选择器（既禁 `*` 也强制"新增动画必须进列表"）；② 遍历 `bare.matchAll(/animation:([^;]*);/g)`，断言每段都含 `var(--splash-` 且总数 = 7，另加一条 `/animation-(duration|delay):\s*[\d.]/` 负向；③ drift 改断言 `/translate3d\(\s*32px\s*,\s*32px/`。

### F3 [severity: low] [category: 文档]

- 位置：`docs/root-cause-to-close/2026-11/progress-2026-11-13-193437.md:51-53`
- 描述：rev2 的修复没有回写进度文档，导致两处与代码冲突（该文件在 rev2 manifest 内；若已由文档 scope 记录请合并，避免重复计数）：
  ① L51-52「新增 `Motion: Splash` 12 个时长/延迟变量，**并在 reduced-motion 块内塌缩**」——rev2 已删掉那 7 个 1ms 项（`tokens.css:232-250` 里该组只留解释性注释；其余 `--duration-*` 的 1ms 项仍在），改为组件层 `animation: none`。这条现在是错的机制描述。
  ② L53 只登记了 `StartupOverlay.test.tsx`（3 用例），未登记新增的 `StartupOverlay.css.test.ts`（4 用例，正是本轮 F2 的落地物）。
- 证据：`tokens.css:232-250`（无 `--splash-*` 1ms 项，含 "不在此塌缩" 注释）；`StartupOverlay.css.test.ts` 4 个 `it`；进度文档 L46-55 的「修复」清单未提 CSS 锁与网格 `::before` 重构。
- 建议修复：L51-52 改为「…新增 `Motion: Splash` 12 个变量；reduced-motion 由组件 CSS 的 `animation: none` 处理（1ms 塌缩不取消 delay，故 `tokens.css` 不对该组塌缩）」；修复清单补一行「新增 `__tests__/StartupOverlay.css.test.ts`（4 用例：reduced-motion 全覆盖 / 零字面量时长 / `--z-max` / transform 漂移）」；网格层重构（`::before` + `translate3d`）可并进 L54 的时间线描述。

## 验证缺口（按简报 §5.7，需在收尾前补，不计入问题计数）

rev2 把网格的绘制搬进 `.adl-splash__grid::before` 并加了 `will-change: transform`，而进度文档 L58-65 的实机 `getComputedStyle` 读数采集于重构前，未覆盖新图层。建议主代理在收尾前用 `ui-probe.mjs` 补一轮（light/dark 各一次），至少确认：
① 网格仍可见且**无硬边矩形**（证明父层 mask 仍裁剪合成子层）；
② 漂移方向/速度与重构前一致（读 `::before` 的 `transform` 在 1.5s / 2.5s 两个时刻的值，均应为正且递增；1s 恰是 delay 边界，读数不稳）；
③ reduced-motion 模拟下为静态成品（网格在、图标/细线/名称可见）。CSS 文本断言只能证明"规则写了"，不能证明级联后仍生效。

## 记录不修

- **`inset:-32px` 零余量（潜在）**：动画终点（t=9000ms）左/上边正好落到父层边界，只剩零余量；任何亚像素取整都可能露出一线。实际 overlay 最长 8000ms + 500ms 退出 = 8500ms 即卸载，**永远到不了环路接缝**，当前无风险；若将来把 `--splash-grid-drift-duration` 调到 < 4s，改成 `-33px` 即可。
- **`will-change` 常驻的大纹理**：漂移层是 124% 视口尺寸的合成层（4K 屏约 50MB 量级 GPU 纹理，overlay 生命周期 ≤8.5s 后释放）；相对于 rev1 的全屏逐帧重绘，这是更优的取舍，不做改动。若 4K 低端机出现启动内存告警再评估「只在 grid-in 结束到 drift 开始之间挂 `will-change`」。
- **合成层平移的亚像素重采样**：1px 线在 0.07 alpha、3.55px/s 下不可辨；若将来把网格线加深到可辨程度，再考虑按整数设备像素对齐。
- **CSS:1 保留「A 字标掠光」**：原型代号（用户原话即"A 字标掠光"），非实现描述；实现描述已统一「图标」。
- **`check:changed` 的 `vitest related` 不会因只改 CSS 而挑中 `StartupOverlay.css.test.ts`**（测试用 `readFileSync` 读路径，不构成 ES import 依赖）；与既有 `loading-row.test.ts` 同形状，属仓库既有约定，合并门禁 `check:all` 覆盖。
- **延后项（按要求不重复计入）**：`docs/design-system/foundations/tokens.md` 未登记 12 个 `--splash-*`（P5 台账）；历史文档引用 flow-field（P5 只确认不误导）。
- **维持 rev1 结论**：12 个变量不过度工程、`mask` 里的 `#000`（有先例）、`mix-blend-mode: screen` 亮暗两套等效、调试按钮 `--z-toast-top` 盖住开屏（预存）、退出淡出 500ms 期间拦截点击（预存）、`#preload-overlay` 与 `--splash-bg` 两份字面量（建议 P5 顺手加反向指针）——rev2 未改变这些前提。

## 结论

- rev1 的 5 项：4 项实质闭合（网格改造技术正确、样式锁真的锁住三条硬约束、reduced-motion 逐项列名且无冗余机制、称谓与 `aria-hidden` 已整理），1 项「部分闭合」（名称偏离登记形式成立但文本失真，并入 F1；`--ease-linear` 替换到位）。
- 网格重构逐项核对通过：32px 周期与 +32/+32 方向匹配、伪元素仍被父层 mask 裁剪（多出的 32px 落在透明区外）、`grid-in` 的 scale 与子层 translate 时间上不重叠、`will-change` 用法恰当。
- 无回归：`inset` 余量、`will-change` 纹理、亚像素重采样均为可接受取舍；rev2 未引入新的行为/性能风险。
- 需修复项：3（critical 0 / high 0 / medium 0 / low 3）。另有 1 项验证缺口（§5.7 实机读数）需主代理补采集，不计入问题数。
