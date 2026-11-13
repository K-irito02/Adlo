# R2（清理轮）报告 — 开屏改版（rev6）

## 范围

基线 `e16d96659`，快照 `-rev6`（只读快照，未跑 `git diff/show`，未改源码）。逐文件核对：

| 文件 | 结论入口 |
|------|----------|
| `adlo/frontend/src/app/components/StartupOverlay.css`（191 行，新文件） | 死代码 / 冗余守卫 / 注释 |
| `adlo/frontend/src/app/components/StartupOverlay.tsx`（45 行） | 冗余守卫 / 注释 |
| `adlo/frontend/src/app/components/__tests__/StartupOverlay.css.test.ts`（99 行） | 测试冗余 |
| `adlo/frontend/src/app/components/__tests__/StartupOverlay.test.tsx`（34 行） | 测试冗余 |
| `adlo/frontend/src/app/components/flow-field-background.tsx`、`flow-field-worker.ts`（整删） | 死代码残留 |
| `adlo/frontend/src/styles/themes.css`、`tokens.css` | 零消费方变量 |
| `adlo/frontend/scripts/check-no-cjk-source.mjs`（仅注释） | 注释事实性 |

上下文按需读：`index.html`、`App.tsx`、`StartupOverlayWrapper.tsx`、`styles/base.css`、`styles/testing/cssRules.ts`、`GLOSSARY.md`、`docs/root-cause-to-close/2026-11/progress-2026-11-13-193437.md`。

本轮未实跑测试（按简报：清理轮用读码 + 删除性推演判定；F2 的删除属 CSS 规范级 no-op，需主代理 ui-probe 复核）。

## 上轮问题关闭情况

R2 首轮，无上轮 R2 项可关闭。R1 rev4 判定的 **零问题** 与「记录不修」清单（12 变量不过度、`mask` 的 `#000`、`mix-blend-mode`、`--z-toast-top` 盖住开屏、退出期拦截点击、`inset:-32px` 零余量、`will-change` 常驻纹理、`tokens.md` 登记留 P5、派生集合顺序敏感、`animatedSelectors` 只认简写）本轮未重复计入。

## 新增发现

### F1 [severity: low] [category: 文档]

- 位置：`adlo/frontend/scripts/check-no-cjk-source.mjs:18-20`
- 描述：新增豁免口径把「不可本地化的品牌常量」定义为「两种语言的 i18n 字典里取值相同」，并举开屏的「Adlo · 安洛」为例。但开屏常量**不在任何 i18n 字典里**——`StartupOverlay.tsx:4-6` 明确写「该串不随语言切换，故不进 i18n 字典」，`src/app/i18n/**` 全文搜不到 `Adlo · 安洛`。「字典里取值相同」这句实际描述的是**关于页**的 `aboutAppNameZh`（`zh-CN/about.ts:7` 与 `en-US/about.ts:7` 同为 `'安洛'`，`AboutSettings.tsx:81` 直接消费），与开屏常量是两条不同来源。
- 证据：
  - `grep 'Adlo · 安洛' adlo/frontend/src` → 仅 `StartupOverlay.tsx:4,6`、`StartupOverlay.test.tsx:23`、`AboutSettings.test.tsx:198`，**无 i18n 字典命中**。
  - `grep '安洛' src/app/i18n` → `aboutAppNameZh`（两语言同值）、`brandHoverName`（zh `'安洛'` / en `'Adlo'`，**不同值**）；即该判据若当作通则读，`brandHoverName` 立刻是反例。
- 建议修复：改为描述真实情况，例如「以及**不可本地化、不进入 i18n 字典**的品牌常量（如开屏的「Adlo · 安洛」）」。只改注释，不触碰用户已确认的 `cjk-source-allow` 品牌常量豁免。

### F2 [severity: low] [category: 死代码]

- 位置：`adlo/frontend/src/app/components/StartupOverlay.css:20`、`:56`、`:82`、`:98`、`:109`
- 描述：五处声明在当前 DOM/层叠结构下**不产生任何可观察差异**，属事后防御/旧内联样式残留；CSS 锁未断言它们，删除不影响任何测试。
  1. `:20 .adl-splash { cursor: default }` —— 全屏根层已拦截指针（`pointer-events` 默认 `auto`，`inset: 0`），且 `.adl-splash__brand`（`:56`）`pointer-events: none` 使品牌文字不是命中目标、`.adl-splash__name`（`:111`）`user-select: none` 也不会出现 I-beam；`cursor` 在此元素上 `auto` 与 `default` 渲染一致。
  2. `:56 .adl-splash__brand { pointer-events: none }` —— 父层 `.adl-splash` 已覆盖整个视口且自身可命中（本轮范围外已知项「退出期拦截点击」即此行为），子层是否可命中无差别；本次建议**保留这一条**作为唯一显式语义。
  3. `:82 .adl-splash__sweep { pointer-events: none }` —— 同上，装饰层不可命中在父层已成立；与 `:56` 重复表达同一约束。
  4. `:98 .adl-splash__rule { transform-origin: center }` —— `transform-origin` 初始值即 `50% 50%`（= `center`），声明等于默认值；`scaleX(0)` 的展开中心本来就在中间。
  5. `:109 .adl-splash__name { text-align: center }` —— 该元素是 `flex-direction: column` + `align-items: center` 的 flex item（`:48-57`），交叉轴尺寸为 fit-content，且 `:110` `white-space: nowrap`，盒子宽度恒等于文本宽度，居中无可作用；仅当窗口窄于文本宽度才可能有差异（最小窗口 640px，不可达）。
- 证据：`StartupOverlay.tsx:31-44` 全树无事件监听；`StartupOverlay.css` 全文无其它 `pointer-events` / `cursor` 复位；`StartupOverlay.css.test.ts` 四条用例只锁 reduced-motion / 时长 token / `z-index` / 漂移 `transform`，均不涉及上述声明。
- 建议修复：删除 `:20` 的 `cursor: default`、`:82` 的 `pointer-events: none`、`:98` 的 `transform-origin`、`:109` 的 `text-align`；保留 `:56` 的 `pointer-events: none`（品牌层非交互的唯一显式声明）。删除后需按简报 §5.7 用 `ui-probe.mjs` 复核开屏计算样式无变化（预期零差异：均为默认值/被父层覆盖）。

## 记录不修

- **`img width={88} height={88}`（`StartupOverlay.tsx:36`）**：与 `.adl-splash__mark`（88×88）+ `img { width/height: 100% }` 重复，且同类 `<img>` 在 `AboutSettings.tsx:79` 不带尺寸属性；但它只是 intrinsic-size 提示、零成本，删不删都不改变渲染，属可选清理。
- **CSS 锁 `expect(media).not.toMatch(/animation:[^;]*!important/)`（`StartupOverlay.css.test.ts:65`）**：对「7 个已列层的规则加了 `!important`」这一目标风险已由 `:62` 的精确 `toContain('animation: none;')` 抢先判红（`none !important;` 不含 `none;`），该行只对「媒体块内另加一条 `animation: none !important` 规则」这种刻意构造生效；边际价值低但非纯冗余，保留。
- **CSS 锁 `expect(declarations).toHaveLength(7)`（`:76`）**：与 `ANIMATED_LAYERS.length`（`:11-19`）是同一计数的第二处字面量；改成 `toHaveLength(ANIMATED_LAYERS.length)` 可少一处维护点，但当前写法把「7 段编排」直接写在断言里更易读，属可选。
- **`animatedSelectors(bare)` 与 `declared` 两条 `toEqual(ANIMATED_LAYERS)`（`:52`、`:59`）不冗余**：前者锁「有动画的层都已登记」，后者锁「登记的层都有动画」，`:61-63` 的逐选择器循环锁「登记了但没真的 `animation: none`」，三者是三个方向的独立失败面（已按删除性推演逐个核对，删任一条都有仅它可捕获的变异）。
- **`StartupOverlay.test.tsx:29-32`「renders no canvas」**：不与其它断言重复，是删 flow-field 的墓碑用例；只有人再次引入 canvas 背景才会红。保留成本极低，建议留着。
- **「总长 2320ms」出现 3 处**（`StartupOverlay.tsx:11`、`tokens.css:119`、进度文档:52）：源码内 2 处且分属「组件时序说明」与「token 组说明」，未达「同一事实 TSX+CSS 三遍以上」的噪声阈值；代价是改 token 后注释会漂移，属可接受的文档债。
- **「底色同值不闪色」出现 3 处**（`StartupOverlay.tsx:26`、`themes.css:51`、`:335`）：`themes.css` 亮/暗两块同注释是本文件既有惯例（同一写法见 `:66` 与 `:357` 的「编辑态底色」），不按重复计。
- **`-webkit-mask-image` + `mask-image` 双写（`StartupOverlay.css:29-30`）**：与仓库既有惯例一致（`regions/titlebar.css:529,632`、`titlebar-affordances.css:61,85`、`tab-clip.css:34`、`vendor/markdown-theme-vars.css:382` 均为双写），不作为冗余项上报。
- **`.adl-splash { overflow: hidden }`（`:18`）**：固定层 `inset: 0` 已与视口等大，越界的网格（`inset: -12%`）本就落在视口外；严格说该声明是防御性冗余，但属常规 CSS 卫生且是「将来根层内缩」的唯一保险，保留。
- **注释用词「品牌图标」（`StartupOverlay.tsx:9`）**：`GLOSSARY.md:723` 的 `_Avoid_: … 品牌图标（笼统）` 位于 **Provider Logo（第三方服务标识）** 条目下，约束的是第三方标识，本处指自家图标，不构成越界；另 `GLOSSARY.md:10` 的「并列书写为「Adlo · 安洛」」与本注释引用一致（已核，非错误引用）。
- **`GLOSSARY.md` 无「开屏/Splash」条目**：属 R2 强制项 §5.5 的登记面，但开屏是 UI 表面而非产品域术语，且 P5 清单（进度文档:147-156）已归口文档同步；按任务给的 R2 范围不在本轮提出，留给 P5 判定。

## 检查项与结论（供主代理复核）

1. **死代码（flow-field 删除后残留）**：无损。`grep 'flow-field|FlowField|FLOW-FIELD|FLOW-WORKER'` 仅命中 `StartupOverlay.test.tsx:29` 的用例标题文案；`particleCount|trailOpacity|OffscreenCanvas|transferControlToOffscreen` 仅剩 `utils/favicon.ts:43`（无关用法）；无 `vite.config` worker 配置、无 tsconfig/eslint 残留；`systemPrefersDark` 仍被 `shared/resolveTheme.ts:1` 消费、`motion/react` 仍被大量组件消费，均非孤儿导出。
2. **CSS 内无未使用类/关键帧**：TSX 用到的 8 个类全部有定义，7 个 `@keyframes` 全部有引用，反向亦无孤儿类。
3. **零消费方 token**：无。`themes.css` 4 个 `--splash-bg/fg/grid/sweep` 与 `tokens.css` 12 个 `--splash-*` 时长/延迟**逐项**有消费方（`StartupOverlay.css:19,31,40,41,44,45,66,79,83,84,90,91,97,99,104,112`），保留 12 项不算过度工程（R1 已记录）。
4. **冗余守卫/事后防御**：`#preload-overlay` 移除**必要**（`index.html:55` 仍静态创建，且由 `StartupOverlay.test.tsx:12-20` 锁定）；`aria-hidden="true"`（`:32`）**必要**（否则品牌名会被朗读，测试同锁）；`will-change`（`:43`）属 R1 记录不修；`overflow`（`:18`、`:64`）必要（分别裁 `grid inset:-12%` 与 `sweep inset:-25%`）；其余 5 处见 F2。
5. **测试冗余**：CSS 锁 4 条用例内部与两测试文件之间无「同一约束两处断言」的纯冗余（详见「记录不修」中三条推演）；唯一近似重复是 `:76` 的计数与 `:65` 的 `!important`，均只作可选清理。
6. **诊断日志/临时痕迹**：7 个在范围文件内 `console.*` / `[DBG-` / `TODO` / `FIXME` / 被注释掉的旧实现残留 **全部为零**（旧 `FlowFieldBackground` 的内联样式与 `THEME_COLORS`/`MutationObserver` 已随删除彻底消失）。
7. **注释冗余**：见「记录不修」第 6、7 条（未达阈值）；CSS 头部「偏离登记」与 TSX 文档注释分工清晰，无三处以上重复陈述。

## 结论

- 需修复项：2（critical 0 / high 0 / medium 0 / low 2）
- 说明：F1 为错误注释（改文案即可，不触设计决策）；F2 为死代码清理（删 4 条 no-op 声明，建议主代理用 `ui-probe.mjs` 复核零差异）。清理轮未发现功能性、性能或文档一致性问题；死代码面（flow-field 残留、孤儿类/关键帧、零消费 token）干净。
