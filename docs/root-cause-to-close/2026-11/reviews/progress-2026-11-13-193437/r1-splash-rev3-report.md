# R1 定向复核报告 — 开屏改版（rev3）

## 范围

基线 `e16d96659`，快照 `-rev3`。只核 rev2 的 3 项 low 是否闭合 + 修复是否引入新问题；未改源码。

- `adlo/frontend/src/app/components/StartupOverlay.css`（190 行）
- `adlo/frontend/src/app/components/__tests__/StartupOverlay.css.test.ts`（80 行）
- `adlo/frontend/src/app/components/StartupOverlay.tsx`、`__tests__/StartupOverlay.test.tsx`（对比 rev2 无变化）
- `adlo/frontend/src/styles/tokens.css`、`adlo/frontend/src/styles/themes.css`（对比 rev2 无变化）
- `adlo/frontend/scripts/check-no-cjk-source.mjs`（对比 rev2 无变化）
- `docs/root-cause-to-close/2026-11/progress-2026-11-13-193437.md`（146 行）

**本轮实跑**：`pnpm --dir adlo/frontend exec vitest run src/app/components/__tests__/StartupOverlay.css.test.ts src/app/components/__tests__/StartupOverlay.test.tsx` → `2 files / 7 tests passed`。
另用 `$env:TEMP` 脚本按 rev3 用例的同一套算术复算真实 CSS 与 3 个变异体（无仓库写入），结论见 R1。

## rev2 三项闭合情况

| rev2 项 | 结论 |
|---------|------|
| F1 三处注释失真 | **已闭合** |
| F2 三处守卫缺口 | **已闭合**（新引入 1 处口径缺口，见 R1） |
| F3 进度文档回写 | **已闭合**（新引入 1 处自相矛盾，见 R2） |

### F1 — 已闭合（逐条核对）

1. **文件头**（CSS:3-6）：现为「基础样式 = 动画终态。入场动画的 `@keyframes` 只写起始态；两个循环动画有显式端点，但端点取值与基础样式等价（漂移位移恰一个 32px 周期、弱掠光端点即基础态）」。核对：入场 5 段（grid-in / mark-in / sweep / rule / name）确实只有 `from`；两个循环动画 `grid-drift`（CSS:123-130 有 `to`）与 `sweep-idle`（CSS:146-162 有 68%/100%）确实有端点，且 `to translate3d(32px,32px,0)` 与基础态 `none` 相差恰一个 32px 周期（视觉等价）、`sweep-idle` 端点 `opacity:0`/`translateX(130%)` 与基础态逐值相等。**「等价」而非「相等」的措辞准确**，不再是 rev2 那句被推翻的"只描述起始态"。
2. **偏离登记**（CSS:8-12）：现同时点名 `letter-spacing` **+ 配对的 `padding-left`**（CSS:9），并单列「图标落定另有 88px 局部的 `filter: blur(6px)`，局限在图标块内」（CSS:11），最后才说「其余动画只动 `transform` / `opacity`」（CSS:12）。核对剩余动画：grid-in（opacity+transform）、drift（transform）、sweep（transform）、sweep-idle（transform+opacity）、rule（transform）——**该绝对断言现在成立**。「88px 局部」「局限在图标块内」也与实现相符（`.adl-splash__mark` 为 88×88 且 `overflow:hidden`，blur 被裁在块内）。
3. **`::before` 注释**（CSS:37）：改为「多出一整个周期：translate(32px, 32px) 后左/上边正好落到父层边界，仍铺满」。核对关键帧为 `translate3d(32px, 32px, 0)`（CSS:128）——方向一致；`inset:-32px`（CSS:38）下 +32px 平移后左/上边正落在父层 0 点、右/下边仍超出 ✓ 描述准确。

### F2 — 已闭合（四处修复全部到位）

1. **先剥注释**：`const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')`（test:8），注释里举的「animation: 900ms」反例不再误命中；后续断言全部改用 `bare` ✓。
2. **`*` 守卫换成选择器列表精确比对**：`media.split('{')[0].split(',')…` → `expect(declared).toEqual(ANIMATED_LAYERS)`（test:35-40）。这一条现在能真正拦住媒体块被替换成 `.adl-splash *`（`declared` 变成 `['.adl-splash *']` → 不等 → 红），也会拦住从列表里删选择器。rev2 里"守卫对真实形态不命中"的问题消失 ✓。
3. **时长守卫改为遍历全部简写**：`/animation:\s*([^;]*);/g` 取媒体块之前的 7 段，`toHaveLength(7)` + 每段含 `var(--splash-` + 每段无 `\b\d+(\.\d+)?m?s\b` + 全文件负向 `/animation-(duration|delay):\s*[\d.]/`（test:49-64）。rev2 的"漏长写"缺口闭合 ✓（我复算真实 CSS：7 段、全部含 token、无字面量）。
4. **漂移守卫加强**：`ruleBody(bare, '.adl-splash__grid::before')` 必须含 `adl-splash-grid-drift`（test:73，锁"动画归属"）+ `expect(drift).toMatch(/translate3d\(\s*32px\s*,\s*32px/)`（test:77，锁正周期）+ `not.toContain('background-position')`。rev2 的"只查 `translate3d` 存在"缺口闭合 ✓。
5. 作者自述的三个变异（媒体块换 `.adl-splash *`、加 `animation-duration: 900ms`、漂移关键帧缺 `to`）我按断言结构复推：分别命中 test:40、test:64、test:77，均会红 ✓（未复跑变异测试，只复算逻辑）。

### F3 — 已闭合（进度文档三处回写与代码一致）

- L51-53「reduced-motion 由组件 CSS 的 `animation: none` 处理（1ms 塌缩不取消 delay，故该组不在 tokens.css 里塌缩）」——与 `tokens.css:232-250` 现状一致 ✓（rev2 指出的"塌缩"错误描述已消失）。
- L54-56 补登 `StartupOverlay.css.test.ts`（4 用例）✓。
- L57-59 时间线补「贴图在 `.adl-splash__grid::before`，用 `translate3d` 走合成器」✓，与 CSS:34-46 一致。

## 验证缺口复述核对（你特别问的）

- **②（漂移时段 `transform` 值）**：**如实记录** ✓。L133-134 写明冻结原因（桌面窗口不可见 → 动画时钟 `currentTime=0`）与替代证据（rev1 重构前真机截图 + 动画条数），没有把未采集的时段值写成已验证。
- **③（reduced-motion 运行时）**：如实 ✓。L132 只写「规则经 CSSOM 确认存在」，L68-69 注明「browser 工具无 media 模拟能力，运行时未模拟」，未升级为"已验证终态"。
- **①（网格仍可见且 mask 真的裁掉合成子层 / 画面无硬边）**：**只部分覆盖**。L129-131 记了 `::before` 网格线颜色（可见性 ✓）、`inset=-32px`、`will-change=transform`、「父层 mask 在」——但"父层 mask 在"只证明 computed style 里有 mask 声明，不能证明合成子层被真正裁剪、画面无硬边矩形；该点也未写进 L133 的缺口清单。属"未过度声称"但"缺口未列全"，与 R2 一并处理。

## 仍需修复

### R1 [severity: low] [category: 正确性]

- 位置：`adlo/frontend/src/app/components/__tests__/StartupOverlay.css.test.ts:10`、`:49-57`（配合 `:40`）
- 描述：新的"精确比对"只能保证**媒体块列表与常量清单互相一致**，无法发现"新增动画没有登记"——只要那条动画写在 reduced-motion 媒体块**之后**。原因是 test:49-65 这条用例把扫描范围切在媒体块起点（`:50-51`，计数在 `:57`），而 test:40 只比对媒体块自身的选择器列表。于是 L10 的绝对断言「新增动画必须同时进 reduced-motion 列表，否则本断言失败」为假：新增动画既不进媒体块，也不改变 `declared`，7 段计数也不变。
- 证据：TEMP 脚本按用例同一算术复算（`$env:TEMP/opencode/splash-guard-rev3b.mjs`，读真实 CSS）：
  - 现状 → 6 项断言全 PASS（用例全绿）；
  - 在媒体块**之后**追加 `.adl-splash__extra { animation: adl-splash-extra 500ms linear both; }`（第 8 段动画 + 字面量 500ms，且没有 reduced-motion 登记）→ **6 项仍全 PASS**（`declared` 仍 6，`declarations` 仍 7，长写负向也不命中）；
  - 同一段插到媒体块**之前** → `count === 7` FAIL（被长度断言拦住）。
  即缺口只在"写在文件尾（媒体块之后）"，而媒体块本身就在文件尾、追加新规则到 EOF 是最常见的编辑方式；漏掉的后果正是 reduced-motion 用户看到一个仍在动的层。
- 建议修复：把第 2 条用例的扫描范围从"媒体块之前"改成"整文件"：`const decls = [...bare.matchAll(/animation:\s*([^;]*);/g)].map(...)`，然后 `expect(decls).toHaveLength(8)`、对 `decls.filter(d => d !== 'none')` 断言 7 段且每段含 `var(--splash-`、无字面量（`animation: none;` 单独放行）。这样计数与位置无关，也顺带覆盖"媒体块之后追加"的情形。同时把 L10 注释改成可证伪的表述：「本断言只校验媒体块与清单一致；新增动画由『全文件 7 段编排计数』兜住」。

### R2 [severity: low] [category: 文档]

- 位置：`docs/root-cause-to-close/2026-11/progress-2026-11-13-193437.md:135`（配合 `:116-126`）、`:133-134`（缺口清单）
- 描述：两处收尾前需订正：
  ① **自相矛盾**：L116-126 已记录「R1 rev2 复审」的判定与 3 项 low 的修复，L135 却仍写「R1 rev2 复审：待派发（rev2 快照 13 files）」。同一份文档里 rev2 既"已完成并修完"又"待派发"，且 rev3 已在执行。收尾时读文档的人会以为 rev2 还没做。
  ② **缺口清单少一项**：L133-134 只列了"漂移时段值不可采集"，未列"mask 对合成子层的实际裁剪/无硬边未验证"（见上节 ①）。当前写法不构成过度声称（L130 只写"父层 mask 在"），但缺口清单不完整。
- 证据：文档 L116-126 与 L135 原文对照；L129-134 的早读项只有 `inset`/`will-change`/`mask 在`/颜色，无"裁剪是否生效"的结论或缺口声明。
- 建议修复：① L135 改为「R1 rev3 定向复核：进行中（13 files 快照，报告 `r1-splash-rev3-report.md`）」或直接删除该行（rev2/rev3 结论已在上文分条记录）。② L133-134 缺口段补一句：「未验证：`mask-image` 对 `::before` 合成子层的实际裁剪（无硬边矩形）——computed style 只能证明声明存在；如需闭环，取一次开屏全屏截图看网格边缘是否有硬切。」

## 记录不修

- **`declared` 比对对顺序敏感**（test:40）：媒体块选择器列表重排会假红。列表在本文件里稳定且顺序可读，`toEqual` 比 `Set` 更直观，暂不改。
- **CSS:11「不计入本登记」措辞自指**（该条本身就在"偏离登记"节里）：技术内容（88px 局部、blur 被 `overflow:hidden` 裁在块内）均准确，仅句法略绕；若一并整理可写成「该项成本可忽略（88px、620ms），不单独申请豁免」。
- **维持前两轮记录不修**：`inset:-32px` 零余量（环路 9s、overlay ≤8.5s 卸载，不可达）、`will-change` 常驻的 124% 视口合成层纹理、合成层平移的亚像素重采样、`check:changed` 的 `vitest related` 不挑中本 CSS 锁（与 `loading-row.test.ts` 同形状）、`#preload-overlay` 与 `--splash-bg` 两份字面量（P5 加反向指针）、调试按钮 `--z-toast-top` 盖住开屏、退出期拦截点击、`mask` 里的 `#000`、`mix-blend-mode: screen`、12 个变量不过度工程。
- **按你的延后口径不重复计入**：`docs/design-system/foundations/tokens.md` 未登记 12 个 `--splash-*`（P5 台账 L137 已列）；历史文档引用 flow-field（P5 只确认不误导）。

## 结论

- rev2 的三项 low **均已实质闭合**：三处注释已与代码对齐（且"等价 vs 相等"的措辞经得起核对）、四处守卫缺口已补（剥注释 / 选择器精确比对 / 7 段遍历 + 长写负向 / 漂移归属与正周期）、进度文档三处回写与代码一致。
- 验证缺口记录基本如实：漂移时段值与 reduced-motion 运行时两处都明确写了"未采集/未模拟"；仅 mask 实际裁剪一项未列入缺口清单。
- 修复本身未改变行为或性能；新引入的问题都是守卫/文档层面的口径问题，无回归。
- 需修复项：2（critical 0 / high 0 / medium 0 / low 2）。
