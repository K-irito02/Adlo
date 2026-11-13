# R1 审查报告 — 开屏改版（rev1）

## 范围

基线 `e16d96659`，本轮快照 `-rev1`，只读审查：未运行测试套件、未改源码。仅用 `$env:TEMP` 下的临时脚本对 `adlo/frontend/public/adlo-icon.png` 做了像素/alpha 探测（128×128 PNG 解码，无写入仓库）。

- `adlo/frontend/src/app/components/StartupOverlay.tsx`（重写：纯 CSS 开屏 + 品牌常量）
- `adlo/frontend/src/app/components/StartupOverlay.css`（新增 173 行）
- `adlo/frontend/src/app/components/__tests__/StartupOverlay.test.tsx`（新增 3 用例）
- `adlo/frontend/src/styles/themes.css`（`--splash-bg/fg/grid/sweep`，亮暗各一套）
- `adlo/frontend/src/styles/tokens.css`（`Motion: Splash` 12 变量 + reduced-motion 塌缩）
- `adlo/frontend/src/app/components/flow-field-background.tsx`、`flow-field-worker.ts`（整文件删除）

实读上下文：`App.tsx`（L131-165、L215-223、L333，`OVERLAY_MIN_MS=3500` / `OVERLAY_MAX_MS=8000` 未改）、`StartupOverlayWrapper.tsx`（lazy motion.div + 500ms exit）、`index.html`（L20-57 `#preload-overlay`）、`styles/base.css:154-163`、`styles/tokens.css:97-132/196/232-255`、`styles/themes.css:31-56/316-340`、`design-system/tokens.ts:79-90`、`.agents/rules/css-architecture.md`、`.agents/rules/ui-patterns.md` §17、`scripts/check-no-cjk-source.mjs`、`check-changed.mjs:228`、`docs/design-system/foundations/tokens.md:46-56`、`src/styles/loading-row.test.ts`（CSS 文本断言先例）、`public/adlo-icon.png`（像素探测）。

## 上轮问题关闭情况

R1 首轮，无上轮问题。

## 已核对检查项（无问题）

1. **flow-field 删除彻底性**：`flow-field|FlowField|FLOW-FIELD|OffscreenCanvas|particleCount` 全仓检索——`src` 内零命中（`favicon.ts:43` 的另一处 `OffscreenCanvas` 与本链路无关）；vite 配置无 worker 相关残留；`public` 无配套产物。Worker 生命周期（`terminate()`）、`resize/pointermove/pointerleave` 监听写在组件内随组件删除，无外部清理遗漏——删除后已无任何创建点。
2. **时间线不产生"演完干等"**：入场在 2320ms 收尾，弱掠光 delay=2600ms 接上（首轮 2600→5200ms 覆盖 3.5s 退出点，退出瞬间处于 34.6%（不透明度 0.35、光带居中）），9s 漂移全程可见；即使触发 8s 兜底也仍在弱掠光循环内。2320–2600ms 的 280ms 静止段可接受。
3. **fill-mode 与基础样式一致**：6 个入场关键帧只写 `from`（`name` 的 `letter-spacing:0.28em/padding-left:0.28em` 也在 `from`），隐式 `to` = 基础样式 = 终态；`both` 在延迟期给首帧、结束后停在终态。reduced-motion 下 `animation: none` → 直接呈现基础样式，无残影、无元素消失（`.adl-splash__sweep` 基础态 `translateX(130%)` 在 `overflow:hidden` 外，`.adl-splash__sweep--idle` 基础态 `opacity:0`）。
4. **主题驱动改造正确**：移除 `getThemeFromRoot` / `MutationObserver` 后由 CSS 变量驱动，反而修掉了旧实现的跟随延迟；`--splash-*` 落在 `:root,[data-theme='light']`(themes.css:53-56) 与 `[data-theme='dark']`(337-340)，`index.html:35` 保证 `data-theme` 恒有值，变量必可解析。
5. **`z-index` 只用了 `--z-max`**（CSS:10），未引入魔数。`#preload-overlay` 的 `99999` 是 `index.html` 预存值，且 `useLayoutEffect` 在首次绘制前移除（旧实现同样），React 覆盖层不会压在预加载层之下。
6. **`pointer-events` 语义未变**：旧根节点为 `auto`（仅内容层 `none`），新根节点同为默认 `auto`、`.adl-splash__brand` 显式 `none`（CSS:40），遮罩期仍拦截点击，与 `App.tsx` 注释"覆盖层显示期间 WebView2 保持离屏"一致。
7. **`mix-blend-mode: screen` 在亮色下无异常**：像素探测确认 `adlo-icon.png` 为 128×128 RGBA、88px 显示时是**黑底（RGB≈10,10,10）+ 浅色字标**、自带约 10px 透明圆角；`mark` 的 `border-radius: var(--radius-2xl)`(16px) 比 PNG 自带圆角更"圆"，不会露出透明缺口。白色 0.72 光带经 `screen` 落在黑底上，亮/暗两套呈现同一条白带（亮色不会"消失"，因为光带只覆盖不透明黑底）。
8. **`img` 无 alt 可接受**：`alt=""` + 祖先 `aria-hidden="true"`，纯装饰、无焦点子节点，不构成 a11y 陷阱；`aria-hidden` 放在根节点上是恰当的（旧实现只有 img 有，字标文本会被朗读，属行为变化，但开屏朗读无价值，不算缺陷）。
9. **token 落点与既有约定一致**：颜色/主题变量在 `themes.css`（`--tooltip-bg/fg` 同构），时长/缓动在 `tokens.css`，`css-architecture.md:19` 的"组件 CSS 只消费 var()"成立；12 个 `--splash-*` 唯一消费方就是本组件，**判定不属于过度工程**（一次编排的单一真源；可见颜色零硬编码——唯一字面色是 `mask-image` 的 `#000`，只取 alpha 且已有先例，见「记录不修」；时长零硬编码）。
10. **测试有效性（现有 3 用例）**：删 `useLayoutEffect` 的 preload 移除 → 用例 1 红；把 canvas 开屏搬回 → 用例 3 红；改品牌串/网格 aria-hidden → 用例 2 红。回归保护成立，但覆盖面见 F2。
11. **注释时间点与 CSS 实际值逐项对齐**：620 / 900 / 560+900=1460 / 1420+520=1940 / 1700+620=2320 / 2600 周期 2600 全部吻合；"图标 scale 0.96→1、blur 6px→0"与 `adl-splash-mark-in` 一致。（用词问题见 F5。）

## 新增发现

### F1 [severity: medium] [category: 设计]

- 位置：`adlo/frontend/src/app/components/StartupOverlay.css:158-165`（`@keyframes adl-splash-name` 的 `letter-spacing`/`padding-left`）、`:107-118` + `:26-29`（`@keyframes adl-splash-grid-drift` 的 `background-position`，`infinite`）
- 描述：两处动画属性都越过仓库明文禁令「动画和过渡仅使用 `transform` 和 `opacity`，避免触发 layout/paint（使用 `will-change` 提示浏览器）」（`css-architecture.md:56`，`ui-patterns.md:571` 复述）。`letter-spacing`/`padding-left` 逐帧触发**布局**：名称盒宽随字距变化，而 `.adl-splash__brand` 是 `align-items:center` 的列 flex，每帧还要把细线与图标重新居中，等于 620ms 内持续重排 + 重绘品牌子树。`background-position` 逐帧触发**绘制**：网格层 `inset:-12%`（≈124% 视口）+ 两路渐变 + `mask-image`，且是 `infinite`，全程压在 bootstrap（JS 解析、IPC）最忙的 3.5s 上；这不是 loading-row 那种几行小元素的既有例外（`loading-row.css` 只有文本宽度），量级不同。
- 证据：CSS:26-29 第二条动画无 `fill`、`infinite`；CSS:107-118 关键帧只动 `background-position`；CSS:158-165 只动 `letter-spacing`/`padding-left`；`.agents/rules/css-architecture.md:54-57`（"性能相关"节，含 `will-change` 要求）；全仓 32 处 `letter-spacing` 中仅 `StartupOverlay.css:162` 位于 `@keyframes` 内（其余均为静态声明），即无先例。未做帧耗时实测（本轮不跑浏览器），按规则 + 图层结构判定；改造成 `transform` 后不再需要实测。
- 建议修复：
  - 网格：把纹理放到 `.adl-splash__grid::before`（`inset:0`、`background-size:32px 32px`、尺寸放大 32px），关键帧改为 `transform: translate3d(-32px,-32px,0)`——32px 为周期，位移一个周期与 `background-position` 循环完全等价、同样无缝，但走合成器；`grid-in` 的 `scale` 留在父节点，两者不冲突。必要时加 `will-change: transform`。
  - 名称：要么把收字距换成 `opacity` + `transform: translateY(4px)`/`scaleX` 近似（会削弱"收拢"手感），要么**在文件头显式登记这处偏离**（写明"620ms 单行短文本，收字距是设计核心，接受逐帧布局"），不要让禁令被静默违反。设计已由用户确认，推荐后者 + 上述网格改造，改动面最小。

### F2 [severity: medium] [category: 正确性]

- 位置：`adlo/frontend/src/app/components/StartupOverlay.css:168-173`（reduced-motion 块）、`adlo/frontend/src/app/components/__tests__/StartupOverlay.test.tsx`（全文件）
- 描述：本轮三条硬性设计约束——reduced-motion 塌缩、时长只走 token、层级只用 `--z-max`——**没有任何回归保护**。三条都能被静默改坏且测试全绿；其中 reduced-motion 的破坏是可观测缺陷，不只是规范问题。
- 证据：删掉 CSS:168-173 后 `base.css:154-163` 仍会把 `animation-duration` 压到 1ms、`animation-iteration-count` 压到 1，但**不动 delay**：`.adl-splash__name`（delay 1700ms + `both`）在 0–1700ms 期间按 backwards fill 停在 `opacity:0`，于是 reduced-motion 用户会看到"先只有图标和网格，1.42s 细线瞬间蹦出、1.7s 名称瞬间蹦出"——正是要避免的跳变；现有 3 个用例（`StartupOverlay.test.tsx:5-32`）在 jsdom 里既不读 CSS 文本也不模拟媒体查询，全绿。仓库已有同类 CSS 文本断言先例：`src/styles/loading-row.test.ts`（`@vitest-environment node` + `readFileSync` + `testing/cssRules.ruleBody`，L42-51 正是断言 `@media (prefers-reduced-motion` 块内的 `animation: none`）。
- 建议修复：新增 `src/app/components/__tests__/StartupOverlay.css.test.ts`（node 环境，读 `../StartupOverlay.css`），至少锁四条：① `@media (prefers-reduced-motion` 块内对 5 个动画选择器给出 `animation: none`；② 每条 `animation:` 的时长/延迟都是 `var(--splash-`（禁 `\d+ms` 字面量）；③ `.adl-splash` 的 `z-index: var(--z-max)`；④ 基础态即终态（关键帧 `from` 之外不再出现 `opacity: 0`/`scale` 之外的终态声明——②③已覆盖主要风险，④可选）。顺带把用例 2 对 `.adl-splash__grid` 的 `aria-hidden` 断言换成根节点 `aria-hidden`（子节点那层是冗余属性，锁住它对 a11y 无意义）。

### F3 [severity: low] [category: 文档]

- 位置：`adlo/frontend/scripts/check-no-cjk-source.mjs:18-19`；`docs/design-system/foundations/tokens.md:51`
- 描述：两处"新机制没有登记到它自称权威的地方"。
  ① 豁免口径与首次真实用法不一致：脚本注释明文写「专用豁免：`cjk-source-allow` …**仅用于外部格式规范里**确实出现中文的位置（例如 Chrome 导出文件名解析常量、域常量）」，而 `StartupOverlay.tsx:6` 是**仓库首次使用**该标记，用途是品牌常量，不属于"外部格式规范"。豁免本身我判定**成立**（`Adlo · 安洛` 在 `i18n/en-US/about.ts:7` 也是 `安洛`，即不随语言变化；开屏必须在 `App.tsx` 的 `if (!t)` 分支前渲染）。替代方案我逐条评估后不推荐：静态 import `zhCN` 字典会把整包 i18n 拉进启动 chunk（正是本页要省的时间）；只渲染 ASCII `Adlo` 再补名会有可见的文案二次变化；用 `\u5b89\u6d1b` 转义等于绕过门禁且更难读。但**脚本的权威说明现在是错的**，下一个读者/审查者会认为该标记越界。
  ② 新增的 12 个 `--splash-*` 时长没有登记到 `tokens.md:51` 的 Duration 行——该行按穷举方式书写（`--duration-75` … `--duration-1000`、`--duration-editorial`），读起来就是"全部时长 token"。`design-system/tokens.ts:79-90` 的 `DURATION_TOKENS` 亦未含（该常量只服务 TS 侧 `cssVar()`，无消费方，可不加）。
- 证据：`check-no-cjk-source.mjs:18-27`（`ALLOW_MARKER` 与注释）；`grep -rn cjk-source-allow` 全仓仅 1 处使用 + 脚本自身；`themes.css:50-56/333-340` 与 `docs/design-system` 全文无 `splash` 命中（该目录尚未登记任何 splash token）；`tokens.md:46-56` Motion 表逐项列名。
- 建议修复：① 把脚本注释改为「…仅用于外部格式规范常量与**不可本地化的品牌常量**（需在同仓 i18n 字典的两种语言里取值相同）」，并在 `check-no-cjk-source.test.mjs` 补一句该容许类；或在 `StartupOverlay.tsx:6` 的标记后加 `see scripts/check-no-cjk-source.mjs` 反向指针。② `tokens.md:51` Duration 行补「组件编排时长 `--splash-*`（见 `StartupOverlay.css`，reduced-motion 下同为 1ms）」。两处都是 P5 文档阶段同一批可完成的 3 行改动。

### F4 [severity: low] [category: 设计]

- 位置：`adlo/frontend/src/app/components/StartupOverlay.css:168-173`（`*` 选择器 + `!important`）、`:74`（裸 `linear`）；`adlo/frontend/src/styles/tokens.css:247-253`
- 描述：四处规范/一致性问题，同一处修复面。
  ① `.adl-splash *` 违反「禁止使用 `*` 选择器」（`css-architecture.md:57`）。
  ② `animation: none !important` 违反「禁止使用 `!important`（除非覆盖第三方库样式或浏览器伪元素）」（`css-architecture.md:175`），且此处**不必要**：`.adl-splash *`（0-1-0）与各动画类（0-1-0）同特异度，媒体块在文件末尾，源序已胜出；仓库同类先例 `loading-row.css` 的 reduced-motion 用的就是无 `!important` 的 `animation: none`。`base.css` 的 `animation-duration: … !important` 只影响 duration，`animation-name: none` 仍胜出，删 `!important` 不会有行为差异。
  ③ CSS:74 用了裸 `linear`，而同文件 CSS:28 与 `tokens.css:108` 有 `--ease-linear`；缓动也应走 token。
  ④ `tokens.css:247-253` 的 7 个 `--splash-*: 1ms` 在本组件 `animation: none` 之后**不可达**（同一媒体查询、组件层直接禁用动画），两套 reduced-motion 机制重复：留着会让人以为"只靠 1ms 塌缩就够"（不够，见 F2 证据里的 delay 问题），删了又与"所有 duration 在 reduce 下塌缩"的既有约定不符。
- 证据：CSS:168-173 原文；`css-architecture.md:57/175`；`loading-row.css` 走查（`loading-row.test.ts:42-51` 断言的正是无 `!important` 的 `animation: none;`）；CSS:28 vs 74；`tokens.css:232-254` 注释「Components that opt-in to motion should multiply durations by var(--motion-scale)」。
- 建议修复：媒体块改为逐个列名、无 `*` 无 `!important`：
  `.adl-splash__grid, .adl-splash__mark, .adl-splash__sweep, .adl-splash__rule, .adl-splash__name { animation: none; }`
  （`.adl-splash__sweep--idle` 同带 `.adl-splash__sweep` 类，被覆盖；根节点自身无动画，不必列）。`:74` 的 `linear` → `var(--ease-linear)`。然后二选一：删掉 `tokens.css:247-253` 的 7 行（推荐，动画已被整体禁用），或保留但在组件媒体块注释里写明"1ms 塌缩不足以取消 delay，故此处仍需 animation: none"。

### F5 [severity: low] [category: 文档]

- 位置：`adlo/frontend/src/app/components/StartupOverlay.tsx:9`、`:15`（对照 `:13` 与 `StartupOverlay.css:59`）
- 描述：同一元素在同一段注释里被叫了两个名字：L13 叫「图标」（`.adl-splash__mark`），L15 的掠光对象叫「字标」（"柔光带扫过字标"），文件头 L9 又写「品牌图标 + 字标掠光」。实际掠光发生在 `.adl-splash__mark`（图标副本）上，CSS:59 的注释用的正是「图标副本」；而页面里真正会被读成"字标/文字"的是下一个元素 `.adl-splash__name`（L17 称"名称"）。`GLOSSARY.md` 未收录「字标」，读者无法自行消歧，容易得出"掠光扫的是 Adlo · 安洛 这行文字"的错误结论（正是本轮的三选一设计里 B 案被要求的部位）。
- 证据：TSX:9/13/15/17 与 CSS:59；`GLOSSARY.md` 检索「字标」无条目（仅 L722-723 有一条无关的"品牌标识/Avoid 应用 Logo"）。时间点数值本身全部正确，仅对象称谓不一致。
- 建议修复：统一为「图标」，L9 改「品牌图标（含掠光）+ 网格背景」，L15 改「柔光带扫过图标」；若确实想强调"字标型图标"，在 L13 首次出现处写一次「图标（字标型）」后全程沿用。

## 记录不修

- **12 个 `--splash-*` 是否过度工程**：判定不过度（一次多段编排的单一真源，组件 CSS 零硬编码时长；与"颜色/时长必须 token"的约束同向）。可选的进一步收敛：7 个 duration 在 reduce 下的值不可达，已并入 F4④。
- **`#preload-overlay` ↔ `--splash-bg` 取值耦合（预存）**：`index.html:46-50` 的 `#fff/#000` 与 `themes.css:53/337` 是两份字面量，仅靠注释单向绑定（themes.css 提到 index.html，index.html 无反向指针）。当前取值一致、`data-theme` 恒有值，无回归；风险是将来改品牌开屏底色时只改一处 → React 接管瞬间闪色。建议的廉价护栏（P5 顺手可做）：`index.html` 内联样式旁加一行「改这里必须同步 themes.css `--splash-bg`」，或在 F2 的 CSS 文本测试里加一条把 `index.html` 的两个色值与 `themes.css` 对比。属可选项，未计入需修复。
- **图标圆角 20px → 16px**：旧实现 `borderRadius: 20`，新用 `--radius-2xl`(16px)。PNG 自带约 10px 透明圆角（像素探测：128px 下第一不透明像素在 x=15），16px 裁剪仍以裁剪为准，不露透明缺口；视觉差 4px，属 token 对齐。
- **`mask-image` 里的 `#000`**：掩膜只取 alpha，且仓库既有先例 `titlebar-affordances.css:61-62/85-86` 同样写 `#000`，不算违反"颜色走 token"。
- **`adl-splash__grid` 子节点重复 `aria-hidden`**（TSX:33）：父节点已 `aria-hidden`，子节点冗余但无害；只在 F2 里建议把测试断言迁到根节点。
- **`mix-blend-mode: screen` 强制合成**：在 88px 局部代价可忽略，不值得为省一次合成改成半透明白带（会改变已确认观感）。
- **历史文档仍引用 flow-field**：`docs/specs/ui/2026-07-13-startup-overlay-design.md:20/40/58-59`、`docs/plans/startup/2026-07-13-startup-overlay-implementation.md`、`docs/knowledge-base/tauri-backend/tauri-sync-command-blocking-2026-07-14.md:44`。均为历史记录，进度文件 L93-100 已把"新增新 spec、旧 spec 保留"登记为 P5，不修。
- **`.agents/rules/design-system.md:136/160`「StartupOverlay 通过 MutationObserver 监听 data-theme」已过期**（代码已改 CSS 变量驱动）。进度文件 L95-96 已登记 P5（含 `.opencode/` `.trae/` 三镜像同步），本轮不重复计入；但**必须在本次收尾内落地**（不得跨收尾，属"规则文档与实现两套权威"）。
- **调试日志按钮 `--z-toast-top`(99999) 会盖住开屏**：预存行为（旧开屏同样是 `--z-max`=9999），非本轮引入，未展开。
- **退出淡出 500ms 期间仍拦截点击**（`AnimatePresence` + 根节点 `pointer-events` 默认 auto）：与旧实现一致，非本轮引入。

## 结论

- 根因正确、删除彻底：flow-field 两文件在全仓 `src` 内零残留（仅历史文档与一处测试命名文案），无 Worker/监听器泄漏；新开屏为纯 CSS，主题改由 `--splash-*` 变量驱动，反而修掉了旧的跟随延迟。
- 时间线站得住：2320ms 演完、2600ms 起弱掠光、9s 漂移覆盖 3.5s 最短停留与 8s 兜底，无"演完干等"；`both` + 基础态=终态使 reduced-motion 直接呈现静态成品，无残影。
- 设计约束基本达标：`z-index` 只用 `--z-max`，可见颜色与全部时长零硬编码（掩膜 `#000` 见记录不修），亮暗两套都可见（图标黑底 + 白色 `screen` 光带，两套等效）；`cjk-source-allow` 的使用**成立**但脚本口径需同步（F3①）。
- 主要缺口是性能规范（F1 两处非 transform/opacity 动画）与回归保护（F2 无 CSS 文本断言，reduced-motion 破坏可观测却全绿）。
- 需修复项：5（critical 0 / high 0 / medium 2 / low 3）。
